import { jsonResponse, clean, parseId } from '../lib/http.js';
import { parseRosterExcel } from '../lib/xlsx.js';

const CATEGORIAS_VALIDAS = ['U9', 'U10', 'U11', 'U12'];
const FASES_VALIDAS = ['grupos', 'oro', 'plata', 'bronce'];
const TEAM_MAX_LEN = { name: 120, city: 120, logo_url: 500, group_name: 20 };
const MATCH_MAX_LEN = { group_name: 20, round_name: 60, venue: 120 };
const PLAYER_MAX_LEN = { nombre: 120, apellidos: 120, dni: 20 };

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// --- Equipos ---

export async function handleCreateEquipo(request, env) {
  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);

  const name = clean(payload.name);
  const category = clean(payload.category).toUpperCase();
  const city = clean(payload.city);
  const logo_url = clean(payload.logo_url);
  const group_name = clean(payload.group_name);

  if (!name || !category) return jsonResponse({ error: 'Nombre y categoría son obligatorios.' }, 400);
  if (!CATEGORIAS_VALIDAS.includes(category)) return jsonResponse({ error: 'Categoría no válida.' }, 400);
  for (const [field, max] of Object.entries(TEAM_MAX_LEN)) {
    const value = { name, city, logo_url, group_name }[field];
    if (value && value.length > max) return jsonResponse({ error: `El campo ${field} es demasiado largo.` }, 400);
  }

  const result = await env.DB.prepare(
    'INSERT INTO teams (name, category, city, logo_url, group_name) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, category, city || null, logo_url || null, group_name || null).run();

  return jsonResponse({ ok: true, id: result.meta.last_row_id }, 201);
}

export async function handleUpdateEquipo(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM teams WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ error: 'Equipo no encontrado.' }, 404);

  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);

  const name = clean(payload.name);
  const category = clean(payload.category).toUpperCase();
  const city = clean(payload.city);
  const logo_url = clean(payload.logo_url);
  const group_name = clean(payload.group_name);

  if (!name || !category) return jsonResponse({ error: 'Nombre y categoría son obligatorios.' }, 400);
  if (!CATEGORIAS_VALIDAS.includes(category)) return jsonResponse({ error: 'Categoría no válida.' }, 400);
  for (const [field, max] of Object.entries(TEAM_MAX_LEN)) {
    const value = { name, city, logo_url, group_name }[field];
    if (value && value.length > max) return jsonResponse({ error: `El campo ${field} es demasiado largo.` }, 400);
  }

  await env.DB.prepare(
    'UPDATE teams SET name = ?, category = ?, city = ?, logo_url = ?, group_name = ? WHERE id = ?'
  ).bind(name, category, city || null, logo_url || null, group_name || null, id).run();

  return jsonResponse({ ok: true });
}

export async function handleDeleteEquipo(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  const matchCount = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM matches WHERE home_team_id = ? OR away_team_id = ?'
  ).bind(id, id).first();
  if (matchCount.n > 0) {
    return jsonResponse({ error: 'No se puede eliminar: el equipo tiene partidos asociados. Elimínalos primero.' }, 400);
  }

  await env.DB.batch([
    env.DB.prepare('DELETE FROM players WHERE team_id = ?').bind(id),
    env.DB.prepare('DELETE FROM teams WHERE id = ?').bind(id),
  ]);

  return jsonResponse({ ok: true });
}

// --- Jugadores / plantillas ---

export async function handleListJugadoresAdmin(request, env, teamIdParam) {
  const teamId = parseId(teamIdParam);
  if (!teamId) return jsonResponse({ error: 'Id de equipo inválido.' }, 400);

  const { results: jugadores } = await env.DB.prepare(
    `SELECT id, dorsal, nombre, apellidos, fecha_nacimiento, dni FROM players
     WHERE team_id = ? ORDER BY dorsal IS NULL, dorsal, apellidos`
  ).bind(teamId).all();

  return jsonResponse({ jugadores });
}

export async function handleUploadPlantilla(request, env, teamIdParam) {
  const teamId = parseId(teamIdParam);
  if (!teamId) return jsonResponse({ error: 'Id de equipo inválido.' }, 400);

  const team = await env.DB.prepare('SELECT id FROM teams WHERE id = ?').bind(teamId).first();
  if (!team) return jsonResponse({ error: 'Equipo no encontrado.' }, 404);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return jsonResponse({ error: 'Falta el fichero Excel.' }, 400);
  }
  if (file.size > 2 * 1024 * 1024) {
    return jsonResponse({ error: 'El fichero es demasiado grande (máx. 2 MB).' }, 400);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const { rows, errors } = parseRosterExcel(buffer);

  if (rows.length === 0) {
    return jsonResponse({ error: 'No se encontraron filas válidas en el Excel.', errores: errors }, 400);
  }

  const statements = [env.DB.prepare('DELETE FROM players WHERE team_id = ?').bind(teamId)];
  for (const row of rows) {
    statements.push(
      env.DB.prepare(
        'INSERT INTO players (team_id, dorsal, nombre, apellidos, fecha_nacimiento, dni) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(teamId, row.dorsal, row.nombre, row.apellidos, row.fecha_nacimiento, row.dni)
    );
  }
  await env.DB.batch(statements);

  return jsonResponse({ ok: true, importados: rows.length, errores: errors });
}

export async function handleUpdateJugador(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM players WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ error: 'Jugador no encontrado.' }, 404);

  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);

  const nombre = clean(payload.nombre);
  const apellidos = clean(payload.apellidos);
  const dni = clean(payload.dni);
  const fecha_nacimiento = clean(payload.fecha_nacimiento);

  if (!nombre || !apellidos) return jsonResponse({ error: 'Nombre y apellidos son obligatorios.' }, 400);
  for (const [field, max] of Object.entries(PLAYER_MAX_LEN)) {
    const value = { nombre, apellidos, dni }[field];
    if (value && value.length > max) return jsonResponse({ error: `El campo ${field} es demasiado largo.` }, 400);
  }
  if (fecha_nacimiento && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) {
    return jsonResponse({ error: 'Fecha de nacimiento inválida (formato AAAA-MM-DD).' }, 400);
  }

  let dorsal = null;
  if (payload.dorsal !== null && payload.dorsal !== undefined && payload.dorsal !== '') {
    const n = Number(payload.dorsal);
    if (!Number.isInteger(n) || n < 0) return jsonResponse({ error: 'Dorsal inválido.' }, 400);
    dorsal = n;
  }

  await env.DB.prepare(
    'UPDATE players SET dorsal = ?, nombre = ?, apellidos = ?, fecha_nacimiento = ?, dni = ? WHERE id = ?'
  ).bind(dorsal, nombre, apellidos, fecha_nacimiento || null, dni || null, id).run();

  return jsonResponse({ ok: true });
}

export async function handleDeleteJugador(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM goals WHERE player_id = ?').bind(id),
    env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id),
  ]);

  return jsonResponse({ ok: true });
}

// --- Partidos ---

async function validateMatchPayload(payload, env) {
  const category = clean(payload.category).toUpperCase();
  const phase = clean(payload.phase) || 'grupos';
  const group_name = clean(payload.group_name);
  const round_name = clean(payload.round_name);
  const home_team_id = parseId(payload.home_team_id);
  const away_team_id = parseId(payload.away_team_id);
  const scheduled_at = clean(payload.scheduled_at);
  const venue = clean(payload.venue);

  if (!CATEGORIAS_VALIDAS.includes(category)) return { error: 'Categoría no válida.' };
  if (!FASES_VALIDAS.includes(phase)) return { error: 'Fase no válida.' };
  if (!home_team_id || !away_team_id) return { error: 'Selecciona ambos equipos.' };
  if (home_team_id === away_team_id) return { error: 'Un equipo no puede jugar contra sí mismo.' };
  for (const [field, max] of Object.entries(MATCH_MAX_LEN)) {
    const value = { group_name, round_name, venue }[field];
    if (value && value.length > max) return { error: `El campo ${field} es demasiado largo.` };
  }

  const { results: teams } = await env.DB.prepare('SELECT id FROM teams WHERE id IN (?, ?)')
    .bind(home_team_id, away_team_id).all();
  if (teams.length !== 2) return { error: 'Alguno de los equipos no existe.' };

  return {
    category, phase, group_name: group_name || null, round_name: round_name || null,
    home_team_id, away_team_id, scheduled_at: scheduled_at || null, venue: venue || null,
  };
}

export async function handleCreatePartido(request, env) {
  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);

  const data = await validateMatchPayload(payload, env);
  if (data.error) return jsonResponse({ error: data.error }, 400);

  const result = await env.DB.prepare(
    `INSERT INTO matches (category, phase, group_name, round_name, home_team_id, away_team_id, scheduled_at, venue)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    data.category, data.phase, data.group_name, data.round_name,
    data.home_team_id, data.away_team_id, data.scheduled_at, data.venue
  ).run();

  return jsonResponse({ ok: true, id: result.meta.last_row_id }, 201);
}

export async function handleUpdatePartido(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM matches WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ error: 'Partido no encontrado.' }, 404);

  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);

  const data = await validateMatchPayload(payload, env);
  if (data.error) return jsonResponse({ error: data.error }, 400);

  await env.DB.prepare(
    `UPDATE matches SET category = ?, phase = ?, group_name = ?, round_name = ?,
            home_team_id = ?, away_team_id = ?, scheduled_at = ?, venue = ?
     WHERE id = ?`
  ).bind(
    data.category, data.phase, data.group_name, data.round_name,
    data.home_team_id, data.away_team_id, data.scheduled_at, data.venue, id
  ).run();

  return jsonResponse({ ok: true });
}

export async function handleDeletePartido(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM goals WHERE match_id = ?').bind(id),
    env.DB.prepare('DELETE FROM matches WHERE id = ?').bind(id),
  ]);

  return jsonResponse({ ok: true });
}

export async function handleResultadoPartido(request, env, idParam) {
  const id = parseId(idParam);
  if (!id) return jsonResponse({ error: 'Id de partido inválido.' }, 400);

  const match = await env.DB.prepare(
    'SELECT id, home_team_id, away_team_id FROM matches WHERE id = ?'
  ).bind(id).first();
  if (!match) return jsonResponse({ error: 'Partido no encontrado.' }, 404);

  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);

  const home_score = Number(payload.home_score);
  const away_score = Number(payload.away_score);
  if (!Number.isInteger(home_score) || home_score < 0 || !Number.isInteger(away_score) || away_score < 0) {
    return jsonResponse({ error: 'El resultado debe ser un número entero no negativo.' }, 400);
  }

  const goalsInput = Array.isArray(payload.goals) ? payload.goals : [];
  const goalRows = [];
  for (const g of goalsInput) {
    const player_id = parseId(g.player_id);
    const count = Number(g.count);
    if (!player_id || !Number.isInteger(count) || count <= 0) {
      return jsonResponse({ error: 'Cada gol debe tener un jugador y un número de goles positivo.' }, 400);
    }
    goalRows.push({ player_id, count });
  }

  if (goalRows.length > 0) {
    const ids = [...new Set(goalRows.map((g) => g.player_id))];
    const placeholders = ids.map(() => '?').join(',');
    const { results: players } = await env.DB.prepare(
      `SELECT id, team_id FROM players WHERE id IN (${placeholders})`
    ).bind(...ids).all();
    const playerTeam = new Map(players.map((p) => [p.id, p.team_id]));

    for (const g of goalRows) {
      const teamId = playerTeam.get(g.player_id);
      if (teamId === undefined) {
        return jsonResponse({ error: `El jugador ${g.player_id} no existe.` }, 400);
      }
      if (teamId !== match.home_team_id && teamId !== match.away_team_id) {
        return jsonResponse({ error: `El jugador ${g.player_id} no pertenece a ninguno de los dos equipos del partido.` }, 400);
      }
      g.team_id = teamId;
    }
  }

  const statements = [
    env.DB.prepare('UPDATE matches SET home_score = ?, away_score = ?, played = 1 WHERE id = ?')
      .bind(home_score, away_score, id),
    env.DB.prepare('DELETE FROM goals WHERE match_id = ?').bind(id),
  ];
  for (const g of goalRows) {
    statements.push(
      env.DB.prepare('INSERT INTO goals (match_id, player_id, team_id, count) VALUES (?, ?, ?, ?)')
        .bind(id, g.player_id, g.team_id, g.count)
    );
  }
  await env.DB.batch(statements);

  return jsonResponse({ ok: true });
}
