require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const { transaction, readDb } = require("./db");

const authRoutes = require("./routes/auth");
const linkRoutes = require("./routes/links");

if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET in .env — copy .env.example to .env first.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "16kb" }));

// Minimal, dependency-free security headers.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/auth", authRoutes);
app.use("/api/links", linkRoutes);

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Reserved paths that must never be treated as a short-link slug.
const RESERVED_PATHS = new Set(["favicon.ico", "robots.txt", "sitemap.xml"]);

function detectDevice(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "Tablet";
  if (/mobi|iphone|android/.test(ua)) return "Mobile";
  return "Desktop";
}

// Public redirect route — must come after static files and API routes so
// it only catches genuine short-link slugs.
app.get("/:slug", (req, res, next) => {
  const { slug } = req.params;
  if (RESERVED_PATHS.has(slug) || slug.includes(".")) return next();

  const db = readDb();
  const link = db.links.find((l) => l.slug === slug);
  if (!link) return next();

  transaction((data) => {
    data.clicks.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      linkId: link.id,
      timestamp: new Date().toISOString(),
      referrer: (req.get("referer") || "").replace(/^https?:\/\//, "").split("/")[0] || null,
      device: detectDevice(req.get("user-agent")),
    });
  }).catch((err) => console.error("Failed to log click:", err));

  res.redirect(302, link.url);
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something broke on our end. Try again." });
});

require("./seed")
  .seedIfEmpty()
  .catch((err) => console.error("Seeding failed:", err))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`LinkVault running → http://localhost:${PORT}`);
    });
  });
