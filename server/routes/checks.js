const express = require('express');
const db = require('../db');
const { todayStr, dowOf, addDays } = require('../utils');
const router = express.Router();

function activeRoutinesFor(classId, studentId, date) {
  const dow = dowOf(date);
  const rows = db.prepare(
    `SELECT * FROM routines WHERE class_id = ? AND active = 1 AND (student_id IS NULL OR student_id = ?)`
  ).all(classId, studentId);
  return rows.filter(r => r.days_of_week.split(',').map(Number).includes(dow));
}

function ensureCheckRow(routineId, studentId, date, carriedOver) {
  const row = db.prepare(`SELECT * FROM routine_checks WHERE routine_id = ? AND student_id = ? AND date = ?`)
    .get(routineId, studentId, date);
  if (row) return row;
  db.prepare(`INSERT INTO routine_checks (routine_id, student_id, date, carried_over) VALUES (?, ?, ?, ?)`)
    .run(routineId, studentId, date, carriedOver ? 1 : 0);
  return db.prepare(`SELECT * FROM routine_checks WHERE routine_id = ? AND student_id = ? AND date = ?`)
    .get(routineId, studentId, date);
}

// 전날 미완료 루틴을 오늘로 이월
function carryOverRoutines(classId, studentId, date, scheduledIds) {
  const yesterday = addDays(date, -1);
  const missed = db.prepare(
    `SELECT rc.* FROM routine_checks rc
     JOIN routines r ON r.id = rc.routine_id
     WHERE rc.student_id = ? AND rc.date = ? AND rc.completed = 0 AND r.active = 1 AND r.class_id = ?`
  ).all(studentId, yesterday, classId);

  const carried = [];
  for (const mc of missed) {
    if (scheduledIds.has(mc.routine_id)) continue;
    const routine = db.prepare(`SELECT * FROM routines WHERE id = ?`).get(mc.routine_id);
    if (!routine) continue;
    const check = ensureCheckRow(routine.id, studentId, date, true);
    carried.push({ ...routine, check });
  }
  return carried;
}

function updateStreak(studentId, routineId, date, completedNow) {
  if (!completedNow) return;
  const row = db.prepare(`SELECT * FROM streaks WHERE student_id = ? AND routine_id = ?`).get(studentId, routineId);
  const yesterday = addDays(date, -1);
  if (!row) {
    db.prepare(`INSERT INTO streaks (student_id, routine_id, current_streak, best_streak, last_completed_date) VALUES (?, ?, 1, 1, ?)`)
      .run(studentId, routineId, date);
    return;
  }
  if (row.last_completed_date === date) return;
  const newStreak = row.last_completed_date === yesterday ? row.current_streak + 1 : 1;
  const best = Math.max(newStreak, row.best_streak);
  db.prepare(`UPDATE streaks SET current_streak = ?, best_streak = ?, last_completed_date = ? WHERE student_id = ? AND routine_id = ?`)
    .run(newStreak, best, date, studentId, routineId);
}

// 오늘 학생의 루틴 + 체크 상태
router.get('/today', (req, res) => {
  const { class_id, student_id } = req.query;
  const date = todayStr();
  const routines = activeRoutinesFor(class_id, student_id, date);
  const scheduled = routines.map(r => {
    const check = ensureCheckRow(r.id, student_id, date);
    return { ...r, check, carried_over: false };
  });
  const scheduledIds = new Set(routines.map(r => r.id));
  const carried = carryOverRoutines(class_id, student_id, date, scheduledIds)
    .map(r => ({ ...r, carried_over: true }));

  const result = [...scheduled, ...carried].sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id));
  res.json({ date, routines: result });
});

// 체크 toggle/증가
router.post('/toggle', (req, res) => {
  const { routine_id, student_id } = req.body;
  const date = todayStr();
  const routine = db.prepare(`SELECT * FROM routines WHERE id = ?`).get(routine_id);
  if (!routine) return res.status(404).json({ error: 'routine not found' });
  const row = ensureCheckRow(routine_id, student_id, date);

  let count, completed;
  if (row.completed) {
    count = 0;
    completed = 0;
  } else {
    count = Math.min(row.count + 1, routine.target_count);
    completed = count >= routine.target_count ? 1 : 0;
  }
  const completedAt = completed ? new Date().toISOString() : null;
  db.prepare(`UPDATE routine_checks SET count = ?, completed = ?, completed_at = ? WHERE id = ?`)
    .run(count, completed, completedAt, row.id);

  if (completed === 1 && !row.completed) {
    db.prepare(`UPDATE students SET points = points + 1 WHERE id = ?`).run(student_id);
  } else if (completed === 0 && row.completed) {
    db.prepare(`UPDATE students SET points = MAX(points - 1, 0) WHERE id = ?`).run(student_id);
  }

  updateStreak(student_id, routine_id, date, completed === 1);

  const student = db.prepare(`SELECT points FROM students WHERE id = ?`).get(student_id);
  res.json({ count, completed: !!completed, target_count: routine.target_count, points: student.points });
});

// 한 줄 회고
router.post('/reflection', (req, res) => {
  const { routine_id, student_id, emoji, text } = req.body;
  const date = todayStr();
  const row = ensureCheckRow(routine_id, student_id, date);
  db.prepare(`UPDATE routine_checks SET reflection_emoji = ?, reflection_text = ? WHERE id = ?`)
    .run(emoji || null, text || null, row.id);
  res.json({ ok: true });
});

router.get('/streaks', (req, res) => {
  const { student_id } = req.query;
  const rows = db.prepare(`SELECT * FROM streaks WHERE student_id = ?`).all(student_id);
  res.json(rows);
});

module.exports = router;
