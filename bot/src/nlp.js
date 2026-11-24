// Entendimiento de texto ligero (sin IA): normalización, intenciones por palabras clave,
// detección de emergencias y búsqueda de opciones por nombre.

export const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;:]/g, ' ')
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
  ['cita', ['agendar', 'cita', 'reservar', 'apartar', 'agenda']],
  ['cercana', ['cerca', 'cercana', 'cercano', 'ubicacion', 'donde queda', 'donde estan', 'sucursal', 'sucursales', 'clinica', 'direccion', 'horario']],
  ['estudios', ['precio', 'precios', 'cuanto cuesta', 'costo', 'cuesta', 'ayuno', 'preparacion', 'requisitos', 'estudio', 'estudios', 'que necesito']],
  ['agente', ['agente', 'humano', 'asesor', 'persona', 'operador', 'hablar con alguien', 'queja']],
  ['enlaces', ['pagina', 'link', 'liga', 'web', 'factura', 'facturar', 'sitio', 'whatsapp oficial']],
];

export function intencion(t) {
  for (const [nombre, claves] of INTENCIONES) {
    if (claves.some((k) => (k.includes(' ') ? t.includes(k) : t.split(' ').includes(k)))) return nombre;
  }
  return null;
}

const EMERGENCIA = [
  'dolor de pecho', 'dolor en el pecho', 'no puedo respirar', 'me falta el aire', 'desmayo', 'se desmayo',
  'convulsion', 'sangrado abundante', 'infarto', 'emergencia', 'urgencia', 'me quiero morir', 'suicid',
];
export const esEmergencia = (t) => EMERGENCIA.some((k) => t.includes(k));

// Busca una opción por número ("2") o por nombre/palabra clave ("ultrasonido", "gdl")
function coincideClave(t, palabras, k) {
  if (k.includes(' ')) return t.includes(k);
  return palabras.some((w) => w === k || (k.length >= 5 && w.startsWith(k)));
}

export function elegir(items, t, nombreDe = (x) => x.nombre) {
  if (esNumero(t)) {
    const n = parseInt(t, 10);
    return n >= 1 && n <= items.length ? items[n - 1] : null;
  }
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
