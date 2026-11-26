// Pestaña «Entradas» del panel: abrir/cerrar la venta, tipos de entrada, resumen y pedidos.
// Script clásico: usa `panels`, `fetchJson` y `escapeHtml` de admin.js / utils.js.

let entradasEstado = null;
let tipoEditando = null;

function eurosAdmin(cents) {
  return `${(Number(cents || 0) / 100).toFixed(2).replace('.', ',')} €`;
}

const ESTADOS_PEDIDO = {
  pagado: '<span class="entregada">Pagado</span>',
  pendiente: '<span class="pendiente">Pago sin terminar</span>',
  caducado: '<span class="pendiente">No pagado</span>',
  reembolsado: '<span class="entregas-pendiente">Reembolsado</span>',
};

function renderEntradasTab() {
  panels.entradas.innerHTML = `
    <div class="import-box">
      <h2>Venta de entradas</h2>
      <div id="ventaEstado"><p>Cargando…</p></div>
      <p class="feedback" id="ventaFeedback"></p>
    </div>

    <div class="import-box">
      <h2>Resumen</h2>
      <div id="entradasResumen"></div>
    </div>

    <div class="import-box">
      <div class="admin-toolbar">
        <h2>Tipos de entrada</h2>
        <button class="btn-small primary" id="nuevoTipoBtn">+ Nuevo tipo</button>
      </div>
      <div id="tipoFormContainer"></div>
      <div id="tiposTabla"></div>
    </div>

    <div class="import-box">
      <div class="admin-toolbar">
        <h2>Pedidos</h2>
        <form id="buscarPedidosForm" class="enlace-celda">
          <input type="search" id="buscarPedidos" placeholder="Nombre, email o código" class="buscar-pedidos">
          <button class="btn-small" type="submit">Buscar</button>
        </form>
      </div>
      <p class="feedback" id="pedidosFeedback"></p>
      <div id="pedidosTabla"><p>Cargando…</p></div>
    </div>
  `;

  document.getElementById('nuevoTipoBtn').addEventListener('click', () => mostrarFormTipo(null));
  document.getElementById('buscarPedidosForm').addEventListener('submit', (e) => {
    e.preventDefault();
    cargarPedidos(document.getElementById('buscarPedidos').value.trim());
  });
  panels.entradas.onclick = clickEntradas;

  cargarResumenEntradas();
  cargarPedidos('');
}

async function cargarResumenEntradas() {
  try {
    entradasEstado = await fetchJson('/api/admin/entradas');
  } catch (err) {
    document.getElementById('ventaEstado').innerHTML = `<p>${escapeHtml(err.message)}</p>`;
    return;
  }
  pintarVenta();
  pintarResumen();
  pintarTipos();
}

function pintarVenta() {
  const e = entradasEstado;
  const avisos = [];
  if (!e.stripe_configurado) avisos.push('Falta la clave de Stripe (<code>STRIPE_SECRET_KEY</code>). Sin ella no se puede vender.');
  if (e.stripe_configurado && !e.webhook_configurado) {
    avisos.push('Falta el secreto de avisos de Stripe (<code>STRIPE_WEBHOOK_SECRET</code>). Se puede vender, pero si un comprador cierra la ventana justo después de pagar, sus entradas no se generan hasta que vuelva a abrir su enlace.');
  }
  if (!e.email_configurado) avisos.push('El email (Resend) no está configurado: los compradores no recibirán sus entradas por correo.');

  document.getElementById('ventaEstado').innerHTML = `
    ${e.stripe_pruebas ? '<p class="aviso-stripe">🧪 Stripe está en <strong>modo pruebas</strong>: los pagos no son reales (tarjeta 4242 4242 4242 4242).</p>' : ''}
    ${avisos.map((a) => `<p class="aviso-stripe">⚠️ ${a}</p>`).join('')}
    <p>${e.venta_abierta
      ? '🟢 <strong>Venta abierta</strong>: cualquiera puede comprar en <a href="/entradas.html" target="_blank">turiacup.com/entradas.html</a>.'
      : '🔒 <strong>Venta cerrada</strong>: la página de entradas dice que la venta aún no está disponible.'}</p>
    <div class="form-actions">
      <button class="btn-small ${e.venta_abierta ? 'danger' : 'primary'}" data-accion="toggle-venta">
        ${e.venta_abierta ? 'Cerrar la venta' : 'Abrir la venta'}
      </button>
      <a class="btn-small" href="/control-acceso.html" target="_blank">📷 Abrir el control de acceso (escáner)</a>
    </div>`;
}

function pintarResumen() {
  const t = entradasEstado.totales || {};
  const filas = entradasEstado.tipos.filter((x) => x.vendidas > 0);
  document.getElementById('entradasResumen').innerHTML = `
    <div class="entradas-cifras">
      <div><strong>${t.entradas || 0}</strong><span>entradas vendidas</span></div>
      <div><strong>${eurosAdmin(t.ingresos_cents)}</strong><span>cobrado (antes de comisión)</span></div>
      <div><strong>${t.pedidos || 0}</strong><span>pedidos</span></div>
      <div><strong>${t.accesos_hoy || 0}</strong><span>accesos hoy</span></div>
    </div>
    ${filas.length ? `
      <table class="admin-table">
        <thead><tr><th>Tipo</th><th>Vendidas</th><th>Importe</th></tr></thead>
        <tbody>${filas.map((x) => `
          <tr><td>${escapeHtml(x.nombre)}</td><td>${x.vendidas}${x.stock != null ? ` / ${x.stock}` : ''}</td>
          <td>${eurosAdmin(x.ingresos_cents)}</td></tr>`).join('')}
        </tbody>
      </table>` : ''}
    ${t.reembolsados ? `<p>${t.reembolsados} pedido(s) reembolsado(s) (no cuentan arriba).</p>` : ''}`;
}

function pintarTipos() {
  const tipos = entradasEstado.tipos;
  document.getElementById('tiposTabla').innerHTML = tipos.length ? `
    <table class="admin-table">
      <thead><tr><th>Orden</th><th>Nombre</th><th>Precio</th><th>Límite</th><th>Abono</th><th>A la venta</th><th></th></tr></thead>
      <tbody>${tipos.map((x) => `
        <tr>
          <td>${x.orden}</td>
          <td><strong>${escapeHtml(x.nombre)}</strong>${x.descripcion ? `<br><small>${escapeHtml(x.descripcion)}</small>` : ''}</td>
          <td>${eurosAdmin(x.precio_cents)}</td>
          <td>${x.stock == null ? 'Sin límite' : x.stock}</td>
          <td>${x.abono ? 'Sí' : 'No'}</td>
          <td>${x.activo ? '🟢 Sí' : '⏸️ No'}</td>
          <td class="actions">
            <button class="btn-small" data-accion="editar-tipo" data-id="${x.id}">Editar</button>
            <button class="btn-small danger" data-accion="borrar-tipo" data-id="${x.id}">Borrar</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p>Todavía no hay tipos de entrada. Crea al menos uno (por ejemplo «Entrada general — 5 €») antes de abrir la venta.</p>';
}

function mostrarFormTipo(tipo) {
  tipoEditando = tipo;
  const c = document.getElementById('tipoFormContainer');
  c.innerHTML = `
    <form class="inline-form" id="tipoForm">
      <div class="form-row">
        <label>Nombre *</label>
        <input type="text" name="nombre" required maxlength="80" placeholder="Entrada general" value="${tipo ? escapeHtml(tipo.nombre) : ''}">
      </div>
      <div class="form-row">
        <label>Precio (€) *</label>
        <input type="text" name="precio" required inputmode="decimal" placeholder="5,00"
          value="${tipo ? (tipo.precio_cents / 100).toFixed(2).replace('.', ',') : ''}">
      </div>
      <div class="form-row">
        <label>Límite de unidades</label>
        <input type="number" name="stock" min="0" step="1" placeholder="Sin límite" value="${tipo && tipo.stock != null ? tipo.stock : ''}">
      </div>
      <div class="form-row">
        <label>Orden en la página</label>
        <input type="number" name="orden" step="1" value="${tipo ? tipo.orden : 0}">
      </div>
      <div class="form-row" style="grid-column: 1 / -1">
        <label>Descripción (la ve el comprador)</label>
        <input type="text" name="descripcion" maxlength="300" placeholder="Acceso a todos los campos durante un día"
          value="${tipo && tipo.descripcion ? escapeHtml(tipo.descripcion) : ''}">
      </div>
      <label class="check-linea"><input type="checkbox" name="abono" ${tipo && tipo.abono ? 'checked' : ''}>
        Abono: vale para entrar una vez <strong>cada día</strong> (si no, solo una vez en total)</label>
      <label class="check-linea"><input type="checkbox" name="activo" ${!tipo || tipo.activo ? 'checked' : ''}>
        A la venta (si lo desmarcas, deja de salir en la página de compra)</label>
      <div class="form-actions">
        <button type="submit" class="btn-small primary">${tipo ? 'Guardar cambios' : 'Crear tipo'}</button>
        <button type="button" class="btn-small" data-accion="cancelar-tipo">Cancelar</button>
      </div>
      <p class="feedback" id="tipoFeedback" style="grid-column: 1 / -1"></p>
    </form>`;
  document.getElementById('tipoForm').addEventListener('submit', guardarTipo);
}

async function guardarTipo(e) {
  e.preventDefault();
  const f = e.target;
  const feedback = document.getElementById('tipoFeedback');
  feedback.textContent = '';
  feedback.className = 'feedback';
  const datos = {
    nombre: f.nombre.value,
    precio: f.precio.value,
    stock: f.stock.value,
    orden: Number(f.orden.value || 0),
    descripcion: f.descripcion.value,
    abono: f.abono.checked,
    activo: f.activo.checked,
  };
  try {
    await fetchJson(tipoEditando ? `/api/admin/entradas/tipos/${tipoEditando.id}` : '/api/admin/entradas/tipos', {
      method: tipoEditando ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    document.getElementById('tipoFormContainer').innerHTML = '';
    tipoEditando = null;
    cargarResumenEntradas();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
  }
}

async function cargarPedidos(q) {
  const cont = document.getElementById('pedidosTabla');
  cont.innerHTML = '<p>Cargando…</p>';
  try {
    const { pedidos } = await fetchJson(`/api/admin/entradas/pedidos${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    if (!pedidos.length) {
      cont.innerHTML = `<p>${q ? 'No hay pedidos que coincidan.' : 'Todavía no hay pedidos.'}</p>`;
      return;
    }
    cont.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Fecha</th><th>Comprador</th><th>Entradas</th><th>Total</th><th>Estado</th><th>Usadas</th><th></th></tr></thead>
        <tbody>${pedidos.map((p) => `
          <tr>
            <td>${escapeHtml(formatFechaHora(`${(p.paid_at || p.created_at).replace(' ', 'T')}Z`))}</td>
            <td>${escapeHtml(p.nombre)}<br><small>${escapeHtml(p.email)}${p.telefono ? ` · ${escapeHtml(p.telefono)}` : ''}</small></td>
            <td>${escapeHtml(p.detalle || '')}</td>
            <td>${eurosAdmin(p.total_cents)}</td>
            <td>${ESTADOS_PEDIDO[p.estado] || escapeHtml(p.estado)}
              ${p.estado === 'pagado' && !p.email_enviado_at ? '<br><small class="entregas-pendiente">Email no enviado</small>' : ''}</td>
            <td>${p.estado === 'pagado' ? `${p.usadas} / ${p.entradas}` : ''}</td>
            <td class="actions">
              ${p.estado === 'pagado' || p.estado === 'reembolsado'
                ? `<a class="btn-small" href="/entradas/${encodeURIComponent(p.codigo)}" target="_blank">Ver entradas</a>` : ''}
              ${p.estado === 'pagado' ? `<button class="btn-small" data-accion="reenviar" data-id="${p.id}">Reenviar email</button>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="import-formato">Las devoluciones se hacen desde el panel de Stripe (Pagos → el pago → Reembolsar).
        Al reembolsar el importe completo, las entradas de ese pedido dejan de valer solas.</p>`;
  } catch (err) {
    cont.innerHTML = `<p>${escapeHtml(err.message)}</p>`;
  }
}

async function clickEntradas(ev) {
  const btn = ev.target.closest('[data-accion]');
  if (!btn) return;
  const accion = btn.dataset.accion;
  const id = Number(btn.dataset.id);

  if (accion === 'toggle-venta') {
    const abrir = !entradasEstado.venta_abierta;
    if (!confirm(abrir ? '¿Abrir la venta de entradas al público?' : '¿Cerrar la venta? Las entradas ya vendidas siguen valiendo.')) return;
    const fb = document.getElementById('ventaFeedback');
    fb.textContent = '';
    fb.className = 'feedback';
    try {
      await fetchJson('/api/admin/entradas/venta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abierta: abrir }),
      });
      await cargarResumenEntradas();
      const fb2 = document.getElementById('ventaFeedback');
      fb2.textContent = abrir ? 'Venta abierta.' : 'Venta cerrada.';
      fb2.classList.add('success');
    } catch (err) {
      fb.textContent = err.message;
      fb.classList.add('error');
    }
  }

  if (accion === 'editar-tipo') mostrarFormTipo(entradasEstado.tipos.find((x) => x.id === id));
  if (accion === 'cancelar-tipo') document.getElementById('tipoFormContainer').innerHTML = '';

  if (accion === 'borrar-tipo') {
    if (!confirm('¿Borrar este tipo de entrada?')) return;
    try {
      await fetchJson(`/api/admin/entradas/tipos/${id}`, { method: 'DELETE' });
      cargarResumenEntradas();
    } catch (err) {
      alert(err.message);
    }
  }

  if (accion === 'reenviar') {
    btn.disabled = true;
    const fb = document.getElementById('pedidosFeedback');
    fb.className = 'feedback';
    try {
      await fetchJson(`/api/admin/entradas/pedidos/${id}/reenviar`, { method: 'POST' });
      fb.textContent = 'Email reenviado.';
      fb.classList.add('success');
    } catch (err) {
      fb.textContent = err.message;
      fb.classList.add('error');
    }
    btn.disabled = false;
  }
}
