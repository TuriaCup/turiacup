// Enlaces privados por equipo para que cada club rellene su plantilla desde la web.

const ALFABETO = '23456789abcdefghjkmnpqrstuvwxyz'; // sin caracteres que se confunden al leer
const LONGITUD_CODIGO = 6;

export const MAX_JUGADORES = 40;
export const MAX_STAFF = 12;

const CREATE_UPLOAD_LINKS = `CREATE TABLE IF NOT EXISTS upload_links (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id),
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_upload_at TEXT,
  last_upload_count INTEGER
)`;

const CREATE_STAFF = `CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  cargo TEXT,
  dni TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export async function ensureEntregasTables(env) {
  await env.DB.prepare(CREATE_UPLOAD_LINKS).run();
  await env.DB.prepare(CREATE_STAFF).run();
}

export function slugify(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function codigoAleatorio(longitud = LONGITUD_CODIGO) {
  const bytes = new Uint8Array(longitud);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
}

/** cf-inter-san-jose-u10-2026-k7m4x9 */
export function construirSlug(team, anio) {
  return `${slugify(team.name)}-${team.category.toLowerCase()}-${anio}-${codigoAleatorio()}`;
}

export async function getEquipoPorSlug(env, slug) {
  try {
    return await env.DB.prepare(
      `SELECT t.id, t.name, t.category, l.slug, l.last_upload_at, l.last_upload_count
       FROM upload_links l JOIN teams t ON t.id = l.team_id WHERE l.slug = ?`
    ).bind(slug).first();
  } catch {
    return null; // las tablas todavía no existen
  }
}

export async function getPlantillaDeEquipo(env, teamId) {
  const { results: jugadores } = await env.DB.prepare(
    `SELECT dorsal, nombre, apellidos, fecha_nacimiento, dni FROM players
     WHERE team_id = ? ORDER BY dorsal IS NULL, dorsal, apellidos`
  ).bind(teamId).all();

  let staff = [];
  try {
    const res = await env.DB.prepare(
      'SELECT nombre, apellidos, cargo, dni FROM staff WHERE team_id = ? ORDER BY id'
    ).bind(teamId).all();
    staff = res.results;
  } catch {
    staff = [];
  }

  return { jugadores, staff };
}
