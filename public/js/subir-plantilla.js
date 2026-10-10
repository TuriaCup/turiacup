const content = document.getElementById('content');

// El enlace bonito es /plantilla/<slug>; si algo redirigiera, llega como ?c=<slug>
const slug = (location.pathname.match(/^\/plantilla\/([^/]+)/) || [])[1]
  || new URLSearchParams(location.search).get('c')
  || '';

let datos = null;

function filaJugador(j = {}) {
  return `
    <tr>
      <td class="col-dorsal"><input type="number" min="0" max="999" data-campo="dorsal" value="${j.dorsal ?? ''}"></td>
      <td><input type="text" maxlength="120" data-campo="nombre" value="${escapeHtml(j.nombre ?? '')}"></td>
      <td><input type="text" maxlength="120" data-campo="apellidos" value="${escapeHtml(j.apellidos ?? '')}"></td>
      <td class="col-fecha"><input type="date" data-campo="fecha_nacimiento" value="${escapeHtml(j.fecha_nacimiento ?? '')}"></td>
      <td class="col-dni"><input type="text" maxlength="20" data-campo="dni" value="${escapeHtml(j.dni ?? '')}"></td>
      <td class="col-quitar"><button type="button" class="btn-quitar" data-accion="quitar" title="Quitar">✕</button></td>
    </tr>
  `;
}

function filaTecnico(t = {}) {
  return `
    <tr>
      <td><input type="text" maxlength="120" data-campo="nombre" value="${escapeHtml(t.nombre ?? '')}"></td>
      <td><input type="text" maxlength="120" data-campo="apellidos" value="${escapeHtml(t.apellidos ?? '')}"></td>
      <td><input type="text" maxlength="60" data-campo="cargo" placeholder="Entrenador, delegado…" value="${escapeHtml(t.cargo ?? '')}"></td>
      <td class="col-dni"><input type="text" maxlength="20" data-campo="dni" value="${escapeHtml(t.dni ?? '')}"></td>
      <td class="col-quitar"><button type="button" class="btn-quitar" data-accion="quitar" title="Quitar">✕</button></td>
    </tr>
  `;
}

function render() {
  const { equipo, abierto, actualizada_el: actualizada, jugadores, staff } = datos;
  const soloLectura = !abierto;

  const filasJugadores = (jugadores.length ? jugadores : [{}, {}, {}, {}, {}]).map(filaJugador).join('');
  const filasStaff = (staff.length ? staff : [{}]).map(filaTecnico).join('');

  content.innerHTML = `
    <div class="plantilla-cabecera">
      <h1>${escapeHtml(equipo.name)}</h1>
      <div class="entity-meta">Categoría ${escapeHtml(equipo.category)} · Turia Cup</div>
    </div>

    ${soloLectura ? `
      <div class="plantilla-aviso">🔒 El plazo para enviar plantillas está cerrado. Puedes consultar lo enviado,
      pero ya no se puede modificar. Si necesitas cambiar algo, escribe a
      <a href="mailto:info@turiacup.com">info@turiacup.com</a>.</div>` : ''}

    ${actualizada ? `<div class="plantilla-ok">✅ Plantilla recibida. Última vez guardada: ${escapeHtml(formatFechaHora(actualizada))}.</div>` : ''}

    <div class="plantilla-bloque">
      <h2>Jugadores</h2>
      <p class="ayuda">Rellena <strong>nombre, apellidos, fecha de nacimiento y DNI</strong> de cada jugador.
      La fecha de nacimiento es imprescindible para verificar la categoría. Si más adelante necesitas
      corregir algo, vuelve a este mismo enlace mientras el plazo siga abierto.</p>
      <table class="plantilla-tabla">
        <thead>
          <tr><th>Dorsal</th><th>Nombre *</th><th>Apellidos *</th><th>Fecha de nacimiento *</th><th>DNI *</th><th></th></tr>
        </thead>
        <tbody id="tbodyJugadores">${filasJugadores}</tbody>
      </table>
      <button type="button" class="btn-small" id="addJugador">+ Añadir jugador</button>
    </div>

    <div class="plantilla-bloque">
      <h2>Cuerpo técnico</h2>
      <p class="ayuda">Entrenador, segundo entrenador, delegado… el cargo lo escribes tú.
      Indica el nombre, los apellidos y el DNI de cada persona.</p>
      <table class="plantilla-tabla">
        <thead>
          <tr><th>Nombre *</th><th>Apellidos *</th><th>Cargo</th><th>DNI</th><th></th></tr>
        </thead>
        <tbody id="tbodyStaff">${filasStaff}</tbody>
      </table>
      <button type="button" class="btn-small" id="addTecnico">+ Añadir persona</button>
    </div>

    <div class="plantilla-acciones">
      <button type="button" class="btn btn-primary" id="guardarBtn">Guardar plantilla</button>
      <span class="feedback" id="feedback"></span>
    </div>
  `;

  if (soloLectura) {
    content.querySelectorAll('input, button').forEach((el) => { el.disabled = true; });
  }

  content.querySelector('#addJugador').addEventListener('click', () => {
    document.getElementById('tbodyJugadores').insertAdjacentHTML('beforeend', filaJugador());
  });
  content.querySelector('#addTecnico').addEventListener('click', () => {
    document.getElementById('tbodyStaff').insertAdjacentHTML('beforeend', filaTecnico());
  });
  content.querySelector('#guardarBtn').addEventListener('click', guardar);
  content.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-accion="quitar"]');
    if (btn) btn.closest('tr').remove();
  });
}

function leerTabla(idTbody) {
  return [...document.querySelectorAll(`#${idTbody} tr`)].map((tr) => {
    const fila = {};
    tr.querySelectorAll('[data-campo]').forEach((input) => { fila[input.dataset.campo] = input.value.trim(); });
    return fila;
  });
}

function estaVacia(fila) {
  return Object.values(fila).every((v) => !v);
}

async function guardar() {
  const feedback = document.getElementById('feedback');
  const boton = document.getElementById('guardarBtn');
  feedback.textContent = '';
  feedback.className = 'feedback';

  const jugadores = leerTabla('tbodyJugadores').filter((f) => !estaVacia(f));
  const staff = leerTabla('tbodyStaff').filter((f) => !estaVacia(f));

  if (!jugadores.length) {
    feedback.textContent = 'Añade al menos un jugador.';
    feedback.classList.add('error');
    return;
  }

  const incompletos = [];
  jugadores.forEach((j, i) => {
    const faltan = [];
    if (!j.nombre) faltan.push('nombre');
    if (!j.apellidos) faltan.push('apellidos');
    if (!j.fecha_nacimiento) faltan.push('fecha de nacimiento');
    if (faltan.length) incompletos.push(`jugador ${i + 1} (falta ${faltan.join(', ')})`);
  });
  if (incompletos.length) {
    feedback.textContent = `Faltan datos obligatorios: ${incompletos.join('; ')}.`;
    feedback.classList.add('error');
    return;
  }

  const sinDni = jugadores.filter((j) => !j.dni).length;
  if (sinDni && !confirm(
    `Hay ${sinDni} jugador(es) sin DNI. La organización lo necesita para las fichas.\n\n`
    + '¿Guardar igualmente y completarlo más adelante?')) return;

  boton.disabled = true;
  try {
    const res = await fetchJson(`/api/plantilla/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jugadores, staff }),
    });
    feedback.textContent = `Guardado: ${res.jugadores} jugadores`
      + (res.staff ? ` y ${res.staff} del cuerpo técnico` : '') + '.';
    feedback.classList.add('success');
    datos.actualizada_el = new Date().toISOString();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
  }
  boton.disabled = false;
}

async function cargar() {
  if (!slug) {
    content.innerHTML = '<p class="empty-state">Enlace incompleto. Revisa el enlace que te envió la organización.</p>';
    return;
  }
  try {
    datos = await fetchJson(`/api/plantilla/${encodeURIComponent(slug)}`);
    document.title = `Plantilla de ${datos.equipo.name} — Turia Cup`;
    render();
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('year').textContent = new Date().getFullYear();
cargar();
