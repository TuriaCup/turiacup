// Página /entradas/<codigo>: confirma el pago y enseña las entradas con su QR.

document.getElementById('year').textContent = new Date().getFullYear();

const contenido = document.getElementById('contenido');
const codigo = (location.pathname.match(/^\/entradas\/([A-Za-z0-9]+)/) || [])[1]
  || new URLSearchParams(location.search).get('c') || '';
let intentos = 0;

function euros(cents) {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

function qrSvg(texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

async function cargar() {
  if (!codigo) {
    contenido.innerHTML = '<p class="empty-state">Enlace no válido.</p>';
    return;
  }
  let pedido;
  try {
    pedido = await fetchJson(`/api/entradas/pedido/${encodeURIComponent(codigo)}`);
  } catch (err) {
    contenido.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    return;
  }

  if (pedido.estado === 'pendiente') {
    intentos++;
    if (intentos <= 20) {
      contenido.innerHTML = `
        <div class="proximamente">
          <h2>Confirmando tu pago…</h2>
          <p>Un momento, estamos esperando la confirmación del banco.</p>
        </div>`;
      setTimeout(cargar, intentos < 5 ? 1500 : 3000);
    } else {
      contenido.innerHTML = `
        <div class="proximamente">
          <h2>Pago pendiente</h2>
          <p>Todavía no nos consta el pago. Si has pagado, en unos minutos te llegará el email con las entradas.
          Si no te llega, escríbenos a <a href="mailto:info@turiacup.com">info@turiacup.com</a> indicando la
          referencia <strong>${escapeHtml(pedido.referencia)}</strong>.</p>
        </div>`;
    }
    return;
  }

  if (pedido.estado === 'caducado') {
    contenido.innerHTML = `
      <div class="proximamente">
        <h2>Pago no completado</h2>
        <p>Este pedido no llegó a pagarse, así que no se te ha cobrado nada.
        <a href="/entradas.html">Volver a comprar entradas</a>.</p>
      </div>`;
    return;
  }

  const reembolsado = pedido.estado === 'reembolsado';
  contenido.innerHTML = `
    <div class="pedido-cabecera">
      <h1 class="entradas-titulo">${reembolsado ? 'Pedido reembolsado' : '¡Tus entradas!'}</h1>
      <p>${reembolsado
        ? 'Este pedido se ha reembolsado y sus entradas ya no son válidas.'
        : `Gracias, ${escapeHtml(pedido.nombre)}. Te hemos enviado este enlace a <strong>${escapeHtml(pedido.email)}</strong>.
           Enseña cada QR en la puerta (desde el móvil o impreso). Cada uno es para una persona.`}</p>
      <p class="pedido-resumen">
        ${pedido.lineas.map((l) => `${l.cantidad} × ${escapeHtml(l.nombre)}`).join(' · ')}
        · Total ${euros(pedido.total_cents)} · Ref. ${escapeHtml(pedido.referencia)}
      </p>
      ${reembolsado ? '' : '<button class="btn btn-ghost no-print" id="imprimirBtn">Imprimir o guardar en PDF</button>'}
    </div>
    <div class="lista-entradas">
      ${pedido.entradas.map((e, i) => `
        <div class="entrada-ticket ${e.anulada ? 'anulada' : ''}">
          <div class="ticket-cabecera">
            <img src="/img/brand/logo-lockup-black.png" alt="Turia Cup">
            <span>${i + 1} / ${pedido.entradas.length}</span>
          </div>
          <div class="ticket-tipo">${escapeHtml(e.tipo)}${e.abono ? ' · Abono' : ''}</div>
          <div class="ticket-qr">${e.anulada ? '<div class="ticket-anulada">ANULADA</div>' : qrSvg(`TC-${e.codigo}`)}</div>
          <div class="ticket-codigo">${escapeHtml(e.codigo.replace(/(.{5})/, '$1 '))}</div>
        </div>`).join('')}
    </div>`;

  const imprimir = document.getElementById('imprimirBtn');
  if (imprimir) imprimir.addEventListener('click', () => window.print());
}

cargar();
