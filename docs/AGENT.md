# Nexora Agent - Documentación Técnica

## Descripción General

Nexora Agent es el núcleo de inteligencia artificial de la aplicación. Funciona como un **Chief of Staff Digital** que ayuda a los usuarios a gestionar sus tareas, y próximamente calendario, correos y reuniones.

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│                    ChatPage.tsx / chat.ts                    │
└─────────────────────────┬───────────────────────────────────┘
                          │ POST /agent/chat
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   AgentController                            │
│              (agent.controller.ts)                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    AgentService                              │
│               (agent.service.ts)                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              SYSTEM_PROMPT                           │    │
│  │  - Identidad y personalidad                          │    │
│  │  - Sistema de prioridades                            │    │
│  │  - Reglas de conversación                            │    │
│  │  - Ejemplos de respuestas                            │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 AIProviderFactory                            │
│            (ai-provider.factory.ts)                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │  Claude   │  │  Gemini   │  │  OpenAI   │               │
│  │ Provider  │  │ Provider  │  │ Provider  │               │
│  └───────────┘  └───────────┘  └───────────┘               │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tool Execution                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ get_tasks │  │create_task│  │ complete  │               │
│  │           │  │           │  │   _task   │               │
│  └───────────┘  └───────────┘  └───────────┘               │
│  ┌───────────┐                                              │
│  │   get_    │  + Próximamente: calendar, email, meetings   │
│  │ briefing  │                                              │
│  └───────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

## Estructura de Archivos

```
nexora-backend/src/modules/agent/
├── agent.module.ts          # Módulo NestJS
├── agent.controller.ts      # Endpoints REST
├── agent.service.ts         # Lógica principal + SYSTEM_PROMPT
├── dto/
│   └── agent.dto.ts         # DTOs para request/response
├── entities/
│   ├── conversation.entity.ts  # Entidad de conversación
│   └── message.entity.ts       # Entidad de mensaje
└── providers/
    ├── index.ts                    # Exportaciones
    ├── ai-provider.interface.ts    # Interfaz común
    ├── ai-provider.factory.ts      # Factory pattern
    ├── claude.provider.ts          # Proveedor Anthropic
    ├── gemini.provider.ts          # Proveedor Google
    └── openai.provider.ts          # Proveedor OpenAI
```

## Sistema de Proveedores IA

### Interfaz Común

Todos los proveedores implementan la interfaz `IAIProvider`:

```typescript
interface IAIProvider {
  readonly name: AIProvider;
  chat(messages: AIMessage[], systemPrompt: string, tools?: AITool[]): Promise<AIResponse>;
  continueWithToolResults(...): Promise<AIResponse>;
  isConfigured(): boolean;
}
```

### Proveedores Disponibles

| Proveedor | SDK | Variables de Entorno |
|-----------|-----|---------------------|
| Claude | @anthropic-ai/sdk | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Gemini | @google/generative-ai | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| OpenAI | openai | `OPENAI_API_KEY`, `OPENAI_MODEL` |

### Configuración

```env
# Proveedor principal
AI_PROVIDER=gemini

# Orden de fallback (si el principal falla)
AI_PROVIDER_FALLBACK=gemini,claude,openai

# Gemini (actual)
GEMINI_API_KEY=tu_api_key
GEMINI_MODEL=gemini-2.0-flash

# Claude (opcional)
ANTHROPIC_API_KEY=tu_api_key
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# OpenAI (opcional)
OPENAI_API_KEY=tu_api_key
OPENAI_MODEL=gpt-4o
```

### Factory Pattern

El `AIProviderFactory` selecciona automáticamente el proveedor:

1. Intenta usar el proveedor configurado en `AI_PROVIDER`
2. Si no está disponible, prueba en orden de `AI_PROVIDER_FALLBACK`
3. Si ninguno está disponible, el servicio usa `fallbackResponse()`

## System Prompt

El prompt define la personalidad y comportamiento de Nexora. Está estructurado en secciones:

### Estructura del Prompt

| Sección | Propósito |
|---------|-----------|
| **IDENTIDAD** | Nombre, rol, idioma |
| **PERSONALIDAD** | Tono, estilo de comunicación |
| **FILOSOFÍA CORE** | Principio guía del asistente |
| **SISTEMA DE PRIORIDADES** | HIGH, MEDIUM, LOW, NOISE |
| **CAPACIDADES** | Qué puede hacer (actual y próximamente) |
| **HERRAMIENTAS** | Tools disponibles para el modelo |
| **BRIEFING** | Formato del resumen diario |
| **REGLAS DE CONVERSACIÓN** | Cómo debe responder |
| **DETECCIÓN DE INTENCIÓN** | Mapeo de frases a acciones |
| **EJEMPLOS** | Conversaciones modelo |
| **ESTILO** | Qué hacer y qué NO hacer |

### Sistema de Prioridades

```
🔴 HIGH (1 día)    - Urgente, impacto directo en el negocio
🟡 MEDIUM (2 días) - Importante, debe hacerse pronto
🟢 LOW (5 días)    - Puede esperar, bajo impacto
🟣 NOISE (—)       - Sin clasificar, requiere decisión DO SOMETHING / DO NOTHING
```

## Herramientas (Tools)

### Herramientas Actuales

#### get_tasks
Obtiene las tareas del usuario con filtros opcionales.

```typescript
{
  name: 'get_tasks',
  parameters: {
    priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NOISE',  // opcional
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' // opcional
  }
}
```

#### create_task
Crea una nueva tarea.

```typescript
{
  name: 'create_task',
  parameters: {
    title: string,        // requerido
    description: string,  // opcional
    priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'NOISE',  // opcional, default MEDIUM
    dueDate: string       // opcional, formato ISO YYYY-MM-DD
  }
}
```

#### complete_task
Marca una tarea como completada.

```typescript
{
  name: 'complete_task',
  parameters: {
    taskId: string  // requerido
  }
}
```

#### get_briefing
Obtiene el resumen del día organizado por prioridad.

```typescript
{
  name: 'get_briefing',
  parameters: {}  // sin parámetros
}
```

### Agregar Nuevas Herramientas

1. **Definir la herramienta** en `getTools()`:

```typescript
{
  name: 'nueva_herramienta',
  description: 'Descripción para el modelo IA',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: '...' },
    },
    required: ['param1'],
  },
}
```

2. **Implementar la ejecución** en `executeTool()`:

```typescript
case 'nueva_herramienta': {
  // Lógica de la herramienta
  return JSON.stringify({ resultado: '...' });
}
```

3. **Actualizar el SYSTEM_PROMPT** para que el modelo sepa cuándo usarla.

## Flujo de una Conversación

```
1. Usuario envía mensaje
   POST /agent/chat { message: "...", conversationId?: "..." }

2. AgentService recibe el mensaje
   - Obtiene o crea conversación
   - Guarda mensaje del usuario en BD

3. Selección de proveedor IA
   - AIProviderFactory.getAvailableProvider()
   - Si no hay proveedor → fallbackResponse()

4. Llamada al modelo IA
   - provider.chat(messages, SYSTEM_PROMPT, tools)

5. Tool Use Loop (si aplica)
   - Si stopReason === 'tool_use':
     - Ejecutar herramientas solicitadas
     - Continuar con provider.continueWithToolResults()
     - Repetir hasta que no haya más tool calls

6. Guardar respuesta
   - Guarda mensaje del asistente en BD
   - Actualiza título de conversación si es primera vez

7. Retornar respuesta
   {
     message: "...",
     conversationId: "...",
     suggestions: ["...", "..."]
   }
```

## Endpoints REST

### POST /agent/chat
Envía un mensaje al agente.

**Request:**
```json
{
  "message": "¿Qué tengo pendiente hoy?",
  "conversationId": "uuid-opcional"
}
```

**Response:**
```json
{
  "message": "Buenos días. Tu día:\n\n🔴 HIGH:\n- Tarea 1\n...",
  "conversationId": "uuid",
  "suggestions": ["Ver tareas urgentes", "Crear una tarea"]
}
```

### GET /agent/conversations
Lista las conversaciones del usuario.

### GET /agent/conversations/:id
Obtiene una conversación con sus mensajes.

### DELETE /agent/conversations/:id
Elimina una conversación.

### GET /agent/providers/status
Estado de los proveedores IA (para debugging).

## Fallback Response

Cuando no hay proveedor IA disponible, el sistema usa respuestas predefinidas basadas en detección de intención:

| Intención Detectada | Respuesta |
|--------------------|-----------|
| Ver tareas | Muestra briefing del día |
| Crear tarea | Pide título y prioridad |
| Saludo | Saludo según hora del día |
| Default | Presentación de Nexora |

## Próximas Integraciones

### Calendario (calendar.service.ts)
```typescript
// Herramientas a agregar:
- get_calendar: Ver eventos
- create_event: Crear evento
- update_event: Modificar evento
- delete_event: Cancelar evento
- check_availability: Verificar disponibilidad
```

### Correo (communications.service.ts)
```typescript
// Herramientas a agregar:
- get_emails: Obtener correos
- get_email_detail: Ver contenido
- send_email: Enviar correo
- draft_email: Crear borrador
- mark_email: Marcar como leído/importante
```

### Reuniones
```typescript
// Herramientas a agregar:
- schedule_meeting: Agendar reunión
- get_meetings: Ver reuniones
- reschedule_meeting: Reprogramar
- cancel_meeting: Cancelar
```

## Configuración de Desarrollo

### Reiniciar para aplicar cambios en el prompt:
```bash
cd nexora-backend
npm run start:dev
```

### Verificar estado de proveedores:
```bash
curl http://localhost:3000/agent/providers/status \
  -H "Authorization: Bearer <token>"
```

### Logs útiles:
```
[AgentService] Using AI provider: gemini
[AgentService] Executing tool: get_tasks with input: {...}
```

## Mejores Prácticas

1. **Prompt Engineering**
   - Mantener ejemplos actualizados
   - Ser específico en las reglas
   - Incluir "NO hacer" para evitar comportamientos no deseados

2. **Tool Design**
   - Descripciones claras para el modelo
   - Parámetros bien tipados
   - Respuestas JSON estructuradas

3. **Error Handling**
   - Siempre tener fallback
   - Logs descriptivos
   - Mensajes de error amigables para el usuario

4. **Testing**
   - Probar con diferentes proveedores
   - Verificar tool use loop
   - Validar respuestas del fallback
