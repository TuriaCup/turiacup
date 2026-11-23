import { jsonResponse, parseId } from '../lib/http.js';
import { ensureDirecto, recalcularMarcador, listarEventos, TIPOS_EVENTO } from '../lib/directo.js';

async function getPartido(env, id) {
  return env.DB.prepare(
    `SELECT m.id, m.category, m.phase, m.group_name, m.round_name, m.home_team_id, m.away_team_id,
            m.home_score, m.away_score, m.played, m.scheduled_at, m.venue,
            ht.name AS home_team_name, ht.logo_url AS home_logo,
            at.name AS away_team_name, at.logo_url AS away_logo,
            ml.match_id IS NOT NULL AS live
     FROM matches m
     JOIN teams ht ON ht.id = m.home_team_id
     JOIN teams at ON at.id = m.away_team_id
     LEFT JOIN match_live ml ON ml.match_id = m.id
     WHERE m.id = ?`
  ).bind(id).first();
}

async function plantilla(env, teamId) {
  const { results } = await env.DB.prepare(
    'SELECT id, dorsal, nombre, apellidos FROM players WHERE team_id = ? ORDER BY dorsal IS NULL, dorsal, apellidos'
  ).bind(teamId).all();
  return results;
}

async function estadoCompleto(env, id) {
  const partido = await getPartido(env, id);
  const [eventos, home, away] = await Promise.all([
    listarEventos(env, id),
    plantilla(env, partido.home_team_id),
    plantilla(env, partido.away_team_id),
  ]);
  return { partido, eventos, home, away };
}

// GET /api/admin/partidos/:id/directo
export async function handleGetDirecto(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id de partido inválido.' }, 400);
  await ensureDirecto(env);
  if (!(await getPartido(env, id))) return jsonResponse({ error: 'Partido no encontrado.' }, 404);
  return jsonResponse(await estadoCompleto(env, id));
}

// POST /api/admin/partidos/:id/iniciar
export async function handleIniciarPartido(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id de partido inválido.' }, 400);
  await ensureDirecto(env);
  const partido = await getPartido(env, id);
  if (!partido) return jsonResponse({ error: 'Partido no encontrado.' }, 404);
  if (partido.played) return jsonResponse({ error: 'Este partido ya está terminado.' }, 409);

  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO match_live (match_id) VALUES (?)').bind(id),
    env.DB.prepare('UPDATE matches SET home_score = COALESCE(home_score, 0), away_score = COALESCE(away_score, 0) WHERE id = ?').bind(id),
  ]);
  await recalcularMarcador(env, partido);
  return jsonResponse(await estadoCompleto(env, id));
}

// POST /api/admin/partidos/:id/eventos   { player_id, type }
export async function handleAnadirEvento(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id de partido inválido.' }, 400);
  await ensureDirecto(env);
  const partido = await getPartido(env, id);
  if (!partido) return jsonResponse({ error: 'Partido no encontrado.' }, 404);
  if (!partido.live) return jsonResponse({ error: 'El partido no está en juego. Pulsa «Iniciar partido».' }, 409);

  let payload = null;
  try { payload = await request.json(); } catch { /* sin cuerpo */ }
  const playerId = parseId(payload && payload.player_id);
  const type = payload && payload.type;
  if (!playerId || !TIPOS_EVENTO.includes(type)) return jsonResponse({ error: 'Solicitud inválida.' }, 400);

  const jugador = await env.DB.prepare('SELECT id, team_id FROM players WHERE id = ?').bind(playerId).first();
  if (!jugador || (jugador.team_id !== partido.home_team_id && jugador.team_id !== partido.away_team_id)) {
    return jsonResponse({ error: 'El jugador no pertenece a ninguno de los dos equipos.' }, 400);
  }

  await env.DB.prepare('INSERT INTO match_events (match_id, team_id, player_id, type) VALUES (?, ?, ?, ?)')
    .bind(id, jugador.team_id, playerId, type).run();
  await recalcularMarcador(env, partido);
  return jsonResponse(await estadoCompleto(env, id));
}

// DELETE /api/admin/partidos/:id/eventos/:eventId  (deshacer)
export async function handleBorrarEvento(request, env, idParam, eventParam) {
  const id = parseId(idParam);
  const eventId = parseId(eventParam);
  if (!id || !eventId) return jsonResponse({ error: 'Id inválido.' }, 400);
  await ensureDirecto(env);
  const partido = await getPartido(env, id);
  if (!partido) return jsonResponse({ error: 'Partido no encontrado.' }, 404);
  if (!partido.live) return jsonResponse({ error: 'Solo se puede deshacer mientras el partido está en juego.' }, 409);

  await env.DB.prepare('DELETE FROM match_events WHERE id = ? AND match_id = ?').bind(eventId, id).run();
  await recalcularMarcador(env, partido);
  return jsonResponse(await estadoCompleto(env, id));
}

// POST /api/admin/partidos/:id/finalizar
export async function handleFinalizarPartido(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id de partido inválido.' }, 400);
  await ensureDirecto(env);
  const partido = await getPartido(env, id);
  if (!partido) return jsonResponse({ error: 'Partido no encontrado.' }, 404);
  if (!partido.live) return jsonResponse({ error: 'El partido no está en juego.' }, 409);

  const marcador = await recalcularMarcador(env, partido);
  const { results: goleadores } = await env.DB.prepare(
    "SELECT player_id, team_id, COUNT(*) AS n FROM match_events WHERE match_id = ? AND type = 'gol' GROUP BY player_id, team_id"
  ).bind(id).all();

  // Se guarda el resultado oficial igual que al introducirlo a mano: así lo ven clasificación y fichas.
  const sentencias = [
    env.DB.prepare('UPDATE matches SET home_score = ?, away_score = ?, played = 1 WHERE id = ?')
      .bind(marcador.home_score, marcador.away_score, id),
    env.DB.prepare('DELETE FROM goals WHERE match_id = ?').bind(id),
    env.DB.prepare('DELETE FROM match_live WHERE match_id = ?').bind(id),
  ];
  for (const g of goleadores) {
    sentencias.push(
      env.DB.prepare('INSERT INTO goals (match_id, player_id, team_id, count) VALUES (?, ?, ?, ?)')
        .bind(id, g.player_id, g.team_id, g.n)
    );
  }
  await env.DB.batch(sentencias);
  return jsonResponse(await estadoCompleto(env, id));
}
