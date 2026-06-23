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

// 여러 SQL을 한 번의 네트워크 왕복으로 실행 (원격 DB 환경에서 지연 누적 방지)
async function batch(statements) {
  const results = await client.batch(
    statements.map(s => ({ sql: s.sql, args: s.params || [] })),
    'write'
  );
  return results.map(rs => ({
    rows: rs.rows.map(r => rowToObject(r, rs.columns)),
    lastInsertRowid: rs.lastInsertRowid !== undefined ? Number(rs.lastInsertRowid) : undefined,
    changes: rs.rowsAffected
  }));
}

async function exec(sql) {
  const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }
}

async function columnExists(table, column) {
  const rs = await client.execute(`PRAGMA table_info(${table})`);
  const nameIdx = rs.columns.indexOf('name');
  return rs.rows.some(r => r[nameIdx] === column);
}

async function ensureColumn(table, column, ddl) {
  if (!(await columnExists(table, column))) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
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
      await ensureColumn('routines', 'deadline_time', 'deadline_time TEXT');
      await ensureColumn('classes', 'draw_config_json', 'draw_config_json TEXT');
      await ensureColumn('daily_draws', 'tier', 'tier TEXT');
    })();
  }
  return ready;
}

module.exports = { prepare, exec, batch, init };
