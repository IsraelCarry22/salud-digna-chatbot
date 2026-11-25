import express from 'express';
import { handleMessage } from './flows.js';
import { citas, resumen, olvidar } from './store.js';
import { sendText, registrarCanal, canal, config } from './canales.js';
import * as meta from './meta.js';
import { emit } from './orchestrator.js';
import { getSession, stats, borrarSesion } from './sessions.js';

const app = express();
// Guardamos el cuerpo crudo: Meta firma exactamente esos bytes (X-Hub-Signature-256)
app.use(express.json({ limit: '5mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

const PORT = process.env.PORT || 3001;
const vistos = new Set(); // evita procesar dos veces el mismo mensaje
let contador = { entrantes: 0, salientes: 0 };

// Extrae número, nombre y texto de un evento messages.upsert de Evolution API v2
function parseUpsert(body) {
  const evento = String(body?.event || '').toLowerCase().replace('_', '.');
  if (evento !== 'messages.upsert') return null;
  const d = Array.isArray(body.data) ? body.data[0] : body.data;
  if (!d?.key || d.key.fromMe) return null;
  const jid = d.key.remoteJid || '';
  if (jid.endsWith('@g.us')) return null; // ignorar grupos
  const msg = d.message || {};
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.buttonsResponseMessage?.selectedDisplayText ||
    msg.listResponseMessage?.title ||
    msg.imageMessage?.caption ||
    '';
  // Ubicación compartida (fija o en tiempo real)
  const loc = msg.locationMessage || msg.liveLocationMessage;
  const location =
    loc && Number.isFinite(Number(loc.degreesLatitude))
      ? { lat: Number(loc.degreesLatitude), lng: Number(loc.degreesLongitude) }
      : null;
  return {
    id: d.key.id,
    number: jid.split('@')[0],
    name: d.pushName || '',
    text,
    location,
    tipo: d.messageType || Object.keys(msg)[0] || 'desconocido',
  };
}

async function responder(number, mensajes) {
  for (const m of mensajes) {
    const ok = await sendText(number, m);
    if (ok) contador.salientes++;
    await emit('message_out', { patientId: number, text: m });
  }
}

// Procesa un mensaje entrante de cualquier canal con la misma lógica
async function procesar(m, origen) {
  if (m.id && vistos.has(m.id)) return; // Meta y Evolution pueden reintentar el mismo evento
  if (m.id) {
    vistos.add(m.id);
    if (vistos.size > 5000) vistos.delete(vistos.values().next().value);
  }
  registrarCanal(m.number, origen);
  contador.entrantes++;
  if (origen === 'meta') meta.marcarLeidoYEscribiendo(m.id); // palomitas azules + "escribiendo…"
  await emit('message_in', { patientId: m.number, name: m.name, text: m.text, location: m.location, tipo: m.tipo, origen });
  try {
    const respuestas = await handleMessage(m);
    await responder(m.number, respuestas);
  } catch (err) {
    console.error('[bot] error procesando mensaje', err);
    await responder(m.number, ['Ocurrió un error 😓. Escribe *menu* para intentar de nuevo.']);
  }
}

// Webhook de Evolution API (o el simulador)
app.post(['/webhook', '/webhook/:evento'], async (req, res) => {
  res.sendStatus(200); // responder rápido; procesamos después
  const m = parseUpsert(req.body);
  if (m) await procesar(m, 'evolution');
});

// Webhook de WhatsApp Cloud API (Meta)
// 1) Verificación: Meta llama GET con hub.mode, hub.verify_token y hub.challenge
app.get('/meta/webhook', (req, res) => {
  const challenge = meta.verificarSuscripcion(req.query);
  if (challenge === null) {
    console.warn('[meta] verificación rechazada: revisa META_VERIFY_TOKEN');
    return res.sendStatus(403);
  }
  console.log('[meta] webhook verificado ✅');
  res.status(200).type('text/plain').send(challenge);
});
// 2) Mensajes: POST firmado con X-Hub-Signature-256
app.post('/meta/webhook', async (req, res) => {
  if (!meta.firmaValida(req.rawBody, req.get('x-hub-signature-256'))) {
    console.warn('[meta] firma inválida: mensaje descartado');
    return res.sendStatus(401);
  }
  res.sendStatus(200); // Meta reintenta si no recibe 200 rápido
  for (const m of meta.parseMeta(req.body)) await procesar(m, 'meta');
});

// El call center / agente humano responde al paciente por WhatsApp
app.post('/agent/reply', async (req, res) => {
  const { number, text, agente } = req.body || {};
  if (!number || !text) return res.status(400).json({ error: 'number y text son obligatorios' });
  const s = getSession(String(number));
  if (s.step !== 'agente') s.step = 'agente';
  await responder(String(number), [`👩‍⚕️ ${agente || 'Agente'}: ${text}`]);
  res.json({ ok: true });
});

// Trigger: el orquestador manda un mensaje proactivo (resultados listos, recordatorio, etc.)
app.post('/notify', async (req, res) => {
  const { number, text, folio, estado } = req.body || {};
  if (!number || !text) return res.status(400).json({ error: 'number y text son obligatorios' });
  if (folio && estado && citas.get(folio)) citas.update(folio, { estado });
  // En Meta, fuera de la ventana de 24 h solo se permiten plantillas: con plantilla=true se manda una
  if (req.body.plantilla && canal(String(number)) === 'meta') {
    const ok = await meta.sendTemplate(String(number), req.body.plantilla === true ? undefined : req.body.plantilla);
    return res.json({ ok, tipo: 'plantilla' });
  }
  await responder(String(number), [text]);
  res.json({ ok: true, canal: canal(String(number)) });
});

// Olvidar a un paciente (lo usa el botón "Eliminar chat y memoria" del simulador)
app.delete('/pacientes/:number', async (req, res) => {
  const number = String(req.params.number).replace(/\D/g, '');
  if (!number) return res.status(400).json({ error: 'Número inválido' });
  borrarSesion(number);
  const r = olvidar(number);
  await emit('patient_forgotten', { patientId: number, ...r });
  res.json({ ok: true, ...r });
});

app.get('/citas', (_req, res) => res.json(citas.todas()));
app.get('/stats', (_req, res) => res.json({ ...contador, sesiones: stats(), memoria: resumen() }));
app.get('/health', (_req, res) => res.json({ ok: true, canales: config() }));

app.listen(PORT, () => {
  console.log(`[bot] Salud Digna chatbot escuchando en :${PORT}`);
  const c = config();
  console.log(`[bot] Evolution/simulador -> ${c.evolution.base} (instancia "${c.evolution.instance}")`);
  console.log(
    c.meta.activo
      ? `[bot] WhatsApp Cloud API (Meta) activa: ${c.meta.version}, número …${c.meta.phoneNumberId?.slice(-4)}; webhook en /meta/webhook${c.meta.firmaVerificada ? '' : ' (⚠️ sin META_APP_SECRET: firma no verificada)'}`
      : '[bot] WhatsApp Cloud API (Meta) inactiva: define META_TOKEN y META_PHONE_NUMBER_ID para activarla'
  );
});
