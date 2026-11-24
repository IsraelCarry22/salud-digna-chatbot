// Agenda simulada con cupos por horario. Cada horario tiene CUPO lugares;
// parte viene "ocupada" de forma determinista (para que la demo se vea real)
// y el resto se ocupa con las citas que agendan los pacientes.

import { citas } from './store.js';

const CUPO = 3;
const HORAS = ['07:00', '08:00', '09:30', '11:00', '13:00', '16:00'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Hora de México (UTC-6, sin horario de verano) sin depender de la zona del contenedor
const ahoraMX = () => new Date(Date.now() - 6 * 3600 * 1000);

export function etiquetaFecha(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}

// FNV-1a: reparte mejor los valores que un hash simple
function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

// Ocupación base simulada: la mayoría de horarios con lugar, algunos llenos
const OCUPACION = [0, 0, 1, 1, 1, 2, 2, 3];

function ocupados(sucursalId, fecha, hora) {
  const base = OCUPACION[hash(`${sucursalId}|${fecha}|${hora}`) % OCUPACION.length];
  const reservadas = citas
    .todas()
    .filter((c) => c.estado === 'agendada' && c.sucursalId === sucursalId && c.fecha === fecha && c.hora === hora).length;
  return Math.min(CUPO, base + reservadas);
}

/**
 * Regresa los días con sus horarios a partir de `desdeDia` días en el futuro.
 * [{ fecha, etiqueta, horas: [{ hora, libres }] }]
 */
export function disponibilidad(sucursal, desdeDia = 1, nDias = 2) {
  const dias = [];
  const base = ahoraMX();
  let offset = desdeDia;
  while (dias.length < nDias && offset < desdeDia + 14) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    offset++;
    if (d.getUTCDay() === 0 && !sucursal.domingo) continue;
    const fecha = d.toISOString().slice(0, 10);
    const horas = (d.getUTCDay() === 0 ? HORAS.slice(0, 4) : HORAS).map((hora) => ({
      hora,
      libres: CUPO - ocupados(sucursal.id, fecha, hora),
    }));
    dias.push({ fecha, etiqueta: etiquetaFecha(fecha), horas });
  }
  return { dias, siguienteDesde: offset };
}

export function hayLugar(sucursalId, fecha, hora) {
  return ocupados(sucursalId, fecha, hora) < CUPO;
}

export function nuevoFolio() {
  const d = ahoraMX();
  const ymd = d.toISOString().slice(2, 10).replace(/-/g, '');
  let folio;
  do folio = `SD-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
  while (citas.get(folio));
  return folio;
}

export function proximasCitas(number) {
  const hoy = ahoraMX().toISOString().slice(0, 10);
  return citas
    .delPaciente(number)
    .filter((c) => c.estado === 'agendada' && c.fecha >= hoy)
    .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
}
