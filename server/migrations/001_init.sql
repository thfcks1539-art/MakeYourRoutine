CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  teacher_pin TEXT NOT NULL,
  goal_gauge_target REAL DEFAULT 80,
  reward_text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  nickname TEXT NOT NULL,
  number INTEGER,
  login_code TEXT UNIQUE NOT NULL,
  avatar_json TEXT,
  points INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  student_id INTEGER REFERENCES students(id),
  title TEXT NOT NULL,
  icon TEXT DEFAULT '✅',
  time_slot TEXT DEFAULT '하루',
  days_of_week TEXT DEFAULT '0,1,2,3,4,5,6',
  target_count INTEGER DEFAULT 1,
  start_time TEXT,
  deadline_time TEXT,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routine_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id INTEGER NOT NULL REFERENCES routines(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  date TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  carried_over INTEGER DEFAULT 0,
  reflection_emoji TEXT,
  reflection_text TEXT,
  UNIQUE(routine_id, student_id, date)
);

CREATE TABLE IF NOT EXISTS streaks (
  student_id INTEGER NOT NULL,
  routine_id INTEGER,
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_completed_date TEXT,
  PRIMARY KEY (student_id, routine_id)
);

CREATE TABLE IF NOT EXISTS encouragements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  from_role TEXT,
  from_id INTEGER,
  to_student_id INTEGER NOT NULL,
  message TEXT,
  emoji TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS encouragement_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER,
  min_rate REAL NOT NULL,
  max_rate REAL NOT NULL,
  message TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS class_draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  date TEXT NOT NULL,
  rate REAL,
  number INTEGER,
  tier TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(class_id, date)
);

CREATE TABLE IF NOT EXISTS routine_exclusions (
  routine_id INTEGER NOT NULL REFERENCES routines(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  PRIMARY KEY (routine_id, student_id)
);

CREATE TABLE IF NOT EXISTS class_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS student_absences (
  student_id INTEGER NOT NULL REFERENCES students(id),
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, date)
);

CREATE TABLE IF NOT EXISTS daily_class_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  total_routines INTEGER,
  completed_routines INTEGER,
  completion_rate REAL,
  participants INTEGER,
  UNIQUE(class_id, date)
);

INSERT INTO encouragement_tiers (class_id, min_rate, max_rate, message, sort_order)
SELECT NULL, 1.0, 1.0, '오늘 루틴을 모두 끝냈어요! 최고예요 🎉', 1
WHERE NOT EXISTS (SELECT 1 FROM encouragement_tiers WHERE class_id IS NULL);

INSERT INTO encouragement_tiers (class_id, min_rate, max_rate, message, sort_order)
SELECT NULL, 0.7, 0.999, '루틴을 꾸준히 하고 있군요! 조금만 더 가볼까요?', 2
WHERE (SELECT COUNT(*) FROM encouragement_tiers WHERE class_id IS NULL) < 5;

INSERT INTO encouragement_tiers (class_id, min_rate, max_rate, message, sort_order)
SELECT NULL, 0.4, 0.699, '좋은 출발이에요! 하나씩 채워봐요 💪', 3
WHERE (SELECT COUNT(*) FROM encouragement_tiers WHERE class_id IS NULL) < 5;

INSERT INTO encouragement_tiers (class_id, min_rate, max_rate, message, sort_order)
SELECT NULL, 0.01, 0.399, '오늘도 시작이 중요해요, 화이팅!', 4
WHERE (SELECT COUNT(*) FROM encouragement_tiers WHERE class_id IS NULL) < 5;

INSERT INTO encouragement_tiers (class_id, min_rate, max_rate, message, sort_order)
SELECT NULL, 0.0, 0.0, '아직 오늘 루틴이 남아있어요!', 5
WHERE (SELECT COUNT(*) FROM encouragement_tiers WHERE class_id IS NULL) < 5;
