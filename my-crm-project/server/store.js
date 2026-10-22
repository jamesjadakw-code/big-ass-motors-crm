const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// BAM_DB lets tests run against a throwaway file without touching real data.
const FILE = process.env.BAM_DB || path.join(__dirname, 'data', 'db.json');
let db = null;

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

function get() {
  if (db) return db;
  if (!fs.existsSync(FILE)) {
    db = require('./seed')();
    save();
    return db;
  }
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    // Never replace unreadable data with sample data: keep a copy and refuse to start.
    const bak = `${FILE}.corrupt-${Date.now()}`;
    fs.copyFileSync(FILE, bak);
    throw new Error(`${FILE} is not valid JSON (${e.message}). A copy was saved to ${bak}. Fix or restore it, then restart.`);
  }
  return db;
}

const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();

module.exports = { get, save, id, now };
