const express = require("express");
const { nanoid } = require("nanoid");
const { transaction, readDb } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const SLUG_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const RESERVED = new Set(["api", "app", "login", "register", "dashboard", "analytics", "assets", "css", "js"]);

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function withStats(link, clicks) {
  const linkClicks = clicks.filter((c) => c.linkId === link.id);

  // Small 14-day daily-count array so the dashboard can draw a sparkline
  // without a second round-trip per link.
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const spark = days.map((day) => linkClicks.filter((c) => c.timestamp.startsWith(day)).length);

  return { ...link, clickCount: linkClicks.length, spark };
}

// GET /api/links — list current user's links, newest first, with counts
router.get("/", (req, res) => {
  const db = readDb();
  const mine = db.links
    .filter((l) => l.userId === req.userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((l) => withStats(l, db.clicks));
  res.json({ links: mine });
});

// POST /api/links — create a new short link
router.post("/", (req, res) => {
  const { url, title, slug } = req.body || {};

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: "Enter a valid URL, including http:// or https://" });
  }
  if (slug && !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: "Custom slug must be 3-32 characters: letters, numbers, - or _" });
  }
  if (slug && RESERVED.has(slug.toLowerCase())) {
    return res.status(409).json({ error: "That slug is reserved. Pick another." });
  }

  try {
    const link = transaction((db) => {
      const finalSlug = slug || nanoid(7);
      if (db.links.some((l) => l.slug.toLowerCase() === finalSlug.toLowerCase())) {
        throw Object.assign(new Error("taken"), { code: "SLUG_TAKEN" });
      }
      const newLink = {
        id: nanoid(),
        userId: req.userId,
        slug: finalSlug,
        url,
        title: (title || "").trim() || url.replace(/^https?:\/\//, "").slice(0, 60),
        createdAt: new Date().toISOString(),
      };
      db.links.push(newLink);
      return newLink;
    });
    res.status(201).json({ link: { ...link, clickCount: 0 } });
  } catch (err) {
    if (err.code === "SLUG_TAKEN") {
      return res.status(409).json({ error: "That slug is already taken." });
    }
    console.error(err);
    res.status(500).json({ error: "Could not create the link. Try again." });
  }
});

// PUT /api/links/:id — update title / destination url of an owned link
router.put("/:id", (req, res) => {
  const { title, url } = req.body || {};
  if (url && !isValidUrl(url)) {
    return res.status(400).json({ error: "Enter a valid URL, including http:// or https://" });
  }

  const updated = transaction((db) => {
    const link = db.links.find((l) => l.id === req.params.id && l.userId === req.userId);
    if (!link) return null;
    if (title !== undefined) link.title = title.trim() || link.title;
    if (url) link.url = url;
    link.updatedAt = new Date().toISOString();
    return link;
  });

  if (!updated) return res.status(404).json({ error: "Link not found." });
  const db = readDb();
  res.json({ link: withStats(updated, db.clicks) });
});

// DELETE /api/links/:id — remove an owned link and its click history
router.delete("/:id", (req, res) => {
  const found = transaction((db) => {
    const before = db.links.length;
    db.links = db.links.filter((l) => !(l.id === req.params.id && l.userId === req.userId));
    db.clicks = db.clicks.filter((c) => c.linkId !== req.params.id);
    return db.links.length < before;
  });

  if (!found) return res.status(404).json({ error: "Link not found." });
  res.status(204).end();
});

// GET /api/links/:id/analytics — click history + breakdowns for one link
router.get("/:id/analytics", (req, res) => {
  const db = readDb();
  const link = db.links.find((l) => l.id === req.params.id && l.userId === req.userId);
  if (!link) return res.status(404).json({ error: "Link not found." });

  const clicks = db.clicks
    .filter((c) => c.linkId === link.id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Daily counts for the last 14 days, zero-filled so the chart has no gaps
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), count: 0 });
  }
  const dayIndex = Object.fromEntries(days.map((d, i) => [d.date, i]));
  for (const c of clicks) {
    const key = c.timestamp.slice(0, 10);
    if (key in dayIndex) days[dayIndex[key]].count++;
  }

  const byDevice = {};
  const byReferrer = {};
  for (const c of clicks) {
    byDevice[c.device] = (byDevice[c.device] || 0) + 1;
    const ref = c.referrer || "Direct";
    byReferrer[ref] = (byReferrer[ref] || 0) + 1;
  }

  res.json({
    link: withStats(link, db.clicks),
    daily: days,
    byDevice,
    byReferrer,
    recent: clicks.slice(-25).reverse(),
  });
});

module.exports = router;
