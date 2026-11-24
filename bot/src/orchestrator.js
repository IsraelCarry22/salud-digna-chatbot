// Envía cada evento del canal WhatsApp al orquestador omnicanal (si está configurado).
// Formato normalizado: el orquestador recibe lo mismo venga de WhatsApp, web o call center.

const URL = process.env.ORCHESTRATOR_URL || '';

export async function emit(type, payload) {
  const event = {
    channel: 'whatsapp',
    type, // message_in | message_out | appointment_created | handoff | agent_message
    timestamp: new Date().toISOString(),
    ...payload,
  };
  console.log(`[orquestador] ${type}`, JSON.stringify(payload));
  if (!URL) return;
  try {
    await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.error(`[orquestador] no disponible (${err.message}); el bot sigue funcionando`);
  }
}
