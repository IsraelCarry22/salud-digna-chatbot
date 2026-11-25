import { opcion } from './entender.js';

// Entendimiento de texto ligero (sin IA): normalización, intenciones por palabras clave,
// detección de emergencias y búsqueda de opciones por nombre.

export const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!,;]|\.(?!\d)|:(?!\d)/g, ' ') // conserva "13:00" y "9.30"
    .replace(/\s+/g, ' ')
    .trim();

export const esNumero = (t) => /^\d{1,2}$/.test(String(t).trim());

const COMANDOS = {
  menu: ['menu', 'inicio', '0', 'principal', 'menu principal'],
  saludo: ['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'que tal', 'ola'],
  atras: ['atras', 'regresar', 'volver', 'anterior', 'back'],
  salir: ['salir', 'adios', 'bye', 'terminar', 'finalizar', 'hasta luego', 'nos vemos', 'chao'],
  gracias: ['gracias', 'muchas gracias', 'mil gracias', 'thanks', 'ok gracias', 'perfecto gracias'],
  ayuda: ['ayuda', 'help', 'comandos', 'no entiendo', 'como funciona'],
};

export function comando(t) {
  for (const [cmd, frases] of Object.entries(COMANDOS)) if (frases.includes(t)) return cmd;
  // Saludos cortos con algo más: "hola que tal", "buenas tardes doctor"
  const palabras = t.split(' ');
  if (palabras.length <= 4 && COMANDOS.saludo.some((g) => t.startsWith(g + ' '))) return 'saludo';
  if (palabras.length <= 4 && COMANDOS.gracias.some((g) => t.startsWith(g))) return 'gracias';
  return null;
}

export const esFolio = (texto) => /^SD-[A-Z0-9-]{4,}$/.test(String(texto || '').trim().toUpperCase().replace(/\s+/g, ''));

// Orden importa: lo más específico primero
const INTENCIONES = [
  ['mis_citas', ['mis citas', 'mi cita', 'cancelar', 'reprogramar', 'cambiar mi cita', 'cambiar cita']],
  ['resultados', ['resultado', 'resultados', 'folio', 'mis estudios', 'descargar']],
  ['cita', ['agendar', 'cita', 'citas', 'reservar', 'apartar', 'agenda', 'turno', 'programar']],
  ['cercana', ['cerca', 'cercana', 'cercano', 'ubicacion', 'donde queda', 'donde estan', 'sucursal', 'sucursales', 'clinica', 'direccion', 'horario']],
  ['estudios', ['precio', 'precios', 'cuanto cuesta', 'costo', 'cuesta', 'ayuno', 'preparacion', 'requisitos', 'estudio', 'estudios', 'que necesito']],
  ['agente', ['agente', 'humano', 'asesor', 'persona', 'operador', 'hablar con alguien', 'queja']],
  ['enlaces', ['pagina', 'link', 'liga', 'web', 'factura', 'facturar', 'sitio', 'whatsapp oficial']],
];

export function intencion(t) {
  for (const [nombre, claves] of INTENCIONES) {
    const palabras = t.split(' ');
    if (claves.some((k) => (k.includes(' ') ? t.includes(k) : palabras.some((w) => w === k || (k.length >= 6 && w.startsWith(k)))))) return nombre;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mensajes fuera de tema
// ---------------------------------------------------------------------------
// Palabras que indican que el mensaje SÍ tiene que ver con salud o con Salud Digna
const VOCAB_SALUD = [
  'salud', 'digna', 'medico', 'medica', 'doctor', 'doctora', 'enfermera', 'clinica', 'laboratorio', 'estudio', 'estudios',
  'analisis', 'examen', 'examenes', 'prueba', 'sangre', 'orina', 'glucosa', 'colesterol', 'trigliceridos', 'quimica',
  'ultrasonido', 'eco', 'rayos', 'radiografia', 'tomografia', 'resonancia', 'mastografia', 'papanicolaou', 'electro',
  'electrocardiograma', 'densitometria', 'lentes', 'optometria', 'vista', 'nutricion', 'nutriologo', 'embarazo', 'embarazada',
  'cita', 'citas', 'agendar', 'resultado', 'resultados', 'folio', 'ticket', 'factura', 'sucursal', 'sucursales', 'horario',
  'horarios', 'precio', 'precios', 'costo', 'cuesta', 'ayuno', 'preparacion', 'paciente', 'consulta', 'diagnostico',
  'enfermedad', 'sintoma', 'sintomas', 'dolor', 'duele', 'presion', 'diabetes', 'corazon', 'pulmon', 'cancer', 'vacuna',
  'covid', 'agente', 'asesor', 'ubicacion', 'direccion', 'promocion', 'descuento', 'paquete', 'check', 'chequeo',
];
// Temas que claramente no corresponden a este canal
const FUERA_TEMA = [
  'pizza', 'hamburguesa', 'tacos', 'comida', 'restaurante', 'pedido', 'ordenar', 'domicilio', 'uber', 'didi', 'rappi',
  'chiste', 'chistes', 'cancion', 'musica', 'pelicula', 'peliculas', 'serie', 'netflix', 'juego', 'videojuego', 'futbol',
  'partido', 'apuesta', 'clima', 'tarea', 'novia', 'novio', 'ligar', 'amor', 'politica', 'presidente', 'elecciones',
  'prestamo', 'credito', 'bitcoin', 'criptomoneda', 'vender', 'comprar', 'celular', 'iphone', 'carro', 'boletos', 'viaje',
  'hotel', 'vuelo', 'trabajo', 'empleo', 'vacante', 'programar', 'codigo', 'poema', 'cuento', 'receta de cocina',
];
// Preguntas de salud que el bot no debe responder (diagnóstico o medicación)
const CONSEJO_MEDICO = [
  'que medicamento', 'que medicina', 'que pastilla', 'que tomo', 'que me tomo', 'puedo tomar', 'me recetas', 'recetame',
  'receta medica', 'que tengo', 'es grave', 'diagnosticame', 'dosis', 'antibiotico', 'remedio',
];
const RELLENO_TEMA = new Set([
  'hola', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'que', 'tal', 'quisiera', 'quiero', 'queria', 'me', 'gustaria',
  'una', 'un', 'unos', 'unas', 'el', 'la', 'los', 'las', 'de', 'del', 'a', 'al', 'en', 'para', 'por', 'con', 'y', 'o', 'mi',
  'tu', 'su', 'es', 'se', 'te', 'lo', 'le', 'puedes', 'puede', 'podrias', 'necesito', 'oye', 'disculpa', 'favor', 'porfa',
  'ayudame', 'ayuda', 'saber', 'como', 'cual', 'donde', 'cuando', 'hay', 'tienen', 'tienes', 'si', 'no', 'muy', 'mas',
]);

export function pideConsejoMedico(t) {
  return CONSEJO_MEDICO.some((k) => (k.includes(' ') ? t.includes(k) : t.split(' ').includes(k)));
}

// true si el mensaje no tiene nada que ver con los servicios de Salud Digna
export function fueraDeTema(t) {
  const palabras = t.split(' ').filter(Boolean);
  const sinPlural = (w) => w.replace(/(es|s)$/, '');
  const tiene = (lista) =>
    lista.some((k) => (k.includes(' ') ? t.includes(k) : palabras.some((w) => w === k || sinPlural(w) === k || (k.length >= 6 && w.startsWith(k)))));
  if (tiene(VOCAB_SALUD)) return false;
  if (tiene(FUERA_TEMA)) return true;
  const utiles = palabras.filter((w) => !RELLENO_TEMA.has(w) && !/^\d+$/.test(w));
  return utiles.length >= 2; // una frase con contenido pero sin nada de salud
}

const EMERGENCIA = [
  'dolor de pecho', 'dolor en el pecho', 'duele el pecho', 'duele mucho el pecho', 'presion en el pecho', 'opresion en el pecho',
  'no puedo hablar', 'se me duerme la cara', 'perdi el conocimiento', 'mucho sangrado', 'no deja de sangrar', 'me estoy ahogando', 'no puedo respirar', 'me falta el aire', 'desmayo', 'se desmayo',
  'convulsion', 'sangrado abundante', 'infarto', 'emergencia', 'urgencia', 'me quiero morir', 'suicid',
];
export const esEmergencia = (t) => EMERGENCIA.some((k) => t.includes(k));

// Busca una opción por número ("2") o por nombre/palabra clave ("ultrasonido", "gdl")
function coincideClave(t, palabras, k) {
  if (k.includes(' ')) return t.includes(k);
  return palabras.some((w) => w === k || (k.length >= 5 && w.startsWith(k)));
}

export function elegir(items, t, nombreDe = (x) => x.nombre) {
  const n = opcion(t, items.length);
  if (n) return items[n - 1];
  if (esNumero(t)) return null;
  if (t.length < 3) return null;
  const palabras = t.split(' ');
  return (
    items.find((x) => norm(nombreDe(x)) === t) ||
    items.find((x) => (x.claves || []).some((k) => coincideClave(t, palabras, k))) ||
    // nombre parcial: solo palabras completas de 4+ letras ("minerva", "norte")
    items.find((x) => {
      const nom = norm(nombreDe(x)).split(' ');
      return palabras.some((w) => w.length >= 4 && nom.includes(w));
    }) ||
    null
  );
}

// Distancia en km entre dos coordenadas (fórmula de Haversine)
export function distanciaKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
