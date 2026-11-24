import { ESTUDIOS, CIUDADES, TODAS_SUCURSALES, horariosDisponibles } from './data.js';
import { getSession, reset } from './sessions.js';
import { emit } from './orchestrator.js';

// Citas creadas durante la demo (en memoria)
export const citas = new Map(); // folio -> cita

const MENU = (nombre) =>
  [
    `Hola${nombre ? ' ' + nombre : ''} 👋, soy el asistente virtual de *Salud Digna*.`,
    '¿En qué te puedo ayudar? Responde con el número:',
    '',
    '1️⃣ Agendar una cita',
    '2️⃣ Consultar mis resultados',
    '3️⃣ Sucursales y horarios',
    '4️⃣ Precios de estudios',
    '5️⃣ Preparación para mi estudio',
    '6️⃣ Hablar con un agente',
    '',
    '_En cualquier momento escribe *menu* para volver aquí._',
  ].join('\n');

const lista = (items, fmt) => items.map((x, i) => `${i + 1}. ${fmt(x)}`).join('\n');
const elegir = (items, text) => {
  const n = parseInt(String(text).trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= items.length ? items[n - 1] : null;
};
const norm = (t) =>
  String(t || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function nuevoFolio() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `SD-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Procesa un mensaje entrante y regresa la lista de respuestas a enviar.
 */
export async function handleMessage({ number, name, text }) {
  const s = getSession(number);
  const t = norm(text);

  // Comandos globales
  // (si está con un agente humano, solo "menu" lo regresa al bot; eso se maneja en el case 'agente')
  const saludo = ['menu', 'inicio', 'hola', 'buenas', 'buenos dias', 'buenas tardes', '0'].includes(t);
  if (s.step !== 'agente' && (saludo || s.step === 'nuevo')) {
    reset(s);
    return [MENU(name)];
  }

  switch (s.step) {
    case 'menu':
      return menuPrincipal(s, t, { number, name });

    // ---------- 1. Agendar cita ----------
    case 'cita_estudio': {
      const est = elegir(ESTUDIOS, t);
      if (!est) return ['Opción no válida. Escribe el número del estudio.'];
      s.data.estudio = est;
      s.step = 'cita_ciudad';
      return [`Elegiste *${est.nombre}*.\n¿En qué ciudad?\n\n${lista(CIUDADES, (c) => c.nombre)}`];
    }
    case 'cita_ciudad': {
      const c = elegir(CIUDADES, t);
      if (!c) return ['Opción no válida. Escribe el número de la ciudad.'];
      s.data.ciudad = c;
      s.step = 'cita_sucursal';
      return [`Sucursales en *${c.nombre}*:\n\n${lista(c.sucursales, (x) => `${x.nombre} (${x.horario})`)}`];
    }
    case 'cita_sucursal': {
      const suc = elegir(s.data.ciudad.sucursales, t);
      if (!suc) return ['Opción no válida. Escribe el número de la sucursal.'];
      s.data.sucursal = suc;
      s.data.slots = horariosDisponibles();
      s.step = 'cita_horario';
      return [`Horarios disponibles en *${suc.nombre}*:\n\n${lista(s.data.slots, (x) => x.etiqueta)}`];
    }
    case 'cita_horario': {
      const slot = elegir(s.data.slots, t);
      if (!slot) return ['Opción no válida. Escribe el número del horario.'];
      s.data.slot = slot;
      s.step = 'cita_confirmar';
      const { estudio, sucursal, ciudad } = s.data;
      return [
        [
          '*Confirma tu cita:*',
          `🧪 Estudio: ${estudio.nombre}`,
          `📍 Sucursal: ${sucursal.nombre}, ${ciudad.nombre}`,
          `🗓️ Fecha: ${slot.etiqueta}`,
          `💲 Precio: $${estudio.precio} MXN _(simulado)_`,
          '',
          'Responde *1* para confirmar o *2* para cancelar.',
        ].join('\n'),
      ];
    }
    case 'cita_confirmar': {
      if (t === '1' || t === 'si' || t === 'confirmar') {
        const folio = nuevoFolio();
        const { estudio, sucursal, ciudad, slot } = s.data;
        const cita = {
          folio,
          number,
          paciente: name || null,
          estudio: estudio.nombre,
          sucursal: `${sucursal.nombre}, ${ciudad.nombre}`,
          sucursalId: sucursal.id,
          fecha: slot.fecha,
          hora: slot.hora,
          estado: 'agendada',
          creada: new Date().toISOString(),
        };
        citas.set(folio, cita);
        await emit('appointment_created', { patientId: number, cita });
        reset(s);
        return [
          `✅ ¡Listo! Tu cita quedó agendada.\nFolio: *${folio}*\n\n📋 Preparación: ${estudio.prep}`,
          'Te enviaremos un recordatorio un día antes. Escribe *menu* si necesitas algo más.',
        ];
      }
      if (t === '2' || t === 'no' || t === 'cancelar') {
        reset(s);
        return ['Cita cancelada. Escribe *menu* para ver las opciones.'];
      }
      return ['Responde *1* para confirmar o *2* para cancelar.'];
    }

    // ---------- 2. Resultados ----------
    case 'resultados_folio': {
      const folio = String(text || '').trim().toUpperCase();
      reset(s);
      if (folio === 'SD-DEMO-0001') {
        return [
          '📄 Tus resultados del folio *SD-DEMO-0001* ya están listos.\nDescárgalos aquí (simulado): https://resultados.ejemplo/SD-DEMO-0001',
          'Escribe *menu* para volver.',
        ];
      }
      const cita = citas.get(folio);
      if (cita) {
        return [`🕒 El folio *${folio}* (${cita.estudio}) está *${cita.estado}*. Te avisaremos por aquí cuando tus resultados estén listos.`];
      }
      return ['No encontré ese folio. Revisa que esté bien escrito (ej. *SD-DEMO-0001*) o escribe *6* desde el menú para hablar con un agente.'];
    }

    // ---------- 3. Sucursales ----------
    case 'sucursal_ciudad': {
      const c = elegir(CIUDADES, t);
      if (!c) return ['Opción no válida. Escribe el número de la ciudad.'];
      reset(s);
      return [`📍 Sucursales en *${c.nombre}*:\n\n${c.sucursales.map((x) => `• ${x.nombre}: ${x.horario}`).join('\n')}\n\nEscribe *menu* para volver.`];
    }

    // ---------- 5. Preparación ----------
    case 'prep_estudio': {
      const est = elegir(ESTUDIOS, t);
      if (!est) return ['Opción no válida. Escribe el número del estudio.'];
      reset(s);
      return [`📋 *${est.nombre}*\n${est.prep}\n\nEscribe *menu* para volver.`];
    }

    // ---------- 6. Agente humano ----------
    case 'agente': {
      if (t === 'menu') {
        reset(s);
        await emit('handoff_closed', { patientId: number });
        return [MENU(name)];
      }
      await emit('agent_message', { patientId: number, name, text });
      return []; // el agente responde desde el call center vía POST /agent/reply
    }

    default:
      reset(s);
      return [MENU(name)];
  }
}

async function menuPrincipal(s, t, { number, name }) {
  switch (t) {
    case '1':
      s.step = 'cita_estudio';
      return [`¿Qué estudio necesitas?\n\n${lista(ESTUDIOS, (e) => e.nombre)}`];
    case '2':
      s.step = 'resultados_folio';
      return ['Escribe tu *folio* (ej. SD-DEMO-0001).'];
    case '3':
      s.step = 'sucursal_ciudad';
      return [`¿De qué ciudad?\n\n${lista(CIUDADES, (c) => c.nombre)}`];
    case '4':
      return [`💲 *Precios de referencia (simulados):*\n\n${ESTUDIOS.map((e) => `• ${e.nombre}: $${e.precio} MXN`).join('\n')}\n\nEscribe *1* para agendar o *menu* para volver.`];
    case '5':
      s.step = 'prep_estudio';
      return [`¿Para qué estudio quieres la preparación?\n\n${lista(ESTUDIOS, (e) => e.nombre)}`];
    case '6':
      s.step = 'agente';
      await emit('handoff', { patientId: number, name, motivo: 'solicitud_paciente' });
      return ['👩‍⚕️ Te estoy conectando con un agente. En un momento te atiende.\n_Escribe *menu* para regresar al asistente._'];
    default:
      return ['No entendí tu respuesta 🤔. Escribe un número del *1* al *6*, o *menu* para ver las opciones.'];
  }
}

export { TODAS_SUCURSALES };
