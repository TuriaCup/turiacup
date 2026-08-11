import { jsonResponse, clean, parseId } from '../lib/http.js';

const CATEGORIAS_VALIDAS = ['U9', 'U10', 'U11', 'U12'];

export async function handleListEquipos(request, env) {
  const url = new URL(request.url);
  const categoria = clean(url.searchParams.get('categoria') || '').toUpperCase();

  let query = 'SELECT id, name, category, group_name, city, logo_url FROM teams';
  const binds = [];
  if (categoria) {
    query += ' WHERE category = ?';
    binds.push(categoria);
  }
  query += ' ORDER BY category, group_name, name';

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  return jsonResponse({ equipos: results });
}

export async function handleGetEquipo(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  const equipo = await env.DB.prepare(
    'SELECT id, name, category, group_name, city, logo_url FROM teams WHERE id = ?'
  ).bind(id).first();
  if (!equipo) return jsonResponse({ error: 'Equipo no encontrado.' }, 404);

  const { results: jugadores } = await env.DB.prepare(
    `SELECT id, dorsal, nombre, apellidos, fecha_nacimiento FROM players
     WHERE team_id = ? ORDER BY dorsal IS NULL, dorsal, apellidos`
  ).bind(id).all();

  const { results: partidos } = await env.DB.prepare(
    `SELECT m.id, m.category, m.phase, m.group_name, m.round_name, m.home_team_id, m.away_team_id,
            m.home_score, m.away_score, m.played, m.scheduled_at, m.venue,
            ht.name AS home_team_name, at.name AS away_team_name
     FROM matches m
     JOIN teams ht ON ht.id = m.home_team_id
     JOIN teams at ON at.id = m.away_team_id
     WHERE m.home_team_id = ? OR m.away_team_id = ?
     ORDER BY m.scheduled_at IS NULL, m.scheduled_at`
  ).bind(id, id).all();

  const proximos = partidos.filter((p) => !p.played);
  const jugados = partidos.filter((p) => p.played).reverse();

  return jsonResponse({ equipo, jugadores, proximos, jugados });
}

export async function handleGetJugador(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  const jugador = await env.DB.prepare(
    `SELECT p.id, p.dorsal, p.nombre, p.apellidos, p.fecha_nacimiento, p.team_id, t.name AS team_name, t.category
     FROM players p JOIN teams t ON t.id = p.team_id WHERE p.id = ?`
  ).bind(id).first();
  if (!jugador) return jsonResponse({ error: 'Jugador no encontrado.' }, 404);

  const { results: goles } = await env.DB.prepare(
    `SELECT g.count, g.match_id, m.scheduled_at, m.phase, m.round_name, m.group_name,
            ht.name AS home_team_name, at.name AS away_team_name, m.home_score, m.away_score
     FROM goals g
     JOIN matches m ON m.id = g.match_id
     JOIN teams ht ON ht.id = m.home_team_id
     JOIN teams at ON at.id = m.away_team_id
     WHERE g.player_id = ?
     ORDER BY m.scheduled_at IS NULL, m.scheduled_at`
  ).bind(id).all();

  const totalGoles = goles.reduce((sum, g) => sum + g.count, 0);

  return jsonResponse({ jugador, totalGoles, goles });
}

function applyResult(row, gf, gc) {
  row.pj += 1;
  row.gf += gf;
  row.gc += gc;
  row.dg = row.gf - row.gc;
  if (gf > gc) {
    row.pg += 1;
    row.pts += 3;
  } else if (gf === gc) {
    row.pe += 1;
    row.pts += 1;
  } else {
    row.pp += 1;
  }
}

export async function handleClasificacion(request, env) {
  const url = new URL(request.url);
  const categoria = clean(url.searchParams.get('categoria') || '').toUpperCase();
  const grupo = clean(url.searchParams.get('grupo') || '');

  if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) {
    return jsonResponse({ error: 'Falta el parámetro categoria o no es válido.' }, 400);
  }

  let teamsQuery = 'SELECT id, name, group_name FROM teams WHERE category = ?';
  const teamBinds = [categoria];
  if (grupo) {
    teamsQuery += ' AND group_name = ?';
    teamBinds.push(grupo);
  }
  const { results: teams } = await env.DB.prepare(teamsQuery).bind(...teamBinds).all();

  let matchesQuery = `SELECT home_team_id, away_team_id, home_score, away_score FROM matches
    WHERE category = ? AND phase = 'grupos' AND played = 1`;
  const matchBinds = [categoria];
  if (grupo) {
    matchesQuery += ' AND group_name = ?';
    matchBinds.push(grupo);
  }
  const { results: matches } = await env.DB.prepare(matchesQuery).bind(...matchBinds).all();

  const table = new Map();
  for (const t of teams) {
    table.set(t.id, {
      team_id: t.id, name: t.name, group_name: t.group_name,
      pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0,
    });
  }

  for (const m of matches) {
    const home = table.get(m.home_team_id);
    const away = table.get(m.away_team_id);
    if (home) applyResult(home, m.home_score, m.away_score);
    if (away) applyResult(away, m.away_score, m.home_score);
  }

  const clasificacion = [...table.values()].sort(
    (a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.name.localeCompare(b.name)
  );

  return jsonResponse({ clasificacion });
}

export async function handlePartidos(request, env) {
  const url = new URL(request.url);
  const categoria = clean(url.searchParams.get('categoria') || '').toUpperCase();
  const fase = clean(url.searchParams.get('fase') || '');

  if (!categoria || !CATEGORIAS_VALIDAS.includes(categoria)) {
    return jsonResponse({ error: 'Falta el parámetro categoria o no es válido.' }, 400);
  }

  let query = `SELECT m.*, ht.name AS home_team_name, at.name AS away_team_name
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.category = ?`;
  const binds = [categoria];
  if (fase) {
    query += ' AND m.phase = ?';
    binds.push(fase);
  }
  query += ' ORDER BY m.scheduled_at IS NULL, m.scheduled_at';

  const { results: partidos } = await env.DB.prepare(query).bind(...binds).all();
  if (partidos.length === 0) return jsonResponse({ partidos: [] });

  const ids = partidos.map((p) => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const { results: goles } = await env.DB.prepare(
    `SELECT g.match_id, g.team_id, g.count, p.id AS player_id, p.nombre, p.apellidos, p.dorsal
     FROM goals g JOIN players p ON p.id = g.player_id
     WHERE g.match_id IN (${placeholders})`
  ).bind(...ids).all();

  const golesByMatch = new Map();
  for (const g of goles) {
    if (!golesByMatch.has(g.match_id)) golesByMatch.set(g.match_id, []);
    golesByMatch.get(g.match_id).push(g);
  }

  const withGoles = partidos.map((p) => ({ ...p, goles: golesByMatch.get(p.id) || [] }));

  return jsonResponse({ partidos: withGoles });
}
