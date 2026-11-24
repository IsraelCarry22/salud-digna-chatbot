// Datos para la demo del HackaTec.
// - LINKS: enlaces públicos de Salud Digna (verifícalos antes de la presentación).
// - Precios, sucursales, coordenadas y horarios: SIMULADOS (no son datos oficiales).

export const LINKS = {
  sitio: 'https://salud-digna.org/',
  citas: 'https://salud-digna.org/citas/',
  resultados: 'https://salud-digna.org/perfil',
  factura: 'https://factura.salud-digna.org/',
  whatsapp: 'https://wa.me/525539566729',
  // Búsqueda real de clínicas Salud Digna en Google Maps alrededor de un punto
  mapaCercanas: (lat, lng) => `https://www.google.com/maps/search/Salud+Digna/@${lat},${lng},14z`,
  // Ruta desde la ubicación del paciente hasta una sucursal
  ruta: (origen, destino) =>
    origen
      ? `https://www.google.com/maps/dir/?api=1&origin=${origen.lat},${origen.lng}&destination=${destino.lat},${destino.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${destino.lat},${destino.lng}`,
};

export const ESTUDIOS = [
  {
    id: 1,
    nombre: 'Laboratorio clínico (química sanguínea)',
    claves: ['laboratorio', 'sangre', 'quimica', 'glucosa', 'colesterol', 'analisis'],
    precio: 250,
    descripcion: 'Análisis de sangre que mide glucosa, colesterol, triglicéridos, urea y creatinina, entre otros. Ayuda a detectar diabetes, problemas de riñón y riesgo cardiovascular.',
    duracion: '10 minutos',
    entrega: 'mismo día o al día siguiente',
    prep: 'Ayuno de 8 a 12 horas (solo agua natural). Llega 15 minutos antes.',
  },
  {
    id: 2,
    nombre: 'Ultrasonido abdominal',
    claves: ['ultrasonido', 'eco', 'abdomen', 'abdominal', 'higado', 'vesicula'],
    precio: 450,
    descripcion: 'Estudio de imagen con ondas de sonido (sin radiación) para revisar hígado, vesícula, páncreas, riñones y bazo.',
    duracion: '20 a 30 minutos',
    entrega: 'el mismo día',
    prep: 'Ayuno de 6 horas. Toma 1 litro de agua una hora antes y no orines hasta el estudio.',
  },
  {
    id: 3,
    nombre: 'Rayos X de tórax',
    claves: ['rayos', 'rayos x', 'radiografia', 'torax', 'pulmon', 'placa'],
    precio: 300,
    descripcion: 'Radiografía para revisar pulmones, corazón y huesos del tórax. Útil ante tos persistente o revisiones laborales.',
    duracion: '10 minutos',
    entrega: 'el mismo día',
    prep: 'No requiere ayuno. Evita joyería y ropa con partes metálicas. Avisa si hay posibilidad de embarazo.',
  },
  {
    id: 4,
    nombre: 'Mastografía',
    claves: ['mastografia', 'mama', 'mamas', 'senos', 'mamografia'],
    precio: 550,
    descripcion: 'Radiografía de las mamas para la detección temprana de cáncer de mama. Recomendada cada año o dos a partir de los 40 años.',
    duracion: '15 a 20 minutos',
    entrega: '2 a 3 días hábiles',
    prep: 'No uses desodorante, talco ni cremas en axilas y pecho ese día. Lleva tus estudios anteriores si tienes.',
  },
  {
    id: 5,
    nombre: 'Papanicolaou',
    claves: ['papanicolaou', 'papa', 'cervix', 'cervical', 'pap'],
    precio: 200,
    descripcion: 'Prueba que toma una muestra del cuello uterino para detectar a tiempo lesiones que podrían convertirse en cáncer.',
    duracion: '10 minutos',
    entrega: '5 a 7 días hábiles',
    prep: 'No estar en periodo menstrual. Evita relaciones, duchas vaginales u óvulos 48 horas antes.',
  },
  {
    id: 6,
    nombre: 'Electrocardiograma',
    claves: ['electrocardiograma', 'electro', 'corazon', 'ecg', 'cardiaco'],
    precio: 280,
    descripcion: 'Registra la actividad eléctrica del corazón para detectar arritmias u otras alteraciones. Es rápido y no duele.',
    duracion: '10 minutos',
    entrega: 'el mismo día',
    prep: 'No requiere ayuno. Evita cafeína y ejercicio intenso 2 horas antes. Usa ropa cómoda.',
  },
];

export const CIUDADES = [
  {
    id: 1,
    nombre: 'Culiacán',
    claves: ['culiacan', 'sinaloa'],
    sucursales: [
      { id: 'CUL-CEN', nombre: 'Sucursal Centro', horario: 'Lun a Sáb 6:00–20:00, Dom 7:00–14:00', domingo: true, lat: 24.8049, lng: -107.394 },
      { id: 'CUL-NTE', nombre: 'Sucursal Norte', horario: 'Lun a Sáb 6:30–19:00', domingo: false, lat: 24.8312, lng: -107.3868 },
    ],
  },
  {
    id: 2,
    nombre: 'Guadalajara',
    claves: ['guadalajara', 'gdl', 'jalisco', 'zapopan', 'tlaquepaque'],
    sucursales: [
      { id: 'GDL-MIN', nombre: 'Sucursal Minerva', horario: 'Lun a Sáb 6:00–20:00, Dom 7:00–14:00', domingo: true, lat: 20.674, lng: -103.392 },
      { id: 'GDL-TLA', nombre: 'Sucursal Tlaquepaque', horario: 'Lun a Sáb 6:30–19:00', domingo: false, lat: 20.64, lng: -103.311 },
    ],
  },
  {
    id: 3,
    nombre: 'Ciudad de México',
    claves: ['cdmx', 'ciudad de mexico', 'df', 'mexico', 'tlalpan', 'iztapalapa'],
    sucursales: [
      { id: 'CDMX-TLA', nombre: 'Sucursal Tlalpan', horario: 'Lun a Sáb 6:00–20:00, Dom 7:00–14:00', domingo: true, lat: 19.29, lng: -99.17 },
      { id: 'CDMX-IZT', nombre: 'Sucursal Iztapalapa', horario: 'Lun a Dom 6:00–20:00', domingo: true, lat: 19.357, lng: -99.093 },
    ],
  },
  {
    id: 4,
    nombre: 'Monterrey',
    claves: ['monterrey', 'mty', 'nuevo leon', 'san nicolas'],
    sucursales: [
      { id: 'MTY-CEN', nombre: 'Sucursal Centro', horario: 'Lun a Sáb 6:00–20:00', domingo: false, lat: 25.671, lng: -100.309 },
      { id: 'MTY-SNI', nombre: 'Sucursal San Nicolás', horario: 'Lun a Sáb 6:30–19:00', domingo: false, lat: 25.742, lng: -100.295 },
    ],
  },
];

export const TODAS_SUCURSALES = CIUDADES.flatMap((c) =>
  c.sucursales.map((s) => ({ ...s, ciudad: c.nombre, ciudadId: c.id }))
);

export const sucursalPorId = (id) => TODAS_SUCURSALES.find((s) => s.id === id) || null;
export const estudioPorId = (id) => ESTUDIOS.find((e) => e.id === id) || null;
