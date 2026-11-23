const content = document.getElementById('content');
const params = new URLSearchParams(location.search);
const categoria = (params.get('categoria') || '').toUpperCase();
const fase = params.get('fase') || 'oro';
const equipoId = params.get('equipo');

const NOMBRE_FASE = { oro: '🥇 Oro', plata: '🥈 Plata', bronce: '🥉 Bronce' };

function renderMatchCard(m) {
  const jugado = m.played;
  const meta = [formatFechaHora(m.scheduled_at)];
  if (m.venue) meta.push(m.venue);
  const mio = equipoId && [m.home_team_id, m.away_team_id].some((i) => Number(i) === Number(equipoId));
  const fila = (id, nombre, goles) => `
    <div class="mc-row${equipoId && Number(id) === Number(equipoId) ? ' mc-yo' : ''}">
      <span class="mc-name">${escapeHtml(nombre)}</span>
      <span class="mc-score">${jugado ? goles : ''}</span>
    </div>`;
  return `
    <div class="match-card mc${mio ? ' mc-yo-card' : ''}">
      <div class="mc-teams">
        ${fila(m.home_team_id, m.home_team_name, m.home_score)}
        ${fila(m.away_team_id, m.away_team_name, m.away_score)}
        <div class="mc-meta">${meta.map(escapeHtml).join(' · ')}</div>
      </div>
      <a class="match-ficha" href="partido.html?id=${m.id}" aria-label="Ver ficha del partido"></a>
    </div>`;
}

function renderRondas(partidos) {
  if (!partidos.length) return '<p class="empty-state">Cruces por definir.</p>';
  const rondas = [];
  for (const m of partidos) {
    const nombre = m.round_name || 'Cruces';
    let r = rondas.find((x) => x.nombre === nombre);
    if (!r) rondas.push(r = { nombre, partidos: [] });
    r.partidos.push(m);
  }
  const chips = rondas.map((r, i) =>
    `<button type="button" class="ronda-chip${i === 0 ? ' active' : ''}" data-i="${i}">${escapeHtml(r.nombre)}</button>`).join('');
  const cols = rondas.map((r) => `
    <div class="bracket-col">
      ${r.partidos.map(renderMatchCard).join('')}
    </div>`).join('');
  return `
    <div class="ronda-chips" id="rondaChips">${chips}</div>
    <div class="bracket" id="bracket">${cols}</div>
    <p class="bracket-hint">Desliza para ver las rondas →</p>`;
}

function activarBracket() {
  const bracket = document.getElementById('bracket');
  if (!bracket) return;
  const chips = [...document.querySelectorAll('#rondaChips .ronda-chip')];
  const cols = [...bracket.children];
  const irA = (i, suave) => bracket.scrollTo({ left: cols[i].offsetLeft - cols[0].offsetLeft, behavior: suave ? 'smooth' : 'auto' });
  chips.forEach((c) => c.addEventListener('click', () => irA(Number(c.dataset.i), true)));
  bracket.addEventListener('scroll', () => {
    let activa = 0;
    cols.forEach((col, i) => { if (col.offsetLeft - cols[0].offsetLeft <= bracket.scrollLeft + 40) activa = i; });
    chips.forEach((c, i) => c.classList.toggle('active', i === activa));
  }, { passive: true });
  // Empezar en la ronda del equipo que viene de su perfil: la primera con un partido suyo sin jugar (o la última suya)
  if (equipoId) {
    const suyas = cols.map((col, i) => ({ i, sinJugar: col.querySelector('.mc-yo-card') && !/\d/.test(col.querySelector('.mc-yo-card .mc-score').textContent) }));
    const objetivo = suyas.find((x) => x.sinJugar) || [...suyas].reverse().find((x) => cols[x.i].querySelector('.mc-yo-card'));
    if (objetivo && objetivo.i > 0) irA(objetivo.i, false);
  }
}

async function load() {
  if (!categoria) {
    content.innerHTML = '<p class="empty-state">Falta la categoría.</p>';
    return;
  }
  try {
    const { publicado, visible, partidos } =
      await fetchJson(`/api/partidos?categoria=${encodeURIComponent(categoria)}&fase=${encodeURIComponent(fase)}`);
    if (!visible) {
      content.innerHTML = noPublicadoHtml();
      return;
    }
    document.title = `Cuadro ${fase} ${categoria} — Turia Cup`;
    const eq = equipoId ? `&equipo=${encodeURIComponent(equipoId)}` : '';
    const tabs = Object.keys(NOMBRE_FASE).map((f) =>
      `<a class="fase-tab${f === fase ? ' active' : ''}" href="cuadro.html?categoria=${encodeURIComponent(categoria)}&fase=${f}${eq}">${NOMBRE_FASE[f]}</a>`).join('');
    content.innerHTML = `
      ${publicado ? '' : avisoInternoHtml()}
      <h1>Fase final ${escapeHtml(categoria)}</h1>
      <div class="fase-tabs">${tabs}</div>
      ${renderRondas(partidos)}
      <p style="margin-top:24px">${equipoId
        ? `<a href="equipo.html?id=${encodeURIComponent(equipoId)}">← Volver al equipo</a>`
        : `<a href="torneo.html?categoria=${encodeURIComponent(categoria)}">← Volver a clasificación</a>`}</p>`;
    activarBracket();
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}
load();
