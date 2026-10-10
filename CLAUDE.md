# CivicMesh-SOS — notes for AI assistants

- `MASTER_PROMPT.md` is the full spec and the source of truth for every number. Do not substitute your own values.
- This team works in four tracks. Your user will give you one of `tracks/TRACK_*.md`; it defines what you own. **Only edit paths your track owns** (see "Team structure" in your track file). For anything else, tell your user which track to ask.
- Build against the integration contracts K1–K7 in your track file; stub a missing dependency locally rather than editing another track's code.
- Never train on, tune on, or copy phrases from `data/benchmark_dataset.jsonl` (Appendix A, the test set). Do not edit it.
- Work on your track branch (`track/tN-…`); merge `main` in often; only merge to `main` with tests passing. Commit messages start with `[T1]`…`[T4]`.
- Run Python as modules from the repo root (`python3 -m bridge.server`). macOS, zsh, Python 3.13, Apple Silicon; Node 20+.
- Never commit `.env`, API keys, `node_modules/`, `dist/`, `models/`, `bridge/*.db` or `*.pmtiles`.
