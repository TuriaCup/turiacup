// Mini plano esquemático de la instalación para la ficha del partido.
// Script clásico: define la función global miniPlanoHtml(venue). Va después de utils.js.
(function () {
  const NARANJA = '#ff7900';
  const GRIS = '#c4c4c4';
  const TXT = '#666';

  // Cada campo: caja (x, y, ancho, alto) y, si hace falta, giro. Se pinta en naranja si es el del partido.
  function campo(n, activo, x, y, w, h, giro, tx, ty) {
    const g = giro ? ` transform="rotate(${giro[0]} ${giro[1]} ${giro[2]})"` : '';
    const rect = activo
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${NARANJA}" fill-opacity="0.85" stroke="${NARANJA}"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${GRIS}"/>`;
    const num = `<text x="${tx}" y="${ty}" text-anchor="middle" font-size="12" font-weight="700" fill="${activo ? '#fff' : TXT}">${n}</text>`;
    return { rect: `<g${g}>${rect}</g>`, num };
  }

  const flecha = (d) => `<path d="${d}" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  const cafeteria = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="8" fill="#9333ea"/>`
    + `<path d="M${cx - 3.5} ${cy - 1.5} h6 v3.5 a2.5 2.5 0 0 1 -2.5 2.5 h-1 a2.5 2.5 0 0 1 -2.5 -2.5 z" fill="#fff"/>`
    + `<path d="M${cx + 2.5} ${cy - 0.5} h1 a1.6 1.6 0 0 1 0 3.2 h-1" fill="none" stroke="#fff" stroke-width="1.1"/>`
    + `<path d="M${cx - 1.5} ${cy - 3} v-1.2 M${cx + 0.8} ${cy - 3} v-1.2" stroke="#fff" stroke-width="0.9" stroke-linecap="round"/>`;
  const banos = (x, y) => `<rect x="${x}" y="${y}" width="11" height="11" rx="3" fill="#0d9488"/>`;
  const vestuarios = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#db2777" fill-opacity="0.45"/>`;
  const grada = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="#16a34a" fill-opacity="0.6"/>`;
  const parking = (x, y) => `<rect x="${x}" y="${y}" width="13" height="13" rx="3" fill="#2563eb"/><text x="${x + 6.5}" y="${y + 10.3}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">P</text>`;

  const PLANOS = {
    cracks: {
      nombre: 'Cracks',
      campos: (a) => [
        campo(1, a === 1, 40, 18, 48, 48, null, 64, 46),
        campo(2, a === 2, 88, 18, 46, 48, null, 111, 46),
        campo(3, a === 3, 142, 56, 48, 46, null, 166, 83),
      ],
      extra: [
        vestuarios(40, 69, 68, 7), vestuarios(134, 58, 6, 42),
        cafeteria(18, 20), banos(76, 84),
        flecha('M104 116 L104 96 M98 102 L104 95 L110 102'),
        flecha('M6 66 L26 56 M17 55 L27 55 L24 65'),
      ],
    },
    camarena: {
      nombre: 'Resort Camarena',
      campos: (a) => [
        campo(1, a === 1, 30, 30, 30, 30, [-40, 60, 45], 48, 59),
        campo(2, a === 2, 60, 30, 30, 30, [-40, 60, 45], 72, 39),
        campo(3, a === 3, 100, 60, 30, 30, [40, 130, 75], 118, 69),
        campo(4, a === 4, 130, 60, 30, 30, [40, 130, 75], 142, 89),
      ],
      extra: [
        `<g transform="rotate(40 130 75)">${grada(100, 92, 49, 5)}${vestuarios(164, 58, 7, 34)}</g>`,
        cafeteria(168, 62),
        parking(14, 14), parking(14, 76),
        flecha('M58 118 L72 104 M62 104 L73 103 L72 114'),
      ],
    },
    beniferri: {
      nombre: 'Beniferri',
      campos: (a) => [
        campo(2, a === 2, 22, 48, 78, 62, null, 61, 82),
        campo(1, a === 1, 100, 48, 78, 62, null, 139, 82),
      ],
      extra: [
        vestuarios(72, 30, 80, 14),
        grada(108, 112, 62, 5),
        cafeteria(64, 36), banos(46, 31),
        flecha('M12 12 L24 40 M14 30 L25 42 L28 30'),
      ],
    },
  };

  function detectar(venue) {
    const v = String(venue || '').toLowerCase();
    const num = (v.match(/campo\s*(\d+)/) || [])[1];
    let clave = null;
    if (v.includes('cracks')) clave = 'cracks';
    else if (v.includes('camarena') || v.includes('resort')) clave = 'camarena';
    else if (v.includes('beniferri')) clave = 'beniferri';
    return { clave, campo: num ? Number(num) : null };
  }

  window.miniPlanoHtml = function (venue) {
    const { clave, campo: n } = detectar(venue);
    const plano = clave && PLANOS[clave];
    if (!plano || !n) return '';
    const cs = plano.campos(n);
    if (!cs.some((c) => c.rect.includes(NARANJA))) return '';
    return `
      <div class="miniplano">
        <svg viewBox="0 0 200 120" role="img" aria-label="Plano de ${plano.nombre}: campo ${n}">
          <rect width="200" height="120" rx="8" fill="#f1f1f1"/>
          ${cs.map((c) => c.rect).join('')}
          ${cs.map((c) => c.num).join('')}
          ${plano.extra.join('')}
        </svg>
        <p><span class="miniplano-num">${n}</span> Campo ${n} · ${plano.nombre}</p>
      </div>`;
  };
})();
