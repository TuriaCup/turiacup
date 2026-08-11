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

  if (pathname === '/api/admin/equipos' && method === 'POST') return handleCreateEquipo(request, env);

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
