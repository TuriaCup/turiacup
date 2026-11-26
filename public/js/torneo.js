const catPills = document.querySelectorAll('#catPills .cat-pill');
const tabBtns = document.querySelectorAll('#sectionTabs .tab-btn');
const panelClasificacion = document.getElementById('panelClasificacion');
const panelEquipos = document.getElementById('panelEquipos');
const catPillsBox = document.getElementById('catPills');
const sectionTabs = document.getElementById('sectionTabs');
const avisoInterno = document.getElementById('avisoInterno');
const noPublicado = document.getElementById('noPublicado');

const state = {
  categoria: new URLSearchParams(location.search).get('categoria') || 'U9',
  tab: 'clasificacion',
};

function setActiveCat() {
  catPills.forEach((btn) => btn.classList.toggle('active', btn.dataset.cat === state.categoria));
}

function setActiveTab() {
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.tab));
  panelClasificacion.hidden = state.tab !== 'clasificacion';
  panelEquipos.hidden = state.tab !== 'equipos';
}

function renderMatchCard(m) {
  return matchCardHtml(m, null);
}

function renderMatchList(container, matches, emptyText) {
  if (!matches.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }
  container.innerHTML = matches.map(renderMatchCard).join('');
}

function renderStandingsTable(rows) {
  return tablaGrupoHtml(rows, { enlaces: true });
}

async function loadClasificacionTab() {
  const gruposContainer = document.getElementById('gruposContainer');
  const proximosContainer = document.getElementById('proximosContainer');
  const resultadosContainer = document.getElementById('resultadosContainer');

  gruposContainer.innerHTML = '<p class="empty-state">Cargando…</p>';

  try {
    const { equipos } = await fetchJson(`/api/equipos?categoria=${encodeURIComponent(state.categoria)}`);
    const grupos = [...new Set(equipos.map((e) => e.group_name).filter(Boolean))].sort();

    if (grupos.length === 0) {
      gruposContainer.innerHTML = '<p class="empty-state">Todavía no hay grupos asignados en esta categoría.</p>';
    } else {
      const tables = await Promise.all(grupos.map(async (grupo) => {
        const { clasificacion } = await fetchJson(
          `/api/clasificacion?categoria=${encodeURIComponent(state.categoria)}&grupo=${encodeURIComponent(grupo)}`
        );
        return `
          <div class="grupo-bloque">
            ${cabeceraGrupoHtml(grupo, clasificacion.length)}
            ${renderStandingsTable(clasificacion)}
          </div>
        `;
      }));
      gruposContainer.innerHTML = tables.join('');
    }
  } catch (err) {
    gruposContainer.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }

  try {
    const { partidos } = await fetchJson(
      `/api/partidos?categoria=${encodeURIComponent(state.categoria)}&fase=grupos`
    );
    renderMatchList(proximosContainer, partidos.filter((p) => !p.played), 'No hay próximos partidos programados.');
    renderMatchList(
      resultadosContainer,
      partidos.filter((p) => p.played).slice().reverse(),
      'Todavía no se han jugado partidos.'
    );
  } catch (err) {
    proximosContainer.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    resultadosContainer.innerHTML = '';
  }

  await Promise.all([
    loadFase('oro', document.getElementById('faseOro')),
    loadFase('plata', document.getElementById('fasePlata')),
    loadFase('bronce', document.getElementById('faseBronce')),
  ]);
}

async function loadFase(fase, container) {
  try {
    const { partidos } = await fetchJson(
      `/api/partidos?categoria=${encodeURIComponent(state.categoria)}&fase=${fase}`
    );
    renderMatchList(container, partidos, 'Cruces por definir.');
  } catch (err) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

async function loadEquiposTab() {
  const teamGrid = document.getElementById('teamGrid');
  teamGrid.innerHTML = '<p class="empty-state">Cargando…</p>';
  try {
    const { equipos } = await fetchJson(`/api/equipos?categoria=${encodeURIComponent(state.categoria)}`);
    if (!equipos.length) {
      teamGrid.innerHTML = '<p class="empty-state">Todavía no hay equipos inscritos en esta categoría.</p>';
      return;
    }
    teamGrid.innerHTML = equipos.map((e) => `
      <a class="team-card" href="equipo.html?id=${encodeURIComponent(e.id)}">
        ${crestHtml(e.logo_url)}
        <div class="team-card-txt">
          <h3>${escapeHtml(e.name)}</h3>
          <div class="team-meta">${[e.city ? escapeHtml(e.city) : '', e.group_name ? `Grupo ${escapeHtml(e.group_name)}` : ''].filter(Boolean).join(' · ')}</div>
        </div>
      </a>
    `).join('');
  } catch (err) {
    teamGrid.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function loadCurrentTab() {
  if (state.tab === 'clasificacion') loadClasificacionTab();
  else loadEquiposTab();
}

catPills.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.categoria = btn.dataset.cat;
    setActiveCat();
    loadCurrentTab();
  });
});

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.tab = btn.dataset.tab;
    setActiveTab();
    loadCurrentTab();
  });
});

// --- Estado de publicación ---

function mostrarNoPublicado() {
  noPublicado.hidden = false;
  catPillsBox.hidden = true;
  sectionTabs.hidden = true;
  panelClasificacion.hidden = true;
  panelEquipos.hidden = true;
}

function mostrarAvisoInterno() {
  avisoInterno.hidden = false;
  avisoInterno.textContent =
    '🔒 Vista interna: el torneo todavía no es público. Lo estás viendo porque tienes la sesión de administrador abierta.';
}

async function init() {
  try {
    const { publicado, visible } = await fetchJson('/api/equipos');
    if (!visible) {
      mostrarNoPublicado();
      return;
    }
    if (!publicado) mostrarAvisoInterno();
  } catch {
    // si no se puede consultar el estado, se intenta cargar el torneo igualmente
  }

  setActiveCat();
  setActiveTab();
  loadCurrentTab();
}

init();
