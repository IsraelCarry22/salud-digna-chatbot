// Sesiones en memoria con expiración. Para producción se cambia por Redis
// (ya viene en el docker-compose con el perfil "evolution").

const TTL_MS = 30 * 60 * 1000; // 30 min sin actividad = sesión nueva
const sessions = new Map();

export function getSession(number) {
  const now = Date.now();
  let s = sessions.get(number);
  if (!s || now - s.updatedAt > TTL_MS) {
    s = { step: 'nuevo', data: {}, updatedAt: now };
    sessions.set(number, s);
  }
  s.updatedAt = now;
  return s;
}

export function reset(session) {
  session.step = 'menu';
  session.data = {};
}

export function stats() {
  const byStep = {};
  for (const s of sessions.values()) byStep[s.step] = (byStep[s.step] || 0) + 1;
  return { activas: sessions.size, porPaso: byStep };
}
