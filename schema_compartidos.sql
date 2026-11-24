-- Páginas que solo se ven con el enlace (/c/<codigo>), p. ej. propuestas de calendario para el comité.
-- El contenido vive aquí y no en public/ porque el repo de GitHub es público.
CREATE TABLE IF NOT EXISTS compartidos (
  codigo TEXT PRIMARY KEY,
  titulo TEXT,
  html TEXT NOT NULL,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP
);
