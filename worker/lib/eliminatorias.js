// Fase final: penaltis y paso automático a la siguiente eliminatoria.
// Cada partido de cuadro sabe a qué partido va su ganador (winner_to + winner_slot 'home'/'away')
// y, en el triangular, también su perdedor (loser_to + loser_slot).

// Ganador/perdedor de un partido terminado. Empate sin penaltis (o con penaltis empatados): null.
export function ganadorYPerdedor(m) {
  if (!m || !m.played || m.home_team_id == null || m.away_team_id == null) return null;
  let local;
  if (m.home_score !== m.away_score) local = m.home_score > m.away_score;
  else if (m.home_pen != null && m.away_pen != null && m.home_pen !== m.away_pen) local = m.home_pen > m.away_pen;
  else return null;
  return local
    ? { ganador: m.home_team_id, perdedor: m.away_team_id }
    : { ganador: m.away_team_id, perdedor: m.home_team_id };
}

const columna = (slot) => (slot === 'away' ? 'away_team_id' : 'home_team_id');

// Penaltis obligatorios: partido de cuadro (lleva a otro partido) que acaba en empate.
export function faltanPenaltis(m, home_score, away_score, home_pen, away_pen) {
  const llevaAOtro = m.winner_to != null || m.loser_to != null;
  if (!llevaAOtro || home_score !== away_score) return false;
  return home_pen == null || away_pen == null || home_pen === away_pen;
}

// Coloca al ganador (y al perdedor, si toca) en su hueco del siguiente partido, si aún no se ha jugado.
export async function propagarEliminatoria(env, matchId) {
  const m = await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(matchId).first();
  if (!m || m.phase === 'grupos') return;
  const r = ganadorYPerdedor(m);
  const sentencias = [];
  for (const [destino, slot, equipo] of [[m.winner_to, m.winner_slot, r && r.ganador], [m.loser_to, m.loser_slot, r && r.perdedor]]) {
    if (destino == null) continue;
    sentencias.push(env.DB.prepare(`UPDATE matches SET ${columna(slot)} = ? WHERE id = ? AND played = 0`).bind(equipo ?? null, destino));
  }
  if (sentencias.length) await env.DB.batch(sentencias);
}

// Al volver un partido a «Pendiente»: se vacían los huecos que había llenado (si el siguiente no se ha jugado).
export async function deshacerEliminatoria(env, m) {
  if (!m || m.phase === 'grupos') return;
  const sentencias = [];
  for (const [destino, slot] of [[m.winner_to, m.winner_slot], [m.loser_to, m.loser_slot]]) {
    if (destino == null) continue;
    const col = columna(slot);
    sentencias.push(env.DB.prepare(`UPDATE matches SET ${col} = NULL WHERE id = ? AND played = 0 AND ${col} IN (?, ?)`)
      .bind(destino, m.home_team_id ?? -1, m.away_team_id ?? -1));
  }
  if (sentencias.length) await env.DB.batch(sentencias);
}
