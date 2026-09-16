// Página pública (con enlace privado) para que cada club rellene su propia plantilla.
import { jsonResponse, clean } from '../lib/http.js';
import { subidasAbiertas } from '../lib/ajustes.js';
import {
  getEquipoPorSlug,
  getPlantillaDeEquipo,
  ensureEntregasTables,
  MAX_JUGADORES,
  MAX_STAFF,
} from '../lib/entregas.js';

const SLUG_RE = /^[a-z0-9-]{4,120}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

function validarJugador(fila, indice) {
  const nombre = clean(fila.nombre);
  const apellidos = clean(fila.apellidos);
  const dni = clean(fila.dni);
  const fecha_nacimiento = clean(fila.fecha_nacimiento);
  const etiqueta = `Jugador ${indice + 1}`;

  if (!nombre || !apellidos) return { error: `${etiqueta}: el nombre y los apellidos son obligatorios.` };
  if (nombre.length > 120 || apellidos.length > 120) return { error: `${etiqueta}: nombre o apellidos demasiado largos.` };
  if (dni.length > 20) return { error: `${etiqueta}: el DNI es demasiado largo.` };
  if (!fecha_nacimiento) return { error: `${etiqueta}: falta la fecha de nacimiento.` };
  if (!FECHA_RE.test(fecha_nacimiento)) {
    return { error: `${etiqueta}: la fecha de nacimiento no es válida.` };
  }

  let dorsal = null;
  if (fila.dorsal !== null && fila.dorsal !== undefined && String(fila.dorsal).trim() !== '') {
    const n = Number(fila.dorsal);
    if (!Number.isInteger(n) || n < 0 || n > 999) return { error: `${etiqueta}: el dorsal no es válido.` };
    dorsal = n;
  }

  return { fila: { dorsal, nombre, apellidos, fecha_nacimiento, dni: dni || null } };
}

function validarTecnico(fila, indice) {
  const nombre = clean(fila.nombre);
  const apellidos = clean(fila.apellidos);
  const cargo = clean(fila.cargo);
  const dni = clean(fila.dni);
  const etiqueta = `Cuerpo técnico, fila ${indice + 1}`;

  if (!nombre || !apellidos) return { error: `${etiqueta}: el nombre y los apellidos son obligatorios.` };
  if (nombre.length > 120 || apellidos.length > 120) return { error: `${etiqueta}: nombre o apellidos demasiado largos.` };
  if (cargo.length > 60) return { error: `${etiqueta}: el cargo es demasiado largo.` };
  if (dni.length > 20) return { error: `${etiqueta}: el DNI es demasiado largo.` };

  return { fila: { nombre, apellidos, cargo: cargo || null, dni: dni || null } };
}

export async function handleGetPlantillaPublica(request, env, slugParam) {
  const slug = clean(slugParam).toLowerCase();
  if (!SLUG_RE.test(slug)) return jsonResponse({ error: 'Enlace no válido.' }, 404);

  const equipo = await getEquipoPorSlug(env, slug);
  if (!equipo) return jsonResponse({ error: 'Este enlace no existe o ya no está activo.' }, 404);

  const { jugadores, staff } = await getPlantillaDeEquipo(env, equipo.id);

  return jsonResponse({
    equipo: { name: equipo.name, category: equipo.category },
    abierto: await subidasAbiertas(env),
    actualizada_el: equipo.last_upload_at,
    jugadores,
    staff,
  });
}

export async function handleGuardarPlantillaPublica(request, env, slugParam) {
  const slug = clean(slugParam).toLowerCase();
  if (!SLUG_RE.test(slug)) return jsonResponse({ error: 'Enlace no válido.' }, 404);

  const equipo = await getEquipoPorSlug(env, slug);
  if (!equipo) return jsonResponse({ error: 'Este enlace no existe o ya no está activo.' }, 404);

  if (!(await subidasAbiertas(env))) {
    return jsonResponse({
      error: 'El plazo para enviar plantillas está cerrado. Ponte en contacto con la organización.',
    }, 403);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  }

  const jugadoresInput = Array.isArray(payload.jugadores) ? payload.jugadores : [];
  const staffInput = Array.isArray(payload.staff) ? payload.staff : [];

  if (jugadoresInput.length === 0) {
    return jsonResponse({ error: 'Añade al menos un jugador antes de guardar.' }, 400);
  }
  if (jugadoresInput.length > MAX_JUGADORES) {
    return jsonResponse({ error: `Demasiados jugadores (máx. ${MAX_JUGADORES}).` }, 400);
  }
  if (staffInput.length > MAX_STAFF) {
    return jsonResponse({ error: `Demasiadas personas en el cuerpo técnico (máx. ${MAX_STAFF}).` }, 400);
  }

  const jugadores = [];
  for (let i = 0; i < jugadoresInput.length; i++) {
    const { error, fila } = validarJugador(jugadoresInput[i], i);
    if (error) return jsonResponse({ error }, 400);
    jugadores.push(fila);
  }

  const dorsales = jugadores.map((j) => j.dorsal).filter((d) => d !== null);
  const repetido = dorsales.find((d, i) => dorsales.indexOf(d) !== i);
  if (repetido !== undefined) {
    return jsonResponse({ error: `El dorsal ${repetido} está repetido.` }, 400);
  }

  const staff = [];
  for (let i = 0; i < staffInput.length; i++) {
    const { error, fila } = validarTecnico(staffInput[i], i);
    if (error) return jsonResponse({ error }, 400);
    staff.push(fila);
  }

  await ensureEntregasTables(env);

  const statements = [
    env.DB.prepare('DELETE FROM goals WHERE player_id IN (SELECT id FROM players WHERE team_id = ?)').bind(equipo.id),
    env.DB.prepare('DELETE FROM players WHERE team_id = ?').bind(equipo.id),
    env.DB.prepare('DELETE FROM staff WHERE team_id = ?').bind(equipo.id),
  ];
  for (const j of jugadores) {
    statements.push(env.DB.prepare(
      'INSERT INTO players (team_id, dorsal, nombre, apellidos, fecha_nacimiento, dni) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(equipo.id, j.dorsal, j.nombre, j.apellidos, j.fecha_nacimiento, j.dni));
  }
  for (const t of staff) {
    statements.push(env.DB.prepare(
      'INSERT INTO staff (team_id, nombre, apellidos, cargo, dni) VALUES (?, ?, ?, ?, ?)'
    ).bind(equipo.id, t.nombre, t.apellidos, t.cargo, t.dni));
  }
  statements.push(env.DB.prepare(
    `UPDATE upload_links SET last_upload_at = datetime('now'), last_upload_count = ? WHERE team_id = ?`
  ).bind(jugadores.length, equipo.id));

  await env.DB.batch(statements);

  return jsonResponse({ ok: true, jugadores: jugadores.length, staff: staff.length });
}
