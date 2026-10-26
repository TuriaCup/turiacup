-- Entregas de plantillas: enlace privado por equipo y cuerpo técnico.
-- Aplicar con: wrangler d1 execute turiacup-db --remote --file=./schema_entregas.sql
-- (opcional: el Worker crea estas tablas solo la primera vez que se generan los enlaces)

CREATE TABLE IF NOT EXISTS upload_links (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id),
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_upload_at TEXT,
  last_upload_count INTEGER
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  cargo TEXT,
  dni TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_staff_team ON staff (team_id);

-- Copia de seguridad de cada «Guardar» de un club (no se borra sola, ni al borrar el equipo).
CREATE TABLE IF NOT EXISTS entregas_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL,
  equipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  jugadores TEXT NOT NULL,
  staff TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_historial_team ON entregas_historial (team_id);
