const express = require('express');
const db = require('../db');
const { todayStr, dowOf, addDays, isPastDeadline, isBeforeStart } = require('../utils');
const router = express.Router();

async function activeRoutinesFor(classId, studentId, date) {
  const dow = dowOf(date);
  const rows = await db.prepare(
    `SELECT * FROM routines WHERE class_id = ? AND active = 1 AND (student_id IS NULL OR student_id = ?)
     AND id NOT IN (SELECT routine_id FROM routine_exclusions WHERE student_id = ?)`
  ).all(classId, studentId, studentId);
  return rows.filter(r => {
    if (r.task_date) return r.task_date === date;
    return r.days_of_week && r.days_of_week.split(',').map(Number).includes(dow);
  });
}

async function ensureCheckRow(routineId, studentId, date, carriedOver) {
  const row = await db.prepare(`SELECT * FROM routine_checks WHERE routine_id = ? AND student_id = ? AND date = ?`)
    .get(routineId, studentId, date);
  if (row) return row;
  await db.prepare(`INSERT INTO routine_checks (routine_id, student_id, date, carried_over) VALUES (?, ?, ?, ?)`)
    .run(routineId, studentId, date, carriedOver ? 1 : 0);
  return db.prepare(`SELECT * FROM routine_checks WHERE routine_id = ? AND student_id = ? AND date = ?`)
    .get(routineId, studentId, date);
}

// routineIds 전체에 대해 한 번의 SELECT + (필요시) 한 번의 INSERT로 체크 행을 준비 (N+1 회피)
async function ensureCheckRowsBatch(routineIds, studentId, date, carriedOver) {
  const map = new Map();
  if (!routineIds.length) return map;

  const placeholders = routineIds.map(() => '?').join(',');
  const existing = await db.prepare(
    `SELECT * FROM routine_checks WHERE student_id = ? AND date = ? AND routine_id IN (${placeholders})`
  ).all(studentId, date, ...routineIds);
  existing.forEach(c => map.set(c.routine_id, c));

  const missing = routineIds.filter(id => !map.has(id));
  if (missing.length) {
    const values = missing.map(() => '(?, ?, ?, ?)').join(', ');
    const params = [];
    missing.forEach(id => params.push(id, studentId, date, carriedOver ? 1 : 0));
    await db.prepare(`INSERT INTO routine_checks (routine_id, student_id, date, carried_over) VALUES ${values}`).run(...params);
    missing.forEach(id => map.set(id, {
      routine_id: id, student_id: Number(studentId), date,
      count: 0, completed: 0, completed_at: null,
      carried_over: carriedOver ? 1 : 0, reflection_emoji: null, reflection_text: null
    }));
  }
  return map;
}

// 전날 미완료 루틴을 오늘로 이월
async function carryOverRoutines(classId, studentId, date, scheduledIds) {
  const yesterday = addDays(date, -1);
  const missed = await db.prepare(
    `SELECT rc.* FROM routine_checks rc
     JOIN routines r ON r.id = rc.routine_id
     WHERE rc.student_id = ? AND rc.date = ? AND rc.completed = 0 AND r.active = 1 AND r.class_id = ?
     AND r.task_date IS NULL
     AND r.id NOT IN (SELECT routine_id FROM routine_exclusions WHERE student_id = ?)`
  ).all(studentId, yesterday, classId, studentId);

  const candidateIds = [...new Set(missed.map(mc => mc.routine_id).filter(id => !scheduledIds.has(id)))];
  if (!candidateIds.length) return [];

  const placeholders = candidateIds.map(() => '?').join(',');
  const routines = await db.prepare(`SELECT * FROM routines WHERE id IN (${placeholders})`).all(...candidateIds);
  const routineMap = new Map(routines.map(r => [r.id, r]));

  const checkMap = await ensureCheckRowsBatch(candidateIds, studentId, date, true);

  return candidateIds
    .filter(id => routineMap.has(id))
    .map(id => ({ ...routineMap.get(id), check: checkMap.get(id) }));
}

// 오늘 학생의 루틴 + 체크 상태
router.get('/today', async (req, res) => {
  const { class_id, student_id } = req.query;
  const date = todayStr();
  const routines = await activeRoutinesFor(class_id, student_id, date);
  const scheduledIds = new Set(routines.map(r => r.id));

  const checkMap = await ensureCheckRowsBatch(routines.map(r => r.id), student_id, date, false);
  const scheduled = routines.map(r => ({
    ...r, check: checkMap.get(r.id), carried_over: false,
    not_started: isBeforeStart(r.start_time),
    locked: isPastDeadline(r.deadline_time) || isBeforeStart(r.start_time)
  }));

  const carriedRows = await carryOverRoutines(class_id, student_id, date, scheduledIds);
  const carried = carriedRows.map(r => ({
    ...r, carried_over: true,
    not_started: isBeforeStart(r.start_time),
    locked: isPastDeadline(r.deadline_time) || isBeforeStart(r.start_time)
  }));

  const result = [...scheduled, ...carried].sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
  res.json({ date, routines: result });
});

// 체크 toggle/증가
router.post('/toggle', async (req, res) => {
  const { routine_id, student_id } = req.body;
  const date = todayStr();
  const yesterday = addDays(date, -1);

  // 읽기 3건을 한 번의 왕복으로 처리 (원격 DB 지연 누적 방지)
  const [routineRes, checkRes, streakRes, studentRes] = await db.batch([
    { sql: `SELECT * FROM routines WHERE id = ?`, params: [routine_id] },
    { sql: `SELECT * FROM routine_checks WHERE routine_id = ? AND student_id = ? AND date = ?`, params: [routine_id, student_id, date] },
    { sql: `SELECT * FROM streaks WHERE student_id = ? AND routine_id = ?`, params: [student_id, routine_id] },
    { sql: `SELECT points FROM students WHERE id = ?`, params: [student_id] }
  ]);

  const routine = routineRes.rows[0];
  if (!routine) return res.status(404).json({ error: 'routine not found' });
  if (isBeforeStart(routine.start_time)) {
    return res.status(403).json({ error: `시작 시간(${routine.start_time}) 이전에는 체크할 수 없어요` });
  }
  if (isPastDeadline(routine.deadline_time)) {
    return res.status(403).json({ error: `마감 시간(${routine.deadline_time})이 지나서 체크할 수 없어요` });
  }

  const existingCheck = checkRes.rows[0];
  const prevCompleted = existingCheck ? existingCheck.completed : 0;
  const prevCount = existingCheck ? existingCheck.count : 0;

  let count, completed;
  if (prevCompleted) {
    count = 0;
    completed = 0;
  } else {
    count = Math.min(prevCount + 1, routine.target_count);
    completed = count >= routine.target_count ? 1 : 0;
  }
  const completedAt = completed ? new Date().toISOString() : null;

  let pointsDelta = 0;
  if (completed === 1 && !prevCompleted) pointsDelta = 1;
  else if (completed === 0 && prevCompleted) pointsDelta = -1;

  const currentPoints = studentRes.rows[0] ? studentRes.rows[0].points : 0;
  const newPoints = Math.max(currentPoints + pointsDelta, 0);

  const writes = [{
    sql: `INSERT INTO routine_checks (routine_id, student_id, date, count, completed, completed_at, carried_over)
          VALUES (?, ?, ?, ?, ?, ?, 0)
          ON CONFLICT(routine_id, student_id, date)
          DO UPDATE SET count = excluded.count, completed = excluded.completed, completed_at = excluded.completed_at`,
    params: [routine_id, student_id, date, count, completed, completedAt]
  }];

  if (pointsDelta !== 0) {
    writes.push({ sql: `UPDATE students SET points = ? WHERE id = ?`, params: [newPoints, student_id] });
  }

  if (completed === 1) {
    const streakRow = streakRes.rows[0];
    if (!streakRow) {
      writes.push({
        sql: `INSERT INTO streaks (student_id, routine_id, current_streak, best_streak, last_completed_date) VALUES (?, ?, 1, 1, ?)`,
        params: [student_id, routine_id, date]
      });
    } else if (streakRow.last_completed_date !== date) {
      const newStreak = streakRow.last_completed_date === yesterday ? streakRow.current_streak + 1 : 1;
      const best = Math.max(newStreak, streakRow.best_streak);
      writes.push({
        sql: `UPDATE streaks SET current_streak = ?, best_streak = ?, last_completed_date = ? WHERE student_id = ? AND routine_id = ?`,
        params: [newStreak, best, date, student_id, routine_id]
      });
    }
  }

  // 쓰기도 한 번의 왕복으로 처리
  await db.batch(writes);

  res.json({ count, completed: !!completed, target_count: routine.target_count, points: newPoints });
});

// 결석/등교 안 함 표시 토글 (전자칠판에서): 표시된 날은 루틴 %·게이지 계산에서 제외됨
router.post('/absence', async (req, res) => {
  const { student_id, absent } = req.body;
  const date = req.body.date || todayStr();
  if (absent) {
    await db.prepare(`INSERT INTO student_absences (student_id, date) VALUES (?, ?) ON CONFLICT(student_id, date) DO NOTHING`)
      .run(student_id, date);
  } else {
    await db.prepare(`DELETE FROM student_absences WHERE student_id = ? AND date = ?`).run(student_id, date);
  }
  res.json({ student_id, date, absent: !!absent });
});

// 한 줄 회고
router.post('/reflection', async (req, res) => {
  const { routine_id, student_id, emoji, text } = req.body;
  const date = todayStr();
  const row = await ensureCheckRow(routine_id, student_id, date);
  await db.prepare(`UPDATE routine_checks SET reflection_emoji = ?, reflection_text = ? WHERE id = ?`)
    .run(emoji || null, text || null, row.id);
  res.json({ ok: true });
});

router.get('/streaks', async (req, res) => {
  const { student_id } = req.query;
  const rows = await db.prepare(`SELECT * FROM streaks WHERE student_id = ?`).all(student_id);
  res.json(rows);
});

module.exports = router;
