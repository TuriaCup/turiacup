const CATEGORIAS = ['U9', 'U10', 'U11', 'U12'];
const FASES = [
  { value: 'grupos', label: 'Fase de grupos' },
  { value: 'oro', label: 'Fase final — Oro' },
  { value: 'plata', label: 'Fase final — Plata' },
  { value: 'bronce', label: 'Fase final — Bronce' },
];

let teamsCache = [];
let jugadoresCache = [];
let partidosCache = [];
let currentPlantillaTeamId = null;
let currentRosterByTeam = {};

const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const logoutBtn = document.getElementById('logoutBtn');
const loginForm = document.getElementById('loginForm');
const loginFeedback = document.getElementById('loginFeedback');
const adminTabs = document.querySelectorAll('#adminTabs .tab-btn');
const estadoBanner = document.getElementById('estadoBanner');
const panels = {
  equipos: document.getElementById('panelEquipos'),
  plantillas: document.getElementById('panelPlantillas'),
  partidos: document.getElementById('panelPartidos'),
  importar: document.getElementById('panelImportar'),
  entregas: document.getElementById('panelEntregas'),
  publicacion: document.getElementById('panelPublicacion'),
};

let loteArchivos = [];

let torneoPublico = false;
let subidasAbiertas = true;

let currentTab = 'equipos';

// --- Auth ---

async function checkAuth() {
  const { authenticated } = await fetchJson('/api/admin/me');
  loginSection.hidden = authenticated;
  dashboardSection.hidden = !authenticated;
  logoutBtn.hidden = !authenticated;
  if (authenticated) {
    await loadEstadoPublicacion();
    await loadTeamsCache();
    showTab(currentTab);
  }
}

// --- Publicación ---

async function loadEstadoPublicacion() {
  try {
    const { torneo_publico, subidas_abiertas } = await fetchJson('/api/admin/ajustes');
    torneoPublico = Boolean(torneo_publico);
    subidasAbiertas = subidas_abiertas !== false;
    renderEstadoBanner();
  } catch {
    estadoBanner.hidden = true;
  }
}

function renderEstadoBanner() {
  estadoBanner.hidden = false;
  estadoBanner.className = `estado-banner ${torneoPublico ? 'publicado' : 'interno'}`;
  estadoBanner.textContent = torneoPublico
    ? '🌍 Torneo PUBLICADO: equipos, plantillas, calendario y clasificaciones son visibles para todo el mundo.'
    : '🔒 Modo interno: solo tú ves el torneo. El público no ve equipos, plantillas, calendario ni clasificaciones.';
}

async function loadTeamsCache() {
  const { equipos } = await fetchJson('/api/equipos');
  teamsCache = equipos;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginFeedback.textContent = '';
  const password = document.getElementById('password').value;
  try {
    await fetchJson('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    loginForm.reset();
    await checkAuth();
  } catch (err) {
    loginFeedback.textContent = err.message;
  }
});

logoutBtn.addEventListener('click', async () => {
  await fetchJson('/api/admin/logout', { method: 'POST' });
  await checkAuth();
});

// --- Tabs ---

adminTabs.forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

function showTab(tab) {
  currentTab = tab;
  adminTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== tab; });
  if (tab === 'equipos') renderEquiposTab();
  if (tab === 'plantillas') renderPlantillasTab();
  if (tab === 'partidos') renderPartidosTab();
  if (tab === 'importar') renderImportarTab();
  if (tab === 'entregas') renderEntregasTab();
  if (tab === 'publicacion') renderPublicacionTab();
}

// --- Pestaña de publicación ---

function renderPublicacionTab() {
  panels.publicacion.innerHTML = `
    <div class="publicacion-box">
      <h2>${torneoPublico ? '🌍 El torneo está publicado' : '🔒 El torneo está en modo interno'}</h2>
      <p>${torneoPublico
        ? 'Cualquiera que entre en turiacup.com puede ver los equipos, los grupos, las plantillas, el calendario y las clasificaciones.'
        : 'Puedes ir creando equipos, asignando grupos y subiendo plantillas con total tranquilidad: el público todavía no ve nada de eso.'}</p>
      <p>En modo interno:</p>
      <ul>
        <li>La página «Clasificación y equipos» muestra un aviso de «próximamente» a los visitantes.</li>
        <li>Las fichas de equipo y de jugador tampoco se ven desde fuera.</li>
        <li>Tú, con la sesión de admin abierta, sigues viéndolo todo para revisarlo antes de publicar.</li>
        <li>La landing y el formulario de inscripción funcionan igual: esto no los afecta.</li>
      </ul>
      <div class="form-actions">
        <button class="btn-small ${torneoPublico ? 'danger' : 'primary'}" id="togglePublicacionBtn">
          ${torneoPublico ? 'Volver a modo interno' : 'Publicar el torneo ahora'}
        </button>
      </div>
      <p class="feedback" id="publicacionFeedback"></p>
    </div>
  `;

  document.getElementById('togglePublicacionBtn').addEventListener('click', togglePublicacion);
}

async function togglePublicacion() {
  const nuevoValor = !torneoPublico;
  const pregunta = nuevoValor
    ? '¿Publicar el torneo? A partir de ahora cualquiera podrá ver equipos, plantillas, calendario y clasificaciones.'
    : '¿Volver a modo interno? El torneo dejará de verse desde fuera.';
  if (!confirm(pregunta)) return;

  const feedback = document.getElementById('publicacionFeedback');
  feedback.textContent = '';
  feedback.className = 'feedback';
  try {
    const res = await fetchJson('/api/admin/ajustes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ torneo_publico: nuevoValor }),
    });
    torneoPublico = Boolean(res.torneo_publico);
    renderEstadoBanner();
    renderPublicacionTab();
    const nuevoFeedback = document.getElementById('publicacionFeedback');
    nuevoFeedback.textContent = torneoPublico ? 'Torneo publicado.' : 'Torneo en modo interno.';
    nuevoFeedback.classList.add('success');
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
  }
}

// --- Importar (equipos en lote y plantillas en lote) ---

function renderImportarTab() {
  panels.importar.innerHTML = `
    <div class="import-box">
      <h2>Importar equipos</h2>
      <p>Pega la lista de equipos, uno por línea. Si copias las celdas directamente desde Excel,
      pégalas aquí tal cual: ya vienen separadas por tabuladores.</p>
      <p class="import-formato">Orden de las columnas: <strong>Nombre · Categoría · Grupo · Ciudad</strong>.
      Nombre y categoría son obligatorios; grupo y ciudad pueden ir vacíos.
      Si la primera línea es la de los títulos, se ignora sola.</p>
      <textarea id="importTexto" rows="10" spellcheck="false"
        placeholder="CF Inter San José&#9;U10&#9;A&#9;Valencia&#10;Valencia CF&#9;U11&#9;B&#9;Valencia"></textarea>
      <div class="form-actions">
        <button class="btn-small" id="comprobarImportBtn">Comprobar sin guardar</button>
        <button class="btn-small primary" id="importarBtn">Importar</button>
      </div>
      <p class="feedback" id="importFeedback"></p>
      <div id="importResultado"></div>
    </div>

    <div class="import-box">
      <h2>Subir varias plantillas a la vez</h2>
      <p>Selecciona todos los Excel que te hayan mandado los clubes. Intento adivinar a qué equipo
      corresponde cada fichero por su nombre; <strong>revisa la asignación antes de subir</strong> y
      corrige lo que haga falta.</p>
      <p class="import-formato">Cada Excel sustituye la plantilla completa de ese equipo, y si ese
      equipo ya tenía goles registrados, se borran con ella.</p>
      <input type="file" id="loteFiles" accept=".xlsx" multiple>
      <div id="loteTabla"></div>
      <div class="form-actions">
        <button class="btn-small primary" id="subirLoteBtn" hidden>Subir todas</button>
      </div>
      <p class="feedback" id="loteFeedback"></p>
    </div>
  `;

  document.getElementById('comprobarImportBtn').addEventListener('click', () => enviarImportEquipos(true));
  document.getElementById('importarBtn').addEventListener('click', () => enviarImportEquipos(false));
  document.getElementById('loteFiles').addEventListener('change', (e) => prepararLote(e.target.files));
  document.getElementById('subirLoteBtn').addEventListener('click', subirLote);
}

async function enviarImportEquipos(previsualizar) {
  const texto = document.getElementById('importTexto').value;
  const feedback = document.getElementById('importFeedback');
  const resultado = document.getElementById('importResultado');
  feedback.textContent = '';
  feedback.className = 'feedback';
  resultado.innerHTML = '';

  if (!previsualizar && !confirm('¿Crear en la web los equipos de la lista?')) return;

  try {
    const res = await fetchJson('/api/admin/equipos/importar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, previsualizar }),
    });

    const nuevos = res.nuevos || [];
    feedback.textContent = previsualizar
      ? `Se crearían ${nuevos.length} equipos. Nada guardado todavía.`
      : `Creados ${res.creados} equipos.`;
    feedback.classList.add(res.errores.length ? 'error' : 'success');

    resultado.innerHTML = `
      ${nuevos.length ? `
        <h3>${previsualizar ? 'Se crearían' : 'Creados'} (${nuevos.length})</h3>
        <table class="admin-table">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Grupo</th><th>Ciudad</th></tr></thead>
          <tbody>${nuevos.map((t) => `
            <tr>
              <td>${escapeHtml(t.name)}</td>
              <td>${escapeHtml(t.category)}</td>
              <td>${t.group_name ? escapeHtml(t.group_name) : ''}</td>
              <td>${t.city ? escapeHtml(t.city) : ''}</td>
            </tr>`).join('')}</tbody>
        </table>` : ''}
      ${res.duplicados.length ? `
        <h3>Ya existían, no se tocan (${res.duplicados.length})</h3>
        <ul class="import-lista">${res.duplicados.map((d) =>
          `<li>Línea ${d.linea}: ${escapeHtml(d.name)} (${escapeHtml(d.category)})</li>`).join('')}</ul>` : ''}
      ${res.errores.length ? `
        <h3>Líneas con problemas (${res.errores.length})</h3>
        <ul class="errores-list">${res.errores.map((e) =>
          `<li>Línea ${e.linea}: ${escapeHtml(e.message)}</li>`).join('')}</ul>` : ''}
    `;

    if (!previsualizar && res.creados > 0) await loadTeamsCache();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
  }
}

function normalizarTexto(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Adivina a qué equipo pertenece un fichero por su nombre. Devuelve null si no lo tiene claro. */
function proponerEquipo(nombreFichero) {
  const base = normalizarTexto(nombreFichero.replace(/\.xlsx$/i, ''));
  const cat = base.match(/\bu\s?(9|10|11|12)\b/);
  const categoria = cat ? `U${cat[1]}` : null;

  let candidatos = teamsCache.filter((t) => base.includes(normalizarTexto(t.name)));
  if (categoria) {
    const mismaCategoria = candidatos.filter((t) => t.category === categoria);
    if (mismaCategoria.length) candidatos = mismaCategoria;
  }
  if (candidatos.length === 1) return candidatos[0];
  if (!candidatos.length) return null;

  // varios encajan: gana el nombre más largo, y solo si no hay empate
  candidatos.sort((a, b) => normalizarTexto(b.name).length - normalizarTexto(a.name).length);
  const largo = normalizarTexto(candidatos[0].name).length;
  const empatados = candidatos.filter((t) => normalizarTexto(t.name).length === largo);
  return empatados.length === 1 ? candidatos[0] : null;
}

function prepararLote(fileList) {
  loteArchivos = [...fileList].map((file) => ({ file, equipo: proponerEquipo(file.name) }));
  const tabla = document.getElementById('loteTabla');
  const boton = document.getElementById('subirLoteBtn');

  if (!loteArchivos.length) {
    tabla.innerHTML = '';
    boton.hidden = true;
    return;
  }

  const sinAsignar = loteArchivos.filter((a) => !a.equipo).length;
  tabla.innerHTML = `
    ${sinAsignar ? `<p class="feedback error">No he sabido a qué equipo van ${sinAsignar} fichero(s): elígelo a mano.</p>` : ''}
    <table class="admin-table">
      <thead><tr><th>Fichero</th><th>Equipo</th><th>Estado</th></tr></thead>
      <tbody>${loteArchivos.map((a, i) => `
        <tr data-i="${i}">
          <td>${escapeHtml(a.file.name)}</td>
          <td>
            <select data-field="equipo">
              <option value="">— elegir equipo —</option>
              ${teamsCache.map((t) => `
                <option value="${t.id}" ${a.equipo && a.equipo.id === t.id ? 'selected' : ''}>
                  ${escapeHtml(t.name)} (${t.category})
                </option>`).join('')}
            </select>
          </td>
          <td class="lote-estado">${a.equipo ? 'Listo' : 'Sin asignar'}</td>
        </tr>`).join('')}</tbody>
    </table>
  `;
  boton.hidden = false;
}

async function subirLote() {
  const filas = [...document.querySelectorAll('#loteTabla tbody tr')];
  const feedback = document.getElementById('loteFeedback');
  const boton = document.getElementById('subirLoteBtn');
  feedback.textContent = '';
  feedback.className = 'feedback';

  const pendientes = filas.filter((fila) => fila.querySelector('select').value);
  if (!pendientes.length) {
    feedback.textContent = 'Asigna al menos un fichero a un equipo.';
    feedback.classList.add('error');
    return;
  }
  if (!confirm(`¿Subir ${pendientes.length} plantilla(s)? Se sustituye la plantilla completa de cada equipo.`)) return;

  boton.disabled = true;
  let subidas = 0;
  let conFallo = 0;

  for (const fila of pendientes) {
    const indice = Number(fila.dataset.i);
    const teamId = fila.querySelector('select').value;
    const estado = fila.querySelector('.lote-estado');
    estado.textContent = 'Subiendo…';

    const fd = new FormData();
    fd.append('file', loteArchivos[indice].file);
    try {
      const res = await fetchJson(`/api/admin/equipos/${teamId}/plantilla`, { method: 'POST', body: fd });
      estado.textContent = `✅ ${res.importados} jugadores`
        + (res.errores.length ? ` · ${res.errores.length} filas con errores` : '');
      subidas++;
    } catch (err) {
      estado.textContent = `❌ ${err.message}`;
      conFallo++;
    }
    feedback.textContent = `Subiendo… ${subidas + conFallo} de ${pendientes.length}`;
  }

  boton.disabled = false;
  feedback.textContent = `Terminado: ${subidas} plantilla(s) subida(s)`
    + (conFallo ? `, ${conFallo} con error (mira la columna Estado).` : '.');
  feedback.classList.add(conFallo ? 'error' : 'success');
}

// --- Entregas de plantillas (enlaces por club) ---

let entregasCache = [];

function enlaceDeEntrega(slug) {
  return `${location.origin}/plantilla/${slug}`;
}

function renderEntregasTab() {
  panels.entregas.innerHTML = `
    <div class="import-box">
      <h2>Plazo de entrega</h2>
      <p id="plazoTexto"></p>
      <div class="form-actions">
        <button class="btn-small" id="togglePlazoBtn"></button>
      </div>
      <p class="feedback" id="plazoFeedback"></p>
    </div>

    <div class="import-box">
      <div class="admin-toolbar">
        <h2>Entregas por equipo</h2>
        <div>
          <button class="btn-small" id="generarEnlacesBtn">Generar los enlaces que falten</button>
          <button class="btn-small" id="copiarListaBtn">Copiar lista para el correo</button>
        </div>
      </div>
      <p class="feedback" id="entregasFeedback"></p>
      <div id="entregasResumen"></div>
      <div id="entregasTabla"><p>Cargando…</p></div>
    </div>
  `;

  document.getElementById('togglePlazoBtn').addEventListener('click', togglePlazo);
  document.getElementById('generarEnlacesBtn').addEventListener('click', generarEnlaces);
  document.getElementById('copiarListaBtn').addEventListener('click', copiarLista);

  renderPlazo();
  loadEntregas();
}

function renderPlazo() {
  const texto = document.getElementById('plazoTexto');
  const boton = document.getElementById('togglePlazoBtn');
  if (!texto || !boton) return;

  texto.innerHTML = subidasAbiertas
    ? '🟢 <strong>Abierto</strong>: los clubes pueden rellenar y modificar su plantilla desde su enlace.'
    : '🔒 <strong>Cerrado</strong>: los clubes ven su plantilla pero ya no pueden tocarla. '
      + 'Tú sí puedes seguir editándola desde la pestaña Plantillas.';
  boton.textContent = subidasAbiertas ? 'Cerrar el plazo' : 'Volver a abrir el plazo';
  boton.className = `btn-small ${subidasAbiertas ? 'danger' : 'primary'}`;
}

async function togglePlazo() {
  const nuevoValor = !subidasAbiertas;
  const pregunta = nuevoValor
    ? '¿Volver a abrir el plazo? Los clubes podrán modificar sus plantillas otra vez.'
    : '¿Cerrar el plazo? A partir de ahora ningún club podrá modificar su plantilla.';
  if (!confirm(pregunta)) return;

  const feedback = document.getElementById('plazoFeedback');
  feedback.textContent = '';
  feedback.className = 'feedback';
  try {
    const res = await fetchJson('/api/admin/ajustes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subidas_abiertas: nuevoValor }),
    });
    subidasAbiertas = res.subidas_abiertas !== false;
    renderPlazo();
    feedback.textContent = subidasAbiertas ? 'Plazo abierto.' : 'Plazo cerrado.';
    feedback.classList.add('success');
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
  }
}

async function loadEntregas() {
  const contenedor = document.getElementById('entregasTabla');
  const resumen = document.getElementById('entregasResumen');
  try {
    const { entregas, subidas_abiertas } = await fetchJson('/api/admin/entregas');
    entregasCache = entregas;
    subidasAbiertas = subidas_abiertas !== false;
    renderPlazo();

    if (!entregas.length) {
      contenedor.innerHTML = '<p>No hay equipos todavía. Créalos primero en la pestaña Importar o Equipos.</p>';
      resumen.innerHTML = '';
      return;
    }

    const entregadas = entregas.filter((e) => e.last_upload_at).length;
    const sinEnlace = entregas.filter((e) => !e.slug).length;
    resumen.innerHTML = `
      <p class="entregas-resumen">
        <strong>${entregadas}</strong> de <strong>${entregas.length}</strong> equipos han entregado su plantilla.
        ${sinEnlace ? `<br><span class="entregas-pendiente">${sinEnlace} equipo(s) todavía sin enlace: pulsa «Generar los enlaces que falten».</span>` : ''}
      </p>
    `;

    contenedor.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr><th>Equipo</th><th>Cat.</th><th>Estado</th><th>Jug.</th><th>C. téc.</th><th>Enlace del club</th></tr>
        </thead>
        <tbody>
          ${entregas.map((e) => `
            <tr>
              <td>${escapeHtml(e.name)}</td>
              <td>${escapeHtml(e.category)}</td>
              <td>${e.last_upload_at
                ? `<span class="entregada">✅ ${escapeHtml(formatFechaHora(e.last_upload_at))}</span>`
                : '<span class="pendiente">⏳ Pendiente</span>'}</td>
              <td>${e.jugadores}</td>
              <td>${e.tecnicos}</td>
              <td>${e.slug
                ? `<div class="enlace-celda">
                     <input type="text" readonly value="${escapeHtml(enlaceDeEntrega(e.slug))}">
                     <button class="btn-small" data-action="copiar-enlace" data-slug="${escapeHtml(e.slug)}">Copiar</button>
                   </div>`
                : '<span class="pendiente">sin enlace</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    contenedor.innerHTML = `<p class="feedback error">${escapeHtml(err.message)}</p>`;
  }
}

async function generarEnlaces() {
  const feedback = document.getElementById('entregasFeedback');
  feedback.textContent = '';
  feedback.className = 'feedback';
  try {
    const res = await fetchJson('/api/admin/entregas/enlaces', { method: 'POST' });
    feedback.textContent = res.creados
      ? `Creados ${res.creados} enlaces nuevos. Los que ya existían no se han tocado.`
      : 'Todos los equipos tenían ya su enlace.';
    feedback.classList.add('success');
    await loadEntregas();
  } catch (err) {
    feedback.textContent = err.message;
    feedback.classList.add('error');
  }
}

async function copiarAlPortapapeles(texto, feedback, mensaje) {
  try {
    await navigator.clipboard.writeText(texto);
    feedback.textContent = mensaje;
    feedback.className = 'feedback success';
  } catch {
    feedback.textContent = 'Tu navegador no ha dejado copiar. Selecciona el texto a mano.';
    feedback.className = 'feedback error';
  }
}

function copiarLista() {
  const feedback = document.getElementById('entregasFeedback');
  const conEnlace = entregasCache.filter((e) => e.slug);
  if (!conEnlace.length) {
    feedback.textContent = 'Todavía no hay enlaces generados.';
    feedback.className = 'feedback error';
    return;
  }
  const texto = conEnlace
    .map((e) => `${e.name}\t${e.category}\t${enlaceDeEntrega(e.slug)}`)
    .join('\n');
  copiarAlPortapapeles(texto, feedback,
    `Copiados ${conEnlace.length} enlaces. Pégalos en Excel: una columna para el equipo, otra para la categoría y otra para el enlace.`);
}

panels.entregas.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action="copiar-enlace"]');
  if (!btn) return;
  copiarAlPortapapeles(enlaceDeEntrega(btn.dataset.slug), document.getElementById('entregasFeedback'), 'Enlace copiado.');
});

// --- Equipos ---

function renderEquiposTab() {
  panels.equipos.innerHTML = `
    <div class="admin-toolbar">
      <h2>Equipos</h2>
      <button class="btn-small primary" id="newEquipoBtn">+ Nuevo equipo</button>
    </div>
    <div id="equipoFormContainer"></div>
    <table class="admin-table">
      <thead><tr><th>Nombre</th><th>Categoría</th><th>Grupo</th><th>Ciudad</th><th></th></tr></thead>
      <tbody id="equiposTbody"></tbody>
    </table>
  `;
  document.getElementById('newEquipoBtn').addEventListener('click', () => showEquipoForm(null));
  loadEquiposTable();
}

async function loadEquiposTable() {
  const tbody = document.getElementById('equiposTbody');
  tbody.innerHTML = '<tr><td colspan="5">Cargando…</td></tr>';
  try {
    const { equipos } = await fetchJson('/api/equipos');
    teamsCache = equipos;
    if (!equipos.length) {
      tbody.innerHTML = '<tr><td colspan="5">No hay equipos todavía.</td></tr>';
      return;
    }
    tbody.innerHTML = equipos.map((e) => `
      <tr data-id="${e.id}">
        <td>${escapeHtml(e.name)}</td>
        <td>${escapeHtml(e.category)}</td>
        <td>${e.group_name ? escapeHtml(e.group_name) : ''}</td>
        <td>${e.city ? escapeHtml(e.city) : ''}</td>
        <td class="actions">
          <button class="btn-small" data-action="edit-equipo" data-id="${e.id}">Editar</button>
          <button class="btn-small danger" data-action="delete-equipo" data-id="${e.id}">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(err.message)}</td></tr>`;
  }
}

function showEquipoForm(equipo) {
  const container = document.getElementById('equipoFormContainer');
  const isEdit = Boolean(equipo);
  container.innerHTML = `
    <form class="inline-form" id="equipoForm">
      <div class="form-row">
        <label>Nombre *</label>
        <input type="text" name="name" required maxlength="120" value="${equipo ? escapeHtml(equipo.name) : ''}">
      </div>
      <div class="form-row">
        <label>Categoría *</label>
        <select name="category" required>
          ${CATEGORIAS.map((c) => `<option value="${c}" ${equipo && equipo.category === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Grupo</label>
        <input type="text" name="group_name" maxlength="20" value="${equipo && equipo.group_name ? escapeHtml(equipo.group_name) : ''}">
      </div>
      <div class="form-row">
        <label>Ciudad</label>
        <input type="text" name="city" maxlength="120" value="${equipo && equipo.city ? escapeHtml(equipo.city) : ''}">
      </div>
      <div class="form-row">
        <label>URL del logo</label>
        <input type="url" name="logo_url" maxlength="500" value="${equipo && equipo.logo_url ? escapeHtml(equipo.logo_url) : ''}">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-small primary">${isEdit ? 'Guardar cambios' : 'Crear equipo'}</button>
        <button type="button" class="btn-small" id="cancelEquipoForm">Cancelar</button>
      </div>
      <p class="feedback error" id="equipoFormFeedback"></p>
    </form>
  `;

  document.getElementById('cancelEquipoForm').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('equipoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const feedback = document.getElementById('equipoFormFeedback');
    feedback.textContent = '';
    try {
      if (isEdit) {
        await fetchJson(`/api/admin/equipos/${equipo.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        await fetchJson('/api/admin/equipos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }
      container.innerHTML = '';
      await loadEquiposTable();
    } catch (err) {
      feedback.textContent = err.message;
    }
  });
}

panels.equipos.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'edit-equipo') {
    showEquipoForm(teamsCache.find((t) => String(t.id) === id));
  } else if (action === 'delete-equipo') {
    if (!confirm('¿Eliminar este equipo? Esta acción no se puede deshacer.')) return;
    try {
      await fetchJson(`/api/admin/equipos/${id}`, { method: 'DELETE' });
      await loadEquiposTable();
    } catch (err) {
      alert(err.message);
    }
  }
});

// --- Plantillas ---

function renderPlantillasTab() {
  panels.plantillas.innerHTML = `
    <div class="admin-toolbar">
      <h2>Plantillas</h2>
      <select id="plantillaEquipoSelect">
        <option value="">Selecciona un equipo…</option>
        ${teamsCache.map((t) => `<option value="${t.id}">${escapeHtml(t.name)} (${t.category})</option>`).join('')}
      </select>
    </div>
    <div id="plantillaContent"></div>
  `;
  document.getElementById('plantillaEquipoSelect').addEventListener('change', (e) => loadPlantilla(e.target.value));
}

async function loadPlantilla(teamId) {
  currentPlantillaTeamId = teamId || null;
  const content = document.getElementById('plantillaContent');
  if (!teamId) {
    content.innerHTML = '';
    return;
  }

  content.innerHTML = `
    <div class="upload-box">
      <p>Sube el Excel de la plantilla (columnas: Dorsal, Nombre, Apellidos, Fecha de nacimiento, DNI). Sustituye la plantilla completa del equipo. <a href="plantillas/plantilla-modelo.xlsx" download>Descargar modelo</a></p>
      <form id="uploadForm">
        <input type="file" id="uploadFile" accept=".xlsx" required>
        <button type="submit" class="btn-small primary">Subir Excel</button>
      </form>
      <p class="feedback" id="uploadFeedback"></p>
    </div>
    <table class="admin-table">
      <thead><tr><th>Dorsal</th><th>Nombre</th><th>Apellidos</th><th>Fecha de nacimiento</th><th>DNI</th><th></th></tr></thead>
      <tbody id="jugadoresTbody"><tr><td colspan="6">Cargando…</td></tr></tbody>
    </table>
  `;

  document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('uploadFile');
    const feedback = document.getElementById('uploadFeedback');
    feedback.textContent = '';
    feedback.className = 'feedback';
    if (!fileInput.files.length) return;

    const fd = new FormData();
    fd.append('file', fileInput.files[0]);

    try {
      const result = await fetchJson(`/api/admin/equipos/${teamId}/plantilla`, { method: 'POST', body: fd });
      feedback.textContent = `Importados ${result.importados} jugadores.`
        + (result.errores.length ? ` ${result.errores.length} filas con errores (ver detalle abajo).` : '');
      feedback.classList.add(result.errores.length ? 'error' : 'success');
      const oldList = content.querySelector('.errores-list');
      if (oldList) oldList.remove();
      if (result.errores.length) {
        feedback.insertAdjacentHTML(
          'afterend',
          `<ul class="errores-list">${result.errores.map((er) => `<li>Fila ${er.row}: ${escapeHtml(er.message)}</li>`).join('')}</ul>`
        );
      }
      fileInput.value = '';
      await loadJugadoresTable(teamId);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
    }
  });

  await loadJugadoresTable(teamId);
}

async function loadJugadoresTable(teamId) {
  const tbody = document.getElementById('jugadoresTbody');
  try {
    const { jugadores } = await fetchJson(`/api/admin/equipos/${teamId}/jugadores`);
    jugadoresCache = jugadores;
    if (!jugadores.length) {
      tbody.innerHTML = '<tr><td colspan="6">Sin jugadores todavía.</td></tr>';
      return;
    }
    tbody.innerHTML = jugadores.map((j) => `
      <tr data-id="${j.id}">
        <td>${j.dorsal ?? ''}</td>
        <td>${escapeHtml(j.nombre)}</td>
        <td>${escapeHtml(j.apellidos)}</td>
        <td>${j.fecha_nacimiento ? formatFecha(j.fecha_nacimiento) : ''}</td>
        <td>${j.dni ? escapeHtml(j.dni) : ''}</td>
        <td class="actions">
          <button class="btn-small" data-action="edit-jugador" data-id="${j.id}">Editar</button>
          <button class="btn-small danger" data-action="delete-jugador" data-id="${j.id}">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
  }
}

function startEditJugador(id) {
  const j = jugadoresCache.find((x) => String(x.id) === String(id));
  if (!j) return;
  const row = document.querySelector(`#jugadoresTbody tr[data-id="${id}"]`);
  row.innerHTML = `
    <td><input type="number" min="0" value="${j.dorsal ?? ''}" data-field="dorsal" style="width:60px"></td>
    <td><input type="text" value="${escapeHtml(j.nombre)}" data-field="nombre"></td>
    <td><input type="text" value="${escapeHtml(j.apellidos)}" data-field="apellidos"></td>
    <td><input type="date" value="${j.fecha_nacimiento ?? ''}" data-field="fecha_nacimiento"></td>
    <td><input type="text" value="${j.dni ?? ''}" data-field="dni" style="width:100px"></td>
    <td class="actions">
      <button class="btn-small primary" data-action="save-jugador" data-id="${id}">Guardar</button>
      <button class="btn-small" data-action="cancel-edit-jugador" data-id="${id}">Cancelar</button>
    </td>
  `;
}

async function saveJugador(id) {
  const row = document.querySelector(`#jugadoresTbody tr[data-id="${id}"]`);
  const get = (field) => row.querySelector(`[data-field="${field}"]`).value;
  const payload = {
    dorsal: get('dorsal') || null,
    nombre: get('nombre'),
    apellidos: get('apellidos'),
    fecha_nacimiento: get('fecha_nacimiento') || null,
    dni: get('dni') || null,
  };
  try {
    await fetchJson(`/api/admin/jugadores/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    await loadJugadoresTable(currentPlantillaTeamId);
  } catch (err) {
    alert(err.message);
  }
}

panels.plantillas.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'edit-jugador') {
    startEditJugador(id);
  } else if (action === 'cancel-edit-jugador') {
    await loadJugadoresTable(currentPlantillaTeamId);
  } else if (action === 'save-jugador') {
    await saveJugador(id);
  } else if (action === 'delete-jugador') {
    if (!confirm('¿Eliminar este jugador? También se eliminarán sus goles registrados.')) return;
    try {
      await fetchJson(`/api/admin/jugadores/${id}`, { method: 'DELETE' });
      await loadJugadoresTable(currentPlantillaTeamId);
    } catch (err) {
      alert(err.message);
    }
  }
});

// --- Partidos ---

function renderPartidosTab() {
  panels.partidos.innerHTML = `
    <div class="admin-toolbar">
      <h2>Partidos</h2>
      <div>
        <select id="partidosCategoriaFilter">
          ${CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="partidosFaseFilter">
          ${FASES.map((f) => `<option value="${f.value}">${f.label}</option>`).join('')}
        </select>
        <button class="btn-small primary" id="newPartidoBtn">+ Nuevo partido</button>
      </div>
    </div>
    <div id="partidoFormContainer"></div>
    <div id="partidosListContainer"></div>
  `;

  document.getElementById('partidosCategoriaFilter').addEventListener('change', loadPartidosList);
  document.getElementById('partidosFaseFilter').addEventListener('change', loadPartidosList);
  document.getElementById('newPartidoBtn').addEventListener('click', () => showPartidoForm(null));

  loadPartidosList();
}

async function loadPartidosList() {
  const categoria = document.getElementById('partidosCategoriaFilter').value;
  const fase = document.getElementById('partidosFaseFilter').value;
  const container = document.getElementById('partidosListContainer');
  container.innerHTML = '<p>Cargando…</p>';
  try {
    const { partidos } = await fetchJson(`/api/partidos?categoria=${encodeURIComponent(categoria)}&fase=${encodeURIComponent(fase)}`);
    partidosCache = partidos;
    if (!partidos.length) {
      container.innerHTML = '<p>No hay partidos para este filtro.</p>';
      return;
    }
    container.innerHTML = `
      <table class="admin-table">
        <thead><tr><th>Fecha</th><th>Partido</th><th>Resultado</th><th>Grupo/Ronda</th><th></th></tr></thead>
        <tbody>
          ${partidos.map((p) => `
            <tr data-id="${p.id}">
              <td>${escapeHtml(formatFechaHora(p.scheduled_at))}</td>
              <td>${escapeHtml(p.home_team_name)} vs ${escapeHtml(p.away_team_name)}</td>
              <td>${p.played ? `${p.home_score} - ${p.away_score}` : '—'}</td>
              <td>${p.round_name ? escapeHtml(p.round_name) : (p.group_name ? `Grupo ${escapeHtml(p.group_name)}` : '')}</td>
              <td class="actions">
                <button class="btn-small primary" data-action="resultado-partido" data-id="${p.id}">Resultado</button>
                <button class="btn-small" data-action="edit-partido" data-id="${p.id}">Editar</button>
                <button class="btn-small danger" data-action="delete-partido" data-id="${p.id}">Eliminar</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p class="feedback error">${escapeHtml(err.message)}</p>`;
  }
}

function showPartidoForm(partido) {
  const container = document.getElementById('partidoFormContainer');
  const isEdit = Boolean(partido);
  const defaultCategory = partido ? partido.category : document.getElementById('partidosCategoriaFilter').value;

  container.innerHTML = `
    <form class="inline-form" id="partidoForm">
      <div class="form-row">
        <label>Categoría *</label>
        <select name="category" id="partidoCategoria" required>
          ${CATEGORIAS.map((c) => `<option value="${c}" ${defaultCategory === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Fase *</label>
        <select name="phase" required>
          ${FASES.map((f) => `<option value="${f.value}" ${partido && partido.phase === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>Grupo (fase de grupos)</label>
        <input type="text" name="group_name" maxlength="20" value="${partido && partido.group_name ? escapeHtml(partido.group_name) : ''}">
      </div>
      <div class="form-row">
        <label>Ronda (fase final)</label>
        <input type="text" name="round_name" maxlength="60" placeholder="Semifinal, Final…" value="${partido && partido.round_name ? escapeHtml(partido.round_name) : ''}">
      </div>
      <div class="form-row">
        <label>Equipo local *</label>
        <select name="home_team_id" id="homeTeamSelect" required></select>
      </div>
      <div class="form-row">
        <label>Equipo visitante *</label>
        <select name="away_team_id" id="awayTeamSelect" required></select>
      </div>
      <div class="form-row">
        <label>Fecha y hora</label>
        <input type="datetime-local" name="scheduled_at" value="${partido && partido.scheduled_at ? partido.scheduled_at.slice(0, 16) : ''}">
      </div>
      <div class="form-row">
        <label>Sede</label>
        <input type="text" name="venue" maxlength="120" value="${partido && partido.venue ? escapeHtml(partido.venue) : ''}">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn-small primary">${isEdit ? 'Guardar cambios' : 'Crear partido'}</button>
        <button type="button" class="btn-small" id="cancelPartidoForm">Cancelar</button>
      </div>
      <p class="feedback error" id="partidoFormFeedback"></p>
    </form>
  `;

  function populateTeamSelects() {
    const cat = document.getElementById('partidoCategoria').value;
    const options = teamsCache.filter((t) => t.category === cat)
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    const homeSel = document.getElementById('homeTeamSelect');
    const awaySel = document.getElementById('awayTeamSelect');
    homeSel.innerHTML = options;
    awaySel.innerHTML = options;
    if (partido) {
      homeSel.value = partido.home_team_id;
      awaySel.value = partido.away_team_id;
    }
  }
  populateTeamSelects();
  document.getElementById('partidoCategoria').addEventListener('change', populateTeamSelects);

  document.getElementById('cancelPartidoForm').addEventListener('click', () => { container.innerHTML = ''; });

  document.getElementById('partidoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    const feedback = document.getElementById('partidoFormFeedback');
    feedback.textContent = '';
    try {
      if (isEdit) {
        await fetchJson(`/api/admin/partidos/${partido.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      } else {
        await fetchJson('/api/admin/partidos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
      }
      container.innerHTML = '';
      await loadPartidosList();
    } catch (err) {
      feedback.textContent = err.message;
    }
  });
}

function renderGoalRow(jugadores, selectedPlayerId, count) {
  const options = jugadores.map((j) => `
    <option value="${j.id}" ${String(j.id) === String(selectedPlayerId) ? 'selected' : ''}>
      ${j.dorsal ? `#${j.dorsal} ` : ''}${escapeHtml(j.nombre)} ${escapeHtml(j.apellidos)}
    </option>
  `).join('');
  return `
    <div class="goal-row">
      <select>${options}</select>
      <input type="number" min="1" value="${count || 1}">
      <button type="button" class="btn-small danger" data-action="remove-goal-row">✕</button>
    </div>
  `;
}

function addGoalRow(teamId) {
  const container = document.getElementById(`goalRows-${teamId}`);
  const jugadores = currentRosterByTeam[teamId] || [];
  if (!jugadores.length) {
    alert('Este equipo no tiene jugadores en la plantilla.');
    return;
  }
  container.insertAdjacentHTML('beforeend', renderGoalRow(jugadores, jugadores[0].id, 1));
}

async function toggleResultadoPanel(matchId, btn) {
  const row = btn.closest('tr');
  const existingPanelRow = row.nextElementSibling;
  if (existingPanelRow && existingPanelRow.classList.contains('resultado-row')) {
    existingPanelRow.remove();
    return;
  }
  document.querySelectorAll('.resultado-row').forEach((r) => r.remove());

  const partido = partidosCache.find((p) => String(p.id) === String(matchId));
  const panelRow = document.createElement('tr');
  panelRow.className = 'resultado-row';
  panelRow.innerHTML = '<td colspan="5"><p>Cargando jugadores…</p></td>';
  row.after(panelRow);

  try {
    const [home, away] = await Promise.all([
      fetchJson(`/api/equipos/${partido.home_team_id}`),
      fetchJson(`/api/equipos/${partido.away_team_id}`),
    ]);

    currentRosterByTeam = {
      [home.equipo.id]: home.jugadores,
      [away.equipo.id]: away.jugadores,
    };

    const existingGoalsByTeam = { [home.equipo.id]: [], [away.equipo.id]: [] };
    (partido.goles || []).forEach((g) => {
      if (existingGoalsByTeam[g.team_id]) existingGoalsByTeam[g.team_id].push(g);
    });

    panelRow.innerHTML = `
      <td colspan="5">
        <div class="resultado-panel" data-match-id="${matchId}">
          <div class="resultado-scores">
            <strong>${escapeHtml(home.equipo.name)}</strong>
            <input type="number" min="0" id="homeScoreInput" value="${partido.home_score ?? 0}">
            -
            <input type="number" min="0" id="awayScoreInput" value="${partido.away_score ?? 0}">
            <strong>${escapeHtml(away.equipo.name)}</strong>
          </div>

          <div class="goal-team-block">
            <h4>Goleadores — ${escapeHtml(home.equipo.name)}</h4>
            <div class="goal-rows" id="goalRows-${home.equipo.id}">
              ${existingGoalsByTeam[home.equipo.id].map((g) => renderGoalRow(home.jugadores, g.player_id, g.count)).join('')}
            </div>
            <button type="button" class="btn-small" data-action="add-goal-row" data-team-id="${home.equipo.id}">+ Añadir goleador</button>
          </div>

          <div class="goal-team-block">
            <h4>Goleadores — ${escapeHtml(away.equipo.name)}</h4>
            <div class="goal-rows" id="goalRows-${away.equipo.id}">
              ${existingGoalsByTeam[away.equipo.id].map((g) => renderGoalRow(away.jugadores, g.player_id, g.count)).join('')}
            </div>
            <button type="button" class="btn-small" data-action="add-goal-row" data-team-id="${away.equipo.id}">+ Añadir goleador</button>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-small primary" data-action="guardar-resultado" data-id="${matchId}">Guardar resultado</button>
            <button type="button" class="btn-small" data-action="cancelar-resultado">Cancelar</button>
          </div>
          <p class="feedback error" id="resultadoFeedback-${matchId}"></p>
        </div>
      </td>
    `;
  } catch (err) {
    panelRow.innerHTML = `<td colspan="5"><p class="feedback error">${escapeHtml(err.message)}</p></td>`;
  }
}

async function guardarResultado(matchId) {
  const panel = document.querySelector(`.resultado-panel[data-match-id="${matchId}"]`);
  const feedback = document.getElementById(`resultadoFeedback-${matchId}`);
  feedback.textContent = '';

  const home_score = Number(panel.querySelector('#homeScoreInput').value);
  const away_score = Number(panel.querySelector('#awayScoreInput').value);

  const goals = [];
  panel.querySelectorAll('.goal-row').forEach((row) => {
    const player_id = Number(row.querySelector('select').value);
    const count = Number(row.querySelector('input').value);
    if (player_id && count > 0) goals.push({ player_id, count });
  });

  try {
    await fetchJson(`/api/admin/partidos/${matchId}/resultado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home_score, away_score, goals }),
    });
    await loadPartidosList();
  } catch (err) {
    feedback.textContent = err.message;
  }
}

panels.partidos.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'edit-partido') {
    showPartidoForm(partidosCache.find((p) => String(p.id) === id));
  } else if (action === 'delete-partido') {
    if (!confirm('¿Eliminar este partido?')) return;
    try {
      await fetchJson(`/api/admin/partidos/${id}`, { method: 'DELETE' });
      await loadPartidosList();
    } catch (err) {
      alert(err.message);
    }
  } else if (action === 'resultado-partido') {
    await toggleResultadoPanel(id, btn);
  } else if (action === 'guardar-resultado') {
    await guardarResultado(id);
  } else if (action === 'cancelar-resultado') {
    document.querySelectorAll('.resultado-row').forEach((r) => r.remove());
  } else if (action === 'add-goal-row') {
    addGoalRow(btn.dataset.teamId);
  } else if (action === 'remove-goal-row') {
    btn.closest('.goal-row').remove();
  }
});

checkAuth();
