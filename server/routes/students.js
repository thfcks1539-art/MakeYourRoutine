const express = require('express');
const db = require('../db');
const { genCode } = require('../utils');
const router = express.Router();

router.get('/', (req, res) => {
  const classId = req.query.class_id;
  const rows = db.prepare(
    `SELECT id, class_id, nickname, number, login_code, points, avatar_json FROM students WHERE class_id = ? ORDER BY number ASC`
  ).all(classId);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT id, class_id, nickname, number, points, avatar_json FROM students WHERE id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.put('/:id/avatar', (req, res) => {
  const { avatar_json } = req.body;
  db.prepare(`UPDATE students SET avatar_json = ? WHERE id = ?`).run(JSON.stringify(avatar_json || {}), req.params.id);
  res.json({ ok: true });
});

router.post('/', (req, res) => {
  const { class_id, nickname, number } = req.body;
  if (!class_id || !nickname) return res.status(400).json({ error: 'class_id, nickname 필요' });
  let code;
  for (let i = 0; i < 20; i++) {
    code = genCode(4);
    const exists = db.prepare(`SELECT 1 FROM students WHERE login_code = ?`).get(code);
    if (!exists) break;
  }
  const info = db.prepare(
    `INSERT INTO students (class_id, nickname, number, login_code) VALUES (?, ?, ?, ?)`
  ).run(class_id, nickname, number || null, code);
  res.json({ id: info.lastInsertRowid, nickname, number, login_code: code });
});

router.put('/:id', (req, res) => {
  const { login_code } = req.body;
  if (!login_code) return res.status(400).json({ error: 'login_code 필요' });
  if (!/^\d{4}$/.test(login_code)) return res.status(400).json({ error: '코드는 숫자 4자리여야 해요' });
  const dup = db.prepare(`SELECT 1 FROM students WHERE login_code = ? AND id != ?`).get(login_code, req.params.id);
  if (dup) return res.status(409).json({ error: '이미 다른 학생이 쓰고 있는 코드예요' });
  db.prepare(`UPDATE students SET login_code = ? WHERE id = ?`).run(login_code, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM students WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { login_code } = req.body;
  const student = db.prepare(`SELECT * FROM students WHERE login_code = ?`).get(login_code);
  if (!student) return res.status(401).json({ error: '코드가 올바르지 않습니다' });
  req.session.studentId = student.id;
  req.session.classId = student.class_id;
  res.json({ id: student.id, nickname: student.nickname, class_id: student.class_id });
});

module.exports = router;
