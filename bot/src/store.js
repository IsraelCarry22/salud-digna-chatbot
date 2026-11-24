// "Memoria" del bot: perfil de cada paciente y citas, guardados en un JSON.
// Sobrevive reinicios del contenedor gracias al volumen bot_data (ver docker-compose).
// En producción esto sería una base de datos (Postgres/Redis), con la misma interfaz.

import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DIR, 'memoria.json');

let db = { perfiles: {}, citas: {} };
try {
  db = { perfiles: {}, citas: {}, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  console.log(`[memoria] cargados ${Object.keys(db.perfiles).length} perfiles y ${Object.keys(db.citas).length} citas`);
} catch {
  console.log('[memoria] sin datos previos; empezando vacío');
}

let timer = null;
function guardar() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
    } catch (err) {
      console.error('[memoria] no se pudo guardar:', err.message);
    }
  }, 300);
}

// ---------- Perfiles ----------
export function perfil(number) {
  if (!db.perfiles[number]) {
    db.perfiles[number] = { number, nombre: '', visitas: 0, creado: new Date().toISOString() };
  }
  return db.perfiles[number];
}

export function actualizarPerfil(number, cambios) {
  Object.assign(perfil(number), cambios, { actualizado: new Date().toISOString() });
  guardar();
}

// ---------- Citas ----------
export const citas = {
  get: (folio) => db.citas[folio] || null,
  set: (cita) => {
    db.citas[cita.folio] = cita;
    guardar();
  },
  update: (folio, cambios) => {
    if (db.citas[folio]) Object.assign(db.citas[folio], cambios);
    guardar();
  },
  todas: () => Object.values(db.citas),
  delPaciente: (number) => Object.values(db.citas).filter((c) => c.number === number),
};

export function resumen() {
  return { perfiles: Object.keys(db.perfiles).length, citas: Object.keys(db.citas).length };
}
