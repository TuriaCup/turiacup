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
  // Huecos de la fase final: «Mejor primero», «Ganador Octavo 1»… mientras no hay equipo asignado.
  // y penaltis + a qué partido pasa el ganador / el perdedor (triangular).
  for (const [col, tipo] of [['home_label', 'TEXT'], ['away_label', 'TEXT'], ['home_pen', 'INTEGER'], ['away_pen', 'INTEGER'],
    ['winner_to', 'INTEGER'], ['winner_slot', 'TEXT'], ['loser_to', 'INTEGER'], ['loser_slot', 'TEXT']]) {
    try {
      await env.DB.prepare(`ALTER TABLE matches ADD COLUMN ${col} ${tipo}`).run();
    } catch {
      // ya existe
    }
  }
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

// En un partido ya terminado, el resultado oficial (tabla goals) se rehace a partir de las incidencias.
export async function sincronizarOficial(env, partido) {
  const { results: goleadores } = await env.DB.prepare(
    "SELECT player_id, team_id, COUNT(*) AS n FROM match_events WHERE match_id = ? AND type = 'gol' GROUP BY player_id, team_id"
  ).bind(partido.id).all();
  const sentencias = [env.DB.prepare('DELETE FROM goals WHERE match_id = ?').bind(partido.id)];
  for (const g of goleadores) {
    sentencias.push(
      env.DB.prepare('INSERT INTO goals (match_id, player_id, team_id, count) VALUES (?, ?, ?, ?)')
        .bind(partido.id, g.player_id, g.team_id, g.n)
    );
  }
  await env.DB.batch(sentencias);
}

// Partidos cerrados a mano (con «Resultado») no tienen incidencias: se crean a partir de sus goleadores
// para poder corregirlos igual que los demás.
export async function importarGolesComoEventos(env, matchId) {
  const hay = await env.DB.prepare('SELECT COUNT(*) AS n FROM match_events WHERE match_id = ?').bind(matchId).first();
  if (hay.n > 0) return;
  const { results } = await env.DB.prepare('SELECT player_id, team_id, count FROM goals WHERE match_id = ?').bind(matchId).all();
  const sentencias = [];
  for (const g of results) {
    for (let i = 0; i < g.count; i++) {
      sentencias.push(
        env.DB.prepare('INSERT INTO match_events (match_id, team_id, player_id, type) VALUES (?, ?, ?, ?)')
          .bind(matchId, g.team_id, g.player_id, 'gol')
      );
    }
  }
  if (sentencias.length) await env.DB.batch(sentencias);
}
