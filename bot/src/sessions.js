// Estado de la conversación (en qué paso va cada paciente). Vive en memoria y expira
// tras 30 min sin actividad. Lo que el bot "recuerda" a largo plazo está en store.js.

const TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

export function getSession(number) {
  const now = Date.now();
  let s = sessions.get(number);
  if (!s || now - s.updatedAt > TTL_MS) {
    s = { step: 'nuevo', data: {}, historial: [], errores: 0, updatedAt: now };
    sessions.set(number, s);
  }
  s.updatedAt = now;
  return s;
}

export function reset(session, step = 'menu') {
  session.step = step;
  session.data = {};
  session.historial = [];
  session.errores = 0;
}

export function borrarSesion(number) {
  sessions.delete(number);
}

export function stats() {
  const porPaso = {};
  for (const s of sessions.values()) porPaso[s.step] = (porPaso[s.step] || 0) + 1;
  return { activas: sessions.size, porPaso };
}
