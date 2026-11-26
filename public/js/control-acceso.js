// Escáner de la puerta: lee el QR con la cámara del móvil y lo valida contra el servidor.
// Necesita la sesión del panel de admin (la misma cookie).

const video = document.getElementById('video');
const lienzo = document.getElementById('lienzo');
const ctx = lienzo.getContext('2d', { willReadFrequently: true });
const escaner = document.getElementById('escaner');
const resultado = document.getElementById('resultado');
const camaraBtn = document.getElementById('camaraBtn');
const camaraAviso = document.getElementById('camaraAviso');
const contadorHoy = document.getElementById('contadorHoy');

let flujo = null;
let ocupado = false;
let ultimoCodigo = '';
let ultimoMomento = 0;
let validadasSesion = 0;
let temporizador = null;

async function comprobarSesion() {
  try {
    const { authenticated } = await fetchJson('/api/admin/me');
    document.getElementById('sinSesion').hidden = authenticated;
    escaner.hidden = !authenticated;
  } catch {
    document.getElementById('sinSesion').hidden = false;
  }
}

async function activarCamara() {
  try {
    flujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
    video.srcObject = flujo;
    await video.play();
    camaraBtn.hidden = true;
    camaraAviso.hidden = true;
    requestAnimationFrame(leerFotograma);
  } catch (err) {
    camaraAviso.textContent = 'No se ha podido abrir la cámara. Revisa los permisos del navegador o escribe el código a mano.';
  }
}

function leerFotograma() {
  if (!flujo) return;
  if (!ocupado && video.readyState === video.HAVE_ENOUGH_DATA) {
    // Se analiza a resolución reducida: va de sobra para un QR y no calienta el móvil.
    const escala = Math.min(1, 640 / video.videoWidth);
    lienzo.width = Math.round(video.videoWidth * escala);
    lienzo.height = Math.round(video.videoHeight * escala);
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (qr && qr.data) {
      const ahora = Date.now();
      // El mismo QR sigue delante de la cámara justo después de validarlo: lo ignoramos unos segundos.
      if (qr.data !== ultimoCodigo || ahora - ultimoMomento > 4000) {
        ultimoCodigo = qr.data;
        ultimoMomento = ahora;
        validar(qr.data);
      }
    }
  }
  requestAnimationFrame(leerFotograma);
}

function aviso(tipo) {
  try {
    if (navigator.vibrate) navigator.vibrate(tipo === 'valida' ? 120 : [200, 100, 200]);
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    osc.frequency.value = tipo === 'valida' ? 880 : 220;
    osc.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + (tipo === 'valida' ? 0.15 : 0.4));
  } catch { /* sin sonido */ }
}

function horaCorta(iso) {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  return hoy
    ? `hoy a las ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
    : `el ${d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
}

async function validar(codigo) {
  ocupado = true;
  let r;
  try {
    r = await fetchJson('/api/admin/entradas/validar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    });
  } catch (err) {
    if (/sesi|autoriz|401/i.test(err.message)) {
      await comprobarSesion();
      ocupado = false;
      return;
    }
    mostrar('error', '⚠️', 'Sin conexión', `No se ha podido comprobar la entrada: ${escapeHtml(err.message)}. Inténtalo otra vez.`);
    return;
  }

  const e = r.entrada || {};
  const quien = e.tipo ? `<strong>${escapeHtml(e.tipo)}</strong>${e.abono ? ' (abono)' : ''}<br>${escapeHtml(e.comprador)}` : '';
  if (r.resultado === 'valida') {
    validadasSesion++;
    contadorHoy.textContent = `${validadasSesion} validadas`;
    mostrar('valida', '✅', 'Entrada válida', quien, e.codigo);
  } else if (r.resultado === 'ya_usada') {
    mostrar('usada', '⛔', 'Ya utilizada', `${quien}<br>Entró ${horaCorta(r.primer_acceso)}.`);
  } else if (r.resultado === 'anulada') {
    mostrar('error', '❌', 'Entrada anulada', `${quien}<br>Esta entrada se ha reembolsado y no es válida.`);
  } else {
    mostrar('error', '❌', 'No existe', 'Este código no corresponde a ninguna entrada de la Turia Cup.');
  }
}

function mostrar(tipo, icono, titulo, detalle, codigoValido) {
  aviso(tipo);
  resultado.className = `control-resultado res-${tipo}`;
  document.getElementById('resIcono').textContent = icono;
  document.getElementById('resTitulo').textContent = titulo;
  document.getElementById('resDetalle').innerHTML = detalle;
  const deshacer = document.getElementById('deshacerBtn');
  deshacer.hidden = !codigoValido;
  deshacer.dataset.codigo = codigoValido || '';
  resultado.hidden = false;
  clearTimeout(temporizador);
  if (tipo === 'valida') temporizador = setTimeout(seguir, 2500);
}

function seguir() {
  clearTimeout(temporizador);
  resultado.hidden = true;
  ocupado = false;
}

document.getElementById('seguirBtn').addEventListener('click', seguir);

document.getElementById('deshacerBtn').addEventListener('click', async (ev) => {
  clearTimeout(temporizador);
  try {
    await fetchJson('/api/admin/entradas/deshacer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: ev.currentTarget.dataset.codigo }),
    });
    validadasSesion = Math.max(0, validadasSesion - 1);
    contadorHoy.textContent = `${validadasSesion} validadas`;
    ultimoCodigo = '';
    seguir();
  } catch (err) {
    alert(err.message);
  }
});

camaraBtn.addEventListener('click', activarCamara);

document.getElementById('manualForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const input = document.getElementById('manualCodigo');
  const codigo = input.value.trim();
  if (!codigo) return;
  input.value = '';
  input.blur();
  validar(codigo);
});

comprobarSesion();
