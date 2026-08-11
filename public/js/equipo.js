const content = document.getElementById('content');
const teamId = new URLSearchParams(location.search).get('id');

function renderMatchCard(m, teamId) {
  const scoreHtml = m.played
    ? `<span class="match-score">${m.home_score} - ${m.away_score}</span>`
    : `<span class="match-meta">${escapeHtml(formatFechaHora(m.scheduled_at))}</span>`;

  const meta = [];
  if (m.played) meta.push(formatFecha(m.scheduled_at));
  if (m.venue) meta.push(escapeHtml(m.venue));
  if (m.round_name) meta.push(escapeHtml(m.round_name));
  else if (m.group_name) meta.push(`Grupo ${escapeHtml(m.group_name)}`);

  return `
    <div class="match-card">
      <div class="match-teams">
        <a href="equipo.html?id=${m.home_team_id}">${escapeHtml(m.home_team_name)}</a>
        <span>vs</span>
        <a href="equipo.html?id=${m.away_team_id}">${escapeHtml(m.away_team_name)}</a>
      </div>
      ${scoreHtml}
      ${meta.length ? `<span class="match-meta">${meta.join(' · ')}</span>` : ''}
    </div>
  `;
}

function renderMatchList(matches, emptyText) {
  if (!matches.length) return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
  return `<div class="match-list">${matches.map((m) => renderMatchCard(m)).join('')}</div>`;
}

async function load() {
  if (!teamId) {
    content.innerHTML = '<p class="empty-state">Falta el identificador del equipo.</p>';
    return;
  }

  try {
    const { equipo, jugadores, proximos, jugados } = await fetchJson(`/api/equipos/${encodeURIComponent(teamId)}`);

    document.title = `${equipo.name} — Turia Cup`;

    const rosterRows = jugadores.length
      ? jugadores.map((j) => `
          <tr>
            <td>${j.dorsal ?? ''}</td>
            <td><a href="jugador.html?id=${j.id}">${escapeHtml(j.nombre)} ${escapeHtml(j.apellidos)}</a></td>
            <td>${j.fecha_nacimiento ? formatFecha(j.fecha_nacimiento) : ''}</td>
          </tr>
        `).join('')
      : '';

    content.innerHTML = `
      <div class="entity-header">
        ${equipo.logo_url ? `<img src="${escapeHtml(equipo.logo_url)}" alt="">` : ''}
        <div>
          <h1>${escapeHtml(equipo.name)}</h1>
          <div class="entity-meta">
            ${escapeHtml(equipo.category)}${equipo.group_name ? ` · Grupo ${escapeHtml(equipo.group_name)}` : ''}${equipo.city ? ` · ${escapeHtml(equipo.city)}` : ''}
          </div>
        </div>
      </div>

      <h2>Plantilla</h2>
      ${jugadores.length ? `
        <table class="roster-table">
          <thead><tr><th>Dorsal</th><th>Jugador</th><th>Fecha de nacimiento</th></tr></thead>
          <tbody>${rosterRows}</tbody>
        </table>
      ` : '<p class="empty-state">Plantilla aún no publicada.</p>'}

      <h2 class="subsection-title">Próximos partidos</h2>
      ${renderMatchList(proximos, 'No hay próximos partidos programados.')}

      <h2 class="subsection-title">Partidos jugados</h2>
      ${renderMatchList(jugados, 'Todavía no ha jugado ningún partido.')}
    `;
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

load();
