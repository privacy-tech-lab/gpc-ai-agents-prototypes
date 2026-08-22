# CLAUDE.md

Guidance for AI assistants and contributors working in this repository.

## Writing style

In all descriptions, summaries, and README updates:

- Do not use overtly complex words. Prefer simple, common wording.
- Do not use em-dashes. Use a comma, a period, parentheses, or a colon instead.

The goal is writing that reads plainly and does not look AI-generated.

## Working in this repo

- This repository holds GPC (Global Privacy Control) reference prototypes for AI agent pipelines, numbered Prototype 1 through Prototype 8. Each one shows a specific opt-out enforcement mechanism.
- The pipelines run locally on Ollama (default model `qwen2.5:14b`). Keep it local-first. Do not swap in a hosted model.
- For Prototype 1, generate the JWT keypair from its README after a fresh clone, before running tests. Tests fail with `invalid signature` if `keys/private.pem` is missing.
- Use a branch and a pull request for changes. Do not commit directly to `main`.

## Issue and PR conventions

Read [CONTRIBUTING.md](CONTRIBUTING.md) before filing an issue or opening a PR. The issue template at `.github/ISSUE_TEMPLATE/feature.md` and the PR template at `.github/pull_request_template.md` are the canonical structures: Context / Goal / Approach / Acceptance / Out of scope for issues, Summary / Changes / Test plan / Related for PRs.

The writing rules (no em-dashes, intro commas, inclusive language, no Claude tagline, American English) live in `CONTRIBUTING.md`. The "Writing style" section above is a shorter restatement; `CONTRIBUTING.md` is canonical.
