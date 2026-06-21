const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const raw = new DatabaseSync(path.join(dataDir, 'routine.db'));
raw.exec('PRAGMA journal_mode = WAL');
raw.exec('PRAGMA foreign_keys = ON');

const migration = fs.readFileSync(path.join(__dirname, 'migrations', '001_init.sql'), 'utf8');
raw.exec(migration);

// better-sqlite3 호환 래퍼: prepare().run/get/all 패턴을 그대로 사용
const db = {
  prepare(sql) {
    const stmt = raw.prepare(sql);
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params)
    };
  },
  exec(sql) { return raw.exec(sql); }
};

module.exports = db;
