const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const classId = req.query.class_id;
  const studentId = req.query.student_id;
  let rows;
  if (studentId) {
    rows = await db.prepare(
      `SELECT * FROM routines WHERE class_id = ? AND active = 1 AND (student_id IS NULL OR student_id = ?) ORDER BY sort_order ASC, id ASC`
    ).all(classId, studentId);
  } else {
    rows = await db.prepare(
      `SELECT * FROM routines WHERE class_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC`
    ).all(classId);
  }
  res.json(rows);
});

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

router.post('/', async (req, res) => {
  const { class_id, student_id, title, icon, time_slot, days_of_week, target_count, sort_order, start_time, deadline_time } = req.body;
  if (!class_id || !title) return res.status(400).json({ error: 'class_id, title 필요' });
  if (start_time && !TIME_RE.test(start_time)) {
    return res.status(400).json({ error: '시작 시간은 HH:MM 형식이어야 해요' });
  }
  if (deadline_time && !TIME_RE.test(deadline_time)) {
    return res.status(400).json({ error: '마감 시간은 HH:MM 형식이어야 해요' });
  }
  if (start_time && deadline_time && start_time >= deadline_time) {
    return res.status(400).json({ error: '시작 시간은 마감 시간보다 빨라야 해요' });
  }
  const info = await db.prepare(
    `INSERT INTO routines (class_id, student_id, title, icon, time_slot, days_of_week, target_count, sort_order, start_time, deadline_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    class_id,
    student_id || null,
    title,
    icon || '✅',
    time_slot || '하루',
    days_of_week || '0,1,2,3,4,5,6',
    target_count || 1,
    sort_order || 0,
    start_time || null,
    deadline_time || null
  );
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', async (req, res) => {
  const { title, icon, time_slot, days_of_week, target_count, active, sort_order, start_time, deadline_time } = req.body;
  if (start_time && !TIME_RE.test(start_time)) {
    return res.status(400).json({ error: '시작 시간은 HH:MM 형식이어야 해요' });
  }
  if (deadline_time && !TIME_RE.test(deadline_time)) {
    return res.status(400).json({ error: '마감 시간은 HH:MM 형식이어야 해요' });
  }
  if (start_time && deadline_time && start_time >= deadline_time) {
    return res.status(400).json({ error: '시작 시간은 마감 시간보다 빨라야 해요' });
  }
  await db.prepare(
    `UPDATE routines SET
      title = COALESCE(?, title),
      icon = COALESCE(?, icon),
      time_slot = COALESCE(?, time_slot),
      days_of_week = COALESCE(?, days_of_week),
      target_count = COALESCE(?, target_count),
      active = COALESCE(?, active),
      sort_order = COALESCE(?, sort_order),
      start_time = ?,
      deadline_time = ?
     WHERE id = ?`
  ).run(
    title ?? null,
    icon ?? null,
    time_slot ?? null,
    days_of_week ?? null,
    target_count ?? null,
    active ?? null,
    sort_order ?? null,
    start_time ?? null,
    deadline_time ?? null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await db.prepare(`UPDATE routines SET active = 0 WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
