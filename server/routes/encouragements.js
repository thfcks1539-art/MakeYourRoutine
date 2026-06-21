const express = require('express');
const db = require('../db');
const router = express.Router();

router.post('/', async (req, res) => {
  const { class_id, to_student_id, message, emoji } = req.body;
  if (!class_id || !to_student_id || !message) return res.status(400).json({ error: 'class_id, to_student_id, message 필요' });
  const info = await db.prepare(
    `INSERT INTO encouragements (class_id, from_role, to_student_id, message, emoji) VALUES (?, 'teacher', ?, ?, ?)`
  ).run(class_id, to_student_id, message, emoji || null);
  res.json({ id: info.lastInsertRowid });
});

router.get('/', async (req, res) => {
  const { student_id, unread_only } = req.query;
  let rows;
  if (unread_only === '1') {
    rows = await db.prepare(
      `SELECT * FROM encouragements WHERE to_student_id = ? AND read_at IS NULL ORDER BY created_at DESC`
    ).all(student_id);
  } else {
    rows = await db.prepare(
      `SELECT * FROM encouragements WHERE to_student_id = ? ORDER BY created_at DESC LIMIT 50`
    ).all(student_id);
  }
  res.json(rows);
});

router.post('/:id/read', async (req, res) => {
  await db.prepare(`UPDATE encouragements SET read_at = datetime('now') WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
