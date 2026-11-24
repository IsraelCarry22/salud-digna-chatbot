# Chatbot WhatsApp · Salud Digna (HackaTec)

Chatbot de WhatsApp construido sobre el contrato de **Evolution API v2**, con un **teléfono virtual** para probarlo sin conectar ningún teléfono ni número real.

```
Navegador (teléfono virtual) ──► simulator :8090 ──webhook messages.upsert──► bot :3001
                                      ▲                                         │
                                      └──── POST /message/sendText/{inst} ◄─────┘
                                                                                │
                                                          ORCHESTRATOR_URL ◄────┘ (eventos normalizados)
```

El simulador usa los mismos endpoints y el mismo formato de webhook que Evolution API. Para pasar a Evolution API real solo se cambia `EVOLUTION_URL` en `.env`: el bot no se toca.

## 1. Instalar lo necesario

Solo necesitas **Docker** (con Docker Compose) y **Git**. Node.js es opcional, por si quieres correrlo sin Docker.

**Windows (PowerShell como administrador)**
```powershell
wsl --install
winget install -e --id Docker.DockerDesktop
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS.LTS   # opcional
```
Reinicia, abre Docker Desktop y espera a que diga "Engine running".

**macOS**
```bash
brew install --cask docker
brew install git node   # node opcional
```

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER   # cierra sesión y vuelve a entrar
```

Verifica:
```bash
docker --version
docker compose version
```

## 2. Levantar el chatbot con el teléfono virtual

```bash
cd salud-digna-chatbot
cp .env.example .env          # en Windows: copy .env.example .env
docker compose up -d --build
```

- Teléfono virtual: **http://localhost:8090** → escribe `hola`
- Estado del bot: http://localhost:3001/health · http://localhost:3001/stats · http://localhost:3001/citas

Logs: `docker compose logs -f bot` · Apagar: `docker compose down`

En el panel izquierdo puedes crear varios pacientes (números distintos) para simular varias conversaciones al mismo tiempo.

## 3. Lo que hace el bot

**Menú principal:** 1 Agendar cita · 2 Mis citas · 3 Resultados · 4 Sucursal más cercana · 5 Estudios (precios y preparación) · 6 Agente · 7 Enlaces útiles.

| Función | Cómo se ve |
|---|---|
| **Navegación en todos los pasos** | `atrás` regresa un paso, `0`/`menu` va al menú, `salir` termina la conversación |
| **Mensajes fuera de lugar** | Repite lo que escribió el paciente ("No entendí *pizza* en este paso"), le dice qué espera y, al tercer intento, ofrece un agente |
| **Lenguaje natural** | "quiero agendar un ultrasonido", "¿cuánto cuesta la mastografía?", "sucursales en Monterrey", o un folio escrito en cualquier momento |
| **Memoria** | Recuerda nombre, sucursal de siempre, último estudio, citas y ubicación (`bot/data/memoria.json`, en un volumen de Docker). Saluda "¡Qué gusto verte de nuevo!" y le recuerda su próxima cita |
| **Horarios con cupo** | Muestra días y horas con 🟢 lugares / 🟡 último lugar / ⛔ lleno; `más` para ver otros días. Si alguien gana el horario, avisa |
| **Mis citas** | Ver, reprogramar (libera el horario anterior) o cancelar |
| **Ubicación** | Con la ubicación de WhatsApp (`locationMessage`) calcula las sucursales más cercanas (Haversine), da el link de la ruta en Google Maps y el de las clínicas reales cerca del paciente |
| **Emergencias** | "dolor de pecho", "no puedo respirar", etc. → indica llamar al 911 y manda alerta `emergency_flag` al orquestador |
| **Agente humano** | Handoff con confirmación al paciente; el call center contesta con `POST /agent/reply` |

En el teléfono virtual, el botón **📍** comparte la ubicación real del navegador (GPS) o una ciudad demo.

**Datos:** los enlaces de `LINKS` en `bot/src/data.js` son los públicos de Salud Digna (verifícalos antes de presentar). Precios, sucursales, coordenadas y horarios son **simulados**.

### Estructura del bot

| Archivo | Qué hace |
|---|---|
| `src/index.js` | Servidor, webhook de Evolution API (texto y ubicación), endpoints |
| `src/flows.js` | Pasos de la conversación, navegación, intenciones |
| `src/nlp.js` | Normalización de texto, intenciones, emergencias, distancia |
| `src/agenda.js` | Disponibilidad con cupos, folios, próximas citas |
| `src/store.js` | Memoria persistente (perfiles y citas) |
| `src/sessions.js` | En qué paso va cada conversación (expira a los 30 min) |
| `src/data.js` | Enlaces, estudios, ciudades y sucursales |
| `src/orchestrator.js` | Envía eventos al orquestador omnicanal |

## 4. Endpoints para el orquestador / call center

```bash
# Agente humano responde al paciente (después del handoff, opción 6)
curl -X POST localhost:3001/agent/reply -H "Content-Type: application/json" \
  -d '{"number":"5216671234567","agente":"Ana","text":"Hola, ¿en qué te ayudo?"}'

# Trigger proactivo (ej. resultados listos); opcionalmente cambia el estado de la cita
curl -X POST localhost:3001/notify -H "Content-Type: application/json" \
  -d '{"number":"5216671234567","folio":"SD-261124-1234","estado":"resultados listos","text":"📄 Tus resultados ya están listos."}'
```

Si defines `ORCHESTRATOR_URL`, el bot le manda cada evento con este formato:
```json
{ "channel": "whatsapp", "type": "message_in | message_out | appointment_created | appointment_rescheduled | appointment_cancelled | location_shared | emergency_flag | handoff | agent_message | handoff_closed | session_closed",
  "timestamp": "...", "patientId": "5216671234567", "...": "datos del evento" }
```

## 5. (Opcional) Evolution API real sin vincular tu teléfono

```bash
# en .env:  EVOLUTION_URL=http://evolution-api:8080
docker compose --profile evolution up -d --build
```
Levanta Evolution API + PostgreSQL + Redis, con el webhook global apuntando al bot. Manager: http://localhost:8080/manager (usa tu `EVOLUTION_API_KEY`).

Para **no** escanear QR con tu teléfono, crea la instancia con la integración **WHATSAPP-BUSINESS** (Cloud API de Meta con su número de prueba gratuito) en vez de WHATSAPP-BAILEYS. Los datos que pide (token, phone number ID, business ID) salen de tu app en developers.facebook.com; revisa la documentación de Evolution para los campos exactos de tu versión.

## Correr sin Docker (opcional, requiere Node 20+)

```bash
cd simulator && npm install && WEBHOOK_URL=http://localhost:3001/webhook npm start
# en otra terminal
cd bot && npm install && EVOLUTION_URL=http://localhost:8080 npm start
```
Abre http://localhost:8080. En Windows PowerShell define las variables con `$env:WEBHOOK_URL="..."` antes de `npm start`.
