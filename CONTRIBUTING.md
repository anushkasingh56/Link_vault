# Contributing

## Local setup

See the Quick Start in [README.md](README.md) — `cp .env.example .env`, `npm install`, `npm start`.

## Branching & commits

- One feature or fix per branch: `feat/analytics-chart`, `fix/slug-validation`
- Commit style: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` — small, focused commits
- Never commit `.env` or the generated `server/data/db.json`

## Before opening a PR

```bash
node --check server/**/*.js   # quick syntax sanity check
npm start                     # smoke-test the app manually
```

Describe **what changed and why** in the PR body — that's what a reviewer needs to move fast.
