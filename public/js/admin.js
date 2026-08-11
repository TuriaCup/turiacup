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
const panels = {
  equipos: document.getElementById('panelEquipos'),
  plantillas: document.getElementById('panelPlantillas'),
  partidos: document.getElementById('panelPartidos'),
};

let currentTab = 'equipos';

// --- Auth ---

async function checkAuth() {
  const { authenticated } = await fetchJson('/api/admin/me');
  loginSection.hidden = authenticated;
  dashboardSection.hidden = !authenticated;
  logoutBtn.hidden = !authenticated;
  if (authenticated) {
    await loadTeamsCache();
    showTab(currentTab);
  }
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
}

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
