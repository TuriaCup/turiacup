-- Módulo de torneo: equipos, plantillas, partidos, goles.
-- Aplicar con: wrangler d1 execute turiacup-db --remote --file=./schema_torneo.sql

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT,
  logo_url TEXT,
  group_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  dorsal INTEGER,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  fecha_nacimiento TEXT,
  dni TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'grupos',
  group_name TEXT,
  round_name TEXT,
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  home_score INTEGER,
  away_score INTEGER,
  played INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  venue TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_players_team ON players (team_id);
CREATE INDEX IF NOT EXISTS idx_matches_lookup ON matches (category, phase, group_name);
CREATE INDEX IF NOT EXISTS idx_matches_home ON matches (home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away ON matches (away_team_id);
CREATE INDEX IF NOT EXISTS idx_goals_match ON goals (match_id);
CREATE INDEX IF NOT EXISTS idx_goals_player ON goals (player_id);
