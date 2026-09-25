// Tiny JSON-file store (no dependencies). Good enough for a single-instance app.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'clients.json');

let cache = null;
let writeTimer = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = [];
  }
  return cache;
}

function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  }, 50);
}

export const store = {
  all() {
    return [...load()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  get(id) {
    return load().find((c) => c.id === id) || null;
  },
  insert(record) {
    load().push(record);
    persist();
    return record;
  },
  update(id, patch) {
    const rec = this.get(id);
    if (!rec) return null;
    Object.assign(rec, typeof patch === 'function' ? patch(rec) : patch, {
      updatedAt: new Date().toISOString(),
    });
    persist();
    return rec;
  },
  remove(id) {
    const list = load();
    const i = list.findIndex((c) => c.id === id);
    if (i === -1) return false;
    list.splice(i, 1);
    persist();
    return true;
  },
};
