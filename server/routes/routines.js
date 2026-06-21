const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const classId = req.query.class_id;
  const studentId = req.query.student_id;
  let rows;
  if (studentId) {
    rows = db.prepare(
      `SELECT * FROM routines WHERE class_id = ? AND active = 1 AND (student_id IS NULL OR student_id = ?) ORDER BY sort_order ASC, id ASC`
    ).all(classId, studentId);
  } else {
    rows = db.prepare(
      `SELECT * FROM routines WHERE class_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC`
    ).all(classId);
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { class_id, student_id, title, icon, time_slot, days_of_week, target_count, sort_order } = req.body;
  if (!class_id || !title) return res.status(400).json({ error: 'class_id, title 필요' });
  const info = db.prepare(
    `INSERT INTO routines (class_id, student_id, title, icon, time_slot, days_of_week, target_count, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    class_id,
    student_id || null,
    title,
    icon || '✅',
    time_slot || '하루',
    days_of_week || '0,1,2,3,4,5,6',
    target_count || 1,
    sort_order || 0
  );
  res.json({ id: info.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { title, icon, time_slot, days_of_week, target_count, active, sort_order } = req.body;
  db.prepare(
    `UPDATE routines SET
      title = COALESCE(?, title),
      icon = COALESCE(?, icon),
      time_slot = COALESCE(?, time_slot),
      days_of_week = COALESCE(?, days_of_week),
      target_count = COALESCE(?, target_count),
      active = COALESCE(?, active),
      sort_order = COALESCE(?, sort_order)
     WHERE id = ?`
  ).run(title, icon, time_slot, days_of_week, target_count, active, sort_order, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare(`UPDATE routines SET active = 0 WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
