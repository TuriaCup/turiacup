function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

function formatFecha(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(iso) {
  if (!iso) return 'Fecha por confirmar';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    // sin cuerpo JSON
  }
  if (!res.ok) {
    throw new Error((body && body.error) || `Error ${res.status}`);
  }
  return body;
}

function noPublicadoHtml() {
  return `
    <div class="proximamente">
      <h2>Próximamente</h2>
      <p>Esta información se publicará unas semanas antes del torneo.
      Mientras tanto, puedes <a href="index.html#inscripcion">inscribir a tu equipo</a>.</p>
    </div>
  `;
}

function avisoInternoHtml() {
  return '<div class="aviso-interno">🔒 Vista interna: el torneo todavía no es público. '
    + 'Lo estás viendo porque tienes la sesión de administrador abierta.</div>';
}

function crestHtml(url) {
  return url
    ? `<img class="crest" src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;crest crest-vacio&quot;></span>'">`
    : '<span class="crest crest-vacio"></span>';
}

// Tarjeta de partido (toda ella lleva a la ficha). miId marca al equipo propio y añade V/E/D.
function matchCardHtml(m, miId, destacar) {
  const jugado = Boolean(m.played);
  const live = Boolean(m.live) && !jugado;
  const hayMarcador = jugado || live;
  const esMio = (id) => miId != null && Number(id) === Number(miId);
  const participa = esMio(m.home_team_id) || esMio(m.away_team_id);

  let resultado = '';
  if (jugado && participa) {
    const local = esMio(m.home_team_id);
    const mio = local ? m.home_score : m.away_score;
    const rival = local ? m.away_score : m.home_score;
    const [clase, letra] = mio > rival ? ['gana', 'V'] : mio < rival ? ['pierde', 'D'] : ['empata', 'E'];
    resultado = `<span class="match-res ${clase}">${letra}</span>`;
  }

  const cuando = formatFechaHora(m.scheduled_at);
  const donde = m.venue ? `📍 ${m.venue}` : '';
  const etapa = m.round_name || (m.group_name ? `Grupo ${m.group_name}` : '');
  const enJuego = live ? '<div class="match-live">● EN JUEGO</div>' : '';
  const meta = [[cuando, etapa].filter(Boolean).join(' · '), donde].filter(Boolean);

  const fila = (id, nombre, logo, goles) => `
    <div class="mc-row${esMio(id) ? ' mc-yo' : ''}">
      ${crestHtml(logo)}
      <span class="mc-name">${escapeHtml(nombre)}</span>
      <span class="mc-score">${hayMarcador ? (goles ?? 0) : ''}</span>
    </div>`;

  const scorers = (m.goles || [])
    .map((g) => `${escapeHtml(g.nombre)} ${escapeHtml(g.apellidos)}${g.count > 1 ? ` (${g.count})` : ''}`).join(' · ');

  return `
    <div class="match-card mc${destacar && participa ? ' mc-yo-card' : ''}${live ? ' mc-live' : ''}">
      <div class="mc-teams">
        ${fila(m.home_team_id, m.home_team_name, m.home_logo, m.home_score)}
        ${fila(m.away_team_id, m.away_team_name, m.away_logo, m.away_score)}
        ${enJuego}
        <div class="mc-meta">${meta.map((t) => `<div>${escapeHtml(t)}</div>`).join('')}</div>
        ${scorers ? `<div class="mc-goles">⚽ ${scorers}</div>` : ''}
      </div>
      ${resultado}
      <a class="match-ficha" href="partido.html?id=${m.id}" aria-label="Ver ficha del partido"></a>
    </div>`;
}
