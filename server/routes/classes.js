const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT id, name, created_at FROM classes ORDER BY created_at DESC`).all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, teacher_pin } = req.body;
  if (!name || !teacher_pin) return res.status(400).json({ error: 'name, teacher_pin 필요' });
  const dup = db.prepare(`SELECT 1 FROM classes WHERE name = ?`).get(name);
  if (dup) return res.status(409).json({ error: '이미 같은 이름의 학급이 있어요. 기존 학급 목록에서 로그인해주세요.' });
  const info = db.prepare(`INSERT INTO classes (name, teacher_pin) VALUES (?, ?)`).run(name, teacher_pin);
  res.json({ id: info.lastInsertRowid, name });
});

router.post('/:id/login', (req, res) => {
  const { teacher_pin } = req.body;
  const cls = db.prepare(`SELECT * FROM classes WHERE id = ?`).get(req.params.id);
  if (!cls || cls.teacher_pin !== teacher_pin) return res.status(401).json({ error: '비밀번호가 틀렸습니다' });
  req.session.teacherClassId = cls.id;
  res.json({ id: cls.id, name: cls.name });
});

router.get('/:id', (req, res) => {
  const cls = db.prepare(`SELECT id, name, goal_gauge_target, reward_text, created_at FROM classes WHERE id = ?`).get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'not found' });
  res.json(cls);
});

router.put('/:id', (req, res) => {
  const { goal_gauge_target, reward_text } = req.body;
  db.prepare(`UPDATE classes SET goal_gauge_target = COALESCE(?, goal_gauge_target), reward_text = COALESCE(?, reward_text) WHERE id = ?`)
    .run(goal_gauge_target, reward_text, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
