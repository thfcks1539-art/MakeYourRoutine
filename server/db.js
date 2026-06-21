const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, '..', 'data', 'routine.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith('file:')) {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

const client = createClient(authToken ? { url, authToken } : { url });

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function prepare(sql) {
  return {
    async run(...params) {
      const rs = await client.execute({ sql, args: params });
      return {
        lastInsertRowid: rs.lastInsertRowid !== undefined ? Number(rs.lastInsertRowid) : undefined,
        changes: rs.rowsAffected
      };
    },
    async get(...params) {
      const rs = await client.execute({ sql, args: params });
      return rs.rows[0] ? rowToObject(rs.rows[0], rs.columns) : undefined;
    },
    async all(...params) {
      const rs = await client.execute({ sql, args: params });
      return rs.rows.map(r => rowToObject(r, rs.columns));
    }
  };
}

async function exec(sql) {
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
}

let ready;
function init() {
  if (!ready) {
    ready = (async () => {
      const migrationPath = path.join(__dirname, 'migrations', '001_init.sql');
      if (!fs.existsSync(migrationPath)) {
        console.warn('마이그레이션 파일을 찾을 수 없어 건너뜁니다 (이미 적용된 스키마를 사용한다고 가정):', migrationPath);
        return;
      }
      const migration = fs.readFileSync(migrationPath, 'utf8');
      await exec(migration);
    })();
  }
  return ready;
}

module.exports = { prepare, exec, init };
