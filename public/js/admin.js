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
  grupos: document.getElementById('panelGrupos'),
  partidos: document.getElementById('panelPartidos'),
  avisos: document.getElementById('panelAvisos'),
  importar: document.getElementById('panelImportar'),
  entregas: document.getElementById('panelEntregas'),
  publicacion: document.getElementById('panelPublicacion'),
};

let loteArchivos = [];

let torneoPublico = false;
let subidasAbiertas = true;

// Memoria de la pantalla: pestaña, filtros y partido abierto sobreviven a recargas y a cerrar el navegador.
const MEMORIA_CLAVE = 'turia_admin_estado';
function memLeer() {
  try { return JSON.parse(localStorage.getItem(MEMORIA_CLAVE)) || {}; } catch { return {}; }
}
function memGuardar(parcial) {
  try { localStorage.setItem(MEMORIA_CLAVE, JSON.stringify({ ...memLeer(), ...parcial })); } catch { /* sin memoria */ }
}

let currentTab = memLeer().tab || 'equipos';

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
  if (!panels[tab]) tab = 'equipos';
  currentTab = tab;
  memGuardar({ tab });
  adminTabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  Object.entries(panels).forEach(([key, el]) => { el.hidden = key !== tab; });
  if (tab === 'equipos') renderEquiposTab();
  if (tab === 'plantillas') renderPlantillasTab();
  if (tab === 'grupos') renderGruposTab();
  if (tab === 'partidos') renderPartidosTab();
  if (tab === 'avisos') renderAvisosTab();
  if (tab === 'importar') renderImportarTab();
  if (tab === 'entregas') renderEntregasTab();
  if (tab === 'publicacion') renderPublicacionTab();
}

// --- Pestaña de grupos (vista previa de cómo se verán en la web) ---

let gruposCat = null;

async function renderGruposTab() {
  panels.grupos.innerHTML = '<p class="empty-state">Cargando…</p>';
  try {
    await loadTeamsCache();
  } catch (err) {
    panels.grupos.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    return;
  }
  const cats = [...new Set(teamsCache.map((t) => t.category))].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
  if (!cats.includes(gruposCat)) gruposCat = cats[0];
  panels.grupos.innerHTML = `
    <div class="admin-toolbar"><h2>Grupos</h2></div>
    <p style="color:#666;margin-bottom:16px">Así se verán los grupos en la web. Los equipos con nombre tipo <strong>U9D5</strong> son ficticios (pendientes de sustituir por el club real).</p>
    <div class="tabs" id="gruposCats">
      ${cats.map((c) => `<button class="tab-btn ${c === gruposCat ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}
        (${teamsCache.filter((t) => t.category === c).length})</button>`).join('')}
    </div>
    <div id="gruposLista"></div>
  `;
  document.getElementById('gruposCats').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cat]');
    if (!b) return;
    gruposCat = b.dataset.cat;
    document.querySelectorAll('#gruposCats .tab-btn').forEach((x) => x.classList.toggle('active', x === b));
    pintarGrupos();
  });
  pintarGrupos();
}

function pintarGrupos() {
  const equipos = teamsCache.filter((t) => t.category === gruposCat);
  const grupos = [...new Set(equipos.map((t) => t.group_name).filter(Boolean))].sort();
  const sin = equipos.filter((t) => !t.group_name);
  const ficticio = (n) => /^U\d+[A-Z]\d+$/.test(n);
  const tabla = (lista) => tablaGrupoHtml(lista.map((t) => ({
    team_id: t.id, name: t.name, logo_url: t.logo_url, ficticio: ficticio(t.name), profesional: t.profesional,
    pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0,
  })), { enlaces: true, nuevaPestana: true });
  const porNombre = (a, b) => (b.profesional ? 1 : 0) - (a.profesional ? 1 : 0) || a.name.localeCompare(b.name, 'es');
  const bloques = grupos.map((g) => {
    const lista = equipos.filter((t) => t.group_name === g).sort(porNombre);
    return `<div class="grupo-bloque">${cabeceraGrupoHtml(g, lista.length)}${tabla(lista)}</div>`;
  });
  if (sin.length) {
    bloques.push(`<div class="grupo-bloque">${cabeceraGrupoHtml('', sin.length)}${tabla(sin.sort(porNombre))}</div>`);
  }
  document.getElementById('gruposLista').innerHTML = bloques.join('') || '<p class="empty-state">Todavía no hay grupos asignados.</p>';
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

// --- Avisos: el banner que sale arriba en la app del torneo ---

const AVISO_MAX = 280;
const AVISO_EJEMPLOS = [
  'Los partidos del Campo 2 van con 20 minutos de retraso.',
  'La entrega de trofeos será a las 19:00 en la grada principal.',
  'Por la lluvia, los partidos de la tarde se juegan en el Campo 1.',
];

function avisoHora(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function renderAvisosTab() {
  panels.avisos.innerHTML = '<p class="empty-state">Cargando…</p>';
  let aviso = null;
  try {
    ({ aviso } = await fetchJson('/api/admin/aviso'));
  } catch (err) {
    panels.avisos.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    return;
  }
  const tipo = aviso ? aviso.tipo : 'info';
  panels.avisos.innerHTML = `
    <div class="publicacion-box aviso-box">
      <h2>Aviso en la app</h2>
      <p>Un mensaje corto que sale arriba en la app del torneo, en todas las pantallas. Los móviles que la tengan
        abierta lo ven en menos de un minuto. Sirve para retrasos, cambios de campo, horarios de trofeos…</p>
      ${torneoPublico ? '' : '<p class="aviso-nota">🔒 El torneo está en modo interno: el aviso solo lo verás tú hasta que lo publiques.</p>'}

      <div class="aviso-actual">
        <h3>Ahora mismo</h3>
        ${aviso ? `<div class="aviso-preview ${escapeHtml(aviso.tipo)}">${escapeHtml(aviso.texto)}</div>
          <small>Publicado el ${escapeHtml(avisoHora(aviso.publicado_at))}</small>`
          : '<p class="empty-state">No hay ningún aviso publicado.</p>'}
      </div>

      <form id="avisoForm">
        <div class="form-row">
          <label for="avisoTexto">${aviso ? 'Cambiar el aviso' : 'Nuevo aviso'}</label>
          <textarea id="avisoTexto" rows="3" maxlength="${AVISO_MAX}" placeholder="${escapeHtml(AVISO_EJEMPLOS[0])}">${aviso ? escapeHtml(aviso.texto) : ''}</textarea>
          <small id="avisoContador"></small>
        </div>
        <div class="aviso-tipos">
          <label><input type="radio" name="avisoTipo" value="info" ${tipo === 'info' ? 'checked' : ''}> <span class="aviso-chip info">Información</span></label>
          <label><input type="radio" name="avisoTipo" value="urgente" ${tipo === 'urgente' ? 'checked' : ''}> <span class="aviso-chip urgente">Urgente</span></label>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-small primary">${aviso ? 'Guardar cambios' : 'Publicar aviso'}</button>
          ${aviso ? '<button type="button" class="btn-small danger" id="avisoQuitar">Quitar el aviso</button>' : ''}
        </div>
        <p class="feedback" id="avisoFeedback"></p>
      </form>
      ${aviso ? '' : `<p class="aviso-ejemplos">Ejemplos: ${AVISO_EJEMPLOS.map((e) => `«${escapeHtml(e)}»`).join(' · ')}</p>`}
    </div>`;

  const texto = document.getElementById('avisoTexto');
  const contador = document.getElementById('avisoContador');
  const contar = () => { contador.textContent = `${texto.value.length} / ${AVISO_MAX}`; };
  texto.addEventListener('input', contar);
  contar();

  const guardar = async (cuerpo, mensaje) => {
    const feedback = document.getElementById('avisoFeedback');
    feedback.className = 'feedback';
    feedback.textContent = '';
    try {
      await fetchJson('/api/admin/aviso', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      await renderAvisosTab();
      const nuevo = document.getElementById('avisoFeedback');
      nuevo.textContent = mensaje;
      nuevo.classList.add('success');
    } catch (err) {
      feedback.textContent = err.message;
      feedback.classList.add('error');
    }
  };

  document.getElementById('avisoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!texto.value.trim()) {
      const feedback = document.getElementById('avisoFeedback');
      feedback.textContent = 'Escribe el texto del aviso.';
      feedback.className = 'feedback error';
      return;
    }
    const tipoElegido = panels.avisos.querySelector('input[name="avisoTipo"]:checked').value;
    guardar({ texto: texto.value, tipo: tipoElegido }, 'Aviso publicado en la app.');
  });
  const quitar = document.getElementById('avisoQuitar');
  if (quitar) {
    quitar.addEventListener('click', () => {
      if (!confirm('¿Quitar el aviso de la app?')) return;
      guardar({ texto: '' }, 'Aviso quitado.');
    });
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
let entregasCat = null;
let entregasBusqueda = '';

function pintarEntregas() {
  const cont = document.getElementById('entregasLista');
  if (!cont) return;
  const q = normalizarTexto(entregasBusqueda);
  const lista = entregasCache.filter((e) => e.category === entregasCat && (!q || normalizarTexto(e.name).includes(q)));
  if (!lista.length) {
    cont.innerHTML = '<p>Ningún equipo coincide.</p>';
    return;
  }
  cont.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr><th>Equipo</th><th>Estado</th><th>Jug.</th><th>C. téc.</th><th>Copias</th><th>PDF</th><th>Enlace del club</th></tr>
      </thead>
      <tbody>
        ${lista.map((e) => `
          <tr>
            <td>${escapeHtml(e.name)}</td>
            <td>${e.last_upload_at
              ? `<span class="entregada">✅ ${escapeHtml(formatFechaHora(e.last_upload_at))}</span>`
              : '<span class="pendiente">⏳ Pendiente</span>'}</td>
            <td>${e.jugadores}</td>
            <td>${e.tecnicos}</td>
            <td>${e.versiones ? `<button class="btn-small" data-action="ver-copias" data-id="${e.id}">${e.versiones}</button>` : '—'}</td>
            <td>${e.jugadores || e.versiones
              ? `<button class="btn-small primary" data-action="pdf-ultimo" data-id="${e.id}" data-versiones="${e.versiones}">PDF</button>`
              : '—'}</td>
            <td>${e.slug
              ? `<div class="enlace-celda">
                   <input type="text" readonly value="${escapeHtml(enlaceDeEntrega(e.slug))}">
                   <button class="btn-small" data-action="copiar-enlace" data-slug="${escapeHtml(e.slug)}">Copiar</button>
                 </div>`
              : '<span class="pendiente">sin enlace</span>'}</td>
          </tr>
          <tr hidden id="copias-${e.id}"><td colspan="7"></td></tr>
        `).join('')}
      </tbody>
    </table>`;
}

// --- PDF: se abre una hoja limpia y el navegador la imprime / guarda como PDF ---

function filasPdf(lista, columnas) {
  return lista.map((f, i) => `<tr><td>${i + 1}</td>${columnas.map((c) => `<td>${escapeHtml(f[c] ?? '')}</td>`).join('')}</tr>`).join('');
}

function abrirPdf(ventana, d) {
  const jug = (d.jugadores || []).map((j) => ({ ...j, fecha: j.fecha_nacimiento ? formatFecha(j.fecha_nacimiento) : '' }));
  ventana.document.open();
  ventana.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
    <title>${escapeHtml(d.equipo)} ${escapeHtml(d.categoria)} — Turia Cup</title>
    <style>
      body{font-family:Arial,sans-serif;margin:24px;color:#111}
      h1{margin:0 0 4px} p{margin:2px 0 14px;color:#444}
      h2{margin:22px 0 6px;font-size:1.05rem}
      table{width:100%;border-collapse:collapse;font-size:.85rem}
      th,td{border:1px solid #bbb;padding:5px 8px;text-align:left} th{background:#eee}
      @media print{ body{margin:0} }
    </style></head><body>
    <h1>${escapeHtml(d.equipo)} · ${escapeHtml(d.categoria)}</h1>
    <p>Turia Cup — Plantilla ${d.fecha ? `entregada el ${escapeHtml(formatFechaHora(d.fecha))}` : 'tal como está ahora'}</p>
    <h2>Jugadores (${jug.length})</h2>
    <table><thead><tr><th>#</th><th>Dorsal</th><th>Nombre</th><th>Apellidos</th><th>Nacimiento</th><th>DNI</th><th>Intolerancias</th></tr></thead>
    <tbody>${filasPdf(jug, ['dorsal', 'nombre', 'apellidos', 'fecha', 'dni', 'intolerancias'])}</tbody></table>
    <h2>Cuerpo técnico (${(d.staff || []).length})</h2>
    ${(d.staff || []).length
      ? `<table><thead><tr><th>#</th><th>Nombre</th><th>Apellidos</th><th>Cargo</th><th>DNI</th></tr></thead>
         <tbody>${filasPdf(d.staff, ['nombre', 'apellidos', 'cargo', 'dni'])}</tbody></table>`
      : '<p>Sin cuerpo técnico.</p>'}
    </body></html>`);
  ventana.document.close();
  ventana.focus();
  setTimeout(() => ventana.print(), 300);
}

async function descargarPdf(origen) {
  const ventana = window.open('', '_blank'); // se abre ya, antes de pedir los datos, para que no la bloquee el navegador
  if (!ventana) {
    alert('Tu navegador ha bloqueado la ventana. Permite las ventanas emergentes para esta página.');
    return;
  }
  ventana.document.write('<p style="font-family:Arial">Preparando PDF…</p>');
  try {
    abrirPdf(ventana, await fetchJson(typeof origen === 'function' ? await origen() : origen));
  } catch (err) {
    ventana.close();
    alert(err.message);
  }
}

async function verCopias(id) {
  const fila = document.getElementById(`copias-${id}`);
  if (!fila) return;
  if (!fila.hidden) { fila.hidden = true; return; }
  const celda = fila.firstElementChild;
  celda.textContent = 'Cargando…';
  fila.hidden = false;
  try {
    const { versiones } = await fetchJson(`/api/admin/equipos/${id}/historial`);
    celda.innerHTML = versiones.map((v) => `
      <div style="display:flex;gap:12px;align-items:center;margin:4px 0">
        <span>${escapeHtml(formatFechaHora(v.created_at))} — ${v.jugadores} jugadores, ${v.tecnicos} c. técnico</span>
        <button class="btn-small" data-action="pdf-copia" data-copia="${v.id}">PDF</button>
      </div>`).join('');
  } catch (err) {
    celda.textContent = err.message;
  }
}

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

    const cats = [...new Set(entregas.map((e) => e.category))].sort((x, y) => parseInt(x.slice(1)) - parseInt(y.slice(1)));
    if (!cats.includes(entregasCat)) entregasCat = cats[0];

    contenedor.innerHTML = `
      <div class="tabs" id="entregasCats">
        ${cats.map((c) => `<button class="tab-btn ${c === entregasCat ? 'active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}
          (${entregas.filter((e) => e.category === c).length})</button>`).join('')}
      </div>
      <input type="search" id="entregasBuscar" placeholder="Buscar equipo…" value="${escapeHtml(entregasBusqueda)}" style="width:100%;max-width:360px;margin-bottom:12px">
      <div id="entregasLista"></div>
    `;
    document.getElementById('entregasCats').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-cat]');
      if (!b) return;
      entregasCat = b.dataset.cat;
      document.querySelectorAll('#entregasCats .tab-btn').forEach((x) => x.classList.toggle('active', x === b));
      pintarEntregas();
    });
    document.getElementById('entregasBuscar').addEventListener('input', (ev) => {
      entregasBusqueda = ev.target.value;
      pintarEntregas();
    });
    pintarEntregas();
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
  const acc = e.target.closest('button[data-action]');
  if (!acc) return;
  const a = acc.dataset.action;
  if (a === 'ver-copias') return verCopias(acc.dataset.id);
  if (a === 'pdf-copia') return descargarPdf(`/api/admin/entregas/historial/${acc.dataset.copia}`);
  if (a === 'pdf-ultimo') {
    if (!Number(acc.dataset.versiones)) return descargarPdf(`/api/admin/equipos/${acc.dataset.id}/plantilla-actual`);
    return descargarPdf(async () => {
      const { versiones } = await fetchJson(`/api/admin/equipos/${acc.dataset.id}/historial`);
      return `/api/admin/entregas/historial/${versiones[0].id}`;
    });
  }
  const btn = acc.matches('[data-action="copiar-enlace"]') ? acc : null;
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
      <thead><tr><th>Nombre</th><th>Categoría</th><th>Grupo</th><th>Ciudad</th><th title="Los profesionales salen primero en su grupo">Pro</th><th></th></tr></thead>
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
      tbody.innerHTML = '<tr><td colspan="6">No hay equipos todavía.</td></tr>';
      return;
    }
    tbody.innerHTML = equipos.map((e) => `
      <tr data-id="${e.id}">
        <td>${escapeHtml(e.name)}</td>
        <td>${escapeHtml(e.category)}</td>
        <td>${e.group_name ? escapeHtml(e.group_name) : ''}</td>
        <td>${e.city ? escapeHtml(e.city) : ''}</td>
        <td><input type="checkbox" class="chk-pro" data-id="${e.id}" ${e.profesional ? 'checked' : ''} title="Club profesional: sale primero en su grupo"></td>
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
      <thead><tr><th>Dorsal</th><th>Nombre</th><th>Apellidos</th><th>Fecha de nacimiento</th><th>DNI</th><th>Intolerancias</th><th></th></tr></thead>
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
      tbody.innerHTML = '<tr><td colspan="7">Sin jugadores todavía.</td></tr>';
      return;
    }
    tbody.innerHTML = jugadores.map((j) => `
      <tr data-id="${j.id}">
        <td>${j.dorsal ?? ''}</td>
        <td>${escapeHtml(j.nombre)}</td>
        <td>${escapeHtml(j.apellidos)}</td>
        <td>${j.fecha_nacimiento ? formatFecha(j.fecha_nacimiento) : ''}</td>
        <td>${j.dni ? escapeHtml(j.dni) : ''}</td>
        <td>${j.intolerancias ? escapeHtml(j.intolerancias) : ''}</td>
        <td class="actions">
          <button class="btn-small" data-action="edit-jugador" data-id="${j.id}">Editar</button>
          <button class="btn-small danger" data-action="delete-jugador" data-id="${j.id}">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
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
    <td><input type="text" value="${escapeHtml(j.intolerancias ?? '')}" data-field="intolerancias"></td>
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
    intolerancias: get('intolerancias') || null,
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
        <select id="partidosCampoFilter" class="filtro-campo"><option value="">Todos los campos</option></select>
        <select id="partidosCategoriaFilter">
          <option value="TODAS">Todas las categorías</option>
          ${CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="partidosFaseFilter">
          ${FASES.map((f) => `<option value="${f.value}">${f.label}</option>`).join('')}
        </select>
        <input type="search" id="partidosBuscar" placeholder="Buscar equipo, campo o grupo…">
        <button class="btn-small primary" id="newPartidoBtn">+ Nuevo partido</button>
      </div>
    </div>
    <div class="pc-estado" id="partidosEstado">
      <button type="button" data-estado="enjuego">En juego</button>
      <button type="button" class="active" data-estado="pendientes">Pendientes</button>
      <button type="button" data-estado="terminados">Terminados</button>
      <button type="button" data-estado="todos">Todos</button>
    </div>
    <div id="partidoFormContainer"></div>
    <div id="partidosListContainer"></div>
  `;

  // Restaurar lo último que se estaba mirando
  const mem = memLeer();
  const poner = (id, valor) => {
    const el = document.getElementById(id);
    if (valor && el && (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === valor))) el.value = valor;
  };
  poner('partidosCategoriaFilter', mem.categoria);
  poner('partidosFaseFilter', mem.fase);
  poner('partidosBuscar', mem.buscar);
  if (mem.estado) {
    document.querySelectorAll('#partidosEstado button').forEach((b) => b.classList.toggle('active', b.dataset.estado === mem.estado));
  }

  document.getElementById('partidosCategoriaFilter').addEventListener('change', (e) => { memGuardar({ categoria: e.target.value, directoId: null }); loadPartidosList(); });
  document.getElementById('partidosFaseFilter').addEventListener('change', (e) => { memGuardar({ fase: e.target.value, campo: '', directoId: null }); loadPartidosList(); });
  document.querySelectorAll('#partidosEstado button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#partidosEstado button').forEach((x) => x.classList.toggle('active', x === b));
    memGuardar({ estado: b.dataset.estado });
    pintarPartidos();
  }));
  document.getElementById('partidosCampoFilter').addEventListener('change', (e) => { memGuardar({ campo: e.target.value }); pintarPartidos(); });
  document.getElementById('partidosBuscar').addEventListener('input', (e) => { memGuardar({ buscar: e.target.value }); pintarPartidos(); });
  document.getElementById('newPartidoBtn').addEventListener('click', () => showPartidoForm(null));

  loadPartidosList().then(restaurarDirecto);
}

// Si había un partido abierto en el panel, se vuelve a abrir tal cual.
async function restaurarDirecto() {
  const id = memLeer().directoId;
  if (!id) return;
  let btn = document.querySelector(`.pc-card[data-id="${id}"] [data-action="directo-partido"]`);
  if (!btn) {
    // El partido puede haber cambiado de estado: se busca en «Todos».
    document.querySelectorAll('#partidosEstado button').forEach((b) => b.classList.toggle('active', b.dataset.estado === 'todos'));
    const campo = document.getElementById('partidosCampoFilter');
    if (campo) campo.value = '';
    const buscar = document.getElementById('partidosBuscar');
    if (buscar) buscar.value = '';
    pintarPartidos();
    btn = document.querySelector(`.pc-card[data-id="${id}"] [data-action="directo-partido"]`);
  }
  if (!btn) { memGuardar({ directoId: null }); return; }
  await toggleDirecto(id, btn);
  await new Promise((r) => setTimeout(r, 600)); // deja terminar el desplazamiento suave de toggleDirecto
  const panel = document.querySelector('.directo-row');
  if (panel) panel.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function rellenarCampos() {
  const sel = document.getElementById('partidosCampoFilter');
  const actual = sel.value || memLeer().campo || '';
  const campos = [...new Set(partidosCache.map((p) => p.venue).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  const hayVacios = partidosCache.some((p) => !p.venue);
  sel.innerHTML = '<option value="">Todos los campos</option>'
    + campos.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')
    + (hayVacios ? '<option value="__sin__">Sin instalación</option>' : '');
  if (actual && [...sel.options].some((o) => o.value === actual)) sel.value = actual;
}

function pintarPartidos() {
  const container = document.getElementById('partidosListContainer');
  const q = (document.getElementById('partidosBuscar')?.value || '').trim().toLowerCase();
  const campo = document.getElementById('partidosCampoFilter')?.value || '';
  const lista = partidosCache.filter((p) => (!campo || (campo === '__sin__' ? !p.venue : p.venue === campo)))
    .filter((p) => !q
    || p.home_team_name.toLowerCase().includes(q) || p.away_team_name.toLowerCase().includes(q)
    || (p.venue || '').toLowerCase().includes(q) || (p.group_name || '').toLowerCase() === q);
  const estado = document.querySelector('#partidosEstado .active')?.dataset.estado || 'pendientes';
  const fecha = (p) => p.scheduled_at || '';
  const enJuego = lista.filter((p) => p.live && !p.played).sort((a, b) => (fecha(a) || '9999').localeCompare(fecha(b) || '9999'));
  const pendientes = lista.filter((p) => !p.played && !p.live).sort((a, b) => (fecha(a) || '9999').localeCompare(fecha(b) || '9999'));
  const terminados = lista.filter((p) => p.played).sort((a, b) => fecha(b).localeCompare(fecha(a)));
  const ordenada = estado === 'enjuego' ? enJuego : estado === 'pendientes' ? pendientes
    : estado === 'terminados' ? terminados : [...enJuego, ...pendientes, ...terminados];
  // Contadores en los botones de estado
  const nombres = { enjuego: ['En juego', enJuego.length], pendientes: ['Pendientes', pendientes.length],
    terminados: ['Terminados', terminados.length], todos: ['Todos', lista.length] };
  document.querySelectorAll('#partidosEstado button').forEach((b) => {
    const [txt, n] = nombres[b.dataset.estado];
    b.innerHTML = `${txt} <small>${n}</small>`;
  });
  if (!ordenada.length) {
    container.innerHTML = '<p>No hay partidos para este filtro.</p>';
    return;
  }
  const fila = (nombre, logo, goles, jugado) => `
    <div class="pc-row">
      ${crestHtml(logo)}<span class="pc-name">${escapeHtml(nombre)}</span>
      <span class="pc-score">${jugado ? goles : ''}</span>
    </div>`;
  const marcadorVisible = (p) => p.played || p.live;
  container.innerHTML = `
    <p class="pc-count">${ordenada.length} partido${ordenada.length === 1 ? '' : 's'}${estado === 'todos' ? ` (${enJuego.length} en juego · ${pendientes.length} pendientes · ${terminados.length} terminados)` : ''}</p>
    <div class="pc-list">
      ${ordenada.map((p) => `
        <div class="pc-card" data-id="${p.id}">
          <div class="pc-teams">
            ${fila(p.home_team_name, p.home_logo, p.home_score, marcadorVisible(p))}
            ${fila(p.away_team_name, p.away_logo, p.away_score, marcadorVisible(p))}
          </div>
          <div class="pc-meta">
            <span>🕒 ${escapeHtml(formatFechaHora(p.scheduled_at))}</span>
            <span>📍 ${p.venue ? escapeHtml(p.venue) : '<em>Sin instalación</em>'}</span>
            <span><strong>${escapeHtml(p.category)}</strong> · ${p.round_name ? escapeHtml(p.round_name) : (p.group_name ? `Grupo ${escapeHtml(p.group_name)}` : '')}${p.played ? '' : (p.live ? ' · <span class="en-juego">● EN JUEGO</span>' : ' · Por jugar')}</span>
          </div>
          <div class="pc-actions">
            ${p.home_team_id && p.away_team_id ? `
            <button class="btn-small directo ${p.played ? 'editar' : ''}" data-action="directo-partido" data-id="${p.id}">${p.played ? '✎ Editar resultado' : (p.live ? '● Seguir en directo' : '▶ Directo')}</button>
            <button class="btn-small" data-action="resultado-partido" data-id="${p.id}">Resultado</button>` : '<span class="pc-pend">Equipos por definir · pulsa «Editar» para asignarlos</span>'}
            <button class="btn-small" data-action="edit-partido" data-id="${p.id}">Editar</button>
            <button class="btn-small danger" data-action="delete-partido" data-id="${p.id}">Eliminar</button>
          </div>
        </div>`).join('')}
    </div>`;
}

async function loadPartidosList() {
  const categoria = document.getElementById('partidosCategoriaFilter').value;
  const fase = document.getElementById('partidosFaseFilter').value;
  const container = document.getElementById('partidosListContainer');
  container.innerHTML = '<p>Cargando…</p>';
  try {
    const cats = categoria === 'TODAS' ? CATEGORIAS : [categoria];
    const respuestas = await Promise.all(cats.map((c) =>
      fetchJson(`/api/partidos?categoria=${encodeURIComponent(c)}&fase=${encodeURIComponent(fase)}`)));
    const partidos = respuestas.flatMap((r) => r.partidos)
      .sort((a, b) => (a.scheduled_at || '9999').localeCompare(b.scheduled_at || '9999') || (a.venue || '').localeCompare(b.venue || ''));
    partidosCache = partidos;
    rellenarCampos();
    if (!partidos.length) {
      container.innerHTML = '<p>No hay partidos para este filtro.</p>';
      return;
    }
    pintarPartidos();
  } catch (err) {
    container.innerHTML = `<p class="feedback error">${escapeHtml(err.message)}</p>`;
  }
}

function showPartidoForm(partido) {
  const container = document.getElementById('partidoFormContainer');
  const isEdit = Boolean(partido);
  const filtroCat = document.getElementById('partidosCategoriaFilter').value;
  const defaultCategory = partido ? partido.category : (filtroCat === 'TODAS' ? CATEGORIAS[0] : filtroCat);

  setTimeout(() => container.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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
        <select name="home_team_id" id="homeTeamSelect"></select>
        <input type="text" name="home_label" maxlength="60" placeholder="Si aún no se sabe: «Mejor primero», «Ganador Octavo 1»…" value="${partido && partido.home_label ? escapeHtml(partido.home_label) : ''}">
      </div>
      <div class="form-row">
        <label>Equipo visitante *</label>
        <select name="away_team_id" id="awayTeamSelect"></select>
        <input type="text" name="away_label" maxlength="60" placeholder="Si aún no se sabe: «Mejor cuarto», «Ganador Octavo 2»…" value="${partido && partido.away_label ? escapeHtml(partido.away_label) : ''}">
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
    const options = '<option value="">— Por definir —</option>' + teamsCache.filter((t) => t.category === cat)
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
    const homeSel = document.getElementById('homeTeamSelect');
    const awaySel = document.getElementById('awayTeamSelect');
    homeSel.innerHTML = options;
    awaySel.innerHTML = options;
    if (partido) {
      homeSel.value = partido.home_team_id || '';
      awaySel.value = partido.away_team_id || '';
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


// --- Partido en directo ---

let directoActual = null; // { partido, eventos, home, away } del partido abierto

// Los nombres vienen en mayúsculas: se muestran como «Alejandro Soriano Aldana».
function nombreBonito(txt) {
  return String(txt ?? '').toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

const ICONOS_EVENTO = { gol: '⚽', propia: '⚽↩', amarilla: '🟨', roja: '🟥' };
const NOMBRES_EVENTO = { gol: 'Gol', propia: 'Gol en propia puerta', amarilla: 'Tarjeta amarilla', roja: 'Tarjeta roja' };

async function toggleDirecto(matchId, btn) {
  const card = btn.closest('.pc-card');
  const existente = card.nextElementSibling;
  if (existente && existente.classList.contains('directo-row')) {
    existente.remove();
    directoActual = null;
    memGuardar({ directoId: null });
    return;
  }
  document.querySelectorAll('.resultado-row').forEach((r) => r.remove());
  memGuardar({ directoId: matchId });
  const panel = document.createElement('div');
  panel.className = 'resultado-row directo-row';
  panel.innerHTML = '<p>Cargando partido…</p>';
  card.after(panel);
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  try {
    directoActual = await fetchJson(`/api/admin/partidos/${matchId}/directo`);
    pintarDirecto(panel);
  } catch (err) {
    panel.innerHTML = `<p class="feedback error">${escapeHtml(err.message)}</p>`;
  }
}

function resumenJugador(playerId) {
  const ev = directoActual.eventos.filter((e) => e.player_id === playerId);
  const n = (t) => ev.filter((e) => e.type === t).length;
  return [
    n('gol') ? '⚽'.repeat(n('gol')) : '',
    n('propia') ? 'P.P.' : '',
    n('amarilla') ? '🟨'.repeat(n('amarilla')) : '',
    n('roja') ? '🟥' : '',
  ].filter(Boolean).join(' ');
}

function columnaPlantilla(nombreEquipo, jugadores) {
  if (!jugadores.length) return `<div class="dj-col"><h4>${escapeHtml(nombreEquipo)}</h4><p class="empty-state">Sin plantilla subida.</p></div>`;
  return `
    <div class="dj-col">
      <h4>${escapeHtml(nombreEquipo)}</h4>
      ${jugadores.map((j) => `
        <button type="button" class="dj-jug" data-action="jugador-directo" data-player="${j.id}">
          <b>${j.dorsal ?? '–'}</b>
          <span class="dj-nombre">${escapeHtml(nombreBonito(`${j.nombre} ${j.apellidos}`))}</span>
          <span class="dj-badges">${resumenJugador(j.id)}</span>
        </button>`).join('')}
    </div>`;
}

function pintarDirecto(panel) {
  panel = panel || document.querySelector('.directo-row');
  if (!panel || !directoActual) return;
  const { partido: p, eventos, home, away } = directoActual;
  const nombreJugador = (e) => `${e.dorsal != null ? `${e.dorsal}. ` : ''}${nombreBonito(`${e.nombre} ${e.apellidos}`)}`;
  const equipoDe = (e) => (e.team_id === p.home_team_id ? p.home_team_name : p.away_team_name);

  const reiniciar = `<button type="button" class="btn-reiniciar" data-action="reiniciar-partido" data-id="${p.id}">↺ Volver a pendiente (borrar todo)</button>`;
  let cuerpo;
  if (!p.live && !p.played) {
    cuerpo = `
      <p class="dj-aviso">El partido aún no ha empezado.</p>
      <button type="button" class="btn-iniciar" data-action="iniciar-partido" data-id="${p.id}">▶ Iniciar partido</button>`;
  } else {
    // Aviso si el marcador guardado no sale de las incidencias (partidos cerrados a mano)
    const golesEq = (t, tipo) => eventos.filter((e) => e.type === tipo && e.team_id === t).length;
    const calcLocal = golesEq(p.home_team_id, 'gol') + golesEq(p.away_team_id, 'propia');
    const calcVisit = golesEq(p.away_team_id, 'gol') + golesEq(p.home_team_id, 'propia');
    const descuadre = p.played && (calcLocal !== (p.home_score ?? 0) || calcVisit !== (p.away_score ?? 0))
      ? `<p class="dj-descuadre">⚠ El marcador guardado (${p.home_score ?? 0}-${p.away_score ?? 0}) no coincide con las incidencias (${calcLocal}-${calcVisit}). Al anotar o deshacer algo, el marcador se ajustará a las incidencias.</p>` : '';
    cuerpo = `
      ${p.played ? `<p class="dj-aviso dj-edicion">✎ Estás editando un partido terminado. Cada cambio se guarda al instante.</p>${descuadre}` : ''}
      <div class="dj-plantillas">
        ${columnaPlantilla(p.home_team_name, home)}
        ${columnaPlantilla(p.away_team_name, away)}
      </div>
      <h4 class="dj-titulo">Incidencias</h4>
      ${eventos.length ? `<ul class="dj-eventos">${[...eventos].reverse().map((e) => `
        <li><span>${ICONOS_EVENTO[e.type]} ${escapeHtml(NOMBRES_EVENTO[e.type])} · ${escapeHtml(nombreJugador(e))} <small>(${escapeHtml(equipoDe(e))})</small></span>
          <button type="button" class="btn-small" data-action="deshacer-evento" data-id="${p.id}" data-event="${e.id}">Quitar</button></li>`).join('')}</ul>`
        : '<p class="empty-state">Todavía no hay incidencias. Toca un jugador para anotar un gol o una tarjeta.</p>'}
      ${p.live ? `<button type="button" class="btn-finalizar" data-action="finalizar-partido" data-id="${p.id}">■ Finalizar partido</button>` : ''}
      ${reiniciar}`;
  }

  panel.innerHTML = `
    <div class="directo-panel">
      <div class="dj-marcador">
        <span class="dj-eq">${escapeHtml(p.home_team_name)}</span>
        <span class="dj-goles">${p.home_score ?? 0} - ${p.away_score ?? 0}</span>
        <span class="dj-eq">${escapeHtml(p.away_team_name)}</span>
        ${p.live ? '<span class="en-juego dj-badge">● EN JUEGO</span>' : ''}
      </div>
      ${cuerpo}
      <p class="feedback error" id="directoFeedback"></p>
    </div>`;
}

function abrirHojaJugador(playerId) {
  const { partido: p, home, away } = directoActual;
  const id = Number(playerId);
  const jug = [...home, ...away].find((j) => j.id === id);
  if (!jug) return;
  cerrarHojaJugador();
  const equipo = home.some((j) => j.id === id) ? p.home_team_name : p.away_team_name;
  const hoja = document.createElement('div');
  hoja.className = 'hoja-jugador';
  hoja.innerHTML = `
    <button type="button" class="hoja-fondo" data-action="cerrar-hoja" aria-label="Cerrar"></button>
    <div class="hoja-caja">
      <h3>${jug.dorsal != null ? `${jug.dorsal}. ` : ''}${escapeHtml(nombreBonito(`${jug.nombre} ${jug.apellidos}`))}</h3>
      <p>${escapeHtml(equipo)}</p>
      <button type="button" class="hoja-btn gol" data-action="evento-directo" data-id="${p.id}" data-player="${id}" data-type="gol">⚽ Gol</button>
      <button type="button" class="hoja-btn" data-action="evento-directo" data-id="${p.id}" data-player="${id}" data-type="amarilla">🟨 Tarjeta amarilla</button>
      <button type="button" class="hoja-btn" data-action="evento-directo" data-id="${p.id}" data-player="${id}" data-type="roja">🟥 Tarjeta roja</button>
      <button type="button" class="hoja-btn" data-action="evento-directo" data-id="${p.id}" data-player="${id}" data-type="propia">⚽↩ Gol en propia puerta</button>
      <button type="button" class="hoja-btn cancelar" data-action="cerrar-hoja">Cancelar</button>
    </div>`;
  panels.partidos.appendChild(hoja);
}

function cerrarHojaJugador() {
  document.querySelectorAll('.hoja-jugador').forEach((h) => h.remove());
}

async function accionDirecto(matchId, accion, datos = {}) {
  cerrarHojaJugador();
  const panel = document.querySelector('.directo-row');
  const feedback = () => document.getElementById('directoFeedback');
  const opciones = {
    iniciar: [`/api/admin/partidos/${matchId}/iniciar`, { method: 'POST' }],
    finalizar: [`/api/admin/partidos/${matchId}/finalizar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home_pen: datos.home_pen ?? null, away_pen: datos.away_pen ?? null }),
    }],
    evento: [`/api/admin/partidos/${matchId}/eventos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: datos.player_id, type: datos.type }),
    }],
    deshacer: [`/api/admin/partidos/${matchId}/eventos/${datos.eventId}`, { method: 'DELETE' }],
    reiniciar: [`/api/admin/partidos/${matchId}/reiniciar`, { method: 'POST' }],
  }[accion];
  try {
    directoActual = await fetchJson(opciones[0], opciones[1]);
  } catch (err) {
    if (feedback()) feedback().textContent = err.message;
    return;
  }
  // Se actualiza la lista en memoria con el estado nuevo del partido.
  const idx = partidosCache.findIndex((x) => String(x.id) === String(matchId));
  if (idx >= 0) partidosCache[idx] = { ...partidosCache[idx], ...directoActual.partido, goles: partidosCache[idx].goles };

  if (accion === 'reiniciar') {
    // Vuelve a pendientes: se cierra el panel y se muestra en esa pestaña.
    directoActual = null;
    memGuardar({ directoId: null, estado: 'pendientes' });
    document.querySelectorAll('#partidosEstado button').forEach((b) => b.classList.toggle('active', b.dataset.estado === 'pendientes'));
    pintarPartidos();
    const tarjeta = document.querySelector(`.pc-card[data-id="${matchId}"]`);
    if (tarjeta) tarjeta.scrollIntoView({ block: 'center', behavior: 'smooth' });
  } else if (accion === 'iniciar' || accion === 'finalizar') {
    // Al cambiar de estado el partido cambia de pestaña: pasamos a ella y reabrimos su panel.
    const destino = accion === 'iniciar' ? 'enjuego' : 'terminados';
    memGuardar({ estado: destino });
    document.querySelectorAll('#partidosEstado button').forEach((b) => b.classList.toggle('active', b.dataset.estado === destino));
    pintarPartidos();
    const btn = document.querySelector(`.pc-card[data-id="${matchId}"] [data-action="resultado-partido"]`);
    if (btn) {
      const card = btn.closest('.pc-card');
      const nuevo = document.createElement('div');
      nuevo.className = 'resultado-row directo-row';
      card.after(nuevo);
      pintarDirecto(nuevo);
      card.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  } else {
    pintarDirecto(panel);
    // Marcador de la tarjeta, sin repintar la lista (así no se cierra el panel).
    const card = document.querySelector(`.pc-card[data-id="${matchId}"]`);
    if (card) {
      const marcadores = card.querySelectorAll('.pc-score');
      if (marcadores[0]) marcadores[0].textContent = directoActual.partido.home_score ?? 0;
      if (marcadores[1]) marcadores[1].textContent = directoActual.partido.away_score ?? 0;
    }
  }
}

async function toggleResultadoPanel(matchId, btn) {
  const row = btn.closest('.pc-card');
  const existingPanelRow = row.nextElementSibling;
  if (existingPanelRow && existingPanelRow.classList.contains('resultado-row') && !existingPanelRow.classList.contains('directo-row')) {
    existingPanelRow.remove();
    return;
  }
  document.querySelectorAll('.resultado-row').forEach((r) => r.remove());

  const partido = partidosCache.find((p) => String(p.id) === String(matchId));
  const panelRow = document.createElement('div');
  panelRow.className = 'resultado-row';
  panelRow.innerHTML = '<p>Cargando jugadores…</p>';
  row.after(panelRow);
  panelRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

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
        <div class="resultado-panel" data-match-id="${matchId}">
          <div class="resultado-scores">
            <strong>${escapeHtml(home.equipo.name)}</strong>
            <input type="number" min="0" id="homeScoreInput" value="${partido.home_score ?? 0}">
            -
            <input type="number" min="0" id="awayScoreInput" value="${partido.away_score ?? 0}">
            <strong>${escapeHtml(away.equipo.name)}</strong>
          </div>
          ${partido.phase !== 'grupos' ? `
          <div class="resultado-scores resultado-pen">
            <span>Penaltis (solo si hay empate)</span>
            <input type="number" min="0" id="homePenInput" value="${partido.home_pen ?? ''}">
            -
            <input type="number" min="0" id="awayPenInput" value="${partido.away_pen ?? ''}">
          </div>` : ''}

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
    `;
  } catch (err) {
    panelRow.innerHTML = `<p class="feedback error">${escapeHtml(err.message)}</p>`;
  }
}

async function guardarResultado(matchId) {
  const panel = document.querySelector(`.resultado-panel[data-match-id="${matchId}"]`);
  const feedback = document.getElementById(`resultadoFeedback-${matchId}`);
  feedback.textContent = '';

  const home_score = Number(panel.querySelector('#homeScoreInput').value);
  const away_score = Number(panel.querySelector('#awayScoreInput').value);
  const penH = panel.querySelector('#homePenInput');
  const penA = panel.querySelector('#awayPenInput');
  const home_pen = penH && penH.value !== '' ? Number(penH.value) : null;
  const away_pen = penA && penA.value !== '' ? Number(penA.value) : null;

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
      body: JSON.stringify({ home_score, away_score, home_pen, away_pen, goals }),
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

  if (action === 'directo-partido') {
    toggleDirecto(id, btn);
  } else if (action === 'iniciar-partido') {
    await accionDirecto(id, 'iniciar');
  } else if (action === 'jugador-directo') {
    abrirHojaJugador(btn.dataset.player);
  } else if (action === 'evento-directo') {
    await accionDirecto(id, 'evento', { player_id: Number(btn.dataset.player), type: btn.dataset.type });
  } else if (action === 'cerrar-hoja') {
    cerrarHojaJugador();
  } else if (action === 'deshacer-evento') {
    await accionDirecto(id, 'deshacer', { eventId: btn.dataset.event });
  } else if (action === 'reiniciar-partido') {
    const d = directoActual;
    const aviso = d.partido.played
      ? `Este partido está terminado (${d.partido.home_score}-${d.partido.away_score}). ¿Volver a «Pendiente»? Se borrarán el marcador, los goles y las tarjetas, y dejará de contar en la clasificación.`
      : '¿Volver el partido a «Pendiente»? Se borrarán el marcador, los goles y las tarjetas anotados.';
    if (confirm(aviso)) await accionDirecto(id, 'reiniciar');
  } else if (action === 'finalizar-partido') {
    const d = directoActual;
    const p = d.partido;
    const eliminatoria = (p.winner_to != null || p.loser_to != null) && p.home_score === p.away_score;
    if (eliminatoria) {
      // Eliminatoria en empate: se piden los penaltis para saber quién pasa.
      const h = prompt(`Empate ${p.home_score} - ${p.away_score} en eliminatoria.\nPenaltis marcados por ${p.home_team_name}:`);
      if (h === null) return;
      const a = prompt(`Penaltis marcados por ${p.away_team_name}:`);
      if (a === null) return;
      if (!/^\d+$/.test(h.trim()) || !/^\d+$/.test(a.trim()) || Number(h) === Number(a)) {
        alert('Escribe dos números distintos (no puede acabar en empate en los penaltis).');
        return;
      }
      if (confirm(`¿Finalizar ${p.home_score} - ${p.away_score} (penaltis ${h} - ${a})? Pasará a la siguiente ronda ${Number(h) > Number(a) ? p.home_team_name : p.away_team_name}.`)) {
        await accionDirecto(id, 'finalizar', { home_pen: Number(h), away_pen: Number(a) });
      }
    } else if (confirm(`¿Finalizar el partido con el resultado ${p.home_score} - ${p.away_score}? Se guardará como resultado oficial.`)) {
      await accionDirecto(id, 'finalizar');
    }
  } else if (action === 'edit-partido') {
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

// Casilla «Pro» de la lista de equipos: se guarda al marcarla.
panels.equipos.addEventListener('change', async (e) => {
  const chk = e.target.closest('.chk-pro');
  if (!chk) return;
  chk.disabled = true;
  try {
    await fetchJson(`/api/admin/equipos/${chk.dataset.id}/profesional`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profesional: chk.checked }),
    });
    const t = teamsCache.find((x) => String(x.id) === chk.dataset.id);
    if (t) t.profesional = chk.checked;
  } catch (err) {
    chk.checked = !chk.checked;
    alert(err.message);
  }
  chk.disabled = false;
});
