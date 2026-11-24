// Simulador de Evolution API v2 + teléfono virtual tipo WhatsApp.
// Implementa los mismos endpoints y el mismo formato de webhook que Evolution API,
// para que el bot no note la diferencia. NO se conecta a WhatsApp ni a ningún teléfono.

import express from 'express';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.AUTHENTICATION_API_KEY || 'cambia-esta-clave';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'saluddigna';
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://bot:3001/webhook';
const INSTANCE_ID = randomUUID();

const chats = new Map(); // number -> { name, messages: [] }
const clientes = new Set(); // conexiones SSE del navegador

const soloNumero = (n) => String(n || '').split('@')[0].replace(/\D/g, '');

function guardar(number, msg) {
  if (!chats.has(number)) chats.set(number, { name: '', messages: [] });
  const chat = chats.get(number);
  chat.messages.push(msg);
  if (chat.messages.length > 300) chat.messages.shift();
  const data = `data: ${JSON.stringify({ number, ...msg })}\n\n`;
  for (const c of clientes) c.write(data);
}

function auth(req, res, next) {
  if (req.get('apikey') !== API_KEY) return res.status(401).json({ status: 401, error: 'Unauthorized' });
  next();
}

// ---------- Endpoints compatibles con Evolution API v2 ----------

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/instance/fetchInstances', auth, (_req, res) =>
  res.json([{ name: INSTANCE, connectionStatus: 'open', integration: 'SIMULATOR', id: INSTANCE_ID }])
);

app.get('/instance/connectionState/:instance', auth, (req, res) =>
  res.json({ instance: { instanceName: req.params.instance, state: 'open' } })
);

app.post('/message/sendText/:instance', auth, async (req, res) => {
  const { number, text, delay } = req.body || {};
  if (!number || !text) return res.status(400).json({ status: 400, error: 'number y text son obligatorios' });
  const n = soloNumero(number);
  const id = randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
  if (delay) await new Promise((r) => setTimeout(r, Math.min(Number(delay) || 0, 3000)));
  guardar(n, { id, from: 'bot', text, ts: Date.now() });
  res.status(201).json({
    key: { remoteJid: `${n}@s.whatsapp.net`, fromMe: true, id },
    message: { conversation: text },
    messageType: 'conversation',
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 'PENDING',
  });
});

// ---------- API del teléfono virtual (la usa el navegador) ----------

app.get('/ui/config', (_req, res) => res.json({ instance: INSTANCE, webhook: WEBHOOK_URL }));

app.get('/ui/chats', (_req, res) =>
  res.json([...chats.entries()].map(([number, c]) => ({ number, name: c.name, messages: c.messages })))
);

app.get('/ui/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(': conectado\n\n');
  clientes.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clientes.delete(res);
  });
});

// El "paciente" escribe en el teléfono virtual -> se manda al bot como webhook messages.upsert
app.post('/ui/send', async (req, res) => {
  const number = soloNumero(req.body?.number);
  const name = String(req.body?.name || '').slice(0, 60);
  const text = String(req.body?.text || '').slice(0, 4000);
  const loc = req.body?.location;
  const location =
    loc && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))
      ? { lat: Number(loc.lat), lng: Number(loc.lng), nombre: String(loc.nombre || '').slice(0, 80) }
      : null;
  if (!number || (!text && !location)) return res.status(400).json({ error: 'number y text (o location) son obligatorios' });

  const id = randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase();
  if (!chats.has(number)) chats.set(number, { name, messages: [] });
  if (name) chats.get(number).name = name;
  guardar(number, { id, from: 'patient', text: location ? '📍 Ubicación' : text, location, ts: Date.now() });

  // Mismo formato que Evolution API: texto -> conversation, ubicación -> locationMessage
  const message = location
    ? { locationMessage: { degreesLatitude: location.lat, degreesLongitude: location.lng, name: location.nombre || '', address: '' } }
    : { conversation: text };

  const payload = {
    event: 'messages.upsert',
    instance: INSTANCE,
    data: {
      key: { remoteJid: `${number}@s.whatsapp.net`, fromMe: false, id },
      pushName: name,
      message,
      messageType: location ? 'locationMessage' : 'conversation',
      messageTimestamp: Math.floor(Date.now() / 1000),
      instanceId: INSTANCE_ID,
      source: 'web',
    },
    destination: WEBHOOK_URL,
    date_time: new Date().toISOString(),
    sender: `${number}@s.whatsapp.net`,
    server_url: `http://simulator:${PORT}`,
    apikey: API_KEY,
  };

  try {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    res.json({ ok: r.ok, id });
  } catch (err) {
    console.error(`[simulador] el bot no responde en ${WEBHOOK_URL}: ${err.message}`);
    res.status(502).json({ ok: false, error: 'El bot no está disponible' });
  }
});

app.listen(PORT, () => {
  console.log(`[simulador] Evolution API simulada + teléfono virtual en :${PORT}`);
  console.log(`[simulador] webhook -> ${WEBHOOK_URL}`);
});
