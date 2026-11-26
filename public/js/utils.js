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
  const penaltis = m.home_pen != null && m.away_pen != null ? `Penaltis: ${m.home_pen} - ${m.away_pen}` : '';
  const meta = [penaltis, [cuando, etapa].filter(Boolean).join(' · '), donde].filter(Boolean);

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

// Cabecera de grupo: letra grande + «n equipos»
function cabeceraGrupoHtml(nombre, numEquipos) {
  const letra = nombre ? String(nombre).slice(0, 2).toUpperCase() : '–';
  return `<div class="grupo-cab"><span class="grupo-letra">${escapeHtml(letra)}</span>
    <h3>${nombre ? `Grupo ${escapeHtml(nombre)}` : 'Sin grupo'}</h3>
    ${numEquipos != null ? `<small>${numEquipos} equipos</small>` : ''}</div>`;
}

// Tabla de clasificación de un grupo.
// rows: { team_id, name, logo_url, pj, pg, pe, pp, gf, gc, dg, pts, ficticio? }
// opciones: enlaces (nombre enlaza al club), miId (resalta ese equipo)
function tablaGrupoHtml(rows, opciones = {}) {
  if (!rows.length) return '<p class="empty-state">Sin equipos en este grupo.</p>';
  const { enlaces, miId, nuevaPestana } = opciones;
  const dg = (n) => `${n > 0 ? '+' : ''}${n}`;
  const filas = rows.map((r, i) => `
    <tr class="${miId != null && Number(r.team_id) === Number(miId) ? 'tg-yo' : ''}${enlaces ? ' tg-link' : ''}"${enlaces ? ` data-href="equipo.html?id=${encodeURIComponent(r.team_id)}"${nuevaPestana ? ' data-blank="1"' : ''}` : ''}>
      <td class="tg-pos"><span>${i + 1}</span></td>
      <td class="tg-eq${r.ficticio ? ' ficticio' : ''}"><div class="tg-club">${crestHtml(r.logo_url)}
        ${enlaces ? `<a href="equipo.html?id=${encodeURIComponent(r.team_id)}"${nuevaPestana ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(r.name)}</a>`
          : `<span class="tg-nombre">${escapeHtml(r.name)}</span>`}</div></td>
      <td>${r.pj}</td><td>${r.pg}</td><td>${r.pe}</td><td>${r.pp}</td>
      <td class="tg-opc">${r.gf}</td><td class="tg-opc">${r.gc}</td>
      <td class="tg-dg ${r.dg > 0 ? 'pos' : r.dg < 0 ? 'neg' : ''}">${dg(r.dg)}</td>
      <td class="tg-pts"><b>${r.pts}</b></td>
    </tr>`).join('');
  return `
    <div class="tg-wrap"><table class="tg">
      <thead><tr><th class="tg-pos">#</th><th class="tg-eq">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th>
        <th class="tg-opc">GF</th><th class="tg-opc">GC</th><th>DG</th><th class="tg-pts">Pts</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    <p class="tg-leyenda">PJ partidos jugados · G ganados · E empatados · P perdidos · DG diferencia de goles · Pts puntos</p>`;
}

// Clasificaciones: se puede pulsar cualquier parte de la fila para abrir la página del club.
document.addEventListener('click', (e) => {
  const fila = e.target.closest('tr.tg-link[data-href]');
  if (!fila || e.target.closest('a')) return;
  if (fila.dataset.blank) window.open(fila.dataset.href, '_blank', 'noopener');
  else location.href = fila.dataset.href;
});

// --- Cuadro de la fase final (estilo Apple Sports: una columna por ronda, se desliza) ---
// Orden de las columnas y, dentro de cada una, por número de cruce («Octavos de final · 3»):
// así el árbol queda alineado (los dos cruces de los que sale cada partido, a su altura).
const ORDEN_RONDA = ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final', 'Triangular'];
const numCruce = (m) => Number(((m.round_name || '').split(' · ')[1]) || 0);
const posRonda = (nombre) => { const i = ORDEN_RONDA.indexOf(nombre); return i < 0 ? 99 : i; };

function cuadroHtml(partidos, miId) {
  if (!partidos.length) return '<p class="empty-state">Cruces por definir.</p>';
  const rondas = [];
  partidos = [...partidos].sort((x, y) => numCruce(x) - numCruce(y));
  for (const m of partidos) {
    // «Octavos de final · 3» se agrupa en la columna «Octavos de final»
    const nombre = (m.round_name || 'Cruces').split(' · ')[0];
    let r = rondas.find((x) => x.nombre === nombre);
    if (!r) rondas.push(r = { nombre, partidos: [] });
    r.partidos.push(m);
  }
  rondas.sort((x, y) => posRonda(x.nombre) - posRonda(y.nombre));
  const chips = rondas.map((r, i) =>
    `<button type="button" class="ronda-chip${i === 0 ? ' active' : ''}" data-i="${i}">${escapeHtml(r.nombre)}</button>`).join('');
  const cols = rondas.map((r) => `
    <div class="bracket-col">
      ${r.partidos.map((m) => matchCardHtml(m, miId, true)).join('')}
    </div>`).join('');
  return `
    <div class="ronda-chips" id="rondaChips">${chips}</div>
    <div class="bracket" id="bracket">${cols}</div>
    <p class="bracket-hint">Desliza para ver las rondas →</p>`;
}

function activarCuadro(miId) {
  const bracket = document.getElementById('bracket');
  if (!bracket) return;
  const chips = [...document.querySelectorAll('#rondaChips .ronda-chip')];
  const cols = [...bracket.children];
  const irA = (i, suave) => bracket.scrollTo({ left: cols[i].offsetLeft - cols[0].offsetLeft, behavior: suave ? 'smooth' : 'auto' });
  chips.forEach((c) => c.addEventListener('click', () => irA(Number(c.dataset.i), true)));

  // Contraer / expandir (como Apple Sports): la ronda que se ve queda compacta, una tarjeta tras otra,
  // y las siguientes se colocan a media altura de los dos cruces de los que salen. El alto del cuadro
  // es el de la ronda visible, así en semis o en la final no hay que bajar tanto.
  const GAP = 14;
  let actual = -1;
  function maquetar(activa) {
    if (activa === actual) return;
    actual = activa;
    // Las posiciones se calculan aquí (no se leen del DOM, que está a mitad de la animación).
    const pos = [];
    let altoVisible = 0;
    cols.forEach((col, k) => {
      const cards = [...col.children];
      const prev = k > 0 ? pos[k - 1] : [];
      const mio = [];
      let y = 0;
      cards.forEach((card, j) => {
        const h = card.offsetHeight;
        let top = y + (j ? GAP : 0);
        if (k > activa && prev.length) {
          const par = prev.length >= 2 * cards.length;
          const a = prev[par ? 2 * j : j];
          const b = prev[par ? 2 * j + 1 : j] || a;
          if (a) top = Math.max(top, (a.top + a.h / 2 + b.top + b.h / 2) / 2 - h / 2);
        }
        card.style.marginTop = `${top - y}px`;
        mio.push({ top, h });
        y = top + h;
      });
      pos.push(mio);
      if (k === activa) altoVisible = y;
    });
    bracket.style.height = `${altoVisible + 16}px`;
  }
  let pendiente = false;
  bracket.addEventListener('scroll', () => {
    let activa = 0;
    cols.forEach((col, i) => { if (col.offsetLeft - cols[0].offsetLeft <= bracket.scrollLeft + 40) activa = i; });
    chips.forEach((c, i) => c.classList.toggle('active', i === activa));
    if (!pendiente) { pendiente = true; requestAnimationFrame(() => { pendiente = false; maquetar(activa); }); }
  }, { passive: true });
  window.addEventListener('resize', () => { const a = actual; actual = -1; maquetar(Math.max(a, 0)); });
  maquetar(0);
  // Empezar en la ronda del equipo que viene de su perfil: la primera con un partido suyo sin jugar (o la última suya)
  if (miId) {
    const suyas = cols.map((col, i) => ({ i, sinJugar: col.querySelector('.mc-yo-card') && !/\d/.test(col.querySelector('.mc-yo-card .mc-score').textContent) }));
    const objetivo = suyas.find((x) => x.sinJugar) || [...suyas].reverse().find((x) => cols[x.i].querySelector('.mc-yo-card'));
    if (objetivo && objetivo.i > 0) irA(objetivo.i, false);
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
