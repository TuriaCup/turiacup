const CATEGORIAS_VALIDAS = ['U8', 'U9', 'U10', 'U11', 'U12'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = { club: 120, categoria: 10, ciudad: 120, nombre: 120, email: 180, telefono: 30, comentarios: 1000 };

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleInscripcion(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  }

  // Honeypot: si el bot rellena este campo oculto, respondemos como si todo hubiera ido bien
  if (clean(payload.website)) {
    return jsonResponse({ ok: true }, 200);
  }

  const club = clean(payload.club);
  const categoria = clean(payload.categoria).toUpperCase();
  const ciudad = clean(payload.ciudad);
  const nombre = clean(payload.nombre);
  const email = clean(payload.email);
  const telefono = clean(payload.telefono);
  const comentarios = clean(payload.comentarios);

  if (!club || !categoria || !ciudad || !nombre || !email || !telefono) {
    return jsonResponse({ error: 'Faltan campos obligatorios.' }, 400);
  }
  if (!CATEGORIAS_VALIDAS.includes(categoria)) {
    return jsonResponse({ error: 'Categoría no válida.' }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ error: 'Email no válido.' }, 400);
  }
  for (const [field, max] of Object.entries(MAX_LEN)) {
    const value = { club, categoria, ciudad, nombre, email, telefono, comentarios }[field];
    if (value.length > max) {
      return jsonResponse({ error: `El campo ${field} es demasiado largo.` }, 400);
    }
  }

  try {
    await env.DB.prepare(
      `INSERT INTO inscripciones (club, categoria, ciudad, nombre, email, telefono, comentarios)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(club, categoria, ciudad, nombre, email, telefono, comentarios || null)
      .run();
  } catch (err) {
    return jsonResponse({ error: 'No se pudo guardar la inscripción. Inténtalo de nuevo.' }, 500);
  }

  return jsonResponse({ ok: true }, 200);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/inscripcion' && request.method === 'POST') {
      return handleInscripcion(request, env);
    }

    return new Response('Not found', { status: 404 });
  },
};
