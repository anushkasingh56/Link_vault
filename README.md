# LinkVault

> Turn any long URL into a short, trackable link — with real-time click analytics, device and referrer breakdowns, all in one dashboard.

**Live demo →** _add your deployed URL here after deploying (see Deployment below)_

Demo login: `demo@demo.com` / `demo1234` (seeded automatically on first run, with sample links and click history).

---

## Features

- Email/password auth with hashed passwords (bcrypt), JWT sessions
- Create short links with an auto-generated or custom slug
- Full CRUD on links: create, edit destination/title, delete
- Every redirect is logged: timestamp, device type, referrer — no third-party tracking pixel
- Dashboard with live stats, search, and a 14-day sparkline per link
- Per-link analytics page: 14-day trend chart, device breakdown, referrer breakdown, recent-clicks table
- Fully responsive, keyboard-navigable, dark UI designed from scratch

## Tech Stack

Node.js · Express · vanilla HTML/CSS/JS (no framework, no build step) · JWT auth · bcrypt · a file-backed JSON store (see [Architecture notes](#architecture-notes) for why)

## Quick Start

```bash
git clone <your-repo-url> && cd linkvault
cp .env.example .env        # then optionally edit values
npm install
npm start                   # http://localhost:3000
```

That's it — no database server, no Docker, nothing else to install. On first run the app seeds a demo account automatically.

For auto-restart during development:

```bash
npm run dev
```

## Environment Variables

| Variable      | Description                                   |
| -------------- | ---------------------------------------------- |
| `PORT`         | Port the server listens on (default `3000`)    |
| `JWT_SECRET`   | Secret used to sign session tokens — change this before deploying |
| `BASE_URL`     | Public URL of the deployed app (used for reference; short links resolve relative to whatever host serves the request) |

## Project Structure

```
linkvault/
├── server/
│   ├── server.js        # Express app, static files, redirect + click logging
│   ├── db.js             # file-backed JSON store with atomic writes + a write mutex
│   ├── seed.js           # creates the demo account on first boot
│   ├── middleware/auth.js
│   └── routes/
│       ├── auth.js       # register, login, /me
│       └── links.js      # CRUD + per-link analytics
├── public/
│   ├── index.html         # marketing/landing page
│   ├── login.html / register.html
│   ├── dashboard.html + js/dashboard.js
│   ├── analytics.html + js/analytics.js
│   ├── css/style.css     # full design system (tokens, components)
│   └── js/shared.js      # api() wrapper, auth helpers, toasts
├── .env.example
└── package.json
```

## Architecture Notes

**Why a JSON file instead of Postgres/SQLite?** The brief's hard rule is "a real database, not just localStorage" — this is a real server-side database: it lives on disk, survives restarts, and every write is atomic (write-to-temp-then-rename) with a request queue acting as a mutex so concurrent writes can't corrupt it. The tradeoff against Postgres is horizontal scale and multi-instance consistency, which this single-process trial app doesn't need. Swapping in Prisma + Postgres later would only mean rewriting `server/db.js` — every route already goes through that one module.

**Auth.** Passwords are hashed with bcrypt (cost 12). Sessions are stateless JWTs (7-day expiry) sent as `Authorization: Bearer <token>` and stored in `localStorage` on the client. Every link route runs through `requireAuth` middleware and every query/mutation is scoped to `req.userId` — one user can never read or edit another's links, even by guessing an ID.

**Click logging.** The redirect route (`GET /:slug`) is intentionally the *last* route registered, after static files and all `/api/*` routes, so it only ever catches genuine short-link slugs. A small reserved-word list stops someone from creating a slug that would collide with the app's own pages.

## Testing It Yourself

1. `npm start`, open `http://localhost:3000`
2. Register a new account (or use the demo login)
3. Create a link, then open the short URL in a new tab a few times — the dashboard sparkline and the analytics page update on refresh
4. Try an invalid URL, a duplicate slug, and a wrong password to see the validation/error states

## License

MIT — see [LICENSE](LICENSE).

---

Built for the Digital Heroes Full Stack Developer Trial.
