// Partidos en directo: tablas, marcador a partir de las incidencias y lectura de eventos.
export const TIPOS_EVENTO = ['gol', 'propia', 'amarilla', 'roja'];

let tablasListas = false;

export async function ensureDirecto(env) {
  if (tablasListas) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS match_live (
      match_id INTEGER PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS match_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id),
      player_id INTEGER NOT NULL REFERENCES players(id),
      type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events (match_id)'),
  ]);
  tablasListas = true;
}

// Marcador: goles propios de cada equipo + propias puertas del rival.
export async function recalcularMarcador(env, match) {
  const { results } = await env.DB.prepare(
    'SELECT team_id, type, COUNT(*) AS n FROM match_events WHERE match_id = ? AND type IN (\'gol\', \'propia\') GROUP BY team_id, type'
  ).bind(match.id).all();
  let home = 0;
  let away = 0;
  for (const r of results) {
    const aFavorDeLocal = (r.type === 'gol') === (r.team_id === match.home_team_id);
    if (aFavorDeLocal) home += r.n; else away += r.n;
  }
  await env.DB.prepare('UPDATE matches SET home_score = ?, away_score = ? WHERE id = ?')
    .bind(home, away, match.id).run();
  return { home_score: home, away_score: away };
}

export async function listarEventos(env, matchId) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.team_id, e.player_id, e.type, e.created_at, p.dorsal, p.nombre, p.apellidos
     FROM match_events e JOIN players p ON p.id = e.player_id
     WHERE e.match_id = ? ORDER BY e.id`
  ).bind(matchId).all();
  return results;
}
