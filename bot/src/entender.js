// Interpreta lenguaje natural para no depender de los números del menú:
//   horas:   "a la 1pm", "como a las 9 y media", "13:00", "al mediodía", "en la tarde", "lo más pronto"
//   fechas:  "mañana", "pasado mañana", "el jueves", "el 27", "27 de noviembre", "27/11", "la próxima semana"
//   opciones:"la primera", "el dos", "opción 3", "la última"
//   sí / no: "sí, confírmala", "está bien", "dale", "mejor no", "no gracias"
// Recibe texto ya normalizado con norm() (minúsculas, sin acentos ni signos).

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NUM_PALABRA = {
  uno: 1, una: 1, primera: 1, primero: 1, primer: 1,
  dos: 2, segunda: 2, segundo: 2,
  tres: 3, tercera: 3, tercero: 3, tercer: 3,
  cuatro: 4, cuarta: 4, cuarto: 4,
  cinco: 5, quinta: 5, quinto: 5,
  seis: 6, sexta: 6, sexto: 6,
  siete: 7, septima: 7, septimo: 7,
  ocho: 8, octava: 8, octavo: 8,
  nueve: 9, novena: 9, noveno: 9,
  diez: 10, decima: 10, decimo: 10,
  once: 11, doce: 12,
};
const RELLENO = new Set([
  'la', 'el', 'lo', 'opcion', 'numero', 'num', 'no', 'n', 'quiero', 'dame', 'elijo', 'escojo', 'prefiero',
  'me', 'quedo', 'con', 'esa', 'ese', 'esta', 'este', 'porfa', 'por', 'favor', 'pls', 'plis', 'mejor', 'va', 'pues', 'de',
]);

// "la primera" -> 1, "opcion 3" -> 3, "el dos porfa" -> 2. Si el mensaje dice algo más, regresa null.
export function opcion(t, total = Infinity) {
  if (/\ba las?\b|\bpm\b|\bam\b|:/.test(t)) return null; // eso es una hora, no una opción
  const resto = t.split(' ').filter((w) => w && !RELLENO.has(w));
  if (resto.length !== 1) return null;
  const w = resto[0].replace(/^(\d{1,2})(ra|ro|da|do|er|a|o)$/, '$1'); // "1ra" -> "1"
  let n = /^\d{1,2}$/.test(w) ? parseInt(w, 10) : NUM_PALABRA[w];
  if (w === 'ultima' || w === 'ultimo') n = total;
  return Number.isFinite(n) && n >= 1 && n <= total ? n : null;
}

const SI = ['si', 'sip', 'simon', 'claro', 'dale', 'va', 'ok', 'okay', 'okey', 'oki', 'correcto', 'confirmo', 'confirmar', 'confirmala',
  'confirmalo', 'confirma', 'perfecto', 'adelante', 'afirmativo', 'de acuerdo', 'esta bien', 'asi esta bien', 'me parece bien',
  'sale', 'por supuesto', 'agendala', 'agendalo', 'listo', 'si por favor', 'yes', 'arre', 'orale'];
const NO = ['no', 'nel', 'nop', 'nope', 'mejor no', 'no gracias', 'cancela', 'cancelar', 'cancelala', 'olvidalo', 'dejalo', 'negativo', 'para nada'];

export function afirmativo(t) {
  if (/\bno\b/.test(t) && !/\bno hay problema\b/.test(t)) return false;
  return SI.some((k) => t === k || t.startsWith(k + ' ') || t.endsWith(' ' + k) || t.includes(' ' + k + ' '));
}
export function negativo(t) {
  return NO.some((k) => t === k || t.startsWith(k + ' '));
}

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------
function a24(h, m, sufijo) {
  if (/pm|tarde|noche/.test(sufijo || '') && h < 12) h += 12;
  else if (/am|manana/.test(sufijo || '') && h === 12) h = 0;
  else if (!sufijo && h >= 1 && h <= 6) h += 12; // "a la 1" en una clínica = 13:00
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function extraerHora(t) {
  if (/\b(medio ?dia)\b/.test(t)) return '12:00';
  const SUF = '(a ?m|p ?m|hrs?|horas?|de la manana|de la tarde|de la noche|en la manana|en la tarde|por la manana|por la tarde)';
  // "13:00", "9:30 am", "1.30pm"
  let m = t.match(new RegExp(`\\b(\\d{1,2})[:.](\\d{2})\\s*${SUF}?`));
  if (m && +m[1] <= 23 && +m[2] < 60) return a24(+m[1], +m[2], m[3]);
  // "1pm", "9 am", "4 de la tarde", "10 hrs"
  m = t.match(new RegExp(`\\b(\\d{1,2})\\s*${SUF}`));
  if (m && +m[1] <= 23) return a24(+m[1], 0, m[2]);
  // "a la 1", "a las 9 y media", "como a las 11", "tipo 8", "las 4 y cuarto"
  m = t.match(/\b(?:a las?|las|tipo|como a las?|para las?)\s+(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s+y\s+(media|cuarto|\d{1,2}))?(?:\s+(de la manana|de la tarde|de la noche|am|pm))?\b/);
  if (m) {
    const h = /^\d+$/.test(m[1]) ? +m[1] : NUM_PALABRA[m[1]];
    const min = m[2] === 'media' ? 30 : m[2] === 'cuarto' ? 15 : m[2] ? +m[2] : 0;
    if (h >= 0 && h <= 23 && min < 60) return a24(h, min, m[3]);
  }
  return null;
}

export function extraerFranja(t) {
  if (/\b(lo mas pronto|lo antes posible|cuanto antes|lo mas temprano|primer horario|el primero que haya|ya mismo|urgente)\b/.test(t)) return 'pronto';
  if (/\b(en|por|de) la manana\b|\btemprano\b|\bmatutino\b/.test(t)) return 'manana';
  if (/\b(en|por|de) la tarde\b|\bvespertino\b|\bdespues de comer\b/.test(t)) return 'tarde';
  return null;
}

// ---------------------------------------------------------------------------
// Fechas (fecha de México, formato YYYY-MM-DD)
// ---------------------------------------------------------------------------
const hoyMX = () => {
  const d = new Date(Date.now() - 6 * 3600 * 1000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
};
const iso = (d) => d.toISOString().slice(0, 10);
const sumar = (d, n) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

export function extraerFecha(t) {
  const hoy = hoyMX();
  if (/\bpasado manana\b/.test(t)) return { fecha: iso(sumar(hoy, 2)) };
  // "mañana" como día (no "en/por/de la mañana")
  if (/\bmanana\b/.test(t) && !/\b(la|las) manana\b/.test(t)) return { fecha: iso(sumar(hoy, 1)) };
  if (/\bhoy\b/.test(t)) return { fecha: iso(hoy), hoy: true };

  // "27 de noviembre", "el 3 de diciembre"
  let m = t.match(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MESES.join('|')})\\b`));
  if (m) return { fecha: fechaDiaMes(+m[1], MESES.indexOf(m[2]), hoy) };
  // "27/11", "27-11"
  m = t.match(/\b(\d{1,2})[/-](\d{1,2})\b/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return { fecha: fechaDiaMes(+m[1], +m[2] - 1, hoy) };

  // "el jueves", "este viernes", "el proximo lunes", "el sabado de la otra semana"
  const dia = DIAS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(t));
  if (dia >= 0) {
    let delta = (dia - hoy.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7; // "el martes" dicho en martes = el próximo
    if (/\b(proxima|otra|siguiente) semana\b/.test(t) && delta < 7) delta += 7;
    return { fecha: iso(sumar(hoy, delta)) };
  }
  // "el 27", "para el dia 3"
  m = t.match(/\b(?:el|dia|el dia|para el)\s+(\d{1,2})\b(?!\s*(?::|am|pm|hrs?|horas?|de la))/);
  if (m && +m[1] >= 1 && +m[1] <= 31) {
    let f = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), +m[1], 12));
    if (f < hoy) f = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, +m[1], 12));
    return { fecha: iso(f) };
  }
  if (/\b(proxima|otra|siguiente) semana\b/.test(t)) {
    const lunes = (8 - hoy.getUTCDay()) % 7 || 7;
    return { fecha: iso(sumar(hoy, lunes)), desdeSemana: true };
  }
  return null;
}

function fechaDiaMes(dia, mes, hoy) {
  let f = new Date(Date.UTC(hoy.getUTCFullYear(), mes, dia, 12));
  if (f < hoy) f = new Date(Date.UTC(hoy.getUTCFullYear() + 1, mes, dia, 12));
  return iso(f);
}

export function diasDesdeHoy(fecha) {
  return Math.round((new Date(`${fecha}T12:00:00Z`) - hoyMX()) / 86400000);
}

// Todo lo que el paciente dijo sobre cuándo quiere su cita
export function preferenciaHorario(t) {
  const hora = extraerHora(t);
  const fecha = extraerFecha(t);
  const franja = hora ? null : extraerFranja(t);
  if (!hora && !fecha && !franja) return null;
  return { hora, franja, ...(fecha || {}) };
}

const amPm = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'am' : 'pm'}`;
};
export const horaBonita = (hhmm) => `${hhmm} (${amPm(hhmm)})`;
export { amPm };
