function todayStr() {
  // KST 기준 YYYY-MM-DD
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function dowOf(dateStr) {
  // 0=Sun ... 6=Sat, KST 기준
  const d = new Date(dateStr + 'T00:00:00+09:00');
  return d.getDay();
}

function addDays(dateStr, n) {
  // 'YYYY-MM-DD' 달력 날짜 기준 단순 가감 (타임존 변환 없음)
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nowHM() {
  // KST 기준 HH:MM
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(11, 16);
}

function isPastDeadline(deadlineTime) {
  if (!deadlineTime) return false;
  return nowHM() > deadlineTime;
}

function genCode(len = 4) {
  let code = '';
  for (let i = 0; i < len; i++) code += Math.floor(Math.random() * 10);
  return code;
}

async function pickMessage(db, classId, rate) {
  const tiers = await db.prepare(
    `SELECT * FROM encouragement_tiers WHERE class_id = ? OR class_id IS NULL ORDER BY (class_id IS NULL) ASC, sort_order ASC`
  ).all(classId);
  for (const t of tiers) {
    if (rate >= t.min_rate && rate <= t.max_rate) return t.message;
  }
  return '';
}

module.exports = { todayStr, dowOf, addDays, genCode, pickMessage, nowHM, isPastDeadline };
