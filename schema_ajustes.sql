-- Ajustes del sitio: interruptores que se cambian desde el panel de admin.
-- Aplicar con: wrangler d1 execute turiacup-db --remote --file=./schema_ajustes.sql

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- torneo_publico: '0' = modo interno (solo admin), '1' = visible para todo el mundo.
INSERT OR IGNORE INTO settings (key, value) VALUES ('torneo_publico', '0');
