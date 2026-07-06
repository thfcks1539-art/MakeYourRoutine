const express = require('express');
const db = require('../db');
const { DEFAULT_DRAW_CONFIG } = require('../utils');
const router = express.Router();

router.get('/', async (req, res) => {
  const rows = await db.prepare(`SELECT id, name, created_at FROM classes ORDER BY created_at DESC`).all();
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, teacher_pin } = req.body;
  if (!name || !teacher_pin) return res.status(400).json({ error: 'name, teacher_pin 필요' });
  const dup = await db.prepare(`SELECT 1 FROM classes WHERE name = ?`).get(name);
  if (dup) return res.status(409).json({ error: '이미 같은 이름의 학급이 있어요. 기존 학급 목록에서 로그인해주세요.' });
  const info = await db.prepare(`INSERT INTO classes (name, teacher_pin) VALUES (?, ?)`).run(name, teacher_pin);
  res.json({ id: info.lastInsertRowid, name });
});

router.post('/:id/login', async (req, res) => {
  const { teacher_pin } = req.body;
  const cls = await db.prepare(`SELECT * FROM classes WHERE id = ?`).get(req.params.id);
  if (!cls || cls.teacher_pin !== teacher_pin) return res.status(401).json({ error: '비밀번호가 틀렸습니다' });
  res.json({ id: cls.id, name: cls.name });
});

router.get('/:id', async (req, res) => {
  const cls = await db.prepare(`SELECT id, name, goal_gauge_target, reward_text, draw_config_json, praise_weight, concern_weight, created_at FROM classes WHERE id = ?`).get(req.params.id);
  if (!cls) return res.status(404).json({ error: 'not found' });
  const draw_config = cls.draw_config_json ? JSON.parse(cls.draw_config_json) : DEFAULT_DRAW_CONFIG;
  delete cls.draw_config_json;
  res.json({ ...cls, draw_config });
});

router.put('/:id', async (req, res) => {
  const { goal_gauge_target, reward_text, draw_config, praise_weight, concern_weight, current_pin, new_pin } = req.body;
  let newPinValue;
  if (new_pin !== undefined) {
    if (!current_pin || !new_pin) return res.status(400).json({ error: '현재 비밀번호와 새 비밀번호를 입력해주세요' });
    const cls = await db.prepare(`SELECT teacher_pin FROM classes WHERE id = ?`).get(req.params.id);
    if (!cls) return res.status(404).json({ error: 'not found' });
    if (cls.teacher_pin !== current_pin) return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다' });
    newPinValue = new_pin;
  }
  let drawConfigJson;
  if (draw_config) {
    const badNumbers = (draw_config.badNumbers || []).map(Number).filter(n => Number.isFinite(n));
    const lowNumbers = (draw_config.lowNumbers || []).map(Number).filter(n => Number.isFinite(n));
    const highNumbers = (draw_config.highNumbers || []).map(Number).filter(n => Number.isFinite(n));
    if (!lowNumbers.length || !highNumbers.length) {
      return res.status(400).json({ error: '보통 숫자와 특별한 숫자를 하나 이상 입력해주세요' });
    }
    drawConfigJson = JSON.stringify({
      badNumbers,
      badThreshold: Number(draw_config.badThreshold),
      lowNumbers,
      highNumbers,
      threshold: Number(draw_config.threshold),
      minChance: Number(draw_config.minChance),
      maxChance: Number(draw_config.maxChance)
    });
  }
  if (praise_weight !== undefined && praise_weight !== null && (typeof praise_weight !== 'number' || praise_weight < 0)) {
    return res.status(400).json({ error: '칭찬 가중치는 0 이상의 숫자여야 해요' });
  }
  if (concern_weight !== undefined && concern_weight !== null && (typeof concern_weight !== 'number' || concern_weight < 0)) {
    return res.status(400).json({ error: '아쉬움 가중치는 0 이상의 숫자여야 해요' });
  }
  await db.prepare(
    `UPDATE classes SET
       goal_gauge_target = COALESCE(?, goal_gauge_target),
       reward_text = COALESCE(?, reward_text),
       draw_config_json = COALESCE(?, draw_config_json),
       praise_weight = COALESCE(?, praise_weight),
       concern_weight = COALESCE(?, concern_weight),
       teacher_pin = COALESCE(?, teacher_pin)
     WHERE id = ?`
  ).run(goal_gauge_target ?? null, reward_text ?? null, drawConfigJson ?? null, praise_weight ?? null, concern_weight ?? null, newPinValue ?? null, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
