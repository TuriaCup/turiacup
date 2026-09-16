import { isAdminRequest } from './auth.js';

const KEY_TORNEO_PUBLICO = 'torneo_publico';

const CREATE_SETTINGS_TABLE = `CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

async function ensureSettingsTable(env) {
  await env.DB.prepare(CREATE_SETTINGS_TABLE).run();
}

/** ¿Está el torneo publicado? Si la tabla no existe todavía, se asume que no. */
export async function isTorneoPublico(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
      .bind(KEY_TORNEO_PUBLICO).first();
    return row ? row.value === '1' : false;
  } catch {
    return false;
  }
}

export async function setTorneoPublico(env, publico) {
  await ensureSettingsTable(env);
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(KEY_TORNEO_PUBLICO, publico ? '1' : '0').run();
}

/**
 * Estado de publicación para una petición pública.
 * `publicado`: el interruptor global. `visible`: si esta petición puede ver los datos
 * (porque el torneo está publicado o porque quien mira es el admin con sesión iniciada).
 */
export async function estadoPublicacion(request, env) {
  const publicado = await isTorneoPublico(env);
  if (publicado) return { publicado: true, visible: true };
  const admin = await isAdminRequest(request, env);
  return { publicado: false, visible: admin };
}
