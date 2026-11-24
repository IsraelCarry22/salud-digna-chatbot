const $ = (id) => document.getElementById(id);
const chats = new Map();     // number -> { name, messages }
const noLeidos = new Map();
let actual = null;

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Formato de WhatsApp: *negrita*, _cursiva_, ~tachado~ y enlaces
const formato = (t) => esc(t)
.replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<i>$2</i>')
.replace(/~([^~\n]+)~/g, '<s>$1</s>')
.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const hora = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
const iniciales = (n) => (n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

function asegurar(number, name) {
if (!chats.has(number)) chats.set(number, { name: name || '', messages: [] });
if (name) chats.get(number).name = name;
return chats.get(number);
}

function pintarPacientes() {
const cont = $('pacientes');
cont.innerHTML = '';
for (const [number, c] of chats) {
	const div = document.createElement('div');
	div.className = 'pac' + (number === actual ? ' activo' : '');
	const n = noLeidos.get(number) || 0;
	div.innerHTML = `<div class="av">${esc(iniciales(c.name || number))}</div>
	<div><div class="nom">${esc(c.name || 'Paciente')}</div><div class="num">+${esc(number)}</div></div>
	${n ? `<span class="badge">${n}</span>` : ''}`;
	div.onclick = () => abrir(number);
	cont.appendChild(div);
}
}

function burbuja(m) {
const div = document.createElement('div');
div.className = 'msg ' + (m.from === 'bot' ? 'bot' : 'patient');
div.innerHTML = formato(m.text) + `<span class="hora">${hora(m.ts)}</span>`;
return div;
}

function pintarChat() {
const chat = $('chat');
chat.innerHTML = '';
if (!actual) { chat.innerHTML = '<div class="vacio">Abre un chat desde el panel izquierdo.</div>'; return; }
const aviso = document.createElement('div');
aviso.className = 'aviso';
aviso.textContent = `Chat simulado · paciente +${actual}. Escribe "hola" o "menu" para empezar.`;
chat.appendChild(aviso);
for (const m of chats.get(actual).messages) chat.appendChild(burbuja(m));
chat.scrollTop = chat.scrollHeight;
}

function abrir(number) {
actual = number;
noLeidos.delete(number);
const c = chats.get(number);
$('num').value = number;
$('nom').value = c?.name || '';
pintarPacientes();
pintarChat();
$('texto').focus();
}

$('nuevo').onclick = () => {
const number = $('num').value.replace(/\D/g, '');
if (!number) return alertaEstado('Escribe un número', true);
asegurar(number, $('nom').value.trim());
abrir(number);
};

$('form').onsubmit = async (e) => {
e.preventDefault();
const text = $('texto').value.trim();
if (!text) return;
if (!actual) $('nuevo').click();
$('texto').value = '';
$('escribiendo').style.display = 'block';
try {
	const r = await fetch('/ui/send', {
	method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ number: actual, name: chats.get(actual)?.name || '', text }),
	});
	if (!r.ok) alertaEstado('El bot no respondió. ¿Está corriendo el contenedor "bot"?', true);
} catch { alertaEstado('Sin conexión con el simulador', true); }
setTimeout(() => ($('escribiendo').style.display = 'none'), 1500);
};

function alertaEstado(txt, error) {
const e = $('estado');
e.textContent = txt;
e.className = 'estado' + (error ? ' off' : '');
}

// Mensajes en tiempo real (del paciente y respuestas del bot)
function conectar() {
const es = new EventSource('/ui/events');
es.onopen = () => alertaEstado('● Instancia simulada conectada (estado: open)');
es.onerror = () => alertaEstado('Reconectando con el simulador…', true);
es.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	const c = asegurar(m.number);
	if (c.messages.some((x) => x.id === m.id)) return;
	c.messages.push(m);
	if (m.from === 'bot') $('escribiendo').style.display = 'none';
	if (m.number === actual) {
	$('chat').appendChild(burbuja(m));
	$('chat').scrollTop = $('chat').scrollHeight;
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
if (!chats.size) asegurar($('num').value, $('nom').value);
abrir([...chats.keys()][0]);
conectar();
}

setInterval(() => ($('reloj').textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })), 10000);
$('reloj').textContent = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
cargar();