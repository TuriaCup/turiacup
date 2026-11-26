// Venta de entradas: página pública de compra, pago con Stripe, avisos de Stripe y panel de admin.

import { jsonResponse, clean, parseId } from '../lib/http.js';
import { ventaEntradasAbierta, setVentaEntradas } from '../lib/ajustes.js';
import {
  crearSesionPago, leerSesionPago, verificarWebhook, stripeConfigurado, stripeEnPruebas,
} from '../lib/stripe.js';
import {
  ensureEntradasTables, codigoAleatorio, diaMadrid, getPedidoPorCodigo, getLineas,
  getEntradasDePedido, confirmarPedido, enviarEmailEntradas, anularPedidoPorPaymentIntent,
} from '../lib/entradas.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_POR_PEDIDO = 20;
const MINUTOS_RESERVA = 35; // la sesión de Stripe caduca a los 30; un pedido pendiente reserva stock hasta entonces
const TIPO_MAX_LEN = { nombre: 80, descripcion: 300 };

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function origenDe(request) {
  return new URL(request.url).origin;
}

/** Entradas ya vendidas (o reservadas por un pago en curso) de cada tipo. */
async function ocupadasPorTipo(env) {
  const { results } = await env.DB.prepare(
    `SELECT l.tipo_id, SUM(l.cantidad) AS n
     FROM entradas_lineas l JOIN entradas_pedidos p ON p.id = l.pedido_id
     WHERE p.estado = 'pagado'
        OR (p.estado = 'pendiente' AND p.created_at > datetime('now', ?))
     GROUP BY l.tipo_id`
  ).bind(`-${MINUTOS_RESERVA} minutes`).all();
  return new Map(results.map((r) => [r.tipo_id, r.n]));
}

function tipoPublico(t, ocupadas) {
  const quedan = t.stock == null ? null : Math.max(0, t.stock - (ocupadas.get(t.id) || 0));
  return {
    id: t.id, nombre: t.nombre, descripcion: t.descripcion, precio_cents: t.precio_cents,
    abono: Boolean(t.abono), agotado: quedan === 0, quedan: quedan != null && quedan <= 20 ? quedan : null,
  };
}

// --- Público ---

export async function handleGetTiposEntrada(request, env) {
  const abierta = await ventaEntradasAbierta(env);
  if (!abierta || !stripeConfigurado(env)) return jsonResponse({ abierta: false, tipos: [] });

  await ensureEntradasTables(env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM entradas_tipos WHERE activo = 1 ORDER BY orden, id'
  ).all();
  const ocupadas = await ocupadasPorTipo(env);
  return jsonResponse({ abierta: true, pruebas: stripeEnPruebas(env), tipos: results.map((t) => tipoPublico(t, ocupadas)) });
}

export async function handleComprarEntradas(request, env) {
  if (!(await ventaEntradasAbierta(env)) || !stripeConfigurado(env)) {
    return jsonResponse({ error: 'La venta de entradas no está abierta.' }, 400);
  }
  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  if (clean(payload.website)) return jsonResponse({ error: 'Solicitud inválida.' }, 400); // honeypot

  const nombre = clean(payload.nombre);
  const email = clean(payload.email).toLowerCase();
  const telefono = clean(payload.telefono);
  if (!nombre || !email) return jsonResponse({ error: 'Indica tu nombre y tu email.' }, 400);
  if (!EMAIL_RE.test(email) || email.length > 180) return jsonResponse({ error: 'El email no es válido.' }, 400);
  if (nombre.length > 120 || telefono.length > 30) return jsonResponse({ error: 'Algún dato es demasiado largo.' }, 400);

  const pedidas = new Map();
  for (const item of Array.isArray(payload.items) ? payload.items : []) {
    const id = parseId(item?.tipo_id);
    const cantidad = Number(item?.cantidad);
    if (!id || !Number.isInteger(cantidad) || cantidad < 0) return jsonResponse({ error: 'Cantidad no válida.' }, 400);
    if (cantidad > 0) pedidas.set(id, (pedidas.get(id) || 0) + cantidad);
  }
  const totalEntradas = [...pedidas.values()].reduce((a, b) => a + b, 0);
  if (totalEntradas === 0) return jsonResponse({ error: 'Elige al menos una entrada.' }, 400);
  if (totalEntradas > MAX_POR_PEDIDO) {
    return jsonResponse({ error: `Máximo ${MAX_POR_PEDIDO} entradas por compra.` }, 400);
  }

  await ensureEntradasTables(env);
  const { results: tipos } = await env.DB.prepare('SELECT * FROM entradas_tipos WHERE activo = 1').all();
  const porId = new Map(tipos.map((t) => [t.id, t]));
  const ocupadas = await ocupadasPorTipo(env);

  const lineas = [];
  for (const [id, cantidad] of pedidas) {
    const t = porId.get(id);
    if (!t) return jsonResponse({ error: 'Uno de los tipos de entrada ya no está a la venta. Recarga la página.' }, 400);
    if (t.stock != null && (ocupadas.get(id) || 0) + cantidad > t.stock) {
      const quedan = Math.max(0, t.stock - (ocupadas.get(id) || 0));
      return jsonResponse({ error: quedan ? `Solo quedan ${quedan} de «${t.nombre}».` : `«${t.nombre}» está agotada.` }, 400);
    }
    lineas.push({ tipo: t, cantidad });
  }
  const total = lineas.reduce((s, l) => s + l.tipo.precio_cents * l.cantidad, 0);
  if (total <= 0) return jsonResponse({ error: 'El pedido no tiene importe.' }, 400);

  const codigo = codigoAleatorio(20);
  const pedido = await env.DB.prepare(
    `INSERT INTO entradas_pedidos (codigo, nombre, email, telefono, total_cents) VALUES (?, ?, ?, ?, ?) RETURNING id`
  ).bind(codigo, nombre, email, telefono || null, total).first();
  await env.DB.batch(lineas.map((l) => env.DB.prepare(
    'INSERT INTO entradas_lineas (pedido_id, tipo_id, nombre, precio_cents, cantidad) VALUES (?, ?, ?, ?, ?)'
  ).bind(pedido.id, l.tipo.id, l.tipo.nombre, l.tipo.precio_cents, l.cantidad)));

  const origen = origenDe(request);
  let sesion;
  try {
    sesion = await crearSesionPago(env, {
      mode: 'payment',
      locale: 'es',
      customer_email: email,
      client_reference_id: codigo,
      success_url: `${origen}/entradas/${codigo}`,
      cancel_url: `${origen}/entradas.html?cancelado=1`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      metadata: { pedido: codigo },
      payment_intent_data: { metadata: { pedido: codigo }, description: 'Entradas Turia Cup' },
      line_items: lineas.map((l) => ({
        quantity: l.cantidad,
        price_data: {
          currency: 'eur',
          unit_amount: l.tipo.precio_cents,
          product_data: { name: `Turia Cup — ${l.tipo.nombre}` },
        },
      })),
    });
  } catch (err) {
    await env.DB.prepare("UPDATE entradas_pedidos SET estado = 'caducado' WHERE id = ?").bind(pedido.id).run();
    return jsonResponse({ error: 'No se ha podido iniciar el pago. Inténtalo de nuevo en unos minutos.' }, 502);
  }

  await env.DB.prepare('UPDATE entradas_pedidos SET stripe_session_id = ? WHERE id = ?')
    .bind(sesion.id, pedido.id).run();
  return jsonResponse({ url: sesion.url });
}

/** Lo que ve el comprador en /entradas/<codigo>. Si aún no consta el pago, se lo pregunta a Stripe. */
export async function handleGetPedidoPublico(request, env, codigo) {
  if (!/^[A-Z0-9]{20}$/.test(codigo || '')) return jsonResponse({ error: 'Pedido no encontrado.' }, 404);
  let pedido = await getPedidoPorCodigo(env, codigo);
  if (!pedido) return jsonResponse({ error: 'Pedido no encontrado.' }, 404);

  if (pedido.estado === 'pendiente' && pedido.stripe_session_id && stripeConfigurado(env)) {
    try {
      const sesion = await leerSesionPago(env, pedido.stripe_session_id);
      if (sesion.payment_status === 'paid') {
        await confirmarPedido(env, pedido, { paymentIntent: sesion.payment_intent, origen: origenDe(request) });
        pedido = await getPedidoPorCodigo(env, codigo);
      }
    } catch {
      // seguimos con lo que haya; la página volverá a preguntar
    }
  }

  const entradas = pedido.estado === 'pagado' || pedido.estado === 'reembolsado'
    ? await getEntradasDePedido(env, pedido.id) : [];
  return jsonResponse({
    estado: pedido.estado,
    nombre: pedido.nombre,
    email: pedido.email,
    total_cents: pedido.total_cents,
    referencia: pedido.codigo.slice(0, 6),
    lineas: await getLineas(env, pedido.id),
    entradas: entradas.map((e) => ({
      codigo: e.codigo, tipo: e.tipo_nombre, abono: Boolean(e.abono), anulada: Boolean(e.anulada), usada: e.accesos > 0,
    })),
  });
}

/** Avisos que manda Stripe (pago completado, sesión caducada, reembolso). */
export async function handleStripeWebhook(request, env) {
  const cuerpo = await request.text();
  const evento = await verificarWebhook(env, cuerpo, request.headers.get('Stripe-Signature'));
  if (!evento) return jsonResponse({ error: 'Firma no válida.' }, 400);

  await ensureEntradasTables(env);
  const obj = evento.data?.object || {};

  if (evento.type === 'checkout.session.completed' || evento.type === 'checkout.session.async_payment_succeeded') {
    if (obj.payment_status === 'paid') {
      const pedido = await getPedidoPorCodigo(env, obj.client_reference_id || obj.metadata?.pedido || '');
      if (pedido) await confirmarPedido(env, pedido, { paymentIntent: obj.payment_intent, origen: origenDe(request) });
    }
  } else if (evento.type === 'checkout.session.expired') {
    await env.DB.prepare("UPDATE entradas_pedidos SET estado = 'caducado' WHERE stripe_session_id = ? AND estado = 'pendiente'")
      .bind(obj.id).run();
  } else if (evento.type === 'charge.refunded') {
    if (obj.refunded && obj.payment_intent) await anularPedidoPorPaymentIntent(env, obj.payment_intent);
  }

  return jsonResponse({ recibido: true });
}

// --- Admin ---

function leerTipo(payload) {
  const nombre = clean(payload.nombre);
  const descripcion = clean(payload.descripcion);
  const precio = Number(String(payload.precio ?? '').replace(',', '.'));
  const stockRaw = payload.stock;
  const stock = stockRaw === '' || stockRaw == null ? null : Number(stockRaw);

  if (!nombre) return { error: 'El nombre es obligatorio.' };
  for (const [campo, max] of Object.entries(TIPO_MAX_LEN)) {
    if ({ nombre, descripcion }[campo].length > max) return { error: `El campo ${campo} es demasiado largo.` };
  }
  if (!Number.isFinite(precio) || precio < 0.5 || precio > 1000) {
    return { error: 'El precio tiene que estar entre 0,50 € y 1.000 €.' };
  }
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) return { error: 'El límite tiene que ser un número entero.' };

  return {
    tipo: {
      nombre,
      descripcion: descripcion || null,
      precio_cents: Math.round(precio * 100),
      stock,
      abono: payload.abono ? 1 : 0,
      activo: payload.activo === false ? 0 : 1,
      orden: Number.isInteger(Number(payload.orden)) ? Number(payload.orden) : 0,
    },
  };
}

export async function handleAdminResumenEntradas(request, env) {
  await ensureEntradasTables(env);
  const hoy = diaMadrid();

  const { results: tipos } = await env.DB.prepare(
    `SELECT t.*,
       COALESCE((SELECT SUM(l.cantidad) FROM entradas_lineas l JOIN entradas_pedidos p ON p.id = l.pedido_id
                 WHERE l.tipo_id = t.id AND p.estado = 'pagado'), 0) AS vendidas,
       COALESCE((SELECT SUM(l.cantidad * l.precio_cents) FROM entradas_lineas l JOIN entradas_pedidos p ON p.id = l.pedido_id
                 WHERE l.tipo_id = t.id AND p.estado = 'pagado'), 0) AS ingresos_cents
     FROM entradas_tipos t ORDER BY t.orden, t.id`
  ).all();

  const totales = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM entradas_pedidos WHERE estado = 'pagado') AS pedidos,
       (SELECT COALESCE(SUM(total_cents), 0) FROM entradas_pedidos WHERE estado = 'pagado') AS ingresos_cents,
       (SELECT COUNT(*) FROM entradas WHERE anulada = 0) AS entradas,
       (SELECT COUNT(*) FROM entradas_accesos WHERE dia = ?) AS accesos_hoy,
       (SELECT COUNT(*) FROM entradas_pedidos WHERE estado = 'reembolsado') AS reembolsados`
  ).bind(hoy).first();

  return jsonResponse({
    venta_abierta: await ventaEntradasAbierta(env),
    stripe_configurado: stripeConfigurado(env),
    stripe_pruebas: stripeEnPruebas(env),
    webhook_configurado: Boolean(env.STRIPE_WEBHOOK_SECRET),
    email_configurado: Boolean(env.RESEND_API_KEY && env.FROM_EMAIL),
    tipos,
    totales,
  });
}

export async function handleAdminVentaEntradas(request, env) {
  const payload = await readJson(request);
  if (!payload || typeof payload.abierta !== 'boolean') return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  if (payload.abierta && !stripeConfigurado(env)) {
    return jsonResponse({ error: 'Falta configurar la clave de Stripe (STRIPE_SECRET_KEY) antes de abrir la venta.' }, 400);
  }
  await setVentaEntradas(env, payload.abierta);
  return jsonResponse({ ok: true, venta_abierta: await ventaEntradasAbierta(env) });
}

export async function handleAdminCrearTipo(request, env) {
  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  const { tipo, error } = leerTipo(payload);
  if (error) return jsonResponse({ error }, 400);

  await ensureEntradasTables(env);
  const row = await env.DB.prepare(
    `INSERT INTO entradas_tipos (nombre, descripcion, precio_cents, stock, abono, activo, orden)
     VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
  ).bind(tipo.nombre, tipo.descripcion, tipo.precio_cents, tipo.stock, tipo.abono, tipo.activo, tipo.orden).first();
  return jsonResponse({ ok: true, id: row.id }, 201);
}

export async function handleAdminActualizarTipo(request, env, idRaw) {
  const id = parseId(idRaw);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);
  const payload = await readJson(request);
  if (!payload) return jsonResponse({ error: 'Solicitud inválida.' }, 400);
  const { tipo, error } = leerTipo(payload);
  if (error) return jsonResponse({ error }, 400);

  await ensureEntradasTables(env);
  const res = await env.DB.prepare(
    `UPDATE entradas_tipos SET nombre = ?, descripcion = ?, precio_cents = ?, stock = ?, abono = ?, activo = ?, orden = ?
     WHERE id = ?`
  ).bind(tipo.nombre, tipo.descripcion, tipo.precio_cents, tipo.stock, tipo.abono, tipo.activo, tipo.orden, id).run();
  if (!res.meta.changes) return jsonResponse({ error: 'Tipo de entrada no encontrado.' }, 404);
  return jsonResponse({ ok: true });
}

export async function handleAdminBorrarTipo(request, env, idRaw) {
  const id = parseId(idRaw);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);
  await ensureEntradasTables(env);
  const usado = await env.DB.prepare('SELECT 1 FROM entradas_lineas WHERE tipo_id = ? LIMIT 1').bind(id).first();
  if (usado) {
    return jsonResponse({ error: 'Ya se han pedido entradas de este tipo: no se puede borrar. Desactívalo para que deje de venderse.' }, 400);
  }
  await env.DB.prepare('DELETE FROM entradas_tipos WHERE id = ?').bind(id).run();
  return jsonResponse({ ok: true });
}

export async function handleAdminListPedidos(request, env) {
  await ensureEntradasTables(env);
  const q = clean(new URL(request.url).searchParams.get('q') || '');
  const filtro = q ? `%${q}%` : null;
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.codigo, p.nombre, p.email, p.telefono, p.total_cents, p.estado, p.created_at, p.paid_at,
            p.email_enviado_at, p.stripe_payment_intent,
            (SELECT GROUP_CONCAT(l.cantidad || ' × ' || l.nombre, ', ') FROM entradas_lineas l WHERE l.pedido_id = p.id) AS detalle,
            (SELECT COUNT(*) FROM entradas e WHERE e.pedido_id = p.id) AS entradas,
            (SELECT COUNT(DISTINCT a.entrada_id) FROM entradas_accesos a JOIN entradas e ON e.id = a.entrada_id
             WHERE e.pedido_id = p.id) AS usadas
     FROM entradas_pedidos p
     WHERE (? IS NULL AND p.estado <> 'caducado')
        OR (? IS NOT NULL AND (p.nombre LIKE ? OR p.email LIKE ? OR p.codigo LIKE ?
            OR EXISTS (SELECT 1 FROM entradas e WHERE e.pedido_id = p.id AND e.codigo LIKE ?)))
     ORDER BY p.id DESC LIMIT 200`
  ).bind(filtro, filtro, filtro, filtro, filtro, filtro).all();
  return jsonResponse({ pedidos: results });
}

export async function handleAdminReenviarEmail(request, env, idRaw) {
  const id = parseId(idRaw);
  if (!id) return jsonResponse({ error: 'Id inválido.' }, 400);
  await ensureEntradasTables(env);
  const pedido = await env.DB.prepare('SELECT * FROM entradas_pedidos WHERE id = ?').bind(id).first();
  if (!pedido) return jsonResponse({ error: 'Pedido no encontrado.' }, 404);
  if (pedido.estado !== 'pagado') return jsonResponse({ error: 'Solo se reenvían pedidos pagados.' }, 400);
  const ok = await enviarEmailEntradas(env, pedido, origenDe(request));
  if (!ok) return jsonResponse({ error: 'No se ha podido enviar el email. Revisa la configuración de Resend.' }, 502);
  return jsonResponse({ ok: true });
}

/**
 * Control de acceso. Una entrada normal vale para entrar una vez; un abono, una vez cada día.
 * Si ya ha entrado, no se registra otra vez y se avisa (puede ser alguien que sale y vuelve).
 */
export async function handleAdminValidarEntrada(request, env) {
  const payload = await readJson(request);
  const codigo = clean(payload?.codigo).toUpperCase().replace(/^TC-/, '').replace(/[^A-Z0-9]/g, '');
  if (!codigo) return jsonResponse({ error: 'Falta el código.' }, 400);

  await ensureEntradasTables(env);
  const entrada = await env.DB.prepare(
    `SELECT e.id, e.codigo, e.tipo_nombre, e.abono, e.anulada, p.nombre AS comprador, p.estado
     FROM entradas e JOIN entradas_pedidos p ON p.id = e.pedido_id WHERE e.codigo = ?`
  ).bind(codigo).first();
  if (!entrada) return jsonResponse({ resultado: 'no_existe', codigo });

  const info = { codigo: entrada.codigo, tipo: entrada.tipo_nombre, comprador: entrada.comprador, abono: Boolean(entrada.abono) };
  if (entrada.anulada || entrada.estado !== 'pagado') return jsonResponse({ resultado: 'anulada', entrada: info });

  const hoy = diaMadrid();
  const { results: accesos } = await env.DB.prepare(
    'SELECT dia, created_at FROM entradas_accesos WHERE entrada_id = ? ORDER BY id'
  ).bind(entrada.id).all();
  const previo = entrada.abono ? accesos.find((a) => a.dia === hoy) : accesos[0];
  if (previo) {
    return jsonResponse({ resultado: 'ya_usada', entrada: info, primer_acceso: `${previo.created_at.replace(' ', 'T')}Z` });
  }

  await env.DB.prepare('INSERT INTO entradas_accesos (entrada_id, dia) VALUES (?, ?)').bind(entrada.id, hoy).run();
  return jsonResponse({ resultado: 'valida', entrada: info });
}

/** Deshacer el último acceso de hoy (por si se escaneó por error). */
export async function handleAdminDeshacerAcceso(request, env) {
  const payload = await readJson(request);
  const codigo = clean(payload?.codigo).toUpperCase();
  await ensureEntradasTables(env);
  const res = await env.DB.prepare(
    `DELETE FROM entradas_accesos WHERE id = (
       SELECT a.id FROM entradas_accesos a JOIN entradas e ON e.id = a.entrada_id
       WHERE e.codigo = ? AND a.dia = ? ORDER BY a.id DESC LIMIT 1)`
  ).bind(codigo, diaMadrid()).run();
  if (!res.meta.changes) return jsonResponse({ error: 'No había ningún acceso de hoy que deshacer.' }, 400);
  return jsonResponse({ ok: true });
}
