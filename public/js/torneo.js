const catPills = document.querySelectorAll('#catPills .cat-pill');
const tabBtns = document.querySelectorAll('#sectionTabs .tab-btn');
const PANELES = {
  clasificacion: document.getElementById('panelClasificacion'),
  resultados: document.getElementById('panelResultados'),
  final: document.getElementById('panelFinal'),
  equipos: document.getElementById('panelEquipos'),
};
const catPillsBox = document.getElementById('catPills');
const sectionTabs = document.getElementById('sectionTabs');
const avisoInterno = document.getElementById('avisoInterno');
const noPublicado = document.getElementById('noPublicado');

// El estado va en la URL: cada grupo y cada cuadro tiene su propio enlace
// (torneo.html?categoria=U10&tab=clasificacion&grupo=B, …&tab=final&fase=plata).
const qs = new URLSearchParams(location.search);
const state = {
  categoria: (qs.get('categoria') || 'U9').toUpperCase(),
  tab: PANELES[qs.get('tab')] ? qs.get('tab') : 'clasificacion',
  grupo: (qs.get('grupo') || '').toUpperCase(),
  fase: ['oro', 'plata', 'bronce'].includes(qs.get('fase')) ? qs.get('fase') : 'oro',
};

function guardarUrl() {
  const p = new URLSearchParams({ categoria: state.categoria, tab: state.tab });
  if (state.tab === 'clasificacion' && state.grupo) p.set('grupo', state.grupo);
  if (state.tab === 'final') p.set('fase', state.fase);
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function setActiveCat() {
  catPills.forEach((btn) => btn.classList.toggle('active', btn.dataset.cat === state.categoria));
}

function setActiveTab() {
  tabBtns.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.tab));
  for (const [k, el] of Object.entries(PANELES)) el.hidden = state.tab !== k;
}

function renderMatchList(container, matches, emptyText) {
  if (!matches.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
    return;
  }
  container.innerHTML = matches.map((m) => matchCardHtml(m, null)).join('');
}

// --- Clasificación: una subpestaña por grupo, con su tabla y sus partidos ---

async function loadClasificacionTab() {
  const pills = document.getElementById('grupoPills');
  const tabla = document.getElementById('grupoContainer');
  const proximos = document.getElementById('grupoProximos');
  const resultados = document.getElementById('grupoResultados');
  tabla.innerHTML = '<p class="empty-state">Cargando…</p>';
  proximos.innerHTML = '';
  resultados.innerHTML = '';
  try {
    const { equipos } = await fetchJson(`/api/equipos?categoria=${encodeURIComponent(state.categoria)}`);
    const grupos = [...new Set(equipos.map((e) => e.group_name).filter(Boolean))].sort();
    if (!grupos.length) {
      pills.innerHTML = '';
      tabla.innerHTML = '<p class="empty-state">Todavía no hay grupos asignados en esta categoría.</p>';
      return;
    }
    if (state.grupo !== 'POS' && !grupos.includes(state.grupo)) state.grupo = grupos[0];
    guardarUrl();
    pills.innerHTML = grupos.map((g) =>
      `<button type="button" class="ronda-chip${g === state.grupo ? ' active' : ''}" data-grupo="${escapeHtml(g)}">Grupo ${escapeHtml(g)}</button>`).join('')
      + `<button type="button" class="ronda-chip${state.grupo === 'POS' ? ' active' : ''}" data-grupo="POS">Por posiciones</button>`;
    document.getElementById('grupoPartidos').hidden = state.grupo === 'POS';
    if (state.grupo === 'POS') {
      const { clasificacion } = await fetchJson(`/api/clasificacion?categoria=${encodeURIComponent(state.categoria)}`);
      tabla.innerHTML = clasificacionPorPosicionesHtml(clasificacion, grupos);
      return;
    }

    const [{ clasificacion }, { partidos }] = await Promise.all([
      fetchJson(`/api/clasificacion?categoria=${encodeURIComponent(state.categoria)}&grupo=${encodeURIComponent(state.grupo)}`),
      fetchJson(`/api/partidos?categoria=${encodeURIComponent(state.categoria)}&fase=grupos`),
    ]);
    tabla.innerHTML = `
      <div class="grupo-bloque">
        ${cabeceraGrupoHtml(state.grupo, clasificacion.length)}
        ${tablaGrupoHtml(clasificacion, { enlaces: true })}
      </div>`;
    const delGrupo = partidos.filter((p) => p.group_name === state.grupo);
    renderMatchList(proximos, delGrupo.filter((p) => !p.played), 'No quedan partidos por jugar en este grupo.');
    renderMatchList(resultados, delGrupo.filter((p) => p.played).slice().reverse(), 'Todavía no se han jugado partidos en este grupo.');
  } catch (err) {
    tabla.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

// --- Clasificación por posiciones: los mejores primeros, segundos… de todos los grupos ---
// El API devuelve la categoría entera ya ordenada (puntos, diferencia, goles a favor, nombre); dentro de cada
// grupo ese orden es su clasificación, y entre grupos sirve para comparar equipos de la misma posición.
const NOMBRE_POS = ['Primeros', 'Segundos', 'Terceros', 'Cuartos', 'Quintos', 'Sextos', 'Séptimos', 'Octavos'];

function fasePorPosicion(pos, rank) {   // pos y rank empiezan en 1
  if (pos <= 3 || (pos === 4 && rank === 1)) return 'oro';
  if (pos <= 6 || (pos === 7 && rank <= 2)) return 'plata';
  return 'bronce';
}

function clasificacionPorPosicionesHtml(filas, grupos) {
  const porGrupo = Object.fromEntries(grupos.map((g) => [g, filas.filter((f) => f.group_name === g)]));
  const maxPos = Math.max(...grupos.map((g) => porGrupo[g].length));
  const dg = (n) => `${n > 0 ? '+' : ''}${n}`;
  const NOM = { oro: '🥇 Oro', plata: '🥈 Plata', bronce: '🥉 Bronce' };
  let html = '<p class="tg-leyenda">Se comparan los equipos que ocupan la misma posición en su grupo: puntos, diferencia de goles, goles a favor. A la derecha, la fase final a la que irían hoy.</p>';
  for (let p = 0; p < maxPos; p++) {
    const fila = grupos.map((g) => porGrupo[g][p]).filter(Boolean)
      .sort((a, b) => filas.indexOf(a) - filas.indexOf(b));
    html += `
      <h3 class="subsection-title">${NOMBRE_POS[p] || `${p + 1}.º`} de grupo</h3>
      <div class="tg-wrap"><table class="tg tg-pos-tabla">
        <thead><tr><th class="tg-pos">#</th><th class="tg-eq">Equipo</th><th>Gr</th><th>PJ</th><th>DG</th><th class="tg-opc">GF</th><th class="tg-pts">Pts</th><th>Fase</th></tr></thead>
        <tbody>${fila.map((r, i) => {
          const fase = fasePorPosicion(p + 1, i + 1);
          return `<tr class="tg-link" data-href="equipo.html?id=${encodeURIComponent(r.team_id)}">
            <td class="tg-pos"><span>${i + 1}</span></td>
            <td class="tg-eq"><div class="tg-club">${crestHtml(r.logo_url)}<a href="equipo.html?id=${encodeURIComponent(r.team_id)}">${escapeHtml(r.name)}</a></div></td>
            <td>${escapeHtml(r.group_name)}</td><td>${r.pj}</td>
            <td class="tg-dg ${r.dg > 0 ? 'pos' : r.dg < 0 ? 'neg' : ''}">${dg(r.dg)}</td>
            <td class="tg-opc">${r.gf}</td><td class="tg-pts"><b>${r.pts}</b></td>
            <td><span class="fase-chip fase-${fase}">${NOM[fase]}</span></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }
  return html;
}

document.getElementById('grupoPills').addEventListener('click', (e) => {
  const b = e.target.closest('[data-grupo]');
  if (!b || b.dataset.grupo === state.grupo) return;
  state.grupo = b.dataset.grupo;
  loadClasificacionTab();
});

// --- Resultados: todos los partidos de grupos de la categoría ---

async function loadResultadosTab() {
  const resultados = document.getElementById('resultadosContainer');
  const proximos = document.getElementById('proximosContainer');
  resultados.innerHTML = '<p class="empty-state">Cargando…</p>';
  proximos.innerHTML = '';
  guardarUrl();
  try {
    const { partidos } = await fetchJson(`/api/partidos?categoria=${encodeURIComponent(state.categoria)}&fase=grupos`);
    renderMatchList(resultados, partidos.filter((p) => p.played).slice().reverse(), 'Todavía no se han jugado partidos.');
    renderMatchList(proximos, partidos.filter((p) => !p.played), 'No hay próximos partidos programados.');
  } catch (err) {
    resultados.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

// --- Fase final: cuadro estilo Apple Sports (Oro, Plata, Bronce) ---

async function loadFinalTab() {
  const cont = document.getElementById('cuadroContainer');
  document.querySelectorAll('#faseTabs .fase-tab').forEach((b) => b.classList.toggle('active', b.dataset.fase === state.fase));
  cont.innerHTML = '<p class="empty-state">Cargando…</p>';
  guardarUrl();
  try {
    const { partidos } = await fetchJson(`/api/partidos?categoria=${encodeURIComponent(state.categoria)}&fase=${state.fase}`);
    cont.innerHTML = cuadroHtml(partidos, null);
    activarCuadro(null);
  } catch (err) {
    cont.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('faseTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fase]');
  if (!b || b.dataset.fase === state.fase) return;
  state.fase = b.dataset.fase;
  loadFinalTab();
});

async function loadEquiposTab() {
  const teamGrid = document.getElementById('teamGrid');
  guardarUrl();
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
  else if (state.tab === 'resultados') loadResultadosTab();
  else if (state.tab === 'final') loadFinalTab();
  else loadEquiposTab();
}

catPills.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.categoria = btn.dataset.cat;
    state.grupo = '';
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
  Object.values(PANELES).forEach((el) => { el.hidden = true; });
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
