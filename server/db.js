// db.js — a tiny file-backed "database".
// Why not a real SQL database? The brief asks for zero extra setup on a
// fresh clone (no Postgres install, no native bindings to compile). This
// module gives every write the same guarantees that matter for this app —
// atomic writes, consistent reads — without any install-time dependency.

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "db.json");

const EMPTY_DB = {
  users: [],
  links: [],
  clicks: [],
};

function ensureDbFile() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Corrupt file should never take the app down — fall back to empty.
    console.error("db.json failed to parse, resetting:", err.message);
    return structuredClone(EMPTY_DB);
  }
}

// Atomic write: write to a temp file then rename, so a crash mid-write
// never leaves db.json half-written / corrupted.
function writeDb(data) {
  ensureDbFile();
  const tmpPath = DB_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

// Simple mutex so two concurrent requests never interleave a read+write.
let queue = Promise.resolve();
function transaction(fn) {
  const result = queue.then(() => {
    const data = readDb();
    const returnValue = fn(data);
    writeDb(data);
    return returnValue;
  });
  // Keep the queue alive even if this transaction rejects.
  queue = result.catch(() => {});
  return result;
}

module.exports = { readDb, transaction };
