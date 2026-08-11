const content = document.getElementById('content');
const playerId = new URLSearchParams(location.search).get('id');

async function load() {
  if (!playerId) {
    content.innerHTML = '<p class="empty-state">Falta el identificador del jugador.</p>';
    return;
  }

  try {
    const { jugador, totalGoles, goles } = await fetchJson(`/api/jugadores/${encodeURIComponent(playerId)}`);

    document.title = `${jugador.nombre} ${jugador.apellidos} — Turia Cup`;

    const golesRows = goles.length
      ? goles.map((g) => `
          <div class="match-card">
            <div class="match-teams">
              ${escapeHtml(g.home_team_name)} <span>vs</span> ${escapeHtml(g.away_team_name)}
            </div>
            <span class="match-score">${g.home_score} - ${g.away_score}</span>
            <span class="match-meta">${formatFecha(g.scheduled_at)}${g.round_name ? ` · ${escapeHtml(g.round_name)}` : g.group_name ? ` · Grupo ${escapeHtml(g.group_name)}` : ''}</span>
            <div class="match-scorers">⚽ ${g.count} gol${g.count > 1 ? 'es' : ''}</div>
          </div>
        `).join('')
      : '<p class="empty-state">Todavía no ha marcado goles.</p>';

    content.innerHTML = `
      <div class="entity-header">
        <div>
          <h1>${escapeHtml(jugador.nombre)} ${escapeHtml(jugador.apellidos)}</h1>
          <div class="entity-meta">
            ${jugador.dorsal ? `Dorsal ${jugador.dorsal} · ` : ''}
            <a href="equipo.html?id=${jugador.team_id}">${escapeHtml(jugador.team_name)}</a>
            · ${escapeHtml(jugador.category)}
            ${jugador.fecha_nacimiento ? ` · Nacido el ${formatFecha(jugador.fecha_nacimiento)}` : ''}
          </div>
        </div>
      </div>

      <div class="goal-stat">${totalGoles} <span>gol${totalGoles !== 1 ? 'es' : ''} marcados</span></div>

      <h2>Goles por partido</h2>
      <div class="match-list">${golesRows}</div>
    `;
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

load();
