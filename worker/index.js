import { jsonResponse } from './lib/http.js';
import { requireAdmin, handleLogin, handleLogout, handleMe } from './lib/auth.js';
import { handleInscripcion } from './routes/inscripcion.js';
import {
  handleListEquipos,
  handleGetEquipo,
  handleGetJugador,
  handleClasificacion,
  handlePartidos,
} from './routes/public.js';
import {
  handleGetPlantillaPublica,
  handleGuardarPlantillaPublica,
} from './routes/plantilla.js';
import {
  handleImportarEquipos,
  handleGetAjustes,
  handleUpdateAjustes,
  handleListEntregas,
  handleGenerarEnlaces,
  handleCreateEquipo,
  handleUpdateEquipo,
  handleDeleteEquipo,
  handleListJugadoresAdmin,
  handleUploadPlantilla,
  handleUpdateJugador,
  handleDeleteJugador,
  handleCreatePartido,
  handleUpdatePartido,
  handleDeletePartido,
  handleResultadoPartido,
} from './routes/admin.js';

/**
 * Las páginas de /plantilla/:slug no existen como fichero, así que el Worker sirve
 * subir-plantilla.html en su lugar (y si el binding de assets fallara, redirige).
 */
async function servirPaginaPlantilla(request, env, slug) {
  const destino = new URL('/subir-plantilla.html', request.url);

  try {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      let res = await env.ASSETS.fetch(new Request(destino, { method: 'GET' }));

      // Los assets pueden contestar con una redirección a la versión sin `.html`.
      // Hay que seguirla aquí dentro: si se la devolvemos al navegador, se va a esa otra
      // dirección y pierde el código del enlace (/plantilla/<slug>).
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('Location');
        if (location) {
          res = await env.ASSETS.fetch(new Request(new URL(location, request.url), { method: 'GET' }));
        }
      }

      if (res.ok) {
        return new Response(res.body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
    }
  } catch {
    // seguimos con la redirección de abajo
  }

  // Último recurso: mandamos el navegador a la página con el código en la dirección.
  destino.searchParams.set('c', slug);
  return Response.redirect(destino.toString(), 302);
}

function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i];
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = pathParts[i];
    } else if (pp !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

async function routeAdmin(request, env, pathname, method) {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  let params;

  if (pathname === '/api/admin/ajustes') {
    if (method === 'GET') return handleGetAjustes(request, env);
    if (method === 'PUT') return handleUpdateAjustes(request, env);
  }

  if (pathname === '/api/admin/entregas' && method === 'GET') return handleListEntregas(request, env);
  if (pathname === '/api/admin/entregas/enlaces' && method === 'POST') return handleGenerarEnlaces(request, env);

  if (pathname === '/api/admin/equipos' && method === 'POST') return handleCreateEquipo(request, env);
  if (pathname === '/api/admin/equipos/importar' && method === 'POST') return handleImportarEquipos(request, env);

  params = matchPath('/api/admin/equipos/:id', pathname);
  if (params) {
    if (method === 'PUT') return handleUpdateEquipo(request, env, params.id);
    if (method === 'DELETE') return handleDeleteEquipo(request, env, params.id);
  }

  params = matchPath('/api/admin/equipos/:id/jugadores', pathname);
  if (params && method === 'GET') return handleListJugadoresAdmin(request, env, params.id);

  params = matchPath('/api/admin/equipos/:id/plantilla', pathname);
  if (params && method === 'POST') return handleUploadPlantilla(request, env, params.id);

  params = matchPath('/api/admin/jugadores/:id', pathname);
  if (params) {
    if (method === 'PUT') return handleUpdateJugador(request, env, params.id);
    if (method === 'DELETE') return handleDeleteJugador(request, env, params.id);
  }

  if (pathname === '/api/admin/partidos' && method === 'POST') return handleCreatePartido(request, env);

  params = matchPath('/api/admin/partidos/:id', pathname);
  if (params) {
    if (method === 'PUT') return handleUpdatePartido(request, env, params.id);
    if (method === 'DELETE') return handleDeletePartido(request, env, params.id);
  }

  params = matchPath('/api/admin/partidos/:id/resultado', pathname);
  if (params && method === 'PUT') return handleResultadoPartido(request, env, params.id);

  return jsonResponse({ error: 'No encontrado.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const { method } = request;

    try {
      if (pathname === '/api/inscripcion' && method === 'POST') return handleInscripcion(request, env);

      if (pathname === '/api/equipos' && method === 'GET') return handleListEquipos(request, env);
      if (pathname === '/api/clasificacion' && method === 'GET') return handleClasificacion(request, env);
      if (pathname === '/api/partidos' && method === 'GET') return handlePartidos(request, env);

      let params = matchPath('/api/equipos/:id', pathname);
      if (params && method === 'GET') return handleGetEquipo(request, env, params.id);

      params = matchPath('/api/jugadores/:id', pathname);
      if (params && method === 'GET') return handleGetJugador(request, env, params.id);

      params = matchPath('/api/plantilla/:slug', pathname);
      if (params) {
        if (method === 'GET') return handleGetPlantillaPublica(request, env, params.slug);
        if (method === 'PUT') return handleGuardarPlantillaPublica(request, env, params.slug);
      }

      params = matchPath('/plantilla/:slug', pathname);
      if (params && method === 'GET') return servirPaginaPlantilla(request, env, params.slug);

      if (pathname === '/api/admin/login' && method === 'POST') return handleLogin(request, env);
      if (pathname === '/api/admin/logout' && method === 'POST') return handleLogout(request);
      if (pathname === '/api/admin/me' && method === 'GET') return handleMe(request, env);

      if (pathname.startsWith('/api/admin/')) return routeAdmin(request, env, pathname, method);

      return new Response('Not found', { status: 404 });
    } catch (err) {
      return jsonResponse({ error: 'Error interno del servidor.' }, 500);
    }
  },
};
