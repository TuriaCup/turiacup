// Página de compra de entradas: elige cantidades, datos de contacto y salta al pago de Stripe.

const contenido = document.getElementById('contenido');
const MAX_POR_PEDIDO = 20;
let tipos = [];
const cantidades = {};

function euros(cents) {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

if (new URLSearchParams(location.search).get('cancelado')) {
  document.getElementById('avisoCancelado').hidden = false;
}

async function cargar() {
  try {
    const data = await fetchJson('/api/entradas/tipos');
    document.getElementById('avisoPruebas').hidden = !data.pruebas;
    tipos = data.tipos || [];
    if (!data.abierta || tipos.length === 0) {
      contenido.innerHTML = `
        <div class="proximamente">
          <h2>Venta no disponible todavía</h2>
          <p>La venta de entradas todavía no está abierta. Vuelve a mirar unos días antes del torneo
          o escríbenos a <a href="mailto:info@turiacup.com">info@turiacup.com</a>.</p>
        </div>`;
      return;
    }
    pintar();
  } catch (err) {
    contenido.innerHTML = `<p class="empty-state">No se han podido cargar las entradas. ${escapeHtml(err.message)}</p>`;
  }
}

function pintar() {
  contenido.innerHTML = `
    <div class="tipos-entrada">
      ${tipos.map((t) => `
        <div class="tipo-entrada ${t.agotado ? 'agotado' : ''}">
          <div class="tipo-info">
            <h3>${escapeHtml(t.nombre)}${t.abono ? ' <span class="etiqueta-abono">Abono</span>' : ''}</h3>
            ${t.descripcion ? `<p>${escapeHtml(t.descripcion)}</p>` : ''}
            ${t.agotado ? '<p class="quedan">Agotada</p>' : (t.quedan != null ? `<p class="quedan">¡Quedan ${t.quedan}!</p>` : '')}
          </div>
          <div class="tipo-precio">${euros(t.precio_cents)}</div>
          <div class="tipo-cantidad">
            <button type="button" class="cant-btn" data-id="${t.id}" data-delta="-1" aria-label="Quitar una" ${t.agotado ? 'disabled' : ''}>−</button>
            <span class="cant-num" id="cant-${t.id}">0</span>
            <button type="button" class="cant-btn" data-id="${t.id}" data-delta="1" aria-label="Añadir una" ${t.agotado ? 'disabled' : ''}>+</button>
          </div>
        </div>`).join('')}
    </div>

    <div class="resumen-compra">
      <span>Total</span>
      <strong id="totalCompra">0,00 €</strong>
    </div>

    <form class="form" id="compraForm" novalidate>
      <div class="form-row">
        <label for="nombre">Nombre y apellidos *</label>
        <input type="text" id="nombre" name="nombre" required maxlength="120" autocomplete="name">
      </div>
      <div class="form-row">
        <label for="email">Email * <small>(aquí te llegan las entradas)</small></label>
        <input type="email" id="email" name="email" required maxlength="180" autocomplete="email">
      </div>
      <div class="form-row">
        <label for="telefono">Teléfono (opcional)</label>
        <input type="tel" id="telefono" name="telefono" maxlength="30" autocomplete="tel">
      </div>
      <div class="form-row form-hidden" aria-hidden="true">
        <label for="website">No rellenar</label>
        <input type="text" id="website" name="website" tabindex="-1" autocomplete="off">
      </div>
      <p class="form-row-full condiciones">
        El pago se hace en la pasarela segura de Stripe (tarjeta, Apple Pay o Google Pay).
        Cada entrada lleva un QR que solo vale para un acceso. Para cualquier incidencia o devolución,
        escríbenos a <a href="mailto:info@turiacup.com">info@turiacup.com</a>.
      </p>
      <div class="form-row form-row-full">
        <button type="submit" class="btn btn-primary" id="pagarBtn" disabled>Ir al pago</button>
      </div>
      <div class="form-feedback" id="compraFeedback" role="status" aria-live="polite"></div>
    </form>`;

  contenido.querySelectorAll('.cant-btn').forEach((b) => b.addEventListener('click', () => {
    cambiarCantidad(Number(b.dataset.id), Number(b.dataset.delta));
  }));
  document.getElementById('compraForm').addEventListener('submit', pagar);
}

function totalEntradas() {
  return Object.values(cantidades).reduce((a, b) => a + b, 0);
}

function cambiarCantidad(id, delta) {
  const t = tipos.find((x) => x.id === id);
  const actual = cantidades[id] || 0;
  let nueva = Math.max(0, actual + delta);
  if (delta > 0 && totalEntradas() >= MAX_POR_PEDIDO) nueva = actual;
  if (t.quedan != null) nueva = Math.min(nueva, t.quedan);
  cantidades[id] = nueva;
  document.getElementById(`cant-${id}`).textContent = nueva;

  const total = tipos.reduce((s, x) => s + (cantidades[x.id] || 0) * x.precio_cents, 0);
  document.getElementById('totalCompra').textContent = euros(total);
  const n = totalEntradas();
  const btn = document.getElementById('pagarBtn');
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'Ir al pago' : `Pagar ${euros(total)} (${n} ${n === 1 ? 'entrada' : 'entradas'})`;
}

async function pagar(e) {
  e.preventDefault();
  const form = e.target;
  const feedback = document.getElementById('compraFeedback');
  const btn = document.getElementById('pagarBtn');
  feedback.textContent = '';
  feedback.className = 'form-feedback';

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  btn.disabled = true;
  const textoAntes = btn.textContent;
  btn.textContent = 'Preparando el pago…';
  try {
    const { url } = await fetchJson('/api/entradas/comprar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: form.nombre.value,
        email: form.email.value,
        telefono: form.telefono.value,
        website: form.website.value,
        items: Object.entries(cantidades).filter(([, c]) => c > 0)
          .map(([tipo_id, cantidad]) => ({ tipo_id: Number(tipo_id), cantidad })),
      }),
    });
    location.href = url;
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
    btn.disabled = false;
    btn.textContent = textoAntes;
  }
}

cargar();
