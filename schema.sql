CREATE TABLE IF NOT EXISTS inscripciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('U9', 'U10', 'U11', 'U12')),
  ciudad TEXT NOT NULL,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT NOT NULL,
  comentarios TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inscripciones_categoria ON inscripciones (categoria);
