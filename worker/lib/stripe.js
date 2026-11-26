// Llamadas a la API de Stripe sin SDK (fetch + formulario) y verificación de los avisos (webhooks).

const TOLERANCIA_WEBHOOK_S = 300; // Stripe recomienda rechazar avisos con más de 5 minutos

function apiBase(env) {
  // STRIPE_API_BASE solo existe para probar en local contra un Stripe simulado.
  return env.STRIPE_API_BASE || 'https://api.stripe.com';
}

export function stripeConfigurado(env) {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function stripeEnPruebas(env) {
  return String(env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
}

/** { a: { b: [ { c: 1 } ] } } → a[b][0][c]=1 (el formato que pide la API de Stripe). */
function aFormulario(obj, prefijo = '', params = new URLSearchParams()) {
  for (const [clave, valor] of Object.entries(obj)) {
    if (valor === undefined || valor === null) continue;
    const nombre = prefijo ? `${prefijo}[${clave}]` : clave;
    if (typeof valor === 'object') aFormulario(valor, nombre, params);
    else params.append(nombre, String(valor));
  }
  return params;
}

async function llamarStripe(env, method, path, datos) {
  const res = await fetch(`${apiBase(env)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: datos ? aFormulario(datos).toString() : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `Stripe respondió ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

export function crearSesionPago(env, datos) {
  return llamarStripe(env, 'POST', '/v1/checkout/sessions', datos);
}

export function leerSesionPago(env, sessionId) {
  return llamarStripe(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function igualSeguro(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Comprueba la cabecera Stripe-Signature («t=…,v1=…») contra el cuerpo tal cual llegó.
 * Devuelve el evento ya parseado, o null si la firma no cuadra.
 */
export async function verificarWebhook(env, cuerpo, cabecera) {
  if (!env.STRIPE_WEBHOOK_SECRET || !cabecera) return null;

  const partes = cabecera.split(',').map((p) => p.split('='));
  const t = partes.find(([k]) => k === 't')?.[1];
  const firmas = partes.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || firmas.length === 0) return null;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCIA_WEBHOOK_S) return null;

  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const esperada = hex(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${t}.${cuerpo}`)));
  if (!firmas.some((f) => igualSeguro(f, esperada))) return null;

  try {
    return JSON.parse(cuerpo);
  } catch {
    return null;
  }
}
