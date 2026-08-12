const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { nanoid } = require("nanoid");
const { transaction } = require("../db");

const router = express.Router();

// --- tiny in-memory rate limiter (per IP+route) ---------------------------
// Fine for a trial/demo app; swap for a store like Redis if this ever needs
// to survive a server restart or run across multiple instances.
const attempts = new Map(); // key -> [timestamps]
function rateLimited(key, max = 8, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  attempts.set(key, list);
  return list.length > max;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Enter your name." });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await transaction((db) => {
      if (db.users.some((u) => u.email === normalizedEmail)) {
        throw Object.assign(new Error("taken"), { code: "EMAIL_TAKEN" });
      }
      const newUser = {
        id: nanoid(),
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      db.users.push(newUser);
      return newUser;
    });

    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === "EMAIL_TAKEN") {
      return res.status(409).json({ error: "An account with that email already exists." });
    }
    console.error(err);
    return res.status(500).json({ error: "Could not create your account. Try again." });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const key = `login:${req.ip}:${(email || "").toLowerCase()}`;

  if (rateLimited(key)) {
    return res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
  }
  if (!email || !password) {
    return res.status(400).json({ error: "Enter your email and password." });
  }

  const db = require("../db").readDb();
  const user = db.users.find((u) => u.email === email.trim().toLowerCase());

  // Always compare against something to keep timing consistent whether or
  // not the user exists — avoids leaking which emails are registered.
  const hashToCheck = user ? user.passwordHash : "$2a$12$invalidsaltinvalidsaltinvalidsalOe";
  const valid = await bcrypt.compare(password, hashToCheck);

  if (!user || !valid) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }

  return res.json({ token: issueToken(user), user: publicUser(user) });
});

router.get("/me", require("../middleware/auth").requireAuth, (req, res) => {
  const db = require("../db").readDb();
  const user = db.users.find((u) => u.id === req.userId);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ user: publicUser(user) });
});

module.exports = router;
