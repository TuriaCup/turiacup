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
