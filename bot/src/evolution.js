// Cliente mínimo de Evolution API v2.
// Funciona igual contra el simulador (teléfono virtual) o contra Evolution API real:
// solo cambia EVOLUTION_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE en el .env.

const BASE = (process.env.EVOLUTION_URL || 'http://simulator:8080').replace(/\/$/, '');
const API_KEY = process.env.EVOLUTION_API_KEY || 'cambia-esta-clave';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'saluddigna';

export async function sendText(number, text) {
  const url = `${BASE}/message/sendText/${encodeURIComponent(INSTANCE)}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: API_KEY },
      body: JSON.stringify({ number, text, delay: 600 }),
    });
    if (!res.ok) {
      console.error(`[evolution] sendText ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[evolution] no se pudo conectar con ${BASE}: ${err.message}`);
    return false;
  }
}

export function config() {
  return { base: BASE, instance: INSTANCE };
}
