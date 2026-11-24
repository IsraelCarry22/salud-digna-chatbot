import express from 'express';
import { handleMessage, citas } from './flows.js';
import { sendText, config } from './evolution.js';
import { emit } from './orchestrator.js';
import { getSession, stats } from './sessions.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

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
    '';
  return {
    id: d.key.id,
    number: jid.split('@')[0],
    name: d.pushName || '',
    text,
  };
}

async function responder(number, mensajes) {
  for (const m of mensajes) {
    const ok = await sendText(number, m);
    if (ok) contador.salientes++;
    await emit('message_out', { patientId: number, text: m });
  }
}

// Webhook que recibe Evolution API (o el simulador)
app.post(['/webhook', '/webhook/:evento'], async (req, res) => {
  res.sendStatus(200); // responder rápido; procesamos después
  const m = parseUpsert(req.body);
  if (!m || !m.text) return;
  if (m.id && vistos.has(m.id)) return;
  if (m.id) {
    vistos.add(m.id);
    if (vistos.size > 5000) vistos.delete(vistos.values().next().value);
  }
  contador.entrantes++;
  await emit('message_in', { patientId: m.number, name: m.name, text: m.text });
  try {
    const respuestas = await handleMessage(m);
    await responder(m.number, respuestas);
  } catch (err) {
    console.error('[bot] error procesando mensaje', err);
    await responder(m.number, ['Ocurrió un error 😓. Escribe *menu* para intentar de nuevo.']);
  }
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
  if (folio && citas.has(folio) && estado) citas.get(folio).estado = estado;
  await responder(String(number), [text]);
  res.json({ ok: true });
});

app.get('/citas', (_req, res) => res.json([...citas.values()]));
app.get('/stats', (_req, res) => res.json({ ...contador, sesiones: stats(), citas: citas.size }));
app.get('/health', (_req, res) => res.json({ ok: true, evolution: config() }));

app.listen(PORT, () => {
  console.log(`[bot] Salud Digna chatbot escuchando en :${PORT}`);
  console.log(`[bot] Evolution API -> ${config().base} (instancia "${config().instance}")`);
});
