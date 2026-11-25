// Conector oficial: WhatsApp Cloud API de Meta.
// - Verifica el webhook (GET con hub.challenge) y la firma X-Hub-Signature-256 de cada POST.
// - Convierte los mensajes de Meta al mismo formato que usa el bot ({ id, number, name, text, location }).
// - Envía texto, marca como leído y muestra "escribiendo…".
// Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/

import crypto from 'node:crypto';

const TOKEN = process.env.META_TOKEN || '';
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || '';
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'saluddigna-verify';
const APP_SECRET = process.env.META_APP_SECRET || '';
const VERSION = process.env.META_API_VERSION || 'v25.0';
// Números de México: el webhook llega como 521XXXXXXXXXX, pero para enviar (sobre todo
// con el número de prueba) hay que usar 52XXXXXXXXXX o Meta responde el error 131030.
const MX_QUITAR_1 = (process.env.META_MX_QUITAR_1 || 'true') !== 'false';

const GRAPH = (process.env.META_GRAPH_URL || 'https://graph.facebook.com').replace(/\/$/, ''); // se puede apuntar a un mock en pruebas
const API = `${GRAPH}/${VERSION}/${PHONE_NUMBER_ID}/messages`;
const LIMITE = 4096; // máximo de caracteres por mensaje de texto

export const metaActivo = () => Boolean(TOKEN && PHONE_NUMBER_ID);

export function config() {
  return {
    activo: metaActivo(),
    version: VERSION,
    phoneNumberId: PHONE_NUMBER_ID ? `…${PHONE_NUMBER_ID.slice(-4)}` : null,
    firmaVerificada: Boolean(APP_SECRET),
  };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

// GET /meta/webhook: Meta lo llama una vez al registrar la URL
export function verificarSuscripcion(query) {
  const ok = query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === VERIFY_TOKEN;
  return ok ? String(query['hub.challenge'] ?? '') : null;
}

// Comprueba que el POST viene de Meta (HMAC-SHA256 del cuerpo crudo con el App Secret)
export function firmaValida(rawBody, header) {
  if (!APP_SECRET) return true; // sin App Secret configurado no se valida (solo para pruebas)
  if (!rawBody || !header || !header.startsWith('sha256=')) return false;
  const esperado = crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
  const recibido = header.slice('sha256='.length);
  if (recibido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibido, 'hex'), Buffer.from(esperado, 'hex'));
}

// Convierte el payload de Meta en mensajes para el bot. Ignora estados (sent, delivered, read).
export function parseMeta(body) {
  const mensajes = [];
  if (body?.object !== 'whatsapp_business_account') return mensajes;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      if (v.metadata?.phone_number_id && PHONE_NUMBER_ID && v.metadata.phone_number_id !== PHONE_NUMBER_ID) continue;
      const nombres = Object.fromEntries((v.contacts || []).map((c) => [c.wa_id, c.profile?.name || '']));
      for (const m of v.messages || []) {
        let text = '';
        let location = null;
        switch (m.type) {
          case 'text':
            text = m.text?.body || '';
            break;
          case 'interactive':
            text = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
            break;
          case 'button':
            text = m.button?.text || '';
            break;
          case 'location':
            location = { lat: Number(m.location.latitude), lng: Number(m.location.longitude) };
            break;
          case 'image':
          case 'video':
          case 'document':
            text = m[m.type]?.caption || '';
            break;
          default:
            text = ''; // audio, sticker, reacción…: el bot avisa que no lo puede leer
        }
        mensajes.push({ id: m.id, number: m.from, name: nombres[m.from] || '', text, location, tipo: m.type });
      }
    }
  }
  return mensajes;
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------
export function numeroParaEnviar(number) {
  const n = String(number).replace(/\D/g, '');
  return MX_QUITAR_1 && n.length === 13 && n.startsWith('521') ? `52${n.slice(3)}` : n;
}

async function llamar(payload) {
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = data.error || {};
      const pistas = {
        131030: 'Agrega este número a la lista de destinatarios del número de prueba (API Setup > To).',
        131047: 'Pasaron más de 24 h desde el último mensaje del paciente: solo se pueden enviar plantillas.',
        190: 'El token expiró o es inválido. Genera uno nuevo (el temporal dura 24 h).',
        100: 'Revisa META_PHONE_NUMBER_ID y los parámetros enviados.',
      };
      console.error(`[meta] error ${e.code || res.status}: ${e.message || 'sin detalle'}${pistas[e.code] ? ' → ' + pistas[e.code] : ''}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[meta] no se pudo conectar con graph.facebook.com: ${err.message}`);
    return false;
  }
}

// Divide textos largos respetando saltos de línea
function partir(texto) {
  if (texto.length <= LIMITE) return [texto];
  const partes = [];
  let actual = '';
  for (const linea of texto.split('\n')) {
    if ((actual + '\n' + linea).length > LIMITE) {
      partes.push(actual);
      actual = linea;
    } else actual = actual ? `${actual}\n${linea}` : linea;
  }
  if (actual) partes.push(actual);
  return partes;
}

export async function sendText(number, text) {
  let ok = true;
  for (const parte of partir(text)) {
    ok =
      (await llamar({
        recipient_type: 'individual',
        to: numeroParaEnviar(number),
        type: 'text',
        text: { preview_url: false, body: parte },
      })) && ok;
  }
  return ok;
}

// Palomitas azules + "escribiendo…" mientras el bot prepara la respuesta (se quita solo al responder)
export function marcarLeidoYEscribiendo(messageId) {
  if (!messageId) return Promise.resolve(false);
  return llamar({ status: 'read', message_id: messageId, typing_indicator: { type: 'text' } });
}

// Plantilla aprobada (necesaria para escribir fuera de la ventana de 24 h, p. ej. recordatorios)
export function sendTemplate(number, nombre = process.env.META_TEMPLATE || 'hello_world', idioma = process.env.META_TEMPLATE_LANG || 'en_US') {
  return llamar({
    recipient_type: 'individual',
    to: numeroParaEnviar(number),
    type: 'template',
    template: { name: nombre, language: { code: idioma } },
  });
}
