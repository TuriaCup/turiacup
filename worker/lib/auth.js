import { jsonResponse, clean } from './http.js';

const COOKIE_NAME = 'admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 días

function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padLen = (4 - (str.length % 4)) % 4;
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signPayload(payload, secret) {
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLen; i++) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

async function createSessionToken(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ exp })));
  const signature = await signPayload(payload, env.SESSION_SECRET);
  return `${payload}.${signature}`;
}

async function verifySessionToken(token, env) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expected = await signPayload(payload, env.SESSION_SECRET);
  if (!timingSafeEqual(expected, signature)) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return typeof exp === 'number' && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function sessionCookieHeader(token, maxAgeSeconds, secure) {
  const secureFlag = secure ? ' Secure;' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly;${secureFlag} SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export async function isAdminRequest(request, env) {
  const token = getCookie(request, COOKIE_NAME);
  return verifySessionToken(token, env);
}

export async function requireAdmin(request, env) {
  const ok = await isAdminRequest(request, env);
  if (!ok) return jsonResponse({ error: 'No autorizado.' }, 401);
  return null;
}

export async function handleLogin(request, env) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return jsonResponse({ error: 'Panel de administración no configurado.' }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  }

  const password = clean(payload.password);
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) {
    return jsonResponse({ error: 'Contraseña incorrecta.' }, 401);
  }

  const token = await createSessionToken(env);
  const secure = new URL(request.url).protocol === 'https:';
  const res = jsonResponse({ ok: true });
  res.headers.append('Set-Cookie', sessionCookieHeader(token, SESSION_TTL_SECONDS, secure));
  return res;
}

export function handleLogout(request) {
  const secure = new URL(request.url).protocol === 'https:';
  const res = jsonResponse({ ok: true });
  res.headers.append('Set-Cookie', sessionCookieHeader('', 0, secure));
  return res;
}

export async function handleMe(request, env) {
  const authenticated = await isAdminRequest(request, env);
  return jsonResponse({ authenticated });
}
