# Voice benchmark results

Per-week WER (word error rate), latency, cost across:
- Sarvam.ai monolingual (Hindi, Telugu, Tamil, Marathi)
- OpenAI Whisper code-switched

Used by `@axhy/ai-tools` STT routing logic. Routing decision: monolingual high-confidence → Sarvam; otherwise → Whisper.

Results land in `results/YYYY-WW.json`. Recorded weekly during build phase + after every Sarvam/Whisper model upgrade.
