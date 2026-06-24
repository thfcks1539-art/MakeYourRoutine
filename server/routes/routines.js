const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const classId = req.query.class_id;
  const studentId = req.query.student_id;
  let rows;
  if (studentId) {
    rows = await db.prepare(
      `SELECT * FROM routines WHERE class_id = ? AND active = 1 AND (student_id IS NULL OR student_id = ?)
       AND id NOT IN (SELECT routine_id FROM routine_exclusions WHERE student_id = ?)
       ORDER BY sort_order ASC, id ASC`
    ).all(classId, studentId, studentId);
  } else {
    rows = await db.prepare(
      `SELECT * FROM routines WHERE class_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC`
    ).all(classId);
    // 루틴 관리 화면에서 어떤 학생이 제외돼 있는지 보여주기 위해 함께 붙여줌
    if (rows.length) {
      const placeholders = rows.map(() => '?').join(',');
      const exclusions = await db.prepare(
        `SELECT routine_id, student_id FROM routine_exclusions WHERE routine_id IN (${placeholders})`
      ).all(...rows.map(r => r.id));
      const map = new Map();
      for (const e of exclusions) {
        if (!map.has(e.routine_id)) map.set(e.routine_id, []);
        map.get(e.routine_id).push(e.student_id);
      }
      rows.forEach(r => { r.excluded_student_ids = map.get(r.id) || []; });
    }
  }
  res.json(rows);
});

// 이 루틴에서 제외할 학생 목록을 통째로 교체 (체크된 학생들로 덮어씀)
router.put('/:id/exclusions', async (req, res) => {
  const { student_ids } = req.body;
  const ids = Array.isArray(student_ids) ? student_ids.map(Number).filter(Number.isFinite) : [];
  await db.prepare(`DELETE FROM routine_exclusions WHERE routine_id = ?`).run(req.params.id);
  if (ids.length) {
    const values = ids.map(() => '(?, ?)').join(', ');
    const params = [];
    ids.forEach(id => params.push(req.params.id, id));
    await db.prepare(`INSERT INTO routine_exclusions (routine_id, student_id) VALUES ${values}`).run(...params);
  }
  res.json({ ok: true, excluded_student_ids: ids });
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
