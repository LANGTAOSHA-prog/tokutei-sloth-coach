// Sloth Coach: a lazy mistake coach for the 特定技能 construction exam.
// Gemma runs fully in the browser via WebLLM (WebGPU). No server, no API key.
import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm@0.2.86";

const SESSION_SIZE = 10;
const STORE_KEY = "slothcoach.mistakes.v1";

const $ = (id) => document.getElementById(id);
const langSel = $("lang");
const modelSel = $("model");

// Remember the user's choices so they never pick them twice.
langSel.value = localStorage.getItem("slothcoach.lang") || langSel.value;
modelSel.value = localStorage.getItem("slothcoach.model") || modelSel.value;
langSel.onchange = () => localStorage.setItem("slothcoach.lang", langSel.value);
modelSel.onchange = () => {
  localStorage.setItem("slothcoach.model", modelSel.value);
  engine = null;
  loadedModel = null;
  $("modelStatus").textContent = "Model changed. Load it when you need it.";
  $("loadBtn").disabled = false;
};

let bank = [];
let session = [];
let idx = 0;
let wrongThisSession = [];
let engine = null;
let loadedModel = null;
let loading = null;

// ---------- model ----------
function hasWebGPU() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

async function getEngine() {
  if (engine && loadedModel === modelSel.value) return engine;
  if (loading) return loading;
  if (!hasWebGPU()) {
    $("modelStatus").textContent =
      "This browser has no WebGPU, so the coach can't run here. Try recent Chrome or Edge. The reference note is shown instead.";
    return null;
  }
  $("loadBtn").disabled = true;
  const bar = $("progressBar").firstElementChild;
  loading = CreateMLCEngine(modelSel.value, {
    initProgressCallback: (p) => {
      $("modelStatus").textContent = p.text;
      bar.style.width = Math.round((p.progress || 0) * 100) + "%";
    },
  })
    .then((e) => {
      engine = e;
      loadedModel = modelSel.value;
      bar.style.width = "100%";
      $("modelStatus").textContent = "Coach ready. Cached for offline use.";
      return e;
    })
    .catch((err) => {
      $("modelStatus").textContent = "Couldn't load the model: " + err.message;
      $("loadBtn").disabled = false;
      return null;
    })
    .finally(() => (loading = null));
  return loading;
}

async function stream(messages, el) {
  const e = await getEngine();
  if (!e) return null;
  el.textContent = "";
  const chunks = await e.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.3,
    max_tokens: 220,
  });
  let text = "";
  for await (const c of chunks) {
    text += c.choices[0]?.delta?.content || "";
    el.textContent = text;
  }
  return text;
}

// ---------- prompts ----------
// The model is never asked to "know" construction law. It only rewrites
// the reference note for this learner, which keeps a 1B model honest.
function explainPrompt(item, picked) {
  return [
    {
      role: "user",
      content:
        `You are a patient senior worker on a Japanese building site, helping a foreign trainee study.\n` +
        `Use ONLY the facts in the reference note. Do not add numbers or rules that are not in it.\n\n` +
        `Question: ${item.q}\n` +
        `Trainee chose: ${item.choices[picked]}\n` +
        `Correct answer: ${item.choices[item.a]}\n` +
        `Reference note: ${item.note}\n\n` +
        `In 2 or 3 short, plain sentences: say why the trainee's choice is wrong, then give one simple way to remember the correct answer. ` +
        `Keep Japanese technical words in Japanese with a short meaning. Answer only in ${langSel.value}.`,
    },
  ];
}

function reviewPrompt(items) {
  const list = items
    .map((m, i) => `${i + 1}. [${m.topic}] ${m.q} → ${m.choices[m.a]} (missed ${m.count}x)`)
    .join("\n");
  return [
    {
      role: "user",
      content:
        `A construction trainee got these exam questions wrong:\n${list}\n\n` +
        `Write a short plan for tomorrow's 10-minute review: which topic to look at first and why, in 3 lines at most. ` +
        `No greetings. Answer only in ${langSel.value}.`,
    },
  ];
}

// ---------- mistakes store ----------
function loadMistakes() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function saveMistake(item) {
  const m = loadMistakes();
  const prev = m[item.id] || { count: 0 };
  m[item.id] = { count: prev.count + 1, last: Date.now() };
  localStorage.setItem(STORE_KEY, JSON.stringify(m));
}
function clearMistake(item) {
  const m = loadMistakes();
  if (m[item.id]) {
    m[item.id].count = Math.max(0, m[item.id].count - 1);
    if (m[item.id].count === 0) delete m[item.id];
    localStorage.setItem(STORE_KEY, JSON.stringify(m));
  }
}

// ---------- quiz ----------
function buildSession() {
  // Lazy spaced repetition: past mistakes come first, the rest fills in randomly.
  const m = loadMistakes();
  const missed = bank.filter((q) => m[q.id]).sort((a, b) => m[b.id].count - m[a.id].count);
  const rest = bank.filter((q) => !m[q.id]).sort(() => Math.random() - 0.5);
  return [...missed, ...rest].slice(0, SESSION_SIZE);
}

function render() {
  const item = session[idx];
  $("topic").textContent = item.topic;
  $("counter").textContent = `${idx + 1} / ${session.length}`;
  $("question").textContent = item.q;
  $("explainBox").hidden = true;
  $("nextBtn").hidden = true;
  const box = $("choices");
  box.innerHTML = "";
  item.choices.forEach((c, i) => {
    const b = document.createElement("button");
    b.textContent = c;
    b.onclick = () => answer(i);
    box.appendChild(b);
  });
}

async function answer(picked) {
  const item = session[idx];
  const buttons = [...$("choices").children];
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === item.a) b.classList.add("right");
    if (i === picked && picked !== item.a) b.classList.add("wrong");
  });
  $("nextBtn").hidden = false;

  if (picked === item.a) {
    clearMistake(item);
    return;
  }
  saveMistake(item);
  wrongThisSession.push(item);

  const out = $("explain");
  $("explainBox").hidden = false;
  out.textContent = "…";
  const text = await stream(explainPrompt(item, picked), out);
  if (text === null) out.textContent = item.note; // no WebGPU: fall back to the note
}

async function finish() {
  $("quiz").hidden = true;
  $("reviewCard").hidden = false;
  const m = loadMistakes();
  const items = bank
    .filter((q) => m[q.id])
    .map((q) => ({ ...q, count: m[q.id].count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const ol = $("reviewList");
  ol.innerHTML = "";
  items.forEach((q) => {
    const li = document.createElement("li");
    li.textContent = `[${q.topic}] ${q.q} → ${q.choices[q.a]}`;
    ol.appendChild(li);
  });

  const text = $("reviewText");
  if (!items.length) {
    text.textContent = "No mistakes waiting. Nothing to review tomorrow. Enjoy the nap. 🦥";
    return;
  }
  text.textContent = "…";
  const r = await stream(reviewPrompt(items), text);
  if (r === null) text.textContent = "";
}

function start() {
  session = buildSession();
  idx = 0;
  wrongThisSession = [];
  $("reviewCard").hidden = true;
  $("quiz").hidden = false;
  render();
}

$("nextBtn").onclick = () => {
  idx++;
  if (idx >= session.length) finish();
  else render();
};
$("restartBtn").onclick = start;
$("loadBtn").onclick = () => getEngine();

if (!hasWebGPU()) {
  $("modelStatus").textContent =
    "No WebGPU in this browser. You can still practise; you'll see the reference note instead of the coach.";
  $("loadBtn").disabled = true;
}

bank = await (await fetch("questions.json")).json();
start();
