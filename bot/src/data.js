// Datos SIMULADOS para la demo del HackaTec. No son precios ni sucursales reales de Salud Digna.

export const ESTUDIOS = [
  {
    id: 1,
    nombre: 'Laboratorio clínico (química sanguínea)',
    precio: 250,
    prep: 'Ayuno de 8 a 12 horas. Puedes tomar agua natural. Llega 15 min antes.',
  },
  {
    id: 2,
    nombre: 'Ultrasonido abdominal',
    precio: 450,
    prep: 'Ayuno de 6 horas y vejiga llena: toma 1 litro de agua una hora antes y no orines.',
  },
  {
    id: 3,
    nombre: 'Rayos X de tórax',
    precio: 300,
    prep: 'No requiere ayuno. Evita usar joyería o prendas con metal.',
  },
  {
    id: 4,
    nombre: 'Mastografía',
    precio: 550,
    prep: 'No uses desodorante, cremas ni talco en axilas y pecho el día del estudio.',
  },
  {
    id: 5,
    nombre: 'Papanicolaou',
    precio: 200,
    prep: 'No estar en periodo menstrual. Evita relaciones, duchas vaginales u óvulos 48 h antes.',
  },
  {
    id: 6,
    nombre: 'Electrocardiograma',
    precio: 280,
    prep: 'No requiere ayuno. Evita cafeína y ejercicio intenso 2 horas antes.',
  },
];

export const CIUDADES = [
  {
    id: 1,
    nombre: 'Culiacán',
    sucursales: [
      { id: 'CUL-CEN', nombre: 'Sucursal Centro', horario: 'Lun a Sáb 6:00–20:00, Dom 7:00–14:00' },
      { id: 'CUL-NTE', nombre: 'Sucursal Norte', horario: 'Lun a Sáb 6:30–19:00' },
    ],
  },
  {
    id: 2,
    nombre: 'Guadalajara',
    sucursales: [
      { id: 'GDL-MIN', nombre: 'Sucursal Minerva', horario: 'Lun a Sáb 6:00–20:00, Dom 7:00–14:00' },
      { id: 'GDL-TLA', nombre: 'Sucursal Tlaquepaque', horario: 'Lun a Sáb 6:30–19:00' },
    ],
  },
  {
    id: 3,
    nombre: 'Ciudad de México',
    sucursales: [
      { id: 'CDMX-TLA', nombre: 'Sucursal Tlalpan', horario: 'Lun a Sáb 6:00–20:00, Dom 7:00–14:00' },
      { id: 'CDMX-IZT', nombre: 'Sucursal Iztapalapa', horario: 'Lun a Dom 6:00–20:00' },
    ],
  },
  {
    id: 4,
    nombre: 'Monterrey',
    sucursales: [
      { id: 'MTY-CEN', nombre: 'Sucursal Centro', horario: 'Lun a Sáb 6:00–20:00' },
      { id: 'MTY-SNI', nombre: 'Sucursal San Nicolás', horario: 'Lun a Sáb 6:30–19:00' },
    ],
  },
];

export const TODAS_SUCURSALES = CIUDADES.flatMap((c) =>
  c.sucursales.map((s) => ({ ...s, ciudad: c.nombre }))
);

const HORAS = ['07:00', '08:30', '10:00', '12:00'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Genera horarios disponibles para los próximos 2 días hábiles (simulado)
export function horariosDisponibles(now = new Date()) {
  const slots = [];
  const d = new Date(now);
  while (slots.length < 6) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) continue; // sin domingos para la demo
    for (const h of HORAS.slice(0, 3)) {
      if (slots.length >= 6) break;
      const etiqueta = `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} a las ${h}`;
      slots.push({ fecha: d.toISOString().slice(0, 10), hora: h, etiqueta });
    }
  }
  return slots;
}
