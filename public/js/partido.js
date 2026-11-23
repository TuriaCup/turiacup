const content = document.getElementById('content');
const matchId = new URLSearchParams(location.search).get('id');

function golesHtml(goles, equipoId) {
  const lista = goles.filter((g) => g.team_id === equipoId);
  if (!lista.length) return '<p class="empty-state">Sin goleadores registrados.</p>';
  return `<ul>${lista.map((g) => `
    <li>${g.dorsal != null ? `${g.dorsal}. ` : ''}<a href="jugador.html?id=${g.player_id}">${escapeHtml(g.nombre)} ${escapeHtml(g.apellidos)}</a> ⚽ ${g.count > 1 ? `×${g.count}` : ''}</li>`).join('')}</ul>`;
}

async function load() {
  if (!matchId) {
    content.innerHTML = '<p class="empty-state">Falta el identificador del partido.</p>';
    return;
  }
  try {
    const { publicado, visible, partido: m, goles } =
      await fetchJson(`/api/partidos/${encodeURIComponent(matchId)}`);
    if (!visible) {
      content.innerHTML = noPublicadoHtml();
      return;
    }
    document.title = `${m.home_team_name} vs ${m.away_team_name} — Turia Cup`;

    const equipo = (id, name, logo) => `
      <div class="ficha-equipo">
        ${logo ? `<img src="${escapeHtml(logo)}" alt="">` : ''}
        <a href="equipo.html?id=${id}">${escapeHtml(name)}</a>
      </div>`;

    const info = [m.category];
    if (m.round_name) info.push(m.round_name);
    else if (m.group_name) info.push(`Grupo ${m.group_name}`);
    if (m.venue) info.push(m.venue);
    info.push(formatFechaHora(m.scheduled_at));

    content.innerHTML = `
      ${publicado ? '' : avisoInternoHtml()}
      <div class="ficha-marcador">
        ${equipo(m.home_team_id, m.home_team_name, m.home_logo)}
        <div class="ficha-score">${m.played ? `${m.home_score} - ${m.away_score}` : 'vs'}</div>
        ${equipo(m.away_team_id, m.away_team_name, m.away_logo)}
      </div>
      <p class="ficha-info">${info.map(escapeHtml).join(' · ')}${m.played ? '' : ' · Por jugar'}</p>
      ${m.played ? `
        <h2>Goleadores</h2>
        <div class="ficha-goles">
          <div><h3>${escapeHtml(m.home_team_name)}</h3>${golesHtml(goles, m.home_team_id)}</div>
          <div><h3>${escapeHtml(m.away_team_name)}</h3>${golesHtml(goles, m.away_team_id)}</div>
        </div>` : ''}
      <p><a href="equipo.html?id=${m.home_team_id}">← Volver a ${escapeHtml(m.home_team_name)}</a></p>
    `;
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}
load();
