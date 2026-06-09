CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  position TEXT NOT NULL CHECK (position IN ('GK','DEF','MID','FWD')),
  shirt_number INTEGER,
  full_name TEXT NOT NULL,
  name_on_shirt TEXT,
  club TEXT,
  dob TEXT,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE draft_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_picks INTEGER NOT NULL,
  seconds_per_pick INTEGER NOT NULL,
  pos_min TEXT NOT NULL,
  pos_max TEXT NOT NULL,
  max_per_country INTEGER NOT NULL,
  order_mode TEXT NOT NULL DEFAULT 'snake' CHECK (order_mode IN ('snake','linear')),
  status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby','in_progress','paused','complete')),
  current_pick_no INTEGER,
  timer_deadline INTEGER,
  temp_password TEXT NOT NULL
);
CREATE TABLE participants (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  draft_order INTEGER,
  joined INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE picks (
  overall_no INTEGER PRIMARY KEY,
  round_no INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  picked_by_user_id INTEGER NOT NULL,
  picked_at INTEGER NOT NULL
);
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_players_country ON players(country_code);
INSERT INTO draft_settings (id, total_picks, seconds_per_pick, pos_min, pos_max, max_per_country, temp_password)
VALUES (1, 12, 90, '{"GK":1,"DEF":3,"MID":2,"FWD":1}', '{"GK":2,"DEF":6,"MID":6,"FWD":5}', 3, 'worldcup2026');
