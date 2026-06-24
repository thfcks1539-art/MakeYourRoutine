const express = require('express');
const db = require('../db');
const { todayStr, addDays } = require('../utils');
const router = express.Router();

// 학급 전체 칭찬/아쉬움 기록 목록 (최근 N일, 통계 화면에서 수정/삭제용으로도 사용)
router.get('/', async (req, res) => {
  const { class_id } = req.query;
  const days = Number(req.query.days || 14);
  const since = addDays(todayStr(), -(days - 1));
  const rows = await db.prepare(
    `SELECT * FROM class_notes WHERE class_id = ? AND date >= ? ORDER BY date DESC, created_at DESC`
  ).all(class_id, since);
  res.json(rows);
});

// 칭찬(praise)/아쉬움(concern) 기록 추가: 그날 학급 전체 루틴 % 에 가중치만큼 +/- 됨
router.post('/', async (req, res) => {
  const { class_id, type, text } = req.body;
  const date = req.body.date || todayStr();
  if (!class_id || !['praise', 'concern'].includes(type)) {
    return res.status(400).json({ error: 'class_id, type(praise 또는 concern)이 필요해요' });
  }
  const info = await db.prepare(
    `INSERT INTO class_notes (class_id, date, type, text) VALUES (?, ?, ?, ?)`
  ).run(class_id, date, type, text || null);
  res.json({ id: info.lastInsertRowid, class_id, date, type, text: text || null });
});

router.put('/:id', async (req, res) => {
  const { type, text } = req.body;
  if (type && !['praise', 'concern'].includes(type)) {
    return res.status(400).json({ error: 'type은 praise 또는 concern이어야 해요' });
  }
  await db.prepare(
    `UPDATE class_notes SET
       type = COALESCE(?, type),
       text = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(type || null, text ?? null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  await db.prepare(`DELETE FROM class_notes WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
