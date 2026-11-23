// Clubes profesionales: salen siempre los primeros de su grupo (el resto, por orden alfabético).
// Se guardan en la tabla de ajustes como una lista de ids, para no tocar la tabla de equipos.
const KEY = 'profesionales';

export async function getProfesionales(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
    if (!row || !row.value) return new Set();
    return new Set(row.value.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0));
  } catch {
    return new Set(); // la tabla puede no existir todavía
  }
}

export async function setProfesional(env, teamId, valor) {
  const set = await getProfesionales(env);
  if (valor) set.add(teamId); else set.delete(teamId);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(KEY, [...set].join(',')).run();
}

// Orden dentro de un grupo: profesionales primero, después alfabético.
export function compararEquipos(a, b) {
  return (b.profesional ? 1 : 0) - (a.profesional ? 1 : 0) || a.name.localeCompare(b.name, 'es');
}
