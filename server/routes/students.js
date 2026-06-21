const express = require('express');
const db = require('../db');
const { genCode } = require('../utils');
const router = express.Router();

router.get('/', async (req, res) => {
  const classId = req.query.class_id;
  const rows = await db.prepare(
    `SELECT id, class_id, nickname, number, login_code, points, avatar_json FROM students WHERE class_id = ? ORDER BY number ASC`
  ).all(classId);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const row = await db.prepare(
    `SELECT id, class_id, nickname, number, points, avatar_json FROM students WHERE id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.put('/:id/avatar', async (req, res) => {
  const { avatar_json } = req.body;
  await db.prepare(`UPDATE students SET avatar_json = ? WHERE id = ?`).run(JSON.stringify(avatar_json || {}), req.params.id);
  res.json({ ok: true });
});

router.post('/', async (req, res) => {
  const { class_id, nickname, number } = req.body;
  if (!class_id || !nickname) return res.status(400).json({ error: 'class_id, nickname 필요' });
  let code;
  for (let i = 0; i < 20; i++) {
    code = genCode(4);
    const exists = await db.prepare(`SELECT 1 FROM students WHERE login_code = ?`).get(code);
    if (!exists) break;
  }
  const info = await db.prepare(
    `INSERT INTO students (class_id, nickname, number, login_code) VALUES (?, ?, ?, ?)`
  ).run(class_id, nickname, number || null, code);
  res.json({ id: info.lastInsertRowid, nickname, number, login_code: code });
});

router.put('/:id', async (req, res) => {
  const { login_code } = req.body;
  if (!login_code) return res.status(400).json({ error: 'login_code 필요' });
  if (!/^\d{4}$/.test(login_code)) return res.status(400).json({ error: '코드는 숫자 4자리여야 해요' });
  const dup = await db.prepare(`SELECT 1 FROM students WHERE login_code = ? AND id != ?`).get(login_code, req.params.id);
  if (dup) return res.status(409).json({ error: '이미 다른 학생이 쓰고 있는 코드예요' });
  await db.prepare(`UPDATE students SET login_code = ? WHERE id = ?`).run(login_code, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await db.prepare(`DELETE FROM students WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const { login_code } = req.body;
  const student = await db.prepare(`SELECT * FROM students WHERE login_code = ?`).get(login_code);
  if (!student) return res.status(401).json({ error: '코드가 올바르지 않습니다' });
  res.json({ id: student.id, nickname: student.nickname, class_id: student.class_id });
});

module.exports = router;
