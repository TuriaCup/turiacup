// App del torneo (/app): una sola página con cinco pestañas abajo y fichas que se abren encima.
// Script clásico: usa las funciones globales de utils.js (escapeHtml, fetchJson, crestHtml, tablaGrupoHtml,
// cuadroHtml, clasificacionPorPosicionesHtml…) y miniplano.js (miniPlanoHtml).
// La navegación va en el hash (#partidos, #equipo/12, #partido/34) para que el botón «atrás» del móvil funcione.
// «Mi equipo» y la categoría se guardan en el propio navegador (localStorage): no hay inicio de sesión.
(function () {
  const CATEGORIAS = ['U9', 'U10', 'U11', 'U12'];
  const FASES = { oro: 'Copa Oro', plata: 'Copa Plata', bronce: 'Copa Bronce' };
  // Cada refresco es 1 petición al Worker (/api/app): con partidos en juego cada 30 s, si no cada 2 min.
  const REFRESCO_MS = 30000;
  const REFRESCO_SIN_VIVOS_MS = 120000;
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const $top = document.getElementById('appTop');
  const $aviso = document.getElementById('appAviso');
  const $view = document.getElementById('appView');
  const $tabs = document.getElementById('appTabs');
  const $sheet = document.getElementById('appSheet');
  const $banner = document.getElementById('appBanner');

  // ---------- Preferencias guardadas en el móvil ----------
  const leer = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const escribir = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* modo privado */ } };

  let fav = null; // { id, cat }
  try { fav = JSON.parse(leer('tc-fav') || 'null'); } catch { fav = null; }
  let categoria = leer('tc-cat') || (fav && fav.cat) || 'U9';
  if (!CATEGORIAS.includes(categoria)) categoria = 'U9';

  // /app?categoria=U10 abre directamente esa categoría.
  const qs = new URLSearchParams(location.search);
  const catUrl = (qs.get('categoria') || '').toUpperCase();
  if (CATEGORIAS.includes(catUrl)) { categoria = catUrl; escribir('tc-cat', categoria); }

  const ui = { dia: null, filtro: 'todos', grupo: null, fase: 'oro', busca: '' };

  // ---------- Datos ----------
  let aviso = null; // aviso de la organización (llega junto con los datos de la categoría)
  // Las peticiones de la app nunca usan la caché del navegador (iOS podía enseñar un resultado ya corregido).
  const pedir = (url) => fetchJson(url, { cache: 'no-store' });
  // Los datos guardados en memoria valen 20 s: al cambiar de pantalla, si son más viejos, se vuelven a pedir.
  const FRESCO_MS = 20000;
  const fresco = (t) => t && Date.now() - t < FRESCO_MS;
  const cache = {};       // por categoría: { equipos, partidos, clasificacion, cargado, t }
  const favCache = { id: null, data: null, t: 0 };
  let estado = { publicado: true, visible: true };

  async function cargarCategoria(cat, forzar) {
    if (cache[cat] && cache[cat].cargado && !forzar && fresco(cache[cat].t)) return cache[cat];
    // Una sola petición con todo (equipos, partidos, clasificación y aviso): ver handleApp en el Worker.
    const d = await pedir(`/api/app?categoria=${encodeURIComponent(cat)}`);
    estado = { publicado: d.publicado, visible: d.visible };
    cache[cat] = { equipos: d.equipos || [], partidos: d.partidos || [], clasificacion: d.clasificacion || [], cargado: true, t: Date.now() };
    aviso = d.aviso || null;
    pintarBanner();
    if (cat === categoria) unaSede = new Set(cache[cat].partidos.map((m) => sinCampo(m.venue)).filter(Boolean)).size <= 1;
    return cache[cat];
  }

  async function cargarFav(forzar) {
    if (!fav) { favCache.id = null; favCache.data = null; return null; }
    if (favCache.id === fav.id && favCache.data && !forzar && fresco(favCache.t)) return favCache.data;
    try {
      const d = await pedir(`/api/equipos/${encodeURIComponent(fav.id)}`);
      if (d.visible === false) return null;
      favCache.id = fav.id;
      favCache.data = d;
      favCache.t = Date.now();
      return d;
    } catch {
      return null; // el equipo pudo borrarse: se trata como si no hubiera favorito
    }
  }

  function marcarFav(id, cat) {
    fav = fav && Number(fav.id) === Number(id) ? null : { id: Number(id), cat };
    escribir('tc-fav', fav ? JSON.stringify(fav) : null);
    favCache.id = null;
    favCache.data = null;
  }
  const esFav = (id) => fav && Number(fav.id) === Number(id);

  // ---------- Utilidades de presentación ----------
  const dia = (iso) => (iso ? iso.slice(0, 10) : '');
  const hora = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : '');
  function nombreDia(clave, largo) {
    if (!clave) return 'Sin fecha';
    const [y, m, d] = clave.split('-').map(Number);
    const f = new Date(y, m - 1, d);
    if (Number.isNaN(f.getTime())) return clave;
    return largo ? `${DIAS[f.getDay()]} ${d} de ${MESES[m - 1]}` : `${DIAS[f.getDay()]} ${d}`;
  }
  const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const diaLargo = (clave) => { const [y, m, d] = clave.split('-').map(Number); const f = new Date(y, m - 1, d); return Number.isNaN(f.getTime()) ? clave : `${DIAS_LARGOS[f.getDay()]} ${d}`; };
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const enJuego = (m) => Boolean(m.live) && !m.played;
  const porFecha = (a, b) => (a.scheduled_at || '9999').localeCompare(b.scheduled_at || '9999') || (a.venue || '').localeCompare(b.venue || '');
  const enc = encodeURIComponent;
  const enlaceGrupo = (cat, g) => `#grupos/${enc(g)}/${enc(cat)}`;
  const enlaceFase = (cat, fase) => `#final/${enc(fase)}/${enc(cat)}`;
  const enlaceCategoria = (cat) => `#inicio//${enc(cat)}`;
  const enlaceEtapa = (m) => (FASES[m.phase] ? enlaceFase(m.category, m.phase) : m.group_name ? enlaceGrupo(m.category, m.group_name) : '');
  const enlaceCampo = (v) => `#sedes/${enc(v)}`;
  // En la fase final se dice siempre de qué copa es: «Copa Oro · Semifinal · 2».
  const etapa = (m) => (FASES[m.phase] ? [FASES[m.phase], m.round_name].filter(Boolean).join(' · ')
    : m.round_name || (m.group_name ? `Grupo ${m.group_name}` : ''));
  const sinCampo = (v) => String(v || '').replace(/\s*[·\-–,]?\s*campo\s*\d+\s*/i, ' ').trim();
  // Si toda la categoría se juega en una sola instalación, basta con «Campo 2».
  let unaSede = true;
  const campoCorto = (v) => { const n = String(v || '').match(/campo\s*(\d+)/i); return unaSede && n ? `Campo ${n[1]}` : (v || ''); };

  const ICO = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
    partidos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    grupos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/></svg>',
    directo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M8 8a5.6 5.6 0 0 0 0 8M16 8a5.6 5.6 0 0 1 0 8M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14"/></svg>',
    equipos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/></svg>',
    mas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    estrella: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.8 2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.9 9.4l6.3-.8z"/></svg>',
    estrellaVacia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2.8 2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.9 9.4l6.3-.8z"/></svg>',
    atras: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>',
    abajo: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
    flecha: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>',
    copa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M9 21h6M10 17h4v4h-4z"/></svg>',
    balon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 2.9-1.5 4.6h-5L8 10.4z"/></svg>',
    mapa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    web: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>',
    compartir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  };

  // Fila compacta de partido (toda ella abre la ficha).
  function filaPartido(m, miId, sinDia) {
    const live = enJuego(m);
    const jugado = Boolean(m.played);
    const marcador = jugado || live;
    const gana = (a, b) => jugado && a > b;
    const yo = (id) => miId != null && Number(id) === Number(miId);
    const pen = m.home_pen != null && m.away_pen != null;
    const izq = live
      ? '<span class="a-vivo">En juego</span>'
      : jugado ? 'Final' : (hora(m.scheduled_at) || '—');
    const otroDia = !sinDia && m.scheduled_at && dia(m.scheduled_at) !== hoy();
    const sub = [otroDia ? nombreDia(dia(m.scheduled_at)) : '', live || jugado ? hora(m.scheduled_at) : '', campoCorto(m.venue)].filter(Boolean).join(' · ');
    const equipo = (id, nombre, logo, goles, ganador, penal) => `
      <div class="a-eq${ganador ? ' gana' : ''}${yo(id) ? ' yo' : ''}">${crestHtml(logo)}<span class="a-nom${id ? '' : ' hueco'}">${escapeHtml(nombre)}</span>
        <span class="a-gol">${marcador ? (goles ?? 0) : ''}${pen ? `<small>(${penal})</small>` : ''}</span></div>`;
    const ganaLocal = gana(m.home_score, m.away_score) || (pen && m.home_score === m.away_score && m.home_pen > m.away_pen);
    const ganaVisit = gana(m.away_score, m.home_score) || (pen && m.home_score === m.away_score && m.away_pen > m.home_pen);
    return `
      <a class="a-partido${live ? ' vivo' : ''}" href="#partido/${m.id}">
        <div class="a-cuando"><b>${izq}</b><small>${escapeHtml(sub)}</small></div>
        <div class="a-eqs">
          ${equipo(m.home_team_id, m.home_team_name, m.home_logo, m.home_score, ganaLocal, m.home_pen)}
          ${equipo(m.away_team_id, m.away_team_name, m.away_logo, m.away_score, ganaVisit, m.away_pen)}
          <div class="a-etapa${FASES[m.phase] ? ` fase fase-${m.phase}` : ''}">${escapeHtml(etapa(m))}</div>
        </div>
      </a>`;
  }
  const lista = (ms, miId, vacio, sinDia) => (ms.length
    ? `<div class="a-card a-lista">${ms.map((m) => filaPartido(m, miId, sinDia)).join('')}</div>`
    : `<p class="a-vacio">${escapeHtml(vacio || 'No hay partidos.')}</p>`);
  const seccion = (titulo, enlace, texto) => `<div class="a-sec"><h2>${escapeHtml(titulo)}</h2>${enlace ? `<a href="${enlace}">${escapeHtml(texto)}</a>` : ''}</div>`;
  const cargando = () => '<p class="a-vacio">Cargando…</p>';
  const estrellaBtn = (id, cat, grande) => `<button type="button" class="${grande ? 'a-favbtn' : 'a-estrella'}" data-fav="${id}" data-cat="${escapeHtml(cat)}"
      aria-pressed="${esFav(id) ? 'true' : 'false'}" aria-label="${esFav(id) ? 'Quitar de Mi equipo' : 'Marcar como Mi equipo'}">
      ${esFav(id) ? ICO.estrella : ICO.estrellaVacia}${grande ? `<span>${esFav(id) ? 'Mi equipo' : 'Marcar como mi equipo'}</span>` : ''}</button>`;

  function goleadores(partidos) {
    const acc = new Map();
    for (const m of partidos) {
      for (const g of m.goles || []) {
        const r = acc.get(g.player_id) || { id: g.player_id, nombre: `${g.nombre} ${g.apellidos}`.trim(), team_id: g.team_id, goles: 0 };
        r.goles += g.count;
        acc.set(g.player_id, r);
      }
    }
    return [...acc.values()].sort((a, b) => b.goles - a.goles || a.nombre.localeCompare(b.nombre, 'es'));
  }
  function filasGoleadores(rows, equipos) {
    const eq = new Map(equipos.map((e) => [Number(e.id), e]));
    let puesto = 0;
    let anterior = null;
    return rows.map((r, i) => {
      if (r.goles !== anterior) { puesto = i + 1; anterior = r.goles; }
      const e = eq.get(Number(r.team_id));
      return `<a class="a-goleador" href="#jugador/${r.id}"><span class="a-puesto">${puesto}</span>
        <span class="a-gnom"><b>${escapeHtml(r.nombre)}</b><small>${e ? `${crestHtml(e.logo_url)}${escapeHtml(e.name)}` : ''}</small></span>
        <span class="a-goles">${r.goles}</span></a>`;
    }).join('');
  }

  // Fase prevista de cada equipo si los grupos acabaran ahora (misma regla que «Por posiciones»).
  function fasesPrevistas(clasificacion) {
    const grupos = [...new Set(clasificacion.map((f) => f.group_name).filter(Boolean))];
    const porGrupo = grupos.map((g) => clasificacion.filter((f) => f.group_name === g));
    const res = new Map();
    const maxPos = Math.max(0, ...porGrupo.map((x) => x.length));
    for (let p = 0; p < maxPos; p++) {
      const fila = porGrupo.map((x) => x[p]).filter(Boolean).sort((a, b) => clasificacion.indexOf(a) - clasificacion.indexOf(b));
      fila.forEach((r, i) => res.set(Number(r.team_id), fasePorPosicion(p + 1, i + 1)));
    }
    return res;
  }

  // ---------- Pantallas principales ----------
  const PESTANAS = [
    ['inicio', 'Inicio'], ['partidos', 'Partidos'], ['grupos', 'Grupos'], ['directo', 'En directo'], ['mas', 'Más'],
  ];

  async function vistaInicio() {
    const [d, f] = await Promise.all([cargarCategoria(categoria), cargarFav()]);
    const ps = [...d.partidos].sort(porFecha);
    const vivos = ps.filter(enJuego);
    const pendientes = ps.filter((m) => !m.played && !enJuego(m));
    const jugados = ps.filter((m) => m.played).reverse();

    let titular;
    if (vivos.length) titular = `${vivos.length} ${vivos.length === 1 ? 'partido' : 'partidos'} en juego`;
    else if (pendientes.length) titular = pendientes[0].scheduled_at ? `Próximo: ${nombreDia(dia(pendientes[0].scheduled_at), true)}, ${hora(pendientes[0].scheduled_at)}` : 'Calendario por confirmar';
    else if (jugados.length) titular = 'Todos los partidos jugados';
    else titular = 'Calendario por publicar';

    let mi;
    if (f) {
      const e = f.equipo;
      const filaClas = d.clasificacion.find((r) => Number(r.team_id) === Number(e.id));
      const delGrupo = filaClas ? d.clasificacion.filter((r) => r.group_name === filaClas.group_name) : [];
      const pos = filaClas ? delGrupo.indexOf(filaClas) + 1 : 0;
      const vivo = f.proximos.find(enJuego);
      const siguiente = vivo || f.proximos[0];
      const ultimo = f.jugados[0];
      mi = `<div class="a-card a-mi">
          <a class="a-mi-cab" href="#equipo/${e.id}">${crestHtml(e.logo_url)}
            <span><b>${escapeHtml(e.name)}</b><small>${escapeHtml(e.category)}${e.group_name ? ` · Grupo ${escapeHtml(e.group_name)}` : ''}${pos ? ` · ${pos}.º` : ''}</small></span></a>
          ${estrellaBtn(e.id, e.category)}
        </div>
        ${siguiente ? `<p class="a-mini">${vivo ? 'Jugando ahora' : 'Próximo partido'}</p>${lista([siguiente], e.id)}` : ''}
        ${ultimo ? `<p class="a-mini">Último resultado</p>${lista([ultimo], e.id)}` : ''}
        ${!siguiente && !ultimo ? '<p class="a-vacio">Todavía no tiene partidos.</p>' : ''}`;
    } else {
      mi = `<div class="a-card a-mi-vacio"><p>Marca tu equipo con la estrella y verás aquí su próximo partido y su puesto.</p>
        <a class="a-boton" href="#equipos">Elegir equipo</a></div>`;
    }

    const top = goleadores(d.partidos).slice(0, 3);
    return `
      <div class="a-hero"><small>Turia Cup · ${escapeHtml(categoria)}</small><h1>${escapeHtml(titular)}</h1></div>
      ${seccion('Mi equipo')}${mi}
      ${vivos.length ? `${seccion('En directo', '#directo', 'Ver todos')}${lista(vivos)}` : ''}
      ${accesoCuadros(d.partidos)}
      ${pendientes.length ? `${seccion('A continuación', '#partidos', 'Calendario')}${lista(pendientes.slice(0, 3))}` : ''}
      ${jugados.length ? `${seccion('Últimos resultados', '#partidos', 'Todos')}${lista(jugados.slice(0, 3))}` : ''}
      ${top.length ? `${seccion('Goleadores', '#goleadores', 'Ver tabla')}<div class="a-card">${filasGoleadores(top, d.equipos)}</div>` : ''}
      ${avisoInstalar()}`;
  }

  async function vistaPartidos(arg) {
    const d = await cargarCategoria(categoria);
    const ps = [...d.partidos].sort(porFecha);
    if (!ps.length) return '<p class="a-vacio">Todavía no hay partidos en esta categoría.</p>';
    const dias = [...new Set(ps.map((m) => dia(m.scheduled_at)))];
    if (!dias.includes(ui.dia)) {
      // Por defecto: hoy si hay partidos; si no, el primer día con partidos pendientes; si no, el último.
      const conPendientes = ps.find((m) => !m.played);
      ui.dia = dias.includes(hoy()) ? hoy() : (conPendientes ? dia(conPendientes.scheduled_at) : dias[dias.length - 1]);
    }
    const campos = [...new Set(ps.filter((m) => dia(m.scheduled_at) === ui.dia).map((m) => m.venue).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    if (ui.filtro !== 'todos' && !campos.includes(ui.filtro)) ui.filtro = 'todos';

    const delDia = ps.filter((m) => dia(m.scheduled_at) === ui.dia);
    const sel = ui.filtro === 'todos' ? delDia : delDia.filter((m) => m.venue === ui.filtro);
    const horas = [...new Set(sel.map((m) => hora(m.scheduled_at)))];
    const chips = [['todos', 'Todos'], ...campos.map((c) => [c, campoCorto(c)])];

    return `
      <div class="a-dias">${dias.map((k) => `<button type="button" data-dia="${k}" aria-pressed="${k === ui.dia}">${escapeHtml(nombreDia(k))}</button>`).join('')}</div>
      ${campos.length > 1 ? `<div class="a-chips">${chips.map(([k, t]) => `<button type="button" class="a-chip" data-filtro="${escapeHtml(k)}" aria-pressed="${k === ui.filtro}">${escapeHtml(t)}</button>`).join('')}</div>` : ''}
      ${accesoCuadros(delDia, ui.dia)}
      ${horas.length ? horas.map((h) => `<h3 class="a-hora">${h || 'Hora por confirmar'}</h3>${lista(sel.filter((m) => hora(m.scheduled_at) === h), fav && fav.id, '', true)}`).join('')
        : '<p class="a-vacio">No hay partidos con este filtro.</p>'}`;
  }

  async function vistaGrupos(arg) {
    const d = await cargarCategoria(categoria);
    if (arg) { ui.grupo = arg; history.replaceState(history.state, '', '#grupos'); }
    const grupos = [...new Set(d.equipos.map((e) => e.group_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    if (!grupos.length) return '<p class="a-vacio">Todavía no hay grupos asignados en esta categoría.</p>';
    if (!ui.grupo || (ui.grupo !== 'POS' && !grupos.includes(ui.grupo))) {
      const delFav = fav && d.equipos.find((e) => Number(e.id) === Number(fav.id));
      ui.grupo = delFav && delFav.group_name ? delFav.group_name : grupos[0];
    }
    const chips = `<div class="a-chips a-chips-grupo">${grupos.map((g) => `<button type="button" class="a-chip" data-grupo="${escapeHtml(g)}" aria-pressed="${g === ui.grupo}">Grupo ${escapeHtml(g)}</button>`).join('')}
      ${grupos.length > 1 ? `<button type="button" class="a-chip" data-grupo="POS" aria-pressed="${ui.grupo === 'POS'}">Por posiciones</button>` : ''}</div>`;
    if (ui.grupo === 'POS') return `${chips}${accesoCuadros(d.partidos)}<div class="a-posiciones">${clasificacionPorPosicionesHtml(d.clasificacion, grupos)}</div>`;

    const filas = d.clasificacion.filter((r) => r.group_name === ui.grupo);
    const fases = fasesPrevistas(d.clasificacion);
    const partidos = d.partidos.filter((m) => m.phase === 'grupos' && m.group_name === ui.grupo).sort(porFecha);
    const previstas = filas.map((r) => fases.get(Number(r.team_id)));
    return `${chips}${accesoCuadros(d.partidos)}
      <div class="a-tabla">${tablaGrupoHtml(filas, { enlaces: true, miId: fav && fav.id })}</div>
      ${grupos.length > 1 && filas.some((r) => r.pj > 0) ? `<div class="a-card a-previsto"><b>Si el grupo acabara ahora</b>
        ${filas.map((r, i) => `<div><span>${i + 1}.º ${escapeHtml(r.name)}</span><a class="fase-chip fase-${previstas[i]}" href="${enlaceFase(categoria, previstas[i])}">${FASES[previstas[i]]}</a></div>`).join('')}</div>` : ''}
      ${seccion('Partidos del grupo')}${lista(partidos, fav && fav.id)}`;
  }

  async function vistaEquipos() {
    const d = await cargarCategoria(categoria);
    if (!d.equipos.length) return '<p class="a-vacio">Todavía no hay equipos en esta categoría.</p>';
    return `<input type="search" id="aBusca" class="a-busca" placeholder="Buscar club" value="${escapeHtml(ui.busca)}" autocomplete="off" aria-label="Buscar club">
      <div id="aEquipos">${listaEquipos(d.equipos)}</div>`;
  }
  function listaEquipos(equipos) {
    const q = ui.busca.trim().toLowerCase();
    const sel = equipos.filter((e) => !q || e.name.toLowerCase().includes(q) || (e.city || '').toLowerCase().includes(q));
    if (!sel.length) return '<p class="a-vacio">Ningún club coincide con la búsqueda.</p>';
    const grupos = [...new Set(sel.map((e) => e.group_name || ''))];
    return grupos.map((g) => `
      ${g ? seccion(`Grupo ${g}`, enlaceGrupo(categoria, g), 'Clasificación') : seccion('Sin grupo')}
      <div class="a-card">${sel.filter((e) => (e.group_name || '') === g).map((e) => `
        <div class="a-equipo"><a href="#equipo/${e.id}">${crestHtml(e.logo_url)}<span><b>${escapeHtml(e.name)}</b>${e.city ? `<small>${escapeHtml(e.city)}</small>` : ''}</span></a>
          ${estrellaBtn(e.id, e.category)}</div>`).join('')}</div>`).join('');
  }

  // Acceso a los cuadros de la fase final que tengan partidos en esta lista (p. ej. el último día).
  function accesoCuadros(partidos, diaElegido) {
    const fases = Object.keys(FASES).filter((f) => partidos.some((m) => m.phase === f));
    if (!fases.length) return '';
    return `<div class="a-card a-cuadros"><span><b>${!diaElegido ? 'Fase final' : diaElegido === hoy() ? 'Hoy se juega la fase final' : `El ${diaLargo(diaElegido)} se juega la fase final`}</b><small>Mira cómo van los cruces</small></span>
      <div>${fases.map((f) => `<a class="fase-chip fase-${f}" href="${enlaceFase(categoria, f)}">${FASES[f].replace('Copa ', '')}</a>`).join('')}</div></div>`;
  }

  let directoConVivos = false;
  // En directo: los partidos en juego de TODAS las categorías (la elegida, primero).
  async function vistaDirecto() {
    const orden = [categoria, ...CATEGORIAS.filter((c) => c !== categoria)];
    const { partidos: pendientesTodos = [] } = await pedir('/api/directo'); // sin terminar, todas las categorías
    const porCat = orden.map((c) => ({ c, ps: pendientesTodos.filter((m) => m.category === c).sort(porFecha) }));
    const conVivos = porCat.filter((x) => x.ps.some(enJuego));
    directoConVivos = conVivos.length > 0;
    if (conVivos.length) {
      return `${conVivos.map((x) => `${seccion(x.c, enlaceCategoria(x.c), 'Ir a la categoría')}${lista(x.ps.filter(enJuego), fav && fav.id)}`).join('')}
        <p class="a-nota">Los marcadores se actualizan solos cada 30 segundos.</p>`;
    }
    // Nada en juego: los siguientes en empezar de cada categoría.
    const proximos = porCat.map((x) => {
      const pend = x.ps.filter((m) => !m.played && m.scheduled_at);
      const primera = pend.length ? pend[0].scheduled_at : null;
      return { c: x.c, ps: pend.filter((m) => m.scheduled_at === primera) };
    }).filter((x) => x.ps.length);
    return `<div class="a-card a-sin-directo"><span class="a-tab-ico">${ICO.directo}</span><p><b>Ahora mismo no hay partidos en juego</b>
        En cuanto empiece uno, saldrá aquí con su marcador.</p></div>
      ${proximos.map((x) => `${seccion(`${x.c} · próximos en empezar`, enlaceCategoria(x.c), 'Ir a la categoría')}${lista(x.ps, fav && fav.id)}`).join('')}`;
  }

  async function vistaMas() {
    const item = (href, ico, titulo, sub, externo) => `<a href="${href}"${externo ? ' target="_blank" rel="noopener"' : ''}><span class="a-mico">${ico}</span>
      <span class="a-mtxt"><b>${titulo}</b><small>${sub}</small></span>${ICO.flecha}</a>`;
    return `<div class="a-card a-menu">
        ${item('#equipos', ICO.equipos, 'Equipos', `Todos los clubes de ${escapeHtml(categoria)} y sus plantillas`)}
        ${item('#final', ICO.copa, 'Fase final', 'Cuadros de Copa Oro, Plata y Bronce')}
        ${item('#goleadores', ICO.balon, 'Goleadores', `Máximos goleadores de ${escapeHtml(categoria)}`)}
        ${item('#sedes', ICO.mapa, 'Cómo llegar', 'Campos y mapa de cada instalación')}
        ${item('/', ICO.web, 'Web de la Turia Cup', 'Información del torneo, galería y dossier', true)}
        ${navigator.share ? `<button type="button" data-compartir><span class="a-mico">${ICO.compartir}</span><span class="a-mtxt"><b>Compartir la app</b><small>Envía el enlace por WhatsApp</small></span>${ICO.flecha}</button>` : ''}
      </div>
      ${seccion('Patrocinadores')}
      <div class="a-card a-patros">
        <img src="/img/patrocinadores/maxcolchon.png" alt="Maxcolchón">
        <img src="/img/patrocinadores/veganic.png" alt="Veganic">
        <img src="/img/patrocinadores/vancor.png" alt="Vancor Servicios Auxiliares">
        <img src="/img/patrocinadores/trececasas.png" alt="Trececasas">
        <img src="/img/patrocinadores/isotype.png" alt="Principal 33">
      </div>
      ${avisoInstalar(true)}`;
  }

  function avisoInstalar(siempre) {
    const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (instalada) return '';
    if (!siempre && leer('tc-instalar-visto')) return '';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const pasos = ios
      ? 'En Safari, pulsa <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>.'
      : 'En el menú del navegador (⋮), pulsa <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.';
    return `<div class="a-card a-instalar"><img src="/img/app/icon-192.png" alt=""><div><b>Ten la Turia Cup en tu móvil</b><p>${pasos}</p></div>
      ${siempre ? '' : '<button type="button" data-cerrar-instalar aria-label="Cerrar">×</button>'}</div>`;
  }

  // ---------- Fichas (se abren encima, con botón atrás) ----------
  async function fichaEquipo(id) {
    const d = await pedir(`/api/equipos/${encodeURIComponent(id)}`);
    if (d.visible === false) return { titulo: 'Equipo', html: noPublicadoHtml() };
    const { equipo: e, jugadores, staff, proximos, jugados } = d;
    let clas = null;
    try {
      const c = await cargarCategoria(e.category);
      const filas = c.clasificacion.filter((r) => r.group_name === e.group_name);
      const fila = filas.find((r) => Number(r.team_id) === Number(e.id));
      if (fila) clas = { filas, fila, pos: filas.indexOf(fila) + 1 };
    } catch { /* sin clasificación */ }
    const todos = [...proximos, ...jugados];
    const fasePropia = todos.find((m) => FASES[m.phase]);
    return {
      titulo: e.name,
      sub: [e.category, e.group_name ? `Grupo ${e.group_name}` : ''].filter(Boolean).join(' · '),
      html: `
        <div class="a-ficha-cab">${e.logo_url ? `<img src="${escapeHtml(e.logo_url)}" alt="">` : '<span class="crest crest-vacio"></span>'}
          <h1>${escapeHtml(e.name)}</h1>
          <p><a href="${enlaceCategoria(e.category)}">${escapeHtml(e.category)}</a>${e.group_name ? ` · <a href="${enlaceGrupo(e.category, e.group_name)}">Grupo ${escapeHtml(e.group_name)}</a>` : ''}${e.city ? ` · ${escapeHtml(e.city)}` : ''}</p>
          ${estrellaBtn(e.id, e.category, true)}
        </div>
        ${clas ? `<div class="a-card a-stats">
          <a href="${enlaceGrupo(e.category, e.group_name)}"><b>${clas.pos}.º</b><span>Grupo ${escapeHtml(e.group_name)}</span></a><div><b>${clas.fila.pts}</b><span>Puntos</span></div>
          <div><b>${clas.fila.pg}-${clas.fila.pe}-${clas.fila.pp}</b><span>G-E-P</span></div>
          <div><b>${clas.fila.gf}:${clas.fila.gc}</b><span>Goles</span></div></div>` : ''}
        ${fasePropia ? `<a class="a-boton a-boton-ancho" href="${enlaceFase(e.category, fasePropia.phase)}">Ver su cuadro de ${FASES[fasePropia.phase]}</a>` : ''}
        ${proximos.length ? `${seccion('Próximos partidos')}${lista(proximos, e.id)}` : ''}
        ${jugados.length ? `${seccion('Resultados')}${lista(jugados, e.id)}` : ''}
        ${!todos.length ? `${seccion('Partidos')}<p class="a-vacio">Todavía no tiene partidos programados.</p>` : ''}
        ${clas ? `${seccion(`Grupo ${e.group_name}`, enlaceGrupo(e.category, e.group_name), 'Ver grupo')}<div class="a-tabla">${tablaGrupoHtml(clas.filas, { enlaces: true, miId: e.id })}</div>` : ''}
        ${seccion('Plantilla')}
        ${jugadores.length ? `<div class="a-card">${jugadores.map((j) => `
          <a class="a-jugador" href="#jugador/${j.id}"><span class="a-dorsal">${j.dorsal ?? ''}</span><span>${escapeHtml(j.nombre)} ${escapeHtml(j.apellidos)}</span>${ICO.flecha}</a>`).join('')}</div>`
          : '<p class="a-vacio">Plantilla aún no publicada.</p>'}
        ${(staff || []).length ? `${seccion('Cuerpo técnico')}<div class="a-card">${staff.map((t) => `
          <div class="a-jugador"><span class="a-dorsal">·</span><span>${escapeHtml(t.nombre)} ${escapeHtml(t.apellidos)}</span><small>${escapeHtml(t.cargo || '')}</small></div>`).join('')}</div>` : ''}`,
    };
  }

  const TEXTO_INC = { propia: 'Propia puerta', amarilla: 'Amarilla', roja: 'Roja' };
  async function fichaPartido(id) {
    const d = await pedir(`/api/partidos/${encodeURIComponent(id)}`);
    if (d.visible === false) return { titulo: 'Partido', html: noPublicadoHtml() };
    const { partido: m, goles, incidencias } = d;
    const live = enJuego(m);
    const pen = m.home_pen != null && m.away_pen != null;
    const lado = (tid, nombre, logo) => `<a class="a-lado"${tid ? ` href="#equipo/${tid}"` : ''}>${logo ? `<img src="${escapeHtml(logo)}" alt="">` : '<span class="crest crest-vacio"></span>'}<span>${escapeHtml(nombre)}</span></a>`;
    const estadoTxt = live ? '<span class="a-vivo">En juego</span>'
      : m.played ? 'Final' : (m.scheduled_at ? `${nombreDia(dia(m.scheduled_at), true)} · ${hora(m.scheduled_at)}` : 'Fecha por confirmar');
    const golesDe = (tid) => goles.filter((g) => Number(g.team_id) === Number(tid));
    const columna = (tid) => golesDe(tid).map((g) => `<a href="#jugador/${g.player_id}">${g.dorsal != null ? `${g.dorsal}. ` : ''}${escapeHtml(g.nombre)} ${escapeHtml(g.apellidos)}${g.count > 1 ? ` ×${g.count}` : ''}</a>`).join('') || '<span class="a-gris">—</span>';
    return {
      titulo: etapa(m) || 'Partido',
      sub: [m.category, m.venue].filter(Boolean).join(' · '),
      refrescar: live,
      html: `
        <div class="a-card a-marcador${live ? ' vivo' : ''}">
          <div class="a-marc-fila">${lado(m.home_team_id, m.home_team_name, m.home_logo)}
            <div class="a-marc-num">${m.played || live ? `${m.home_score ?? 0}<i>:</i>${m.away_score ?? 0}` : '<i>vs</i>'}
              ${pen ? `<small>Penaltis ${m.home_pen} - ${m.away_pen}</small>` : ''}</div>
            ${lado(m.away_team_id, m.away_team_name, m.away_logo)}</div>
          <div class="a-marc-estado">${estadoTxt}</div>
          <div class="a-marc-meta">${[
            `<a href="${enlaceCategoria(m.category)}">${escapeHtml(m.category)}</a>`,
            etapa(m) ? (enlaceEtapa(m) ? `<a href="${enlaceEtapa(m)}">${escapeHtml(etapa(m))}</a>` : escapeHtml(etapa(m))) : '',
            m.venue ? `<a href="${enlaceCampo(m.venue)}">${escapeHtml(campoCorto(m.venue))}</a>` : '',
          ].filter(Boolean).join(' · ')}</div>
        </div>
        ${(m.played || live) && goles.length ? `${seccion('Goles')}<div class="a-card a-goles2"><div>${columna(m.home_team_id)}</div><div>${columna(m.away_team_id)}</div></div>` : ''}
        ${(incidencias || []).length ? `${seccion('Incidencias')}<div class="a-card">${incidencias.map((e) => `
          <div class="a-inc"><i class="a-inc-${e.type}"></i><span>${TEXTO_INC[e.type] || ''} · <a href="#jugador/${e.player_id}">${escapeHtml(e.nombre)} ${escapeHtml(e.apellidos)}</a></span>
          <small><a href="#equipo/${e.team_id}">${escapeHtml(Number(e.team_id) === Number(m.home_team_id) ? m.home_team_name : m.away_team_name)}</a></small></div>`).join('')}</div>` : ''}
        ${m.venue ? `${seccion('Dónde se juega')}<div class="a-card a-plano">${miniPlanoHtml(m.venue) || `<p>${escapeHtml(m.venue)}</p>`}
          <a class="a-boton a-boton-ancho" target="_blank" rel="noopener" href="${rutaMaps(sedeDe(m.venue).destino)}">Cómo llegar a ${escapeHtml(sedeDe(m.venue).nombre)}</a>
          <a class="a-sede-ver" href="${enlaceCampo(m.venue)}">Ver el mapa 3D: entrada, vestuarios, baños y cafetería</a></div>` : ''}
        ${live ? '<p class="a-nota">El marcador se actualiza solo.</p>' : ''}`,
    };
  }

  async function fichaJugador(id) {
    const d = await pedir(`/api/jugadores/${encodeURIComponent(id)}`);
    if (d.visible === false) return { titulo: 'Jugador', html: noPublicadoHtml() };
    const { jugador: j, totalGoles, goles } = d;
    return {
      titulo: `${j.nombre} ${j.apellidos}`,
      sub: `${j.team_name} · ${j.category}`,
      html: `
        <div class="a-ficha-cab"><span class="a-dorsal-grande">${j.dorsal ?? '–'}</span>
          <h1>${escapeHtml(j.nombre)} ${escapeHtml(j.apellidos)}</h1>
          <p><a href="#equipo/${j.team_id}">${escapeHtml(j.team_name)}</a> · <a href="${enlaceCategoria(j.category)}">${escapeHtml(j.category)}</a></p></div>
        <div class="a-card a-stats a-stats-1"><div><b>${totalGoles}</b><span>${totalGoles === 1 ? 'Gol' : 'Goles'}</span></div></div>
        ${goles.length ? `${seccion('Partidos en los que marcó')}<div class="a-card">${goles.map((g) => `
          <a class="a-jugador" href="#partido/${g.match_id}"><span class="a-dorsal">${g.count}</span>
            <span>${escapeHtml(g.home_team_name)} ${g.home_score ?? ''}-${g.away_score ?? ''} ${escapeHtml(g.away_team_name)}</span>${ICO.flecha}</a>`).join('')}</div>` : ''}`,
    };
  }

  async function fichaGoleadores() {
    const d = await cargarCategoria(categoria);
    const rows = goleadores(d.partidos);
    return {
      titulo: 'Goleadores', sub: categoria,
      html: rows.length ? `<div class="a-card">${filasGoleadores(rows, d.equipos)}</div><p class="a-nota">Cuentan los goles de los partidos terminados.</p>`
        : '<p class="a-vacio">Todavía no hay goles en esta categoría.</p>',
    };
  }

  async function fichaFinal(fase) {
    if (FASES[fase]) ui.fase = fase;
    const d = await cargarCategoria(categoria);
    const ps = d.partidos.filter((m) => m.phase === ui.fase);
    return {
      titulo: 'Fase final', sub: `${categoria} · ${FASES[ui.fase]}`, despues: () => activarCuadro(fav && fav.id),
      html: `<div class="a-dias">${Object.entries(FASES).map(([k, t]) => `<button type="button" data-fase="${k}" aria-pressed="${k === ui.fase}">${t.replace('Copa ', '')}</button>`).join('')}</div>
        <div class="a-cuadro">${cuadroHtml(ps, fav && fav.id)}</div>`,
    };
  }

  // Cómo llegar: todas las instalaciones del torneo (miniplano.js → SEDES_TORNEO), primero las de la categoría elegida.
  // Para cada una: mapa aéreo si lo hay, por dónde se entra, botón de ruta en Google Maps y el plano de los campos.
  const rutaMaps = (destino) => `https://www.google.com/maps/dir/?api=1&destination=${enc(destino)}`;
  const buscarMaps = (destino) => `https://www.google.com/maps/search/?api=1&query=${enc(destino)}`;
  function sedeDe(venue) {
    const clave = window.sedeDeCampo ? sedeDeCampo(venue) : null;
    const conocida = clave && (window.SEDES_TORNEO || []).find((s) => s.clave === clave);
    if (conocida) return conocida;
    const nombre = sinCampo(venue) || venue;
    return { clave: nombre, nombre, destino: `${nombre}, Valencia` };
  }

  async function fichaSedes(campoPedido) {
    const d = await cargarCategoria(categoria);
    const pedida = campoPedido ? sedeDe(campoPedido).clave : null; // desde un partido: su instalación, la primera
    const campos = [...new Set(d.partidos.map((m) => m.venue).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
    const sedes = [...(window.SEDES_TORNEO || [])];
    for (const c of campos) { const s = sedeDe(c); if (!sedes.some((x) => x.clave === s.clave)) sedes.push(s); }
    const usadas = new Set(campos.map((c) => sedeDe(c).clave));
    const peso = (s) => (s.clave === pedida ? 2 : usadas.has(s.clave) ? 1 : 0);
    sedes.sort((x, y) => peso(y) - peso(x));
    return {
      titulo: 'Cómo llegar', sub: 'Instalaciones del torneo',
      html: sedes.map((s) => {
        const plano = s.imagen ? '' : miniPlanoHtml(campos.find((c) => sedeDe(c).clave === s.clave)); // sin mapa 3D, el plano
        return `${seccion(s.nombre)}<div class="a-card a-sede">
          ${s.imagen ? `<a class="a-sede-foto" href="${escapeHtml(s.imagenGrande || s.imagen)}" target="_blank" rel="noopener"><img src="${escapeHtml(s.imagen)}" alt="Mapa 3D de ${escapeHtml(s.nombre)} con los campos, la entrada, la cafetería, los baños y los vestuarios" loading="lazy"${s.ancho ? ` style="aspect-ratio: ${s.ancho} / ${s.alto}"` : ''}><span>Ampliar</span></a>` : ''}
          <div class="a-sede-txt">
            ${s.entrada ? `<p>${escapeHtml(s.entrada)}</p>` : ''}
            ${usadas.has(s.clave) ? '' : `<p class="a-gris">En ${escapeHtml(categoria)} no hay partidos en esta instalación.</p>`}
            <a class="a-boton a-boton-ancho" target="_blank" rel="noopener" href="${rutaMaps(s.destino)}">Cómo llegar</a>
            <a class="a-sede-ver" target="_blank" rel="noopener" href="${buscarMaps(s.destino)}">Ver en Google Maps</a>
          </div>
          ${plano ? `<div class="a-sede-plano"><b>Dentro de la instalación</b>${plano}</div>` : ''}
        </div>`;
      }).join(''),
    };
  }

  const FICHAS = { equipo: fichaEquipo, partido: fichaPartido, jugador: fichaJugador, goleadores: fichaGoleadores, final: fichaFinal, sedes: fichaSedes };
  const VISTAS = { inicio: vistaInicio, partidos: vistaPartidos, grupos: vistaGrupos, directo: vistaDirecto, equipos: vistaEquipos, mas: vistaMas };

  // ---------- Navegación ----------
  let ultimaPestana = 'inicio';
  let temporizador = null;
  let pintando = 0;
  // «Atrás»: cada paso dentro de la app se numera en history.state; con el paso 0 se vuelve a la página de la web
  // desde la que se entró (o a la portada). La app instalada sin pasos previos no muestra la flecha en las pestañas.
  const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let vieneDeLaWeb = false;
  try { vieneDeLaWeb = Boolean(document.referrer) && new URL(document.referrer).origin === location.origin; } catch { vieneDeLaWeb = false; }
  let paso = 0;
  function numerarPaso(nuevo) {
    const s = history.state;
    if (s && typeof s.paso === 'number') paso = s.paso;
    else { paso = nuevo ? paso + 1 : 0; history.replaceState({ paso }, ''); }
  }
  numerarPaso(false);
  let saltoSinPaso = false; // un location.replace no es un paso nuevo

  function ruta() {
    const [nombre, a, c] = location.hash.replace(/^#/, '').split('/');
    const dec = (x) => { try { return decodeURIComponent(x || ''); } catch { return ''; } };
    const arg = dec(a);
    const cat = CATEGORIAS.includes(dec(c).toUpperCase()) ? dec(c).toUpperCase() : null;
    if (VISTAS[nombre]) return { tipo: 'vista', nombre, arg, cat };
    if (FICHAS[nombre]) return { tipo: 'ficha', nombre, arg, cat };
    return { tipo: 'vista', nombre: 'inicio' };
  }

  // Equipos ya no tiene pestaña propia: se abre desde Más, así que ilumina Más.
  function pintarTabs(activa) {
    const marcada = activa === 'equipos' ? 'mas' : activa;
    const d = cache[categoria];
    const vivos = d ? d.partidos.filter(enJuego).length : 0;
    $tabs.innerHTML = PESTANAS.map(([k, t]) => `<a href="#${k}" ${k === marcada ? 'aria-current="page"' : ''}${k === 'directo' && vivos ? ' class="hay-vivos"' : ''}>
      <span class="a-tab-ico">${ICO[k]}${k === 'directo' && vivos ? `<i class="a-badge">${vivos}</i>` : ''}</span><span>${t}</span></a>`).join('');
  }

  function pintarCabecera(r, ficha) {
    if (r.tipo === 'ficha') {
      $top.innerHTML = `<button type="button" class="a-atras" data-atras aria-label="Volver">${ICO.atras}</button>
        <div class="a-titulo"><b>${escapeHtml(ficha ? ficha.titulo : '')}</b>${ficha && ficha.sub ? `<small>${escapeHtml(ficha.sub)}</small>` : ''}</div>`;
    } else {
      const flecha = paso > 0 || vieneDeLaWeb || !instalada;
      $top.innerHTML = `${flecha ? `<button type="button" class="a-atras" data-atras aria-label="Volver">${ICO.atras}</button>` : ''}<img class="a-logo" src="/img/brand/badge-orange.png" alt="">
        <div class="a-titulo"><b>Turia Cup</b><small>Resultados y clasificaciones</small></div>
        <button type="button" class="a-cat" data-elegir-cat aria-label="Cambiar de categoría">${escapeHtml(categoria)}${ICO.abajo}</button>`;
    }
  }

  async function pintar(opciones = {}) {
    const r = ruta();
    const turno = ++pintando;
    const scroll = $view.scrollTop;
    clearTimeout(temporizador);
    if (r.cat && r.cat !== categoria) cambiarCategoria(r.cat); // un enlace a otra categoría (p. ej. un grupo)
    if (r.tipo === 'vista') ultimaPestana = r.nombre;
    pintarTabs(ultimaPestana);
    if (!opciones.silencioso) {
      pintarCabecera(r, r.tipo === 'ficha' ? { titulo: '' } : null);
      $view.innerHTML = cargando();
    }
    let ficha = null;
    let html;
    try {
      if (r.tipo === 'ficha') {
        ficha = await FICHAS[r.nombre](r.arg);
        html = ficha.html;
      } else {
        html = await VISTAS[r.nombre](r.arg);
      }
    } catch (err) {
      html = `<p class="a-vacio">${escapeHtml(err.message || 'No se ha podido cargar.')}</p>
        <button type="button" class="a-boton" data-reintentar>Reintentar</button>`;
    }
    if (turno !== pintando) return; // llegó otra navegación mientras cargaba
    if (!estado.visible) {
      $tabs.hidden = true;
      pintarCabecera({ tipo: 'vista' });
      $view.innerHTML = `<div class="a-proximamente"><img src="/img/app/icon-192.png" alt=""><h1>Próximamente</h1>
        <p>Los equipos, los grupos, el calendario y las clasificaciones se publicarán unas semanas antes del torneo.</p>
        <a class="a-boton" href="/">Ir a la web de la Turia Cup</a></div>`;
      return;
    }
    $tabs.hidden = false;
    $aviso.hidden = estado.publicado;
    $aviso.textContent = 'Vista interna: el torneo todavía no es público. Lo ves porque tienes abierta la sesión de administrador.';
    pintarCabecera(r, ficha);
    pintarTabs(ultimaPestana); // ya con datos: contador de partidos en juego
    $view.innerHTML = html;
    $view.scrollTop = opciones.silencioso ? scroll : 0;
    if (ficha && ficha.despues) ficha.despues();
    if (r.nombre === 'equipos') activarBusqueda();
    programarRefresco(r, ficha);
  }

  // Refresco automático: cada 30 s en las pestañas y en la ficha de un partido en juego.
  function programarRefresco(r, ficha) {
    const toca = r.tipo === 'vista' ? r.nombre !== 'mas' : Boolean(ficha && ficha.refrescar);
    if (!toca) return;
    const d = cache[categoria];
    const hayVivos = (d && d.partidos.some(enJuego)) || (ficha && ficha.refrescar) || (r.nombre === 'directo' && directoConVivos);
    temporizador = setTimeout(async () => {
      if (document.hidden) { programarRefresco(r, ficha); return; }
      if (document.activeElement && document.activeElement.id === 'aBusca') { programarRefresco(r, ficha); return; }
      try { await Promise.all([cargarCategoria(categoria, true), cargarFav(true)]); } catch { /* se reintenta en el siguiente */ }
      pintar({ silencioso: true });
    }, hayVivos ? REFRESCO_MS : REFRESCO_SIN_VIVOS_MS);
  }
  // Al volver a la app, se traen los datos al momento (sin repetir si ya se pidieron hace menos de 5 s).
  let ultimoAlVolver = 0;
  async function alVolver() {
    if (document.hidden || Date.now() - ultimoAlVolver < 5000) return;
    ultimoAlVolver = Date.now();
    try { await Promise.all([cargarCategoria(categoria, true), cargarFav(true)]); } catch { /* sin conexión */ }
    pintar({ silencioso: true });
  }
  document.addEventListener('visibilitychange', alVolver);
  window.addEventListener('pageshow', (e) => { if (e.persisted) alVolver(); });
  window.addEventListener('focus', alVolver);

  function activarBusqueda() {
    const input = document.getElementById('aBusca');
    if (!input) return;
    input.addEventListener('input', () => {
      ui.busca = input.value;
      const d = cache[categoria];
      if (d) document.getElementById('aEquipos').innerHTML = listaEquipos(d.equipos);
    });
  }

  function cambiarCategoria(c) {
    categoria = c;
    escribir('tc-cat', categoria);
    ui.grupo = null; ui.dia = null; ui.filtro = 'todos'; ui.busca = '';
  }

  function elegirCategoria() {
    $sheet.innerHTML = `<div class="a-sheet" role="dialog" aria-label="Elegir categoría"><div class="a-asa"></div><h2>Categoría</h2>
      <div class="a-cats">${CATEGORIAS.map((c) => `<button type="button" data-set-cat="${c}" aria-pressed="${c === categoria}">${c}</button>`).join('')}</div></div>`;
    $sheet.hidden = false;
  }

  // ---------- Aviso de la organización (banner arriba, se escribe en el panel → Avisos) ----------
  function pintarBanner() {
    // Quien lo cierra no lo vuelve a ver… hasta que se publica uno nuevo (otra fecha de publicación).
    if (!aviso || leer('tc-aviso-cerrado') === aviso.publicado_at) { $banner.hidden = true; return; }
    const d = new Date(aviso.publicado_at);
    const horaAviso = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    $banner.className = `app-banner ${aviso.tipo === 'urgente' ? 'urgente' : ''}`;
    $banner.innerHTML = `<span class="a-ban-ico" aria-hidden="true">${aviso.tipo === 'urgente' ? '!' : 'i'}</span>
      <p><b>${aviso.tipo === 'urgente' ? 'Aviso urgente' : 'Aviso de la organización'}${horaAviso ? ` · ${horaAviso}` : ''}</b>${escapeHtml(aviso.texto)}</p>
      <button type="button" data-cerrar-aviso aria-label="Cerrar aviso">×</button>`;
    $banner.hidden = false;
  }

  // ---------- Eventos ----------
  window.addEventListener('hashchange', () => {
    numerarPaso(!saltoSinPaso);
    saltoSinPaso = false;
    pintar();
  });

  document.getElementById('app').addEventListener('click', async (e) => {
    // Pulsar la pestaña en la que ya estás la actualiza (la app instalada no tiene botón de recargar).
    const pestana = e.target.closest('.app-tabs a[aria-current="page"]');
    if (pestana && ruta().tipo === 'vista' && `#${ruta().nombre}` === pestana.getAttribute('href')) {
      e.preventDefault();
      $view.scrollTo({ top: 0, behavior: 'smooth' });
      try { await Promise.all([cargarCategoria(categoria, true), cargarFav(true)]); } catch { /* sin conexión */ }
      pintar({ silencioso: true });
      return;
    }
    // Las tablas y el cuadro de utils.js enlazan a equipo.html / partido.html / jugador.html: dentro de la app
    // se abren como fichas.
    const enlace = e.target.closest('a[href]');
    const fila = e.target.closest('tr.tg-link[data-href]');
    const destino = (enlace && enlace.getAttribute('href')) || (fila && !e.target.closest('a') && fila.dataset.href);
    const interno = destino && destino.match(/^(equipo|partido|jugador)\.html\?id=(\d+)/);
    if (interno) {
      e.preventDefault();
      e.stopPropagation(); // que no actúe también el clic de las tablas de utils.js
      location.hash = `${interno[1]}/${interno[2]}`;
      return;
    }
    const cuadro = destino && destino.match(/^cuadro\.html/);
    if (cuadro) { e.preventDefault(); location.hash = 'final'; return; }

    const b = e.target.closest('button');
    if (e.target === $sheet) { $sheet.hidden = true; return; }
    if (!b) return;
    const d = b.dataset;
    if ('fav' in d) {
      e.preventDefault();
      e.stopPropagation();
      marcarFav(d.fav, d.cat);
      pintar({ silencioso: true });
    } else if ('elegirCat' in d) {
      elegirCategoria();
    } else if (d.setCat) {
      cambiarCategoria(d.setCat);
      $sheet.hidden = true;
      pintar();
    } else if ('atras' in d) {
      if (paso > 0) history.back();
      else if (ruta().tipo === 'ficha') { saltoSinPaso = true; location.replace(`#${ultimaPestana}`); }
      else if (vieneDeLaWeb) history.back();
      else location.href = '/';
    } else if (d.dia) {
      ui.dia = d.dia; pintar({ silencioso: true });
    } else if (d.filtro) {
      ui.filtro = d.filtro;
      pintar({ silencioso: true });
    } else if (d.grupo) {
      ui.grupo = d.grupo; pintar({ silencioso: true });
    } else if (d.fase) {
      history.replaceState(history.state, '', `#final/${d.fase}`); pintar({ silencioso: true });
    } else if ('cerrarAviso' in d) {
      if (aviso) escribir('tc-aviso-cerrado', aviso.publicado_at);
      $banner.hidden = true;
    } else if ('cerrarInstalar' in d) {
      escribir('tc-instalar-visto', '1'); b.closest('.a-instalar').remove();
    } else if ('compartir' in d) {
      navigator.share({ title: 'Turia Cup', text: 'Resultados y clasificaciones de la Turia Cup', url: `${location.origin}/app` }).catch(() => {});
    } else if ('reintentar' in d) {
      try { await cargarCategoria(categoria, true); } catch { /* se mostrará el error */ }
      pintar();
    }
  });

  // ---------- Arranque ----------
  async function arrancar() {
    if (location.search) history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
    pintar();
  }
  arrancar();
}());
