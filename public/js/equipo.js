const content = document.getElementById('content');
const teamId = new URLSearchParams(location.search).get('id');

function renderMatchCard(m) {
  return matchCardHtml(m, teamId);
}

function renderMatchList(matches, emptyText) {
  if (!matches.length) return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
  return `<div class="match-list">${matches.map((m) => renderMatchCard(m)).join('')}</div>`;
}

function renderClasificacion(rows) {
  if (!rows.length) return '<p class="empty-state">Clasificación aún no disponible.</p>';
  return tablaGrupoHtml(rows, { miId: teamId });
}

const NOMBRE_FASE = { oro: '🥇 Oro', plata: '🥈 Plata', bronce: '🥉 Bronce' };

function renderRondas(partidos) {
  const rondas = [];
  for (const m of partidos) {
    const nombre = m.round_name || 'Cruces';
    let r = rondas.find((x) => x.nombre === nombre);
    if (!r) rondas.push(r = { nombre, partidos: [] });
    r.partidos.push(m);
  }
  return rondas.map((r) => `
    <h3 class="ronda-titulo">${escapeHtml(r.nombre)}</h3>
    <div class="match-list">${r.partidos.map(renderMatchCard).join('')}</div>`).join('');
}

function renderCuadro(fase, partidos) {
  const mios = partidos.filter((m) => Number(m.home_team_id) === Number(teamId) || Number(m.away_team_id) === Number(teamId));
  const hayMas = partidos.length > mios.length;
  return `
    <h2 class="subsection-title">Fase final · ${NOMBRE_FASE[fase] || escapeHtml(fase)}</h2>
    ${renderRondas(mios)}
    ${hayMas ? `<a class="btn-cuadro" href="cuadro.html?categoria=${encodeURIComponent(partidos[0].category)}&fase=${encodeURIComponent(fase)}&equipo=${encodeURIComponent(teamId)}">Ver todo el cuadro</a>` : ''}`;
}

async function loadClasificacionEquipo(equipo, todos) {
  const panel = document.getElementById('panelClasificacion');
  try {
    let html = '';
    if (equipo.group_name) {
      const { clasificacion } = await fetchJson(
        `/api/clasificacion?categoria=${encodeURIComponent(equipo.category)}&grupo=${encodeURIComponent(equipo.group_name)}`);
      html += `${cabeceraGrupoHtml(equipo.group_name, clasificacion.length)}${renderClasificacion(clasificacion)}`;
    } else {
      html += '<p class="empty-state">Este equipo aún no tiene grupo asignado.</p>';
    }
    // Fase final: solo si el equipo ya tiene algún partido de oro/plata/bronce
    const fasePropia = todos.find((m) => ['oro', 'plata', 'bronce'].includes(m.phase));
    if (fasePropia) {
      const { partidos } = await fetchJson(
        `/api/partidos?categoria=${encodeURIComponent(equipo.category)}&fase=${fasePropia.phase}`);
      html += renderCuadro(fasePropia.phase, partidos);
    }
    panel.innerHTML = html;
  } catch (err) {
    panel.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

async function load() {
  if (!teamId) {
    content.innerHTML = '<p class="empty-state">Falta el identificador del equipo.</p>';
    return;
  }

  try {
    const { publicado, visible, equipo, jugadores, staff, proximos, jugados } =
      await fetchJson(`/api/equipos/${encodeURIComponent(teamId)}`);

    if (!visible) {
      content.innerHTML = noPublicadoHtml();
      return;
    }

    document.title = `${equipo.name} — Turia Cup`;

    const rosterRows = jugadores.length
      ? jugadores.map((j) => `
          <tr>
            <td>${j.dorsal ?? ''}</td>
            <td><a href="jugador.html?id=${j.id}">${escapeHtml(j.nombre)} ${escapeHtml(j.apellidos)}</a></td>
            <td>${j.anio_nacimiento ? escapeHtml(j.anio_nacimiento) : ''}</td>
          </tr>
        `).join('')
      : '';

    content.innerHTML = `
      ${publicado ? '' : avisoInternoHtml()}
      <div class="entity-header">
        ${equipo.logo_url ? `<img src="${escapeHtml(equipo.logo_url)}" alt="">` : ''}
        <div>
          <h1>${escapeHtml(equipo.name)}</h1>
          <div class="entity-meta">
            ${escapeHtml(equipo.category)}${equipo.group_name ? ` · Grupo ${escapeHtml(equipo.group_name)}` : ''}${equipo.city ? ` · ${escapeHtml(equipo.city)}` : ''}
          </div>
        </div>
      </div>

      <div class="tabs" id="equipoTabs">
        <button class="tab-btn active" data-tab="plantilla">Plantilla</button>
        <button class="tab-btn" data-tab="partidos">Partidos</button>
        <button class="tab-btn" data-tab="clasificacion">Clasificación</button>
      </div>

      <div class="tab-panel" id="panelPlantilla">
        ${jugadores.length ? `
          <table class="roster-table">
            <thead><tr><th>Dorsal</th><th>Jugador</th><th>Año</th></tr></thead>
            <tbody>${rosterRows}</tbody>
          </table>
        ` : '<p class="empty-state">Plantilla aún no publicada.</p>'}

        ${(staff || []).length ? `
          <h2 class="subsection-title">Cuerpo técnico</h2>
          <table class="roster-table">
            <thead><tr><th>Nombre</th><th>Cargo</th></tr></thead>
            <tbody>${staff.map((t) => `
              <tr>
                <td>${escapeHtml(t.nombre)} ${escapeHtml(t.apellidos)}</td>
                <td>${t.cargo ? escapeHtml(t.cargo) : ''}</td>
              </tr>`).join('')}</tbody>
          </table>` : ''}
      </div>

      <div class="tab-panel" id="panelClasificacion" hidden><p class="empty-state">Cargando…</p></div>

      <div class="tab-panel" id="panelPartidos" hidden>
        <h2>Próximos partidos</h2>
        ${renderMatchList(proximos, 'No hay próximos partidos programados.')}
        <h2 class="subsection-title">Partidos jugados</h2>
        ${renderMatchList(jugados, 'Todavía no ha jugado ningún partido.')}
      </div>
    `;

    const tabs = content.querySelectorAll('#equipoTabs .tab-btn');
    tabs.forEach((btn) => btn.addEventListener('click', () => {
      tabs.forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('panelPlantilla').hidden = btn.dataset.tab !== 'plantilla';
      document.getElementById('panelPartidos').hidden = btn.dataset.tab !== 'partidos';
      document.getElementById('panelClasificacion').hidden = btn.dataset.tab !== 'clasificacion';
    }));
    loadClasificacionEquipo(equipo, [...proximos, ...jugados]);
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

load();
