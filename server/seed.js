// seed.js — creates a read-only-in-spirit demo account on first boot so a
// reviewer can log in immediately without registering. Runs once: if any
// user already exists, it does nothing.

const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const { transaction, readDb } = require("./db");

function randomPastTimestamp(maxDaysAgo) {
  const daysAgo = Math.random() * maxDaysAgo;
  const d = new Date(Date.now() - daysAgo * 86400000);
  return d.toISOString();
}

async function seedIfEmpty() {
  const db = readDb();
  if (db.users.length > 0) return;

  const passwordHash = await bcrypt.hash("demo1234", 12);
  const userId = nanoid();
  const now = new Date().toISOString();

  const demoLinks = [
    { slug: "portfolio", url: "https://github.com", title: "GitHub Portfolio" },
    { slug: "resume-2026", url: "https://linkedin.com/in", title: "LinkedIn Resume" },
    { slug: "docs", url: "https://developer.mozilla.org", title: "Project Docs (MDN)" },
  ];

  const devices = ["Desktop", "Mobile", "Tablet"];
  const referrers = ["twitter.com", "linkedin.com", null, "google.com"];

  transaction((data) => {
    data.users.push({ id: userId, name: "Demo User", email: "demo@demo.com", passwordHash, createdAt: now });

    for (const dl of demoLinks) {
      const linkId = nanoid();
      data.links.push({ id: linkId, userId, slug: dl.slug, url: dl.url, title: dl.title, createdAt: now });

      const clickCount = 5 + Math.floor(Math.random() * 25);
      for (let i = 0; i < clickCount; i++) {
        data.clicks.push({
          id: `${Date.now()}-${nanoid(6)}`,
          linkId,
          timestamp: randomPastTimestamp(13),
          referrer: referrers[Math.floor(Math.random() * referrers.length)],
          device: devices[Math.floor(Math.random() * devices.length)],
        });
      }
    }
  });

  console.log("Seeded demo account → demo@demo.com / demo1234");
}

module.exports = { seedIfEmpty };
