const catPills = document.querySelectorAll('#catPills .cat-pill');
const tabBtns = document.querySelectorAll('#sectionTabs .tab-btn');
const panelClasificacion = document.getElementById('panelClasificacion');
const panelEquipos = document.getElementById('panelEquipos');

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

function matchTeamLink(id, name) {
  return `<a href="equipo.html?id=${encodeURIComponent(id)}">${escapeHtml(name)}</a>`;
}

function renderMatchCard(m) {
  const scoreHtml = m.played
    ? `<span class="match-score">${m.home_score} - ${m.away_score}</span>`
    : `<span class="match-meta">${escapeHtml(formatFechaHora(m.scheduled_at))}</span>`;

  const meta = [];
  if (m.played) meta.push(formatFecha(m.scheduled_at));
  if (m.venue) meta.push(escapeHtml(m.venue));
  if (m.round_name) meta.push(escapeHtml(m.round_name));
  else if (m.group_name) meta.push(`Grupo ${escapeHtml(m.group_name)}`);

  const scorers = (m.goles || [])
    .map((g) => `${escapeHtml(g.nombre)} ${escapeHtml(g.apellidos)} (${g.count})`)
    .join(' · ');

  return `
    <div class="match-card">
      <div class="match-teams">
        ${matchTeamLink(m.home_team_id, m.home_team_name)}
        <span>vs</span>
        ${matchTeamLink(m.away_team_id, m.away_team_name)}
      </div>
      ${scoreHtml}
      ${meta.length ? `<span class="match-meta">${meta.join(' · ')}</span>` : ''}
      ${scorers ? `<div class="match-scorers">⚽ ${scorers}</div>` : ''}
    </div>
  `;
}

function renderMatchList(container, matches, emptyText) {
  if (!matches.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }
  container.innerHTML = matches.map(renderMatchCard).join('');
}

function renderStandingsTable(rows) {
  if (!rows.length) return '<p class="empty-state">Sin equipos en este grupo.</p>';
  const body = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${matchTeamLink(r.team_id, r.name)}</td>
      <td>${r.pj}</td>
      <td>${r.pg}</td>
      <td>${r.pe}</td>
      <td>${r.pp}</td>
      <td>${r.gf}</td>
      <td>${r.gc}</td>
      <td>${r.dg}</td>
      <td class="pts">${r.pts}</td>
    </tr>
  `).join('');

  return `
    <table class="standings-table">
      <thead>
        <tr>
          <th>#</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th>
          <th>GF</th><th>GC</th><th>DG</th><th>Pts</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
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
          <div class="group-block">
            <h3>Grupo ${escapeHtml(grupo)}</h3>
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
        <h3>${escapeHtml(e.name)}</h3>
        <div class="team-meta">${e.city ? escapeHtml(e.city) : ''}${e.group_name ? ` · Grupo ${escapeHtml(e.group_name)}` : ''}</div>
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

setActiveCat();
setActiveTab();
loadCurrentTab();
