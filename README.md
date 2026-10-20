# 🦥 Sloth Coach

A lazy mistake coach for the Japanese **Specified Skilled Worker (特定技能) construction exam**.

Get a question wrong and **Gemma runs inside your browser** (WebLLM + WebGPU) to explain why, in your own language: 中文, English, Tiếng Việt, Bahasa Indonesia, or やさしい日本語. At the end of a session it writes tomorrow's review list from your past mistakes.

- No server, no API key, no account
- The model downloads once, then works offline
- Your mistakes stay in your browser's localStorage

Built for the [DEV Hacktoberfest Open-Source AI Challenge, Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19).

## Models

| WebLLM model id | Notes |
| --- | --- |
| `gemma3-1b-it-q4f16_1-MLC` | Default. Smallest download, runs on many phones |
| `gemma-2-2b-it-q4f16_1-MLC` | Better explanations, bigger download |
| `gemma-4-E2B-it-q4f16_1-MLC` | Newest Gemma, largest |

## How it stays honest

A 1B model doesn't know Japanese safety law. So it is never asked to. Each question ships with a short reference note, and the prompt tells the model to explain the learner's mistake using only that note.

## Run locally

```bash
npx serve .
# open http://localhost:3000 in Chrome or Edge (WebGPU required)
```

## Questions

`questions.json` holds 22 sample questions (scaffolding, fall protection, ladders, weather limits, licences, oxygen deficiency, safety colours, KY activity). They are a demo set only.

## License

MIT
