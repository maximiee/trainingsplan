CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'trainer')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  age_group TEXT,
  color TEXT NOT NULL DEFAULT '#3498db',
  fussball_de_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_teams (
  user_id INTEGER NOT NULL REFERENCES users(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  PRIMARY KEY (user_id, team_id)
);

CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pitches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  surface TEXT NOT NULL DEFAULT 'Rasen',
  location_id INTEGER REFERENCES locations(id)
);

CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sommer', 'winter')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  pitch_id INTEGER NOT NULL REFERENCES pitches(id),
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  pitch_id INTEGER NOT NULL REFERENCES pitches(id),
  date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'training' CHECK(type IN ('training', 'spiel', 'turnier')),
  recurrence_id INTEGER REFERENCES recurrences(id),
  is_exception INTEGER NOT NULL DEFAULT 0,
  is_cancelled INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_teams (
  session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  PRIMARY KEY (session_id, team_id)
);

CREATE TABLE IF NOT EXISTS match_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  date DATE NOT NULL,
  time TEXT,
  opponent TEXT,
  location TEXT NOT NULL DEFAULT 'heim' CHECK(location IN ('heim', 'auswaerts')),
  venue TEXT,
  pitch_id INTEGER REFERENCES pitches(id),
  half_pitch INTEGER NOT NULL DEFAULT 0,
  fussball_de_match_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_squad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('m', 'w')),
  count INTEGER NOT NULL DEFAULT 0,
  verein TEXT NOT NULL DEFAULT 'TSV' CHECK(verein IN ('TSV', 'MTV', 'TSG')),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, year, gender, verein)
);
