const express = require('express');
const db = require('../db');
const { todayStr, dowOf, pickMessage } = require('../utils');
const router = express.Router();

function routinesForStudent(classId, studentId, dow) {
  const rows = db.prepare(
    `SELECT * FROM routines WHERE class_id = ? AND active = 1 AND (student_id IS NULL OR student_id = ?)`
  ).all(classId, studentId);
  return rows.filter(r => r.days_of_week.split(',').map(Number).includes(dow));
}

// 교사 대시보드: 학급 전체 게이지 + 학생별 완료율 + 메시지
router.get('/dashboard', (req, res) => {
  const classId = req.query.class_id;
  const date = req.query.date || todayStr();
  const dow = dowOf(date);

  const students = db.prepare(`SELECT id, nickname, number, points, avatar_json FROM students WHERE class_id = ? ORDER BY number ASC`).all(classId);

  let totalRoutines = 0;
  let totalCompleted = 0;

  const studentStats = students.map(s => {
    const routines = routinesForStudent(classId, s.id, dow);
    const checks = db.prepare(
      `SELECT * FROM routine_checks WHERE student_id = ? AND date = ?`
    ).all(s.id, date);
    const checkMap = new Map(checks.map(c => [c.routine_id, c]));

    let completedCount = 0;
    const routineDetail = routines.map(r => {
      const c = checkMap.get(r.id);
      const completed = c ? !!c.completed : false;
      if (completed) completedCount++;
      return {
        routine_id: r.id,
        title: r.title,
        icon: r.icon,
        completed,
        count: c ? c.count : 0,
        target_count: r.target_count
      };
    });

    const rate = routines.length ? completedCount / routines.length : 0;
    totalRoutines += routines.length;
    totalCompleted += completedCount;

    return {
      student_id: s.id,
      nickname: s.nickname,
      number: s.number,
      points: s.points,
      avatar_json: s.avatar_json ? JSON.parse(s.avatar_json) : null,
      rate,
      completed_count: completedCount,
      total_count: routines.length,
      message: pickMessage(db, classId, rate),
      routines: routineDetail
    };
  });

  const classRate = totalRoutines ? totalCompleted / totalRoutines : 0;
  const cls = db.prepare(`SELECT goal_gauge_target, reward_text FROM classes WHERE id = ?`).get(classId);

  res.json({
    date,
    class_rate: classRate,
    goal_gauge_target: cls ? cls.goal_gauge_target : 80,
    reward_text: cls ? cls.reward_text : null,
    students: studentStats
  });
});

// 하루 마감: 오늘(또는 지정 날짜)의 학급 통계를 daily_class_summary에 스냅샷으로 저장
router.post('/day-end', (req, res) => {
  const classId = req.body.class_id;
  const date = req.body.date || todayStr();
  const dow = dowOf(date);

  const students = db.prepare(`SELECT id FROM students WHERE class_id = ?`).all(classId);

  let totalRoutines = 0;
  let totalCompleted = 0;
  let participants = 0;

  for (const s of students) {
    const routines = routinesForStudent(classId, s.id, dow);
    if (!routines.length) continue;
    const checks = db.prepare(`SELECT * FROM routine_checks WHERE student_id = ? AND date = ?`).all(s.id, date);
    const completedCount = checks.filter(c => c.completed).length;
    totalRoutines += routines.length;
    totalCompleted += completedCount;
    if (completedCount > 0) participants++;
  }

  const completionRate = totalRoutines ? totalCompleted / totalRoutines : 0;

  db.prepare(
    `INSERT INTO daily_class_summary (class_id, date, total_routines, completed_routines, completion_rate, participants)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(class_id, date) DO UPDATE SET
       total_routines = excluded.total_routines,
       completed_routines = excluded.completed_routines,
       completion_rate = excluded.completion_rate,
       participants = excluded.participants`
  ).run(classId, date, totalRoutines, totalCompleted, completionRate, participants);

  res.json({ date, total_routines: totalRoutines, completed_routines: totalCompleted, completion_rate: completionRate, participants });
});

router.get('/weekly', (req, res) => {
  const classId = req.query.class_id;
  const days = Number(req.query.days || 7);
  const rows = db.prepare(
    `SELECT date, COUNT(*) as total, SUM(completed) as completed
     FROM routine_checks
     WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)
     GROUP BY date ORDER BY date DESC LIMIT ?`
  ).all(classId, days);
  res.json(rows.reverse());
});

router.get('/csv', (req, res) => {
  const classId = req.query.class_id;
  const rows = db.prepare(
    `SELECT s.nickname, s.number, r.title, rc.date, rc.completed, rc.count
     FROM routine_checks rc
     JOIN students s ON s.id = rc.student_id
     JOIN routines r ON r.id = rc.routine_id
     WHERE s.class_id = ?
     ORDER BY rc.date, s.number`
  ).all(classId);

  let csv = '날짜,번호,닉네임,루틴,완료여부,진행수\n';
  for (const r of rows) {
    csv += `${r.date},${r.number || ''},${r.nickname},${r.title},${r.completed ? '완료' : '미완료'},${r.count}\n`;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="routine_export.csv"');
  res.send('﻿' + csv);
});

module.exports = router;
