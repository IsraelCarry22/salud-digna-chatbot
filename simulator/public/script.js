// =========================================================
// Teléfono virtual · Chatbot Salud Digna
// Chats simulados, ubicación, eliminar chats, tema claro/oscuro
// y panel lateral en móvil.
// =========================================================

const $ = (id) => document.getElementById(id);
const chats = new Map(); // number -> { name, messages }
const noLeidos = new Map();
let actual = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Formato de WhatsApp: *negrita*, _cursiva_, ~tachado~ y enlaces
const formato = (t) =>
  esc(t)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const hora = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const iniciales = (n) => (n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const textoPlano = (t) => String(t || '').replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim();

// ---------- Números de teléfono (México: +52 y 10 dígitos) ----------
// Saca los 10 dígitos nacionales de lo que venga: "+52 866 123 4567", "528661234567" o "5218661234567"
function diezDigitos(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3); // formato antiguo de WhatsApp móvil
  else if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  return d.slice(0, 10);
}
// 8661234567 -> "+52 866 123 4567"
function formatearNumero(valor) {
  const d = diezDigitos(valor);
  return ['+52', d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}
// Identificador que viaja al bot: 52 + 10 dígitos
const numeroCompleto = (valor) => '52' + diezDigitos(valor);

// Lo que el usuario escribe en el campo: siempre "+52 " + máximo 10 dígitos agrupados 3-3-4
function digitosDelCampo(valor) {
  return String(valor || '').replace(/^\s*\+?\s*52\s*/, '').replace(/\D/g, '').slice(0, 10);
}
function mascaraNumero() {
  const d = digitosDelCampo($('num').value);
  $('num').value = d ? formatearNumero(d) : '+52 ';
}
$('num').addEventListener('input', mascaraNumero);
$('num').addEventListener('focus', () => { if (!digitosDelCampo($('num').value)) $('num').value = '+52 '; });

function asegurar(number, name) {
  if (!chats.has(number)) chats.set(number, { name: name || '', messages: [] });
  if (name) chats.get(number).name = name;
  return chats.get(number);
}

// ---------- Tema claro / oscuro ----------
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  $('btnTema').textContent = tema === 'oscuro' ? '☀️' : '🌙';
  $('btnTema').title = tema === 'oscuro' ? 'Modo claro' : 'Modo oscuro';
  try { localStorage.setItem('tema', tema); } catch {}
}
$('btnTema').onclick = () => aplicarTema(document.documentElement.dataset.tema === 'oscuro' ? 'claro' : 'oscuro');
aplicarTema(document.documentElement.dataset.tema || 'claro');

// ---------- Panel lateral (móvil) ----------
const esMovil = () => window.matchMedia('(max-width: 760px)').matches;
function abrirPanel() {
  $('panel').classList.add('abierto');
  $('velo').hidden = false;
}
function cerrarPanel() {
  $('panel').classList.remove('abierto');
  $('velo').hidden = true;
}
$('abrirPanel').onclick = abrirPanel;
$('cerrarPanel').onclick = cerrarPanel;
$('velo').onclick = cerrarPanel;
window.addEventListener('resize', () => { if (!esMovil()) cerrarPanel(); });

// ---------- Lista de pacientes ----------
function pintarPacientes() {
  const cont = $('pacientes');
  cont.innerHTML = '';
  $('conteo').textContent = chats.size ? `(${chats.size})` : '';
  if (!chats.size) {
    cont.innerHTML = '<div class="lista-vacia">No hay chats. Escribe un número y nombre arriba para abrir uno.</div>';
    return;
  }
  for (const [number, c] of chats) {
    const div = document.createElement('div');
    div.className = 'pac' + (number === actual ? ' activo' : '');
    const n = noLeidos.get(number) || 0;
    const ultimo = c.messages[c.messages.length - 1];
    const vista = ultimo ? (ultimo.location ? '📍 Ubicación' : textoPlano(ultimo.text)) : formatearNumero(number);
    div.innerHTML = `<div class="av">${esc(iniciales(c.name || number))}</div>
      <div class="info"><div class="nom">${esc(c.name || 'Paciente')}</div><div class="ultimo">${esc(vista)}</div></div>
      ${n ? `<span class="badge">${n}</span>` : ''}
      <button type="button" class="borrar" title="Eliminar chat" aria-label="Eliminar chat de ${esc(c.name || number)}">🗑️</button>`;
    div.onclick = () => abrir(number);
    div.querySelector('.borrar').onclick = (e) => {
      e.stopPropagation();
      pedirBorrado(number, 'eliminar');
    };
    cont.appendChild(div);
  }
}

// ---------- Mensajes ----------
function burbuja(m) {
  const div = document.createElement('div');
  div.className = 'msg ' + (m.from === 'bot' ? 'bot' : 'patient');
  if (m.location) {
    const { lat, lng, nombre } = m.location;
    div.innerHTML =
      `<a class="mapa" href="https://www.google.com/maps/search/?api=1&query=${lat},${lng}" target="_blank" rel="noopener">` +
      `<b>📍 Ubicación${nombre ? ' · ' + esc(nombre) : ''}</b>${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}</a>` +
      `<span class="hora">${hora(m.ts)}</span>`;
  } else {
    div.innerHTML = formato(m.text) + `<span class="hora">${hora(m.ts)}</span>`;
  }
  return div;
}

function bajarAlFinal() {
  const chat = $('chat');
  chat.scrollTop = chat.scrollHeight;
}

function pintarChat() {
  const chat = $('chat');
  chat.innerHTML = '';
  if (!actual || !chats.has(actual)) {
    $('sub').textContent = 'Asistente virtual · en línea';
    chat.innerHTML = '<div class="vacio">No hay ningún chat abierto.<br>Crea uno desde el panel de pacientes.</div>';
    return;
  }
  const c = chats.get(actual);
  $('sub').textContent = `Chat con ${c.name || 'paciente'} · ${formatearNumero(actual)}`;
  const aviso = document.createElement('div');
  aviso.className = 'aviso';
  aviso.textContent = `Chat simulado · paciente ${formatearNumero(actual)}. Escribe "hola" o "menu" para empezar.`;
  chat.appendChild(aviso);
  for (const m of c.messages) chat.appendChild(burbuja(m));
  bajarAlFinal();
}

function abrir(number) {
  actual = number;
  noLeidos.delete(number);
  const c = chats.get(number);
  $('num').value = formatearNumero(number);
  $('nom').value = c?.name || '';
  pintarPacientes();
  pintarChat();
  if (esMovil()) cerrarPanel();
  else $('texto').focus();
}

$('formNuevo').onsubmit = (e) => {
  e.preventDefault();
  const d = digitosDelCampo($('num').value);
  if (d.length !== 10) return alertaEstado(`El número debe tener 10 dígitos después del +52 (llevas ${d.length}).`, true);
  const number = numeroCompleto(d);
  asegurar(number, $('nom').value.trim());
  abrir(number);
};

// Envía un mensaje del paciente (texto o ubicación) al simulador
async function enviar(extra) {
  if (!actual) {
    const d = digitosDelCampo($('num').value);
    if (d.length !== 10) return alertaEstado('Primero abre un chat con un número de 10 dígitos', true);
    const number = numeroCompleto(d);
    asegurar(number, $('nom').value.trim());
    abrir(number);
  }
  $('escribiendo').style.display = 'block';
  try {
    const r = await fetch('/ui/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: actual, name: chats.get(actual)?.name || '', ...extra }),
    });
    if (!r.ok) alertaEstado('El bot no respondió. ¿Está corriendo el contenedor "bot"?', true);
  } catch {
    alertaEstado('Sin conexión con el simulador', true);
  }
  setTimeout(() => ($('escribiendo').style.display = 'none'), 1500);
}

$('form').onsubmit = (e) => {
  e.preventDefault();
  const text = $('texto').value.trim();
  if (!text) return;
  $('texto').value = '';
  enviar({ text });
};

// ---------- Menús flotantes (ubicación y opciones del chat) ----------
function alternarMenu(id, e) {
  e.stopPropagation();
  const menu = $(id);
  const abrirlo = menu.hidden;
  document.querySelectorAll('.menu-flotante').forEach((m) => (m.hidden = true));
  menu.hidden = !abrirlo;
}
$('btnUbic').onclick = (e) => alternarMenu('menuUbic', e);
$('btnMenuChat').onclick = (e) => alternarMenu('menuChat', e);
document.addEventListener('click', (e) => {
  document.querySelectorAll('.menu-flotante').forEach((m) => {
    if (!m.contains(e.target)) m.hidden = true;
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.menu-flotante').forEach((m) => (m.hidden = true));
  cerrarModal();
  cerrarPanel();
});

$('menuUbic').querySelectorAll('button').forEach((b) => {
  b.onclick = () => {
    $('menuUbic').hidden = true;
    if (b.dataset.gps !== undefined) {
      if (!navigator.geolocation) return alertaEstado('Tu navegador no permite geolocalización; usa una ciudad demo.', true);
      alertaEstado('Obteniendo tu ubicación…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          alertaEstado('● Ubicación enviada');
          enviar({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude, nombre: 'Ubicación actual' } });
        },
        (err) => alertaEstado(`No se pudo obtener la ubicación (${err.message}). Usa una ciudad demo.`, true),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      enviar({ location: { lat: b.dataset.lat, lng: b.dataset.lng, nombre: b.dataset.nom } });
    }
  };
});

$('menuChat').querySelectorAll('button').forEach((b) => {
  b.onclick = () => {
    $('menuChat').hidden = true;
    if (!actual) return alertaEstado('No hay un chat abierto', true);
    pedirBorrado(actual, b.dataset.accion);
  };
});

// ---------- Eliminar chats ----------
const TEXTOS_BORRADO = {
  vaciar: {
    titulo: '¿Vaciar los mensajes?',
    texto: (n) => `Se borrarán los mensajes del chat con ${n}. El contacto sigue en la lista y el bot conserva su memoria.`,
    boton: 'Vaciar',
  },
  eliminar: {
    titulo: '¿Eliminar este chat?',
    texto: (n) => `Se eliminará el chat con ${n} de la lista. El bot seguirá recordando a este paciente (sus citas y preferencias).`,
    boton: 'Eliminar',
  },
  olvidar: {
    titulo: '¿Eliminar chat y memoria?',
    texto: (n) => `Se eliminará el chat con ${n} y el bot olvidará todo sobre este paciente: nombre, sucursal, ubicación y citas. Úsalo para empezar una demo desde cero.`,
    boton: 'Eliminar todo',
  },
};
let pendiente = null;

function pedirBorrado(number, accion) {
  const c = chats.get(number);
  const nombre = c?.name ? `${c.name} (${formatearNumero(number)})` : formatearNumero(number);
  const t = TEXTOS_BORRADO[accion];
  pendiente = { number, accion };
  $('modalTit').textContent = t.titulo;
  $('modalTxt').textContent = t.texto(nombre);
  $('modalSi').textContent = t.boton;
  $('modal').hidden = false;
  $('modalNo').focus();
}
function cerrarModal() {
  $('modal').hidden = true;
  pendiente = null;
}
$('modalNo').onclick = cerrarModal;
$('modal').onclick = (e) => { if (e.target === $('modal')) cerrarModal(); };
$('modalSi').onclick = async () => {
  if (!pendiente) return;
  const { number, accion } = pendiente;
  cerrarModal();
  try {
    const r = await fetch(`/ui/chats/${encodeURIComponent(number)}?modo=${accion}`, { method: 'DELETE' });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) return alertaEstado(res.error || 'No se pudo eliminar', true);
    aplicarBorrado(number, accion);
    if (accion === 'olvidar' && res.memoria === false) alertaEstado('Chat eliminado, pero no se pudo borrar la memoria del bot', true);
    else alertaEstado(accion === 'vaciar' ? '● Mensajes vaciados' : '● Chat eliminado');
  } catch {
    alertaEstado('Sin conexión con el simulador', true);
  }
};

// Aplica un borrado (propio o llegado por tiempo real desde otra pestaña)
function aplicarBorrado(number, accion) {
  if (accion === 'vaciar') {
    if (chats.has(number)) chats.get(number).messages = [];
  } else {
    chats.delete(number);
    noLeidos.delete(number);
    if (actual === number) actual = [...chats.keys()][0] || null;
  }
  pintarPacientes();
  if (actual) abrir(actual);
  else pintarChat();
}

// ---------- Estado y tiempo real ----------
function alertaEstado(txt, error) {
  const e = $('estado');
  e.textContent = txt;
  e.className = 'estado' + (error ? ' off' : '');
}

function conectar() {
  const es = new EventSource('/ui/events');
  es.onopen = () => alertaEstado('● Instancia simulada conectada (estado: open)');
  es.onerror = () => alertaEstado('Reconectando con el simulador…', true);
  es.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.tipo === 'borrado') return aplicarBorrado(m.number, m.modo);
    const c = asegurar(m.number);
    if (c.messages.some((x) => x.id === m.id)) return;
    c.messages.push(m);
    if (m.from === 'bot') $('escribiendo').style.display = 'none';
    if (m.number === actual) {
      $('chat').appendChild(burbuja(m));
      bajarAlFinal();
    } else if (m.from === 'bot') {
      noLeidos.set(m.number, (noLeidos.get(m.number) || 0) + 1);
    }
    pintarPacientes();
  };
}

async function cargar() {
  try {
    const lista = await (await fetch('/ui/chats')).json();
    for (const c of lista) chats.set(c.number, { name: c.name, messages: c.messages });
  } catch {}
  if (!chats.size) asegurar(numeroCompleto(digitosDelCampo($('num').value)), $('nom').value);
  actual = [...chats.keys()][0];
  pintarPacientes();
  pintarChat();
  conectar();
}

const reloj = () => ($('reloj').textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
setInterval(reloj, 10000);
reloj();
cargar();
