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
| **Lenguaje natural (`entender.js`)** | Entiende horas ("a la 1pm", "como a las 9 y media", "al mediodía", "en la tarde", "lo más pronto"), fechas ("mañana", "pasado mañana", "el jueves", "el 27", "27 de noviembre", "la próxima semana"), opciones con palabras ("la primera", "el dos", "la última") y respuestas como "sí, confírmala", "dale" o "mejor no" |
| **Todo en un mensaje** | "quiero un ultrasonido en Minerva el jueves a la 1pm" → llena estudio, sucursal y horario y pasa directo a confirmar. Si no hay lugar, propone los horarios más cercanos |
| **Cambios con palabras** | En la confirmación: "mejor a las 3 de la tarde". En cualquier momento: "cambia mi cita para el viernes en la mañana" o "cancela mi cita" |
| **Intenciones** | "quiero agendar un ultrasonido", "¿cuánto cuesta la mastografía?", "sucursales en Monterrey", o un folio escrito en cualquier momento |
| **Memoria** | Recuerda nombre, sucursal de siempre, último estudio, citas y ubicación (`bot/data/memoria.json`, en un volumen de Docker). Saluda "¡Qué gusto verte de nuevo!" y le recuerda su próxima cita |
| **Horarios con cupo** | Muestra días y horas con 🟢 lugares / 🟡 último lugar / ⛔ lleno; `más` para ver otros días. Si alguien gana el horario, avisa |
| **Mis citas** | Ver, reprogramar (libera el horario anterior) o cancelar |
| **Ubicación** | Con la ubicación de WhatsApp (`locationMessage`) calcula las sucursales más cercanas (Haversine), da el link de la ruta en Google Maps y el de las clínicas reales cerca del paciente |
| **Fuera de tema** | Si escriben algo ajeno (pizza, chistes, fútbol…) responde que el canal es exclusivo para los servicios de Salud Digna, sin perder el trámite en curso, y manda el evento `off_topic`. Preguntas de diagnóstico o medicamentos reciben un aviso de que debe consultar a un médico. Temas de Salud Digna que el bot no cubre (promociones, lentes) se canalizan al sitio oficial o a un agente |
| **Emergencias** | "dolor de pecho", "no puedo respirar", etc. → indica llamar al 911 y manda alerta `emergency_flag` al orquestador |
| **Agente humano** | Handoff con confirmación al paciente; el call center contesta con `POST /agent/reply` |

En el teléfono virtual:
- **⋮** en el encabezado del chat: *Vaciar mensajes*, *Eliminar chat* o *Eliminar chat y memoria del bot* (borra perfil y citas del paciente con `DELETE /pacientes/:numero`; útil para repetir una demo desde cero). También hay un 🗑️ en cada chat de la lista.
- **🌙 / ☀️** cambia entre modo claro y oscuro (se recuerda en el navegador).
- Es responsivo: en celular el teléfono ocupa toda la pantalla y la lista de pacientes se abre con **☰**. La página no se estira: el chat y la lista se desplazan por dentro.
- El botón **📍** comparte la ubicación real del navegador (GPS) o una ciudad demo.

**Datos:** los enlaces de `LINKS` en `bot/src/data.js` son los públicos de Salud Digna (verifícalos antes de presentar). Precios, sucursales, coordenadas y horarios son **simulados**.

### Estructura del bot

| Archivo | Qué hace |
|---|---|
| `src/index.js` | Servidor, webhook de Evolution API (texto y ubicación), endpoints |
| `src/flows.js` | Pasos de la conversación, navegación, intenciones |
| `src/nlp.js` | Normalización de texto, intenciones, emergencias, distancia |
| `src/entender.js` | Horas, fechas, opciones dichas con palabras, sí/no |
| `src/agenda.js` | Disponibilidad con cupos, folios, próximas citas |
| `src/store.js` | Memoria persistente (perfiles y citas) |
| `src/sessions.js` | En qué paso va cada conversación (expira a los 30 min) |
| `src/data.js` | Enlaces, estudios, ciudades y sucursales |
| `src/orchestrator.js` | Envía eventos al orquestador omnicanal |
| `src/meta.js` | WhatsApp Cloud API de Meta: webhook, firma, envío, leído/escribiendo, plantillas |
| `src/canales.js` | Responde a cada paciente por su canal (Meta o Evolution/simulador) |

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

## 6. WhatsApp real con la Cloud API de Meta (oficial, sin vincular tu teléfono)

El bot atiende **al mismo tiempo** el simulador y WhatsApp real: a cada paciente le responde por el canal del que le escribió.

```
WhatsApp del paciente ──► Meta ──► https://….trycloudflare.com/meta/webhook ──► bot :3001
                                                                                   │
WhatsApp del paciente ◄── Meta ◄── graph.facebook.com/{phone_number_id}/messages ◄──┘
```

**1. Crea la app en Meta**
1. Entra a https://developers.facebook.com → *Mis apps* → *Crear app* → tipo **Empresa (Business)** → agrega el producto **WhatsApp**.
2. En **WhatsApp → API Setup** copia el **token de acceso temporal** y el **Phone number ID** (el ID, no el número).
3. En el campo **To**, agrega tu número personal y confírmalo con el código que te llega. Puedes agregar hasta 5 números para pruebas.
4. En **Configuración de la app → Básica** copia el **App Secret**.

**2. Llena el `.env`**
```
META_TOKEN=EAA...
META_PHONE_NUMBER_ID=1234567890
META_VERIFY_TOKEN=saluddigna-verify     # inventado por ti; lo pegarás en Meta
META_APP_SECRET=abc123...
```

**3. Levanta el bot con el túnel HTTPS**
```bash
docker compose --profile meta up -d --build
docker compose logs tunel        # busca la línea con https://algo.trycloudflare.com
docker compose logs bot          # debe decir "WhatsApp Cloud API (Meta) activa"
```

**4. Registra el webhook en Meta**
1. **WhatsApp → Configuración → Webhook → Editar**
   - URL de devolución de llamada: `https://algo.trycloudflare.com/meta/webhook`
   - Token de verificación: el mismo `META_VERIFY_TOKEN`
   - *Verificar y guardar* (en los logs del bot verás `webhook verificado ✅`).
2. En **Campos del webhook**, suscríbete a **messages**.

**5. Pruébalo:** desde tu WhatsApp escríbele "hola" al número de prueba de Meta.

| Ojo con | Qué pasa | Qué hacer |
|---|---|---|
| Token temporal | Caduca a las 24 h (error 190 en los logs) | Genera otro, o crea un token de *usuario del sistema* en Meta Business para la demo |
| Número de prueba | Solo responde a los 5 números de la lista (error 131030) | Agrega el número en *API Setup → To* |
| Ventana de 24 h | Solo puedes escribir libremente 24 h después del último mensaje del paciente (error 131047) | Para recordatorios usa `POST /notify` con `"plantilla": true` (manda `hello_world` u otra plantilla aprobada) |
| URL del túnel | Cambia cada vez que reinicias el contenedor `tunel` | Vuelve a pegarla en Meta, o usa ngrok o un túnel con nombre de Cloudflare |
| Números de México | Meta los manda como `521…`, pero para enviar se usa `52…` | El bot lo convierte solo (`META_MX_QUITAR_1=true`) |

Lo que ya hace con Meta: verifica la firma `X-Hub-Signature-256` de cada mensaje, marca como leído y muestra "escribiendo…", entiende texto, ubicación, respuestas a botones y listas, y avisa cuando llega audio o sticker. El estado de ambos canales se ve en `GET /health`.

## Correr sin Docker (opcional, requiere Node 20+)

```bash
cd simulator && npm install && WEBHOOK_URL=http://localhost:3001/webhook npm start
# en otra terminal
cd bot && npm install && EVOLUTION_URL=http://localhost:8080 npm start
```
Abre http://localhost:8080. En Windows PowerShell define las variables con `$env:WEBHOOK_URL="..."` antes de `npm start`.
