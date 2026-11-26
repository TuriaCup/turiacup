// Cada dispositivo ve el torneo a su manera, abra el enlace que abra:
//  · en el móvil (≤ 800 px), torneo/equipo/partido/jugador/cuadro.html saltan a la app (/app#…);
//  · en el ordenador, /app salta a la página de siempre equivalente.
// La app instalada en la pantalla de inicio nunca se redirige. Va en el <head>, antes que nada, para que no se vea
// la página equivocada ni un instante, y DESPUÉS del meta viewport (si no, el móvil aún mide 980 px). El ancho de
// corte es el del menú móvil (style.css, 800 px); el lado corto de la pantalla ≤ 600 px cubre los teléfonos.
(function () {
  var movil = window.matchMedia('(max-width: 800px)').matches || Math.min(screen.width, screen.height) <= 600;
  var instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  var pagina = (location.pathname.match(/\/(app|torneo|equipo|partido|jugador|cuadro)(\.html)?\/?$/) || [])[1];
  if (!pagina) return;
  var qs = new URLSearchParams(location.search);
  var cat = (qs.get('categoria') || '').toUpperCase();
  var conCat = function (base) { return cat ? base + '?categoria=' + encodeURIComponent(cat) : base; };

  if (pagina === 'app') {
    if (movil || instalada) return;
    if (!cat) { try { cat = localStorage.getItem('tc-cat') || ''; } catch (e) { cat = ''; } }
    var partes = location.hash.replace(/^#/, '').split('/');
    var arg = encodeURIComponent(partes[1] || '');
    var ficha = { equipo: 'equipo.html', partido: 'partido.html', jugador: 'jugador.html' }[partes[0]];
    var tab = { grupos: 'clasificacion', partidos: 'resultados', equipos: 'equipos', final: 'final' }[partes[0]];
    var destino;
    if (ficha && arg) destino = '/' + ficha + '?id=' + arg;
    else if (tab) destino = conCat('/torneo.html') + (cat ? '&' : '?') + 'tab=' + tab + (partes[0] === 'final' && arg ? '&fase=' + arg : '');
    else destino = conCat('/torneo.html');
    location.replace(destino);
    return;
  }

  if (!movil) return;
  var id = encodeURIComponent(qs.get('id') || '');
  var hash = '';
  if ((pagina === 'equipo' || pagina === 'partido' || pagina === 'jugador') && id) hash = pagina + '/' + id;
  else if (pagina === 'cuadro') hash = 'final/' + encodeURIComponent(qs.get('fase') || 'oro');
  else if (pagina === 'torneo') {
    var t = qs.get('tab');
    hash = { clasificacion: 'grupos', resultados: 'partidos', equipos: 'equipos' }[t] || '';
    if (t === 'final') hash = 'final/' + encodeURIComponent(qs.get('fase') || 'oro');
  }
  location.replace(conCat('/app') + (hash ? '#' + hash : ''));
}());
