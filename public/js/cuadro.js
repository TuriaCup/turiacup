const content = document.getElementById('content');
const params = new URLSearchParams(location.search);
const categoria = (params.get('categoria') || '').toUpperCase();
const fase = params.get('fase') || 'oro';
const equipoId = params.get('equipo');

const NOMBRE_FASE = { oro: '🥇 Oro', plata: '🥈 Plata', bronce: '🥉 Bronce' };

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
      ${cuadroHtml(partidos, equipoId)}
      <p style="margin-top:24px">${equipoId
        ? `<a href="equipo.html?id=${encodeURIComponent(equipoId)}">← Volver al equipo</a>`
        : `<a href="torneo.html?categoria=${encodeURIComponent(categoria)}">← Volver a clasificación</a>`}</p>`;
    activarCuadro(equipoId);
  } catch (err) {
    content.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}
load();
