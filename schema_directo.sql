-- Partidos en directo: qué partidos están "en juego" y sus incidencias (goles, propia puerta, tarjetas).
-- Idempotente. El Worker también crea estas tablas solo la primera vez que hace falta.
CREATE TABLE IF NOT EXISTS match_live (
  match_id INTEGER PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS match_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  type TEXT NOT NULL,            -- 'gol' | 'propia' | 'amarilla' | 'roja'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events (match_id);
