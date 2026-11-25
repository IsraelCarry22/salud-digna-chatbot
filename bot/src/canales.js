// Enruta cada respuesta por el canal del que llegó el paciente:
//   'meta'      -> WhatsApp Cloud API oficial (meta.js)
//   'evolution' -> Evolution API o el simulador (evolution.js)
// Así el bot atiende ambos canales al mismo tiempo con la misma lógica.

import * as evolution from './evolution.js';
import * as meta from './meta.js';
import { perfil, actualizarPerfil } from './store.js';

const canalDe = new Map(); // number -> canal (en memoria; también se guarda en el perfil)

export function registrarCanal(number, canal) {
  if (canalDe.get(number) !== canal) {
    canalDe.set(number, canal);
    actualizarPerfil(number, { canal });
  }
}

export function canal(number) {
  return canalDe.get(number) || perfil(number).canal || 'evolution';
}

export function sendText(number, text) {
  return canal(number) === 'meta' ? meta.sendText(number, text) : evolution.sendText(number, text);
}

export function config() {
  return { evolution: evolution.config(), meta: meta.config() };
}
