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

| Opción | Flujo |
|---|---|
| 1 Agendar cita | estudio → ciudad → sucursal → horario → confirmación → folio `SD-AAMMDD-####` |
| 2 Resultados | por folio (`SD-DEMO-0001` regresa resultados listos) |
| 3 Sucursales | por ciudad, con horarios |
| 4 Precios | lista de referencia |
| 5 Preparación | indicaciones por estudio |
| 6 Agente | pasa la conversación al call center (handoff) |

`menu` regresa al inicio en cualquier momento. **Todos los datos (precios, sucursales, horarios) son simulados**; están en `bot/src/data.js`.

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
{ "channel": "whatsapp", "type": "message_in | message_out | appointment_created | handoff | agent_message | handoff_closed",
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
