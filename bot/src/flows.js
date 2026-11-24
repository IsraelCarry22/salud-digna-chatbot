// Lógica de conversación del chatbot.
// Cada paso (STEP) define:
//   prompt(s, ctx)  -> texto que se muestra al entrar al paso
//   handle(s, ctx)  -> respuestas (array) o null si la entrada no es válida para ese paso
//   espera          -> qué está esperando el bot (para los mensajes fuera de lugar)
//   onLocation      -> (opcional) qué hacer si llega una ubicación en ese paso

import { LINKS, ESTUDIOS, CIUDADES, TODAS_SUCURSALES, sucursalPorId, estudioPorId } from './data.js';
import { getSession, reset } from './sessions.js';
import { perfil, actualizarPerfil, citas } from './store.js';
import { disponibilidad, hayLugar, nuevoFolio, proximasCitas, etiquetaFecha } from './agenda.js';
import { norm, esNumero, comando, intencion, esEmergencia, elegir, distanciaKm, esFolio } from './nlp.js';
import { opcion, afirmativo, negativo, preferenciaHorario, diasDesdeHoy, amPm, horaBonita } from './entender.js';
import { emit } from './orchestrator.js';

const NAV = '\n\n↩️ *atrás*  ·  🏠 *0* menú  ·  ❌ *salir*';
const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const precio = (n) => `$${n.toLocaleString('es-MX')} MXN`;
const UBIC_VIGENTE_MS = 2 * 60 * 60 * 1000; // reusar la ubicación hasta 2 h

const COMO_UBICACION =
  '📍 Compárteme tu ubicación: toca el clip 📎 → *Ubicación* → *Enviar mi ubicación actual*.\n' +
  '_(En el teléfono virtual usa el botón 📍 junto al campo de mensaje.)_';

// Las n sucursales más cercanas; si hay alguna a menos de 50 km, se omiten las lejanas
function cercanas(origen, n = 3) {
  const orden = TODAS_SUCURSALES.map((s) => ({ ...s, km: distanciaKm(origen, s) })).sort((a, b) => a.km - b.km);
  const cerca = orden.filter((s) => s.km <= 50);
  return (cerca.length ? cerca : orden).slice(0, n);
}

function listaCercanas(s, pie) {
  const lista = cercanas(s.data.origen);
  s.data.cercanas = lista.map((x) => x.id);
  const lineas = lista.map(
    (x, i) =>
      `${i + 1}. *${x.nombre}* (${x.ciudad}) — ${x.km < 1 ? Math.round(x.km * 1000) + ' m' : x.km.toFixed(1) + ' km'}\n` +
      `    🕒 ${x.horario}\n    🗺️ Cómo llegar: ${LINKS.ruta(s.data.origen, x)}`
  );
  const lejos = lista[0].km > 50
    ? `\n\n⚠️ La más cercana está a ${Math.round(lista[0].km)} km: esta demo solo tiene sucursales en ${CIUDADES.map((c) => c.nombre).join(', ')}.`
    : '';
  return (
    `🧭 *Sucursales más cercanas a ti:*\n\n${lineas.join('\n\n')}${lejos}\n\n${pie}\n\n` +
    `🔎 Todas las clínicas Salud Digna cerca de ti en Google Maps:\n${LINKS.mapaCercanas(s.data.origen.lat, s.data.origen.lng)}` +
    NAV
  );
}

const sucursalesDe = (s) => TODAS_SUCURSALES.filter((x) => x.ciudadId === s.data.ciudad.id);

// ---------------------------------------------------------------------------
// Lenguaje natural en el flujo de citas
// ---------------------------------------------------------------------------
const minutos = (h) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};
const etiquetaSlot = (x) => `${etiquetaFecha(x.fecha)} · ${horaBonita(x.hora)}${x.libres === 1 ? '  🟡 último lugar' : ''}`;

function descPref(p) {
  if (!p) return '';
  const partes = [];
  if (p.fecha) partes.push(p.hoy ? 'hoy' : `el ${etiquetaFecha(p.fecha)}`);
  if (p.hora) partes.push(`${p.hora.startsWith('13:') || p.hora.startsWith('01:') ? 'a la' : 'a las'} ${amPm(p.hora)}`);
  if (p.franja === 'manana') partes.push('en la mañana');
  if (p.franja === 'tarde') partes.push('en la tarde');
  if (p.franja === 'pronto') partes.push('lo más pronto posible');
  return partes.join(' ');
}

// Busca una sucursal por su nombre ("Minerva", "el centro de Monterrey") o al menos la ciudad
function buscarSucursal(t, ctx) {
  if (/\b(de siempre|mi sucursal|la misma|la de siempre)\b/.test(t) && sucursalPorId(ctx.perfil.sucursalId)) {
    return { sucursal: sucursalPorId(ctx.perfil.sucursalId) };
  }
  const palabras = t.split(' ');
  const ciudad = elegir(CIUDADES, t);
  let cand = TODAS_SUCURSALES.filter((x) => {
    const nombre = norm(x.nombre).replace('sucursal ', '');
    return nombre.includes(' ') ? t.includes(nombre) : palabras.includes(nombre);
  });
  if (ciudad) cand = cand.filter((x) => x.ciudadId === ciudad.id);
  if (cand.length === 1) return { sucursal: cand[0] };
  return { ciudad };
}

// Toma del mensaje todo lo que sirva para la cita: estudio, sucursal/ciudad y cuándo
function absorber(s, ctx) {
  if (ctx.op != null) return;
  if (!s.data.estudio) {
    const e = elegir(ESTUDIOS, ctx.t);
    if (e) s.data.estudio = e;
  }
  if (!s.data.sucursal) {
    const r = buscarSucursal(ctx.t, ctx);
    if (r.sucursal) s.data.sucursal = r.sucursal;
    else if (r.ciudad && !s.data.ciudad) s.data.ciudad = r.ciudad;
  }
  if (ctx.pref) s.data.pref = { ...(s.data.pref || {}), ...ctx.pref };
}

const huella = (s) => JSON.stringify([s.data.estudio?.id, s.data.sucursal?.id, s.data.ciudad?.id, s.data.pref]);

function resumenCita(s) {
  const partes = [];
  if (s.data.estudio) partes.push(`🧪 ${s.data.estudio.nombre}`);
  if (s.data.sucursal) partes.push(`📍 ${s.data.sucursal.nombre}, ${s.data.sucursal.ciudad}`);
  else if (s.data.ciudad) partes.push(`🏙️ ${s.data.ciudad.nombre}`);
  if (s.data.pref) partes.push(`🕒 ${descPref(s.data.pref)}`);
  return partes.join('\n');
}

// Avanza al siguiente dato que falte para la cita
function avanzarCita(s, ctx, prefijo = '') {
  if (!s.data.estudio) return go(s, 'cita_estudio', ctx, prefijo);
  if (!s.data.sucursal) return go(s, s.data.ciudad ? 'cita_sucursal' : 'cita_donde', ctx, prefijo);
  if (s.data.pref) return resolverHorario(s, ctx, prefijo);
  return go(s, 'cita_horario', ctx, prefijo);
}

function slotsLibres(suc, desde, nDias) {
  const { dias } = disponibilidad(suc, desde, nDias);
  return dias.flatMap((d) => d.horas.filter((h) => h.libres > 0).map((h) => ({ fecha: d.fecha, hora: h.hora, libres: h.libres })));
}

function textoAlternativas(s) {
  return (
    `${s.data.alt}\n\n${s.data.slots.map((x, i) => `${i + 1}. ${etiquetaSlot(x)}`).join('\n')}\n\n` +
    'Responde el número, o dime otro día u hora (por ejemplo "el viernes a las 9").\n➡️ *más* para ver todos los horarios.' +
    NAV
  );
}

// Convierte "el jueves a la 1pm" en un horario real de la agenda (o propone los más cercanos)
function resolverHorario(s, ctx, prefijo = '') {
  const pref = s.data.pref;
  delete s.data.pref;
  // Si ya habíamos hablado de un día y ahora solo dice la hora, se respeta ese día
  if (!pref.fecha && !pref.franja && s.data.fechaContexto) pref.fecha = s.data.fechaContexto;
  if (pref.fecha && !pref.hoy) s.data.fechaContexto = pref.fecha;
  const suc = s.data.sucursal;
  const notas = prefijo ? [prefijo] : [];
  let desde = 1;
  let nDias = 7;
  if (pref.fecha) {
    const d = diasDesdeHoy(pref.fecha);
    if (pref.hoy || d < 1) notas.push('📅 Para hoy ya no hay citas en línea; te muestro a partir de mañana.');
    else {
      desde = d;
      nDias = pref.desdeSemana ? 6 : 1;
    }
  }
  let slots = slotsLibres(suc, desde, nDias);
  if (pref.fecha && !pref.hoy && !pref.desdeSemana && (!slots.length || slots[0].fecha !== pref.fecha)) {
    notas.push(`📅 El ${etiquetaFecha(pref.fecha)} no hay lugares en ${suc.nombre}; te muestro los días siguientes.`);
    slots = slotsLibres(suc, desde + 1, 3);
  }
  if (!slots.length) slots = slotsLibres(suc, 1, 7);

  if (pref.franja === 'manana' || pref.franja === 'tarde') {
    const f = slots.filter((x) => (pref.franja === 'manana' ? minutos(x.hora) < 720 : minutos(x.hora) >= 720));
    if (f.length) slots = f;
    else notas.push(`😕 No hay lugares ${pref.franja === 'manana' ? 'en la mañana' : 'en la tarde'} esos días.`);
  }

  let exacto = null;
  let lista = slots.slice(0, 6);
  let encabezado = `🗓️ Horarios ${descPref(pref)} en *${suc.nombre}*:`;

  if (pref.franja === 'pronto') {
    exacto = slots[0];
  } else if (pref.hora) {
    exacto = slots.find((x) => x.hora === pref.hora) || null;
    if (!exacto) {
      const primerDia = slots[0]?.fecha;
      lista = [...slots]
        .sort((a, b) => {
          const pa = Math.abs(minutos(a.hora) - minutos(pref.hora)) + (a.fecha !== primerDia ? 240 : 0);
          const pb = Math.abs(minutos(b.hora) - minutos(pref.hora)) + (b.fecha !== primerDia ? 240 : 0);
          return pa - pb;
        })
        .slice(0, 4)
        .sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));
      encabezado = `😕 No tengo lugar ${descPref(pref)} en *${suc.nombre}*. Lo más cercano que tengo:`;
    }
  } else if (slots.length === 1) {
    exacto = slots[0];
  }

  if (exacto) {
    s.data.slot = exacto;
    delete s.data.alt;
    notas.push(`👍 ¡Sí hay lugar el *${etiquetaFecha(exacto.fecha)}* ${descPref({ hora: exacto.hora }).replace(/(a las?) (.*)/, '$1 *$2*')}!`);
    return go(s, 'cita_confirmar', ctx, notas.join('\n'));
  }

  s.data.slots = lista;
  s.data.alt = encabezado;
  if (s.step !== 'cita_horario') {
    s.historial.push(s.step);
    s.step = 'cita_horario';
  }
  return [[...notas, textoAlternativas(s)].join('\n\n')];
}

// ---------------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------------
function go(s, step, ctx, prefijo = '') {
  if (s.step !== step && s.step !== 'nuevo') s.historial.push(s.step);
  s.step = step;
  s.errores = 0;
  const texto = STEPS[step].prompt(s, ctx);
  return [prefijo ? `${prefijo}\n\n${texto}` : texto];
}

function atras(s, ctx) {
  const prev = s.historial.pop();
  if (!prev || prev === 'menu') {
    reset(s);
    return [`↩️ Regresamos al inicio.\n\n${menuTexto(ctx)}`];
  }
  s.step = prev;
  s.errores = 0;
  return [`↩️ Regresamos un paso.\n\n${STEPS[prev].prompt(s, ctx)}`];
}

// ---------------------------------------------------------------------------
// Menú y saludos (con memoria)
// ---------------------------------------------------------------------------
function menuTexto() {
  return [
    '¿En qué te puedo ayudar? Responde con el número o escríbeme lo que necesitas:',
    '',
    '1️⃣ Agendar una cita',
    '2️⃣ Mis citas (ver, cambiar o cancelar)',
    '3️⃣ Consultar resultados',
    '4️⃣ Sucursal más cercana 📍',
    '5️⃣ Estudios: precios y preparación',
    '6️⃣ Hablar con un agente',
    '7️⃣ Enlaces útiles',
    '',
    '_En cualquier momento: *atrás*, *0* para el menú o *salir*._',
  ].join('\n');
}

function saludo(ctx) {
  const p = ctx.perfil;
  const nombre = primerNombre(p.nombre || ctx.name);
  const lineas = [];
  if (p.visitas <= 1) {
    lineas.push(
      `¡Hola${nombre ? ', ' + nombre : ''}! 👋 Soy el asistente virtual de *Salud Digna*.`,
      'Te ayudo a agendar estudios, ver tus citas y resultados, y encontrar tu clínica más cercana, las 24 horas.'
    );
  } else {
    lineas.push(`¡Qué gusto verte de nuevo${nombre ? ', ' + nombre : ''}! 👋`);
    const prox = proximasCitas(ctx.number)[0];
    const suc = sucursalPorId(p.sucursalId);
    const est = estudioPorId(p.ultimoEstudioId);
    if (prox) {
      lineas.push(`📌 Recuerda: tienes *${prox.estudio}* el *${etiquetaFecha(prox.fecha)}* a las *${prox.hora}* en *${prox.sucursal}*.`);
    } else if (est && suc) {
      lineas.push(`La última vez agendaste *${est.nombre}* en *${suc.nombre}, ${suc.ciudad}*.`);
    }
  }
  return lineas.join('\n');
}

const NOMBRE_INTENCION = {
  cita: 'agendar una cita',
  mis_citas: 'ver tus citas',
  resultados: 'consultar resultados',
  cercana: 'encontrar una sucursal',
  estudios: 'información de estudios',
  agente: 'hablar con un agente',
  enlaces: 'enlaces útiles',
};

// Lleva al paciente a una sección; aprovecha detalles del texto (estudio o ciudad mencionados)
async function irA(seccion, s, ctx, prefijo = '') {
  s.data = {};
  const est = ctx.t ? elegir(ESTUDIOS, ctx.t) : null;
  const ciudad = ctx.t ? elegir(CIUDADES, ctx.t) : null;
  switch (seccion) {
    case 'cita': {
      absorber(s, ctx);
      const res = resumenCita(s);
      return avanzarCita(s, ctx, [prefijo, res && `Esto es lo que entendí:\n${res}`].filter(Boolean).join('\n\n'));
    }
    case 'mis_citas': {
      // "cambia mi cita al viernes a las 9" / "cancela mi cita" cuando solo hay una
      const prox = proximasCitas(ctx.number);
      if (prox.length === 1 && ctx.t) {
        const c = prox[0];
        if (ctx.pref && /cambi|reprogram|mover|mueve|pasar|pasa/.test(ctx.t)) {
          s.historial.push(s.step);
          s.data = { cita: c.folio, estudio: estudioPorId(c.estudioId), sucursal: sucursalPorId(c.sucursalId), reprogramar: c.folio, pref: ctx.pref };
          return resolverHorario(s, ctx, [prefijo, `🔁 Va, busco lugar para tu *${c.estudio}* ${descPref(ctx.pref)}.`].filter(Boolean).join('\n'));
        }
        if (/cancel/.test(ctx.t)) {
          s.data = { cita: c.folio };
          return go(s, 'cita_cancelar', ctx, prefijo);
        }
      }
      return go(s, 'mis_citas', ctx, prefijo);
    }
    case 'resultados':
      return go(s, 'resultados', ctx, prefijo);
    case 'cercana':
      if (ciudad && ctx.op == null) {
        s.data.ciudad = ciudad;
        return go(s, 'sucursal_lista', ctx, prefijo);
      }
      return go(s, 'cercana', ctx, prefijo);
    case 'estudios':
      if (est && ctx.op == null) {
        s.data.estudio = est;
        return go(s, 'estudio_detalle', ctx, prefijo);
      }
      return go(s, 'estudios', ctx, prefijo);
    case 'agente':
      await emit('handoff', { patientId: ctx.number, name: ctx.name, motivo: 'solicitud_paciente' });
      return go(s, 'agente', ctx, prefijo);
    case 'enlaces':
      return [`${prefijo ? prefijo + '\n\n' : ''}${enlacesTexto()}`];
    default:
      reset(s);
      return [menuTexto(ctx)];
  }
}

function enlacesTexto() {
  return [
    '🔗 *Enlaces útiles de Salud Digna*',
    '',
    `🌐 Sitio oficial: ${LINKS.sitio}`,
    `📅 Agendar cita en línea: ${LINKS.citas}`,
    `📄 Resultados (con usuario y contraseña de tu ticket): ${LINKS.resultados}`,
    `🧾 Facturación: ${LINKS.factura}`,
    `💬 WhatsApp oficial: ${LINKS.whatsapp}`,
    '',
    'Escribe *0* para volver al menú.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------
const STEPS = {
  menu: {
    espera: 'estoy esperando un número del *1* al *7*, o que me digas qué necesitas (por ejemplo "quiero agendar un ultrasonido")',
    prompt: (s, ctx) => menuTexto(ctx),
    handle: async (s, ctx) => {
      const mapa = { 1: 'cita', 2: 'mis_citas', 3: 'resultados', 4: 'cercana', 5: 'estudios', 6: 'agente', 7: 'enlaces' };
      const n = opcion(ctx.t, 7);
      if (n) return irA(mapa[n], s, { ...ctx, t: '', pref: null });
      // Frases completas: "cambia mi cita al viernes", "un ultrasonido en Minerva el jueves a las 9"
      const i = intencion(ctx.t);
      if (i) return irA(i, s, ctx, `👍 Entendí que quieres *${NOMBRE_INTENCION[i]}*.`);
      if (ctx.pref || buscarSucursal(ctx.t, ctx).sucursal) return irA('cita', s, ctx, '👍 Entendí que quieres *agendar una cita*.');
      return null;
    },
  },

  // ----------------------------- Agendar -----------------------------
  cita_estudio: {
    espera: 'necesito saber qué *estudio* quieres: escribe su número o su nombre (por ejemplo "ultrasonido")',
    prompt: (s, ctx) => {
      const ult = estudioPorId(ctx.perfil.ultimoEstudioId);
      return [
        '🧪 *¿Qué estudio necesitas?*',
        '',
        ...ESTUDIOS.map((e, i) => `${i + 1}. ${e.nombre} — ${precio(e.precio)}`),
        ult ? `\n💡 La última vez agendaste *${ult.nombre}* (opción ${ult.id}).` : '',
        s.data.sucursal ? `📍 Sucursal elegida: *${s.data.sucursal.nombre}, ${s.data.sucursal.ciudad}*` : '',
        '\nTambién puedes escribir el nombre, por ejemplo "rayos x".',
      ].filter(Boolean).join('\n') + NAV;
    },
    handle: (s, ctx) => {
      const est = elegir(ESTUDIOS, ctx.t);
      if (!est) return null;
      s.data.estudio = est;
      absorber(s, ctx);
      return avanzarCita(s, ctx, `✅ ${est.nombre}.`);
    },
  },

  cita_donde: {
    espera: 'necesito saber *dónde* quieres tu cita: elige una de las opciones',
    prompt: (s, ctx) => {
      const opts = [];
      const mia = sucursalPorId(ctx.perfil.sucursalId);
      if (mia) opts.push(['mia', `📍 Mi sucursal de siempre: *${mia.nombre}, ${mia.ciudad}*`]);
      opts.push(['cerca', '🧭 La más cercana a mí (compartir ubicación)']);
      opts.push(['ciudad', '🏙️ Elegir por ciudad']);
      s.data.opcionesDonde = opts.map((o) => o[0]);
      return `🏥 *¿En qué sucursal quieres tu cita?*\n\n${opts.map((o, i) => `${i + 1}. ${o[1]}`).join('\n')}` + NAV;
    },
    handle: (s, ctx) => {
      const n = opcion(ctx.t, s.data.opcionesDonde.length);
      let op = n ? s.data.opcionesDonde[n - 1] : null;
      if (!op && /cerca|ubicacion/.test(ctx.t)) op = 'cerca';
      if (!op && /ciudad/.test(ctx.t)) op = 'ciudad';
      if (!op && /siempre|misma|mia/.test(ctx.t) && s.data.opcionesDonde.includes('mia')) op = 'mia';
      if (!op) {
        const c = elegir(CIUDADES, ctx.t);
        if (c) {
          s.data.ciudad = c;
          absorber(s, ctx);
          return avanzarCita(s, ctx);
        }
        return null;
      }
      if (op === 'mia') {
        s.data.sucursal = sucursalPorId(ctx.perfil.sucursalId);
        absorber(s, ctx);
        return avanzarCita(s, ctx);
      }
      if (op === 'cerca') {
        const u = ctx.perfil.ubicacion;
        if (u && Date.now() - u.ts < UBIC_VIGENTE_MS) {
          s.data.origen = u;
          return go(s, 'cita_cercanas', ctx, '📍 Usé la ubicación que me compartiste hace rato.');
        }
        return go(s, 'cita_ubicacion', ctx);
      }
      return go(s, 'cita_ciudad', ctx);
    },
    onLocation: (s, ctx) => {
      s.data.origen = ctx.location;
      return go(s, 'cita_cercanas', ctx, '📍 ¡Gracias, recibí tu ubicación!');
    },
  },

  cita_ubicacion: {
    espera: 'estoy esperando tu *ubicación* 📍 (o escribe *ciudad* para elegirla de una lista)',
    prompt: () => `${COMO_UBICACION}\n\nSi prefieres, escribe *ciudad* para elegirla de una lista.` + NAV,
    handle: (s, ctx) => {
      if (/ciudad|lista/.test(ctx.t)) return go(s, 'cita_ciudad', ctx);
      const c = elegir(CIUDADES, ctx.t);
      if (c && ctx.op == null) {
        s.data.ciudad = c;
        absorber(s, ctx);
        return avanzarCita(s, ctx);
      }
      return null;
    },
    onLocation: (s, ctx) => {
      s.data.origen = ctx.location;
      return go(s, 'cita_cercanas', ctx, '📍 ¡Gracias, recibí tu ubicación!');
    },
  },

  cita_cercanas: {
    espera: 'necesito el *número de la sucursal* donde quieres tu cita',
    prompt: (s) => listaCercanas(s, 'Responde el *número* de la sucursal donde quieres tu cita.'),
    handle: (s, ctx) => {
      const ops = s.data.cercanas.map(sucursalPorId);
      const suc = elegir(ops, ctx.t);
      if (!suc) return null;
      s.data.sucursal = suc;
      absorber(s, ctx);
      return avanzarCita(s, ctx, `✅ ${suc.nombre}, ${suc.ciudad}.`);
    },
  },

  cita_ciudad: {
    espera: 'necesito la *ciudad*: escribe su número o su nombre',
    prompt: () => `🏙️ *¿En qué ciudad?*\n\n${CIUDADES.map((c, i) => `${i + 1}. ${c.nombre}`).join('\n')}` + NAV,
    handle: (s, ctx) => {
      const c = elegir(CIUDADES, ctx.t);
      if (!c) return null;
      s.data.ciudad = c;
      absorber(s, ctx);
      return avanzarCita(s, ctx);
    },
  },

  cita_sucursal: {
    espera: 'necesito el *número de la sucursal*',
    prompt: (s) =>
      `🏥 *Sucursales en ${s.data.ciudad.nombre}:*\n\n` +
      sucursalesDe(s).map((x, i) => `${i + 1}. *${x.nombre}*\n    🕒 ${x.horario}`).join('\n') +
      NAV,
    handle: (s, ctx) => {
      const suc = elegir(sucursalesDe(s), ctx.t) || buscarSucursal(ctx.t, ctx).sucursal;
      if (!suc || suc.ciudadId !== s.data.ciudad.id) return null;
      s.data.sucursal = suc;
      absorber(s, ctx);
      return avanzarCita(s, ctx, `✅ ${suc.nombre}.`);
    },
  },

  cita_horario: {
    espera: 'necesito el horario: dime su número o algo como "el jueves a la 1pm" (o *más* para ver otros días)',
    prompt: (s) => {
      if (s.data.alt) return textoAlternativas(s);
      const { dias, siguienteDesde } = disponibilidad(s.data.sucursal, s.data.desde || 1, 2);
      s.data.siguiente = siguienteDesde;
      s.data.slots = [];
      const bloques = dias.map((d) => {
        const lineas = d.horas.map((h) => {
          if (h.libres <= 0) return `      ~${h.hora}~  ⛔ lleno`;
          s.data.slots.push({ fecha: d.fecha, hora: h.hora });
          const estado = h.libres === 1 ? '🟡 último lugar' : `🟢 ${h.libres} lugares`;
          return `${s.data.slots.length}. ${h.hora}  ${estado}`;
        });
        return `*${d.etiqueta[0].toUpperCase() + d.etiqueta.slice(1)}*\n${lineas.join('\n')}`;
      });
      return (
        `🗓️ *Horarios disponibles en ${s.data.sucursal.nombre}*\n🧪 ${s.data.estudio.nombre}\n\n` +
        `${bloques.join('\n\n')}\n\n` +
        'Responde el *número* del horario o dímelo con tus palabras (ej. "el jueves a la 1pm", "lo más pronto").\n➡️ Escribe *más* para ver otros días.' +
        NAV
      );
    },
    handle: (s, ctx) => {
      if (/^(mas|siguiente|otros dias|otro dia|despues|ver todos|todos)$/.test(ctx.t)) {
        s.data.desde = s.data.alt ? 1 : s.data.siguiente;
        delete s.data.alt;
        return [STEPS.cita_horario.prompt(s, ctx)];
      }
      const n = opcion(ctx.t, s.data.slots.length);
      if (n) {
        s.data.slot = s.data.slots[n - 1];
        delete s.data.alt;
        return go(s, 'cita_confirmar', ctx);
      }
      // "quisiera agendarla a la 1pm", "el jueves en la tarde", "lo más pronto"
      if (ctx.pref) {
        s.data.pref = ctx.pref;
        return resolverHorario(s, ctx);
      }
      return null;
    },
  },

  cita_confirmar: {
    espera: 'dime *sí* para confirmar, otra hora o día para cambiarla (ej. "mejor a las 9"), o *no* para cancelar',
    prompt: (s, ctx) => {
      const { estudio, sucursal, slot, reprogramar } = s.data;
      return [
        '📝 *Revisa tu cita:*\n',
        `👤 Paciente: ${ctx.perfil.nombre || ctx.name || 'sin nombre'}`,
        `🧪 Estudio: ${estudio.nombre}`,
        `📍 Sucursal: ${sucursal.nombre}, ${sucursal.ciudad}`,
        `🗓️ Fecha: ${etiquetaFecha(slot.fecha)} a las ${slot.hora}`,
        `💲 Precio de referencia: ${precio(estudio.precio)}`,
        `⏱️ Duración aprox.: ${estudio.duracion}`,
        reprogramar ? `🔁 Esta cita reemplaza a la *${reprogramar}*.` : null,
        '\n1. ✅ Confirmar\n2. 🕒 Cambiar horario\n3. ❌ Cancelar',
        '\n_También puedes responder "sí", "mejor a las 9" o "no"._',
      ].filter((x) => x !== null).join('\n');
    },
    handle: async (s, ctx) => {
      // "mejor a las 9", "¿y el viernes?": cambia el horario sin pasar por la lista
      if (ctx.pref) {
        const p = { ...ctx.pref };
        if (!p.fecha) p.fecha = s.data.slot.fecha;
        if (!p.hora && !p.franja) p.hora = s.data.slot.hora;
        s.data.pref = p;
        s.data.slot = null;
        return resolverHorario(s, ctx, '🔁 Va, lo cambio.');
      }
      if (ctx.op === 1 || afirmativo(ctx.t)) {
        const { estudio, sucursal, slot, reprogramar } = s.data;
        if (!hayLugar(sucursal.id, slot.fecha, slot.hora)) {
          s.step = 'cita_horario';
          return [`😕 Ups, alguien acaba de ganar ese horario. Elige otro:\n\n${STEPS.cita_horario.prompt(s, ctx)}`];
        }
        const cita = {
          folio: nuevoFolio(),
          number: ctx.number,
          paciente: ctx.perfil.nombre || ctx.name || null,
          estudioId: estudio.id,
          estudio: estudio.nombre,
          sucursalId: sucursal.id,
          sucursal: `${sucursal.nombre}, ${sucursal.ciudad}`,
          fecha: slot.fecha,
          hora: slot.hora,
          precio: estudio.precio,
          estado: 'agendada',
          canal: 'whatsapp',
          creada: new Date().toISOString(),
        };
        citas.set(cita);
        if (reprogramar) citas.update(reprogramar, { estado: 'reprogramada', reemplazadaPor: cita.folio });
        actualizarPerfil(ctx.number, { sucursalId: sucursal.id, ultimoEstudioId: estudio.id, ultimoFolio: cita.folio });
        await emit(reprogramar ? 'appointment_rescheduled' : 'appointment_created', { patientId: ctx.number, cita, anterior: reprogramar || null });
        reset(s);
        return [
          `✅ *¡Listo! Tu cita quedó ${reprogramar ? 'reprogramada' : 'agendada'}.*\n\n` +
            `🔖 Folio: *${cita.folio}*\n🧪 ${cita.estudio}\n📍 ${cita.sucursal}\n🗓️ ${etiquetaFecha(cita.fecha)} a las ${cita.hora}\n\n` +
            `📋 *Preparación:* ${estudio.prep}\n\n🗺️ Cómo llegar: ${LINKS.ruta(ctx.perfil.ubicacion, sucursal)}`,
          'Te mandaré un recordatorio un día antes. Lleva una identificación y tu folio.\nEscribe *2* para ver tus citas o *0* para el menú.',
        ];
      }
      if (ctx.op === 2 || /\b(cambiar|otro horario|otra hora|otro dia|otra fecha)\b/.test(ctx.t)) {
        s.step = 'cita_horario';
        delete s.data.alt;
        return [STEPS.cita_horario.prompt(s, ctx)];
      }
      if (ctx.op === 3 || negativo(ctx.t)) {
        reset(s);
        return ['De acuerdo, no agendé nada. 🙂 Escribe *0* para ver el menú cuando quieras.'];
      }
      return null;
    },
  },

  // ----------------------------- Mis citas -----------------------------
  mis_citas: {
    espera: 'necesito el *número de la cita* que quieres revisar',
    prompt: (s, ctx) => {
      const lista = proximasCitas(ctx.number);
      s.data.misCitas = lista.map((c) => c.folio);
      if (!lista.length) {
        return '🗓️ No tienes citas próximas.\n\n1. 📅 Agendar una cita' + NAV;
      }
      return (
        `🗓️ *Tus próximas citas:*\n\n` +
        lista.map((c, i) => `${i + 1}. *${c.estudio}*\n    ${etiquetaFecha(c.fecha)} a las ${c.hora}\n    📍 ${c.sucursal} · 🔖 ${c.folio}`).join('\n\n') +
        '\n\nResponde el *número* de una cita para cambiarla o cancelarla.' +
        NAV
      );
    },
    handle: (s, ctx) => {
      if (!s.data.misCitas.length) {
        if (ctx.op === 1 || afirmativo(ctx.t) || /agendar|cita/.test(ctx.t)) {
          s.data = {};
          return go(s, 'cita_estudio', ctx);
        }
        return null;
      }
      const folio = elegir(s.data.misCitas.map((f) => ({ nombre: f })), ctx.t)?.nombre;
      if (!folio) return null;
      s.data.cita = folio;
      return go(s, 'cita_detalle', ctx);
    },
  },

  cita_detalle: {
    espera: 'responde *1* para reprogramar, *2* para cancelar o *3* para ver la preparación',
    prompt: (s, ctx) => {
      const c = citas.get(s.data.cita);
      const suc = sucursalPorId(c.sucursalId);
      return (
        `🔖 *Cita ${c.folio}*\n🧪 ${c.estudio}\n📍 ${c.sucursal}\n🗓️ ${etiquetaFecha(c.fecha)} a las ${c.hora}\n` +
        `🗺️ Cómo llegar: ${LINKS.ruta(ctx.perfil.ubicacion, suc)}\n\n` +
        '1. 🔁 Reprogramar\n2. ❌ Cancelar cita\n3. 📋 Ver preparación' +
        NAV
      );
    },
    handle: (s, ctx) => {
      const c = citas.get(s.data.cita);
      // "cámbiala para el viernes a las 9"
      if (ctx.pref) {
        s.data = { cita: c.folio, estudio: estudioPorId(c.estudioId), sucursal: sucursalPorId(c.sucursalId), reprogramar: c.folio, pref: ctx.pref };
        return resolverHorario(s, ctx, `🔁 Va, busco lugar ${descPref(ctx.pref)}.`);
      }
      if (ctx.op === 1 || /reprogram|cambiar|cambia|mover/.test(ctx.t)) {
        s.data = { estudio: estudioPorId(c.estudioId), sucursal: sucursalPorId(c.sucursalId), reprogramar: c.folio, desde: 1 };
        return go(s, 'cita_horario', ctx, '🔁 Elige el nuevo horario:');
      }
      if (ctx.op === 2 || /cancel/.test(ctx.t)) return go(s, 'cita_cancelar', ctx);
      if (ctx.op === 3 || /preparacion|ayuno|preparo|llevar/.test(ctx.t)) {
        return [`📋 *Preparación para ${c.estudio}:*\n${estudioPorId(c.estudioId).prep}\n\n1. 🔁 Reprogramar · 2. ❌ Cancelar` + NAV];
      }
      return null;
    },
  },

  cita_cancelar: {
    espera: 'responde *1* para cancelar la cita o *2* para conservarla',
    prompt: (s) => `⚠️ ¿Seguro que quieres cancelar la cita *${s.data.cita}*?\n\n1. Sí, cancelarla\n2. No, conservarla`,
    handle: async (s, ctx) => {
      if (ctx.op === 1 || afirmativo(ctx.t) || /^(cancelar|cancelala|si cancelala)$/.test(ctx.t)) {
        const folio = s.data.cita;
        citas.update(folio, { estado: 'cancelada', canceladaEn: new Date().toISOString() });
        await emit('appointment_cancelled', { patientId: ctx.number, folio });
        reset(s);
        return [`🗑️ Cita *${folio}* cancelada. Ese horario quedó libre para otro paciente.\n\nEscribe *1* para agendar otra o *0* para el menú.`];
      }
      if (ctx.op === 2 || negativo(ctx.t) || /conservar|dejala/.test(ctx.t)) return atras(s, ctx);
      return null;
    },
  },

  // ----------------------------- Resultados -----------------------------
  resultados: {
    espera: 'necesito tu *folio* (se ve así: SD-261124-1234)',
    prompt: (s, ctx) => {
      const recientes = citas.delPaciente(ctx.number).slice(-3).map((c) => c.folio);
      return (
        '📄 *Consulta de resultados*\n\nEscribe tu *folio* (ej. SD-DEMO-0001).' +
        (recientes.length ? `\n💡 Tus folios recientes: ${recientes.join(', ')}` : '') +
        `\n\nTambién puedes verlos en línea con el usuario y contraseña de tu ticket:\n${LINKS.resultados}` +
        NAV
      );
    },
    handle: (s, ctx) => {
      const folio = String(ctx.text || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!esFolio(folio)) return null;
      if (folio === 'SD-DEMO-0001') {
        return [`✅ Tus resultados del folio *${folio}* ya están listos.\n📥 Descárgalos aquí (demo): https://resultados.ejemplo/${folio}\n\n¿Otro folio? Escríbelo, o *0* para el menú.`];
      }
      const c = citas.get(folio);
      if (!c) return [`🔎 No encontré el folio *${folio}*. Revisa que esté bien escrito o escribe *agente* para que te ayude una persona.`];
      if (c.estado === 'cancelada') return [`ℹ️ La cita *${folio}* fue cancelada, por eso no tiene resultados.`];
      if (c.estado === 'resultados listos') return [`✅ Los resultados de *${folio}* (${c.estudio}) ya están listos.\n📥 ${LINKS.resultados}`];
      const est = estudioPorId(c.estudioId);
      return [
        `🕒 Tu estudio *${c.estudio}* está programado para el *${etiquetaFecha(c.fecha)}* a las ${c.hora}.\n` +
          `Los resultados suelen estar listos *${est?.entrega || 'en pocos días'}*. Te avisaré por aquí. 🔔`,
      ];
    },
  },

  // ----------------------------- Sucursales -----------------------------
  cercana: {
    espera: 'estoy esperando tu *ubicación* 📍, o el nombre de tu *ciudad*',
    prompt: () =>
      `📍 *Encuentra tu sucursal más cercana*\n\n${COMO_UBICACION}\n\nO escribe tu ciudad (Culiacán, Guadalajara, CDMX o Monterrey), o *ciudad* para ver la lista.` +
      NAV,
    handle: (s, ctx) => {
      if (/^(ciudad|lista|ciudades)$/.test(ctx.t)) return go(s, 'sucursal_ciudad', ctx);
      const c = elegir(CIUDADES, ctx.t);
      if (!c || ctx.op != null) return null;
      s.data.ciudad = c;
      return go(s, 'sucursal_lista', ctx);
    },
    onLocation: (s, ctx) => {
      s.data.origen = ctx.location;
      return go(s, 'cercana_lista', ctx, '📍 ¡Gracias, recibí tu ubicación!');
    },
  },

  cercana_lista: {
    espera: 'responde el *número* de una sucursal para agendar ahí',
    prompt: (s) => listaCercanas(s, '¿Quieres agendar en alguna? Responde su *número*.'),
    handle: (s, ctx) => {
      const suc = elegir(s.data.cercanas.map(sucursalPorId), ctx.t);
      if (!suc) return null;
      s.data = { sucursal: suc };
      return go(s, 'cita_estudio', ctx, `✅ ${suc.nombre}, ${suc.ciudad}.`);
    },
  },

  sucursal_ciudad: {
    espera: 'necesito la *ciudad*: escribe su número o su nombre',
    prompt: () => `🏙️ *¿De qué ciudad?*\n\n${CIUDADES.map((c, i) => `${i + 1}. ${c.nombre}`).join('\n')}` + NAV,
    handle: (s, ctx) => {
      const c = elegir(CIUDADES, ctx.t);
      if (!c) return null;
      s.data.ciudad = c;
      return go(s, 'sucursal_lista', ctx);
    },
  },

  sucursal_lista: {
    espera: 'responde el *número* de una sucursal para agendar ahí',
    prompt: (s, ctx) =>
      `🏥 *Sucursales en ${s.data.ciudad.nombre}:*\n\n` +
      sucursalesDe(s)
        .map((x, i) => `${i + 1}. *${x.nombre}*\n    🕒 ${x.horario}\n    🗺️ ${LINKS.ruta(ctx.perfil.ubicacion, x)}`)
        .join('\n\n') +
      '\n\n¿Quieres agendar en alguna? Responde su *número*.' +
      NAV,
    handle: (s, ctx) => {
      const suc = elegir(sucursalesDe(s), ctx.t);
      if (!suc) return null;
      s.data = { sucursal: suc };
      return go(s, 'cita_estudio', ctx, `✅ ${suc.nombre}, ${suc.ciudad}.`);
    },
  },

  // ----------------------------- Estudios -----------------------------
  estudios: {
    espera: 'necesito el *estudio*: escribe su número o su nombre',
    prompt: () =>
      `🧪 *Estudios y precios de referencia*\n\n${ESTUDIOS.map((e, i) => `${i + 1}. ${e.nombre} — ${precio(e.precio)}`).join('\n')}\n\n` +
      'Responde el número para ver en qué consiste y cómo prepararte.' +
      NAV,
    handle: (s, ctx) => {
      const est = elegir(ESTUDIOS, ctx.t);
      if (!est) return null;
      s.data.estudio = est;
      return go(s, 'estudio_detalle', ctx);
    },
  },

  estudio_detalle: {
    espera: 'responde *1* para agendar este estudio o *2* para ver otro',
    prompt: (s) => {
      const e = s.data.estudio;
      return (
        `🧪 *${e.nombre}*\n\n${e.descripcion}\n\n` +
        `⏱️ Duración: ${e.duracion}\n📄 Resultados: ${e.entrega}\n💲 Precio de referencia: ${precio(e.precio)}\n\n` +
        `📋 *Preparación:* ${e.prep}\n\n1. 📅 Agendar este estudio\n2. 🔎 Ver otro estudio` +
        NAV
      );
    },
    handle: (s, ctx) => {
      if (ctx.op === 1 || afirmativo(ctx.t) || /agendar|cita/.test(ctx.t)) {
        absorber(s, ctx);
        return avanzarCita(s, ctx);
      }
      if (ctx.op === 2 || /otro/.test(ctx.t)) {
        s.historial.pop();
        s.step = 'estudios';
        return [STEPS.estudios.prompt(s, ctx)];
      }
      return null;
    },
  },

  // ----------------------------- Agente -----------------------------
  agente: {
    espera: '',
    prompt: () =>
      '👩‍⚕️ Te estoy conectando con un agente. En un momento te atiende.\nPuedes ir escribiendo tu duda.\n\n_Escribe *0* para regresar al asistente._',
    handle: async (s, ctx) => {
      await emit('agent_message', { patientId: ctx.number, name: ctx.name, text: ctx.text });
      if (s.data.avisado) return [];
      s.data.avisado = true;
      return ['📨 Recibido. Un agente te responderá por aquí en breve.'];
    },
  },
};

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------
export async function handleMessage({ number, name, text, location }) {
  const s = getSession(number);
  const p = perfil(number);
  const t = norm(text);
  const ctx = { number, name, text, t, location, perfil: p, op: opcion(t), pref: preferenciaHorario(t) };

  // Memoria: nombre y número de visitas
  if (s.step === 'nuevo') actualizarPerfil(number, { visitas: (p.visitas || 0) + 1, ultimaVisita: new Date().toISOString() });
  if (name && name !== p.nombre) actualizarPerfil(number, { nombre: name });

  // 1) Emergencias: siempre primero
  if (t && esEmergencia(t)) {
    await emit('emergency_flag', { patientId: number, text, prioridad: 'alta' });
    return [
      '🚨 Si es una emergencia médica, *llama al 911* o acude al servicio de urgencias más cercano de inmediato.\n' +
        'Salud Digna realiza estudios de diagnóstico y no atiende urgencias.\n\n' +
        'Si estás pasando por un momento difícil, la *Línea de la Vida* atiende 24 h: 800 911 2000.\n\n' +
        'Avisé a un agente para que te contacte. Escribe *0* si necesitas otra cosa.',
    ];
  }

  // 2) Ubicación recibida
  if (location) {
    actualizarPerfil(number, { ubicacion: { ...location, ts: Date.now() } });
    ctx.location = location;
    ctx.perfil = perfil(number);
    await emit('location_shared', { patientId: number, location });
    const step = STEPS[s.step];
    if (step?.onLocation) return step.onLocation(s, ctx);
    if (s.step === 'nuevo') reset(s);
    s.data = { origen: location };
    return go(s, 'cercana_lista', ctx, '📍 ¡Gracias por tu ubicación! Estas son las sucursales más cercanas:');
  }

  const cmd = comando(t);

  // 3) Con agente humano: solo 0/menú/salir regresan al bot
  if (s.step === 'agente') {
    if (cmd === 'menu' || cmd === 'salir') {
      await emit('handoff_closed', { patientId: number });
      reset(s);
      return [`🤖 Regresaste con el asistente virtual.\n\n${menuTexto(ctx)}`];
    }
    return STEPS.agente.handle(s, ctx);
  }

  // 4) Conversación nueva: saludo con memoria (y si ya pidió algo, lo atendemos)
  if (s.step === 'nuevo') {
    reset(s);
    const i = cmd ? null : intencion(t);
    if (i) return irA(i, s, ctx, saludo(ctx));
    return [`${saludo(ctx)}\n\n${menuTexto(ctx)}`];
  }

  // 5) Comandos globales
  switch (cmd) {
    case 'menu':
      reset(s);
      return [menuTexto(ctx)];
    case 'saludo':
      if (s.step === 'menu') return [`${saludo(ctx)}\n\n${menuTexto(ctx)}`];
      // A mitad de un trámite: no perdemos el avance
      return [`👋 ¡Hola! Seguimos donde nos quedamos (escribe *0* si prefieres empezar de nuevo).\n\n${STEPS[s.step].prompt(s, ctx)}`];
    case 'atras':
      return atras(s, ctx);
    case 'salir':
      reset(s, 'nuevo');
      await emit('session_closed', { patientId: number });
      return [`¡Gracias por escribirnos${primerNombre(p.nombre) ? ', ' + primerNombre(p.nombre) : ''}! 💚 Cuando quieras, escribe *hola* y aquí estaré.`];
    case 'gracias':
      return ['¡Con mucho gusto! 😊 ¿Algo más? Escribe *0* para ver el menú o *salir* para terminar.'];
    case 'ayuda':
      return [
        '🆘 *Cómo usarme:*\n• Responde con el *número* de la opción.\n• O escríbeme normal: "quiero agendar un ultrasonido", "¿cuánto cuesta la mastografía?", "sucursales en Monterrey".\n' +
          '• Comparte tu *ubicación* 📍 para ver tu sucursal más cercana.\n• *atrás* regresa un paso, *0* va al menú, *salir* termina.\n• *agente* te comunica con una persona.',
      ];
  }

  // 6) El paso actual intenta entender el mensaje
  const step = STEPS[s.step] || STEPS.menu;
  const res = await step.handle(s, ctx);
  if (res) {
    s.errores = 0;
    return res;
  }

  // 7) En medio de una cita: ¿dio otro dato útil? ("en Minerva", "el jueves a la 1pm")
  if (s.step.startsWith('cita_') && !['cita_confirmar', 'cita_detalle', 'cita_cancelar'].includes(s.step) && ctx.op == null) {
    const antes = huella(s);
    absorber(s, ctx);
    if (huella(s) !== antes) return avanzarCita(s, ctx, `📝 Anotado:\n${resumenCita(s)}`);
  }

  // 8) Mensaje fuera de lugar: ¿escribió un folio o pidió otra cosa?
  if (esFolio(text) && s.step !== 'resultados') {
    s.historial.push(s.step);
    s.step = 'resultados';
    const r = await STEPS.resultados.handle(s, ctx);
    return [`📄 Veo que escribiste un folio, te ayudo con eso:\n\n${r[0]}`];
  }
  if (!esNumero(t)) {
    const i = intencion(t);
    if (i) return irA(i, s, ctx, `👍 Entendí que quieres *${NOMBRE_INTENCION[i]}*.`);
  }

  // 9) No se entendió: lo mencionamos y repetimos lo que esperamos
  s.errores = (s.errores || 0) + 1;
  const eco = String(text || '').trim();
  const ecoCorto = eco.length > 40 ? eco.slice(0, 40) + '…' : eco;
  let msg = eco
    ? `🤔 No entendí *"${ecoCorto}"* en este paso.\nAhora mismo ${step.espera}.`
    : `🤔 Ese tipo de mensaje no lo puedo leer todavía. Ahora mismo ${step.espera}.`;
  if (s.errores >= 3) msg += '\n\n¿Prefieres que te atienda una persona? Escribe *agente*.';
  return s.errores === 1 || s.errores >= 3 ? [`${msg}\n\n${step.prompt(s, ctx)}`] : [msg];
}
