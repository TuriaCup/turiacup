// Venta de entradas: tablas, códigos, confirmación de pedidos pagados y email al comprador.

import { escapeHtml } from './http.js';

const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // sin 0/O ni 1/I/L, que se confunden al dictarlos

const TABLAS = [
  `CREATE TABLE IF NOT EXISTS entradas_tipos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio_cents INTEGER NOT NULL,
    stock INTEGER,
    abono INTEGER NOT NULL DEFAULT 0,
    activo INTEGER NOT NULL DEFAULT 1,
    orden INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS entradas_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT,
    total_cents INTEGER NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    stripe_session_id TEXT,
    stripe_payment_intent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT,
    email_enviado_at TEXT
  )`,
  'CREATE INDEX IF NOT EXISTS idx_entradas_pedidos_session ON entradas_pedidos(stripe_session_id)',
  'CREATE INDEX IF NOT EXISTS idx_entradas_pedidos_pi ON entradas_pedidos(stripe_payment_intent)',
  `CREATE TABLE IF NOT EXISTS entradas_lineas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES entradas_pedidos(id) ON DELETE CASCADE,
    tipo_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio_cents INTEGER NOT NULL,
    cantidad INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS entradas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES entradas_pedidos(id) ON DELETE CASCADE,
    tipo_id INTEGER NOT NULL,
    tipo_nombre TEXT NOT NULL,
    abono INTEGER NOT NULL DEFAULT 0,
    codigo TEXT NOT NULL UNIQUE,
    anulada INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS entradas_accesos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entrada_id INTEGER NOT NULL REFERENCES entradas(id) ON DELETE CASCADE,
    dia TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_entradas_accesos_entrada ON entradas_accesos(entrada_id)',
];

let tablasListas = false;
export async function ensureEntradasTables(env) {
  if (tablasListas) return;
  await env.DB.batch(TABLAS.map((sql) => env.DB.prepare(sql)));
  tablasListas = true;
}

export function codigoAleatorio(longitud) {
  const bytes = new Uint8Array(longitud);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
}

/** Fecha de hoy en Valencia (AAAA-MM-DD), que es lo que cuenta para «ya ha entrado hoy». */
export function diaMadrid(fecha = new Date()) {
  return fecha.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
}

export function formatEuros(cents) {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

export async function getPedidoPorCodigo(env, codigo) {
  await ensureEntradasTables(env);
  return env.DB.prepare('SELECT * FROM entradas_pedidos WHERE codigo = ?').bind(codigo).first();
}

export async function getLineas(env, pedidoId) {
  const { results } = await env.DB.prepare(
    'SELECT tipo_id, nombre, precio_cents, cantidad FROM entradas_lineas WHERE pedido_id = ? ORDER BY id'
  ).bind(pedidoId).all();
  return results;
}

export async function getEntradasDePedido(env, pedidoId) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.codigo, e.tipo_nombre, e.abono, e.anulada,
            (SELECT COUNT(*) FROM entradas_accesos a WHERE a.entrada_id = e.id) AS accesos
     FROM entradas e WHERE e.pedido_id = ? ORDER BY e.id`
  ).bind(pedidoId).all();
  return results;
}

/**
 * Marca el pedido como pagado y crea sus entradas. Es idempotente: si el aviso de Stripe y la
 * página de «gracias» llegan a la vez, solo el primero que cambia el estado crea las entradas.
 */
export async function confirmarPedido(env, pedido, { paymentIntent, origen }) {
  const res = await env.DB.prepare(
    `UPDATE entradas_pedidos SET estado = 'pagado', paid_at = datetime('now'),
            stripe_payment_intent = COALESCE(?, stripe_payment_intent)
     WHERE id = ? AND estado = 'pendiente'`
  ).bind(paymentIntent || null, pedido.id).run();
  if (!res.meta || res.meta.changes !== 1) return false;

  const lineas = await getLineas(env, pedido.id);
  const tipos = await env.DB.prepare('SELECT id, abono FROM entradas_tipos').all();
  const abonoPorTipo = new Map(tipos.results.map((t) => [t.id, t.abono]));

  const inserts = [];
  for (const l of lineas) {
    for (let i = 0; i < l.cantidad; i++) {
      inserts.push(env.DB.prepare(
        'INSERT INTO entradas (pedido_id, tipo_id, tipo_nombre, abono, codigo) VALUES (?, ?, ?, ?, ?)'
      ).bind(pedido.id, l.tipo_id, l.nombre, abonoPorTipo.get(l.tipo_id) ? 1 : 0, codigoAleatorio(10)));
    }
  }
  if (inserts.length) await env.DB.batch(inserts);

  await enviarEmailEntradas(env, { ...pedido, estado: 'pagado' }, origen);
  return true;
}

export async function enviarEmailEntradas(env, pedido, origen) {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) return false;

  const lineas = await getLineas(env, pedido.id);
  const enlace = `${origen}/entradas/${pedido.codigo}`;
  const resumen = lineas.map((l) =>
    `<li>${l.cantidad} × ${escapeHtml(l.nombre)} — ${formatEuros(l.precio_cents * l.cantidad)}</li>`).join('');
  const total = lineas.reduce((s, l) => s + l.cantidad, 0);

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#241b12">
      <h2 style="color:#ff7900">¡Gracias por tu compra, ${escapeHtml(pedido.nombre)}!</h2>
      <p>Aquí tienes tu pedido para la <strong>Turia Cup</strong>:</p>
      <ul>${resumen}</ul>
      <p><strong>Total pagado:</strong> ${formatEuros(pedido.total_cents)}</p>
      <p>Tus ${total === 1 ? 'entrada' : `${total} entradas`} con su código QR ${total === 1 ? 'está' : 'están'} en este enlace.
         Enséñalo en la puerta desde el móvil (o imprímelo):</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${enlace}" style="background:#ff7900;color:#fff;padding:14px 26px;border-radius:8px;text-decoration:none;font-weight:bold">
          Ver mis entradas
        </a>
      </p>
      <p style="font-size:13px;color:#6b6058">Si el botón no funciona, copia esta dirección: ${enlace}<br>
         No compartas este enlace: quien lo tenga puede usar tus entradas.</p>
      <p style="font-size:13px;color:#6b6058">Referencia del pedido: ${escapeHtml(pedido.codigo.slice(0, 6))}
         · Dudas: <a href="mailto:info@turiacup.com">info@turiacup.com</a></p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: pedido.email,
        reply_to: env.NOTIFY_EMAIL || undefined,
        subject: 'Tus entradas para la Turia Cup',
        html,
      }),
    });
    if (!res.ok) return false;
    await env.DB.prepare("UPDATE entradas_pedidos SET email_enviado_at = datetime('now') WHERE id = ?")
      .bind(pedido.id).run();
    return true;
  } catch {
    return false; // las entradas ya existen; el admin puede reenviar el email desde el panel
  }
}

/** Reembolso completo hecho desde Stripe: el pedido queda reembolsado y sus entradas dejan de valer. */
export async function anularPedidoPorPaymentIntent(env, paymentIntent) {
  const pedido = await env.DB.prepare('SELECT id FROM entradas_pedidos WHERE stripe_payment_intent = ?')
    .bind(paymentIntent).first();
  if (!pedido) return false;
  await env.DB.batch([
    env.DB.prepare("UPDATE entradas_pedidos SET estado = 'reembolsado' WHERE id = ?").bind(pedido.id),
    env.DB.prepare('UPDATE entradas SET anulada = 1 WHERE pedido_id = ?').bind(pedido.id),
  ]);
  return true;
}
