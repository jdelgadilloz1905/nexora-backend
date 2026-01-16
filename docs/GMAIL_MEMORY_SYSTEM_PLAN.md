# Plan: Gmail Integration + Memory System

## Resumen Ejecutivo

Este documento detalla la implementación de dos funcionalidades críticas para Nexora:
1. **Gmail Integration**: Lectura, envío y gestión inteligente de correos
2. **Memory System**: Sistema de memoria persistente para contexto y personalización

---

## Parte 1: Gmail Integration

### 1.1 Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Service                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ get_emails  │  │ send_email  │  │ search_emails       │ │
│  │ read_email  │  │ reply_email │  │ get_email_threads   │ │
│  │ archive     │  │ draft_email │  │ get_unread_count    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   GoogleGmailService                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ - getEmails(userId, query, maxResults)               │  │
│  │ - getEmail(userId, emailId)                          │  │
│  │ - sendEmail(userId, to, subject, body, cc?, bcc?)    │  │
│  │ - replyToEmail(userId, threadId, body)               │  │
│  │ - createDraft(userId, to, subject, body)             │  │
│  │ - archiveEmail(userId, emailId)                      │  │
│  │ - markAsRead(userId, emailId)                        │  │
│  │ - getThreads(userId, threadId)                       │  │
│  │ - searchEmails(userId, query)                        │  │
│  │ - getLabels(userId)                                  │  │
│  │ - addLabel(userId, emailId, labelId)                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Tools a Implementar

#### Tool: `get_emails`
```typescript
{
  name: 'get_emails',
  description: 'Obtiene los correos del usuario. Por defecto muestra los más recientes de la bandeja de entrada.',
  parameters: {
    type: 'object',
    properties: {
      folder: {
        type: 'string',
        enum: ['inbox', 'sent', 'drafts', 'starred', 'important', 'all'],
        description: 'Carpeta de correos (default: inbox)'
      },
      maxResults: {
        type: 'number',
        description: 'Número máximo de correos a obtener (default: 10, max: 50)'
      },
      unreadOnly: {
        type: 'boolean',
        description: 'Solo mostrar correos no leídos'
      },
      from: {
        type: 'string',
        description: 'Filtrar por remitente (email o nombre)'
      },
      subject: {
        type: 'string',
        description: 'Filtrar por asunto (búsqueda parcial)'
      },
      after: {
        type: 'string',
        description: 'Correos después de esta fecha (YYYY-MM-DD)'
      },
      before: {
        type: 'string',
        description: 'Correos antes de esta fecha (YYYY-MM-DD)'
      }
    },
    required: []
  }
}
```

#### Tool: `read_email`
```typescript
{
  name: 'read_email',
  description: 'Lee el contenido completo de un correo específico, incluyendo adjuntos.',
  parameters: {
    type: 'object',
    properties: {
      emailId: {
        type: 'string',
        description: 'ID del correo a leer'
      },
      searchSubject: {
        type: 'string',
        description: 'Asunto o parte del asunto para buscar el correo'
      },
      searchFrom: {
        type: 'string',
        description: 'Remitente para buscar el correo'
      }
    },
    required: []
  }
}
```

#### Tool: `send_email`
```typescript
{
  name: 'send_email',
  description: 'Envía un correo electrónico. Nexora puede redactar el contenido basándose en instrucciones del usuario.',
  parameters: {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Destinatario(s) separados por coma'
      },
      subject: {
        type: 'string',
        description: 'Asunto del correo'
      },
      body: {
        type: 'string',
        description: 'Cuerpo del correo (puede incluir HTML básico)'
      },
      cc: {
        type: 'string',
        description: 'Copia a (opcional)'
      },
      bcc: {
        type: 'string',
        description: 'Copia oculta (opcional)'
      },
      isHtml: {
        type: 'boolean',
        description: 'Si el cuerpo es HTML (default: false)'
      }
    },
    required: ['to', 'subject', 'body']
  }
}
```

#### Tool: `reply_email`
```typescript
{
  name: 'reply_email',
  description: 'Responde a un correo existente manteniendo el hilo de conversación.',
  parameters: {
    type: 'object',
    properties: {
      emailId: {
        type: 'string',
        description: 'ID del correo a responder (opcional si se usa búsqueda)'
      },
      searchSubject: {
        type: 'string',
        description: 'Buscar correo por asunto para responder'
      },
      body: {
        type: 'string',
        description: 'Contenido de la respuesta'
      },
      replyAll: {
        type: 'boolean',
        description: 'Responder a todos (default: false)'
      }
    },
    required: ['body']
  }
}
```

#### Tool: `search_emails`
```typescript
{
  name: 'search_emails',
  description: 'Busca correos usando consultas avanzadas de Gmail.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Consulta de búsqueda (soporta operadores de Gmail: from:, to:, subject:, has:attachment, etc.)'
      },
      maxResults: {
        type: 'number',
        description: 'Número máximo de resultados (default: 20)'
      }
    },
    required: ['query']
  }
}
```

#### Tool: `archive_email`
```typescript
{
  name: 'archive_email',
  description: 'Archiva uno o más correos (los quita de la bandeja de entrada).',
  parameters: {
    type: 'object',
    properties: {
      emailId: {
        type: 'string',
        description: 'ID del correo a archivar'
      },
      searchSubject: {
        type: 'string',
        description: 'Archivar correos que coincidan con este asunto'
      }
    },
    required: []
  }
}
```

### 1.3 Interfaces de Datos

```typescript
// Email summary for listing
interface EmailSummary {
  id: string;
  threadId: string;
  from: {
    name: string;
    email: string;
  };
  to: string[];
  subject: string;
  snippet: string;        // Preview del contenido
  date: Date;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  labels: string[];
}

// Full email content
interface EmailFull extends EmailSummary {
  body: {
    text: string;         // Plain text version
    html?: string;        // HTML version if available
  };
  cc?: string[];
  bcc?: string[];
  attachments?: {
    filename: string;
    mimeType: string;
    size: number;
  }[];
  replyTo?: string;
  inReplyTo?: string;     // Message ID this is replying to
}

// Email thread
interface EmailThread {
  id: string;
  subject: string;
  messages: EmailFull[];
  participantCount: number;
  lastMessageDate: Date;
}
```

### 1.4 Smart Email Features

#### Auto-categorización
Nexora categoriza automáticamente los correos:
- **URGENTE**: Correos de contactos importantes con palabras clave urgentes
- **ACCIÓN REQUERIDA**: Correos que solicitan respuesta o acción
- **INFORMATIVO**: Newsletters, notificaciones automáticas
- **PERSONAL**: Correos de contactos conocidos sin urgencia

#### Smart Reply Suggestions
Basado en el contexto del correo, Nexora sugiere respuestas:
```typescript
interface SmartReplySuggestion {
  type: 'confirm' | 'decline' | 'acknowledge' | 'question' | 'custom';
  preview: string;      // "Confirmo asistencia a la reunión"
  fullResponse: string; // Respuesta completa sugerida
}
```

---

## Parte 2: Memory System

### 2.1 Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent Service                          │
│                           │                                 │
│            ┌──────────────┼──────────────┐                 │
│            ▼              ▼              ▼                 │
│     ┌──────────┐   ┌──────────┐   ┌──────────────┐        │
│     │ Remember │   │ Recall   │   │ Auto-Memory  │        │
│     │ (save)   │   │ (query)  │   │ (background) │        │
│     └──────────┘   └──────────┘   └──────────────┘        │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     MemoryService                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ - saveMemory(userId, type, content, metadata)        │  │
│  │ - getMemories(userId, type?, query?)                 │  │
│  │ - searchMemories(userId, query)                      │  │
│  │ - updateMemory(userId, memoryId, content)            │  │
│  │ - deleteMemory(userId, memoryId)                     │  │
│  │ - getRelevantMemories(userId, context)               │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Database (PostgreSQL)                    │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   user_memories                       │  │
│  │  - id: UUID                                          │  │
│  │  - userId: UUID (FK)                                 │  │
│  │  - type: MemoryType                                  │  │
│  │  - content: TEXT                                     │  │
│  │  - metadata: JSONB                                   │  │
│  │  - embedding: VECTOR(1536) [futuro]                  │  │
│  │  - importance: INTEGER (1-10)                        │  │
│  │  - lastAccessed: TIMESTAMP                           │  │
│  │  - accessCount: INTEGER                              │  │
│  │  - createdAt: TIMESTAMP                              │  │
│  │  - updatedAt: TIMESTAMP                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Tipos de Memoria

```typescript
enum MemoryType {
  // Preferencias del usuario
  PREFERENCE = 'preference',        // "Prefiere reuniones por la mañana"

  // Información de contactos
  CONTACT = 'contact',              // "Juan Pérez - CEO de ClienteX - último contacto hace 2 semanas"

  // Patrones de comportamiento
  PATTERN = 'pattern',              // "Siempre revisa emails a las 9am"

  // Contexto de proyectos/trabajo
  PROJECT = 'project',              // "Proyecto Alpha - deadline 15 marzo - equipo: Ana, Luis"

  // Información personal relevante
  PERSONAL = 'personal',            // "Cumpleaños: 15 de marzo"

  // Instrucciones específicas del usuario
  INSTRUCTION = 'instruction',      // "Cuando escriba a clientes, usar tono formal"

  // Relaciones entre entidades
  RELATIONSHIP = 'relationship',    // "María es la asistente de Carlos"

  // Historial de decisiones
  DECISION = 'decision',            // "Rechazó propuesta de VendorX por precio"
}
```

### 2.3 Entity: UserMemory

```typescript
// src/modules/memory/entities/user-memory.entity.ts

@Entity('user_memories')
export class UserMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: MemoryType,
  })
  type: MemoryType;

  @Column('text')
  content: string;

  @Column('jsonb', { nullable: true })
  metadata: {
    // Para CONTACT
    email?: string;
    company?: string;
    role?: string;
    lastInteraction?: Date;

    // Para PROJECT
    projectName?: string;
    deadline?: Date;
    status?: string;

    // Para PREFERENCE
    category?: string;    // "meetings", "communication", "schedule"

    // Para cualquier tipo
    source?: string;      // "explicit" | "inferred" | "conversation"
    confidence?: number;  // 0-1 para memorias inferidas
    tags?: string[];
    relatedMemories?: string[];  // IDs de memorias relacionadas
  };

  @Column('int', { default: 5 })
  importance: number;  // 1-10

  @Column('timestamp', { nullable: true })
  lastAccessed: Date;

  @Column('int', { default: 0 })
  accessCount: number;

  @Column('timestamp', { nullable: true })
  expiresAt: Date;  // Para memorias temporales

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 2.4 Tools de Memoria

#### Tool: `remember`
```typescript
{
  name: 'remember',
  description: 'Guarda información importante sobre el usuario para recordar en el futuro. Usa esto cuando el usuario comparta preferencias, información de contactos, proyectos, o cualquier dato relevante.',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['preference', 'contact', 'project', 'personal', 'instruction', 'relationship'],
        description: 'Tipo de información a recordar'
      },
      content: {
        type: 'string',
        description: 'La información a recordar (en lenguaje natural)'
      },
      importance: {
        type: 'number',
        description: 'Importancia del 1-10 (default: 5)'
      },
      metadata: {
        type: 'object',
        description: 'Metadatos adicionales (email, empresa, fecha, etc.)'
      }
    },
    required: ['type', 'content']
  }
}
```

#### Tool: `recall`
```typescript
{
  name: 'recall',
  description: 'Busca en la memoria información relevante sobre un tema, persona o proyecto.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Qué buscar en la memoria'
      },
      type: {
        type: 'string',
        enum: ['preference', 'contact', 'project', 'personal', 'instruction', 'relationship', 'all'],
        description: 'Filtrar por tipo de memoria (default: all)'
      }
    },
    required: ['query']
  }
}
```

#### Tool: `forget`
```typescript
{
  name: 'forget',
  description: 'Elimina una memoria específica cuando el usuario lo solicite.',
  parameters: {
    type: 'object',
    properties: {
      memoryId: {
        type: 'string',
        description: 'ID de la memoria a eliminar'
      },
      query: {
        type: 'string',
        description: 'Descripción de qué olvidar (busca y elimina)'
      }
    },
    required: []
  }
}
```

### 2.5 Auto-Memory System

El sistema automáticamente extrae y guarda memorias de las conversaciones:

```typescript
// Después de cada conversación, analizar y extraer memorias
async extractMemoriesFromConversation(
  userId: string,
  messages: Message[],
): Promise<void> {
  // Usar el LLM para identificar información memorable
  const extractionPrompt = `
    Analiza esta conversación y extrae información importante para recordar sobre el usuario.

    Tipos de información a buscar:
    - Preferencias expresadas ("prefiero", "me gusta", "no me gusta")
    - Información de contactos mencionados (nombres, roles, empresas)
    - Proyectos o tareas importantes con fechas
    - Instrucciones específicas sobre cómo hacer las cosas
    - Relaciones entre personas

    Responde en JSON con formato:
    {
      "memories": [
        {
          "type": "preference|contact|project|instruction|relationship",
          "content": "Descripción en lenguaje natural",
          "importance": 1-10,
          "metadata": {}
        }
      ]
    }

    Si no hay información memorable, responde: {"memories": []}
  `;

  // Procesar y guardar memorias extraídas
}
```

### 2.6 Memory Injection en System Prompt

```typescript
function getSystemPromptWithMemory(userId: string): string {
  const basePrompt = getSystemPrompt();
  const memories = await memoryService.getRelevantMemories(userId, context);

  if (memories.length === 0) return basePrompt;

  const memorySection = `
## MEMORIA DEL USUARIO

Lo que sabes sobre este usuario:

${memories.map(m => `- [${m.type}] ${m.content}`).join('\n')}

Usa esta información para personalizar tus respuestas y anticipar necesidades.
`;

  return basePrompt + memorySection;
}
```

---

## Parte 3: Plan de Implementación

### Fase 1: Gmail Core (2-3 días desarrollo)

1. **Actualizar GoogleGmailService**
   - Implementar todos los métodos de lectura/envío
   - Parseo correcto de emails (MIME, HTML, adjuntos)
   - Manejo de threads

2. **Agregar Tools al Agent**
   - `get_emails`
   - `read_email`
   - `send_email`
   - `reply_email`
   - `search_emails`
   - `archive_email`

3. **Testing**
   - Leer bandeja de entrada
   - Enviar correo de prueba
   - Responder a un correo
   - Buscar correos

### Fase 2: Memory Core (2-3 días desarrollo)

1. **Crear MemoryModule**
   - Entity `UserMemory`
   - `MemoryService` con CRUD
   - Migración de base de datos

2. **Agregar Tools al Agent**
   - `remember`
   - `recall`
   - `forget`

3. **Integrar con System Prompt**
   - Inyectar memorias relevantes
   - Límite de contexto (max 10 memorias)

4. **Testing**
   - Guardar preferencia
   - Recordar contacto
   - Buscar en memoria

### Fase 3: Smart Features (2-3 días desarrollo)

1. **Auto-Memory Extraction**
   - Análisis post-conversación
   - Extracción automática de memorias

2. **Email Intelligence**
   - Smart categorization
   - Priorización automática

3. **Memory-Enhanced Responses**
   - Personalización basada en memoria
   - Sugerencias proactivas

---

## Parte 4: Casos de Uso

### Gmail

```
Usuario: "¿Qué correos tengo sin leer?"
Nexora: Tienes 5 correos sin leer:
1. 📧 De: Carlos Ruiz (cliente@empresa.com) - "Propuesta proyecto Q1" - hace 2h
2. 📧 De: María López - "Re: Presupuesto actualizado" - hace 3h
...
¿Quieres que lea alguno en detalle?
```

```
Usuario: "Responde al correo de Carlos que confirmo la reunión del martes"
Nexora: ✓ Respuesta enviada a Carlos Ruiz:

"Hola Carlos,

Confirmo mi asistencia a la reunión del martes.

Saludos,
[Tu nombre]"
```

```
Usuario: "Redacta un correo para el equipo informando del cambio de fecha del proyecto"
Nexora: He preparado este borrador:

Para: equipo@tuempresa.com
Asunto: Cambio de fecha - Proyecto Alpha

---
Estimado equipo,

Les informo que la fecha de entrega del Proyecto Alpha se ha modificado...
---

¿Lo envío o prefieres hacer algún ajuste?
```

### Memory

```
Usuario: "Cuando escriba a clientes, usa siempre un tono formal"
Nexora: ✓ Recordado: Usar tono formal en comunicaciones con clientes.
```

```
Usuario: "Juan García es el CTO de TechCorp, su email es juan@techcorp.com"
Nexora: ✓ Contacto guardado: Juan García - CTO de TechCorp (juan@techcorp.com)
```

```
[Siguiente conversación]
Usuario: "Envía un correo a Juan de TechCorp preguntando por el estado del proyecto"
Nexora: [Usa la memoria para saber quién es Juan y su email]
✓ Correo enviado a Juan García (juan@techcorp.com):
"Estimado Juan, espero que te encuentres bien..."
```

---

## Parte 5: Archivos a Crear/Modificar

### Nuevos Archivos

```
src/modules/memory/
├── memory.module.ts
├── memory.service.ts
├── entities/
│   └── user-memory.entity.ts
└── dto/
    ├── create-memory.dto.ts
    └── search-memory.dto.ts
```

### Archivos a Modificar

```
src/modules/integrations/google-gmail.service.ts  [EXPANDIR]
src/modules/agent/agent.service.ts                [AGREGAR TOOLS]
src/modules/agent/agent.module.ts                 [IMPORT MEMORY]
src/app.module.ts                                 [IMPORT MEMORY]
```

---

## Parte 6: Consideraciones Técnicas

### Seguridad
- Encriptar contenido sensible de memorias
- No guardar passwords o tokens en memorias
- Sanitizar input de usuarios antes de guardar

### Performance
- Índice en `userId` + `type` para búsquedas rápidas
- Limitar memorias por usuario (max 1000)
- Cache de memorias frecuentes

### Privacidad
- Endpoint para exportar todas las memorias
- Endpoint para eliminar todas las memorias
- Memorias no se comparten entre usuarios

---

**Documento creado**: 2026-01-15
**Autor**: Claude + Usuario
**Estado**: ✅ Implementado (Fases 1 y 2 completadas)

---

## Parte 7: Estado de Implementación

### ✅ Completado (2026-01-15)

#### Gmail Integration
- [x] `getEmails` - Obtener correos de bandeja
- [x] `getUnreadEmails` - Correos no leídos
- [x] `getEmailDetail` - Leer contenido completo
- [x] `sendEmail` - Enviar correos nuevos
- [x] `replyToEmail` - Responder con threading correcto
- [x] `searchEmails` - Búsqueda con query Gmail
- [x] `archiveEmail` - Archivar correos
- [x] `markAsRead/Unread` - Marcar leído/no leído
- [x] `getThread` - Obtener hilo completo
- [x] `createDraft` - Crear borradores
- [x] `getUnreadCount` - Contador de no leídos

#### Memory System
- [x] Entity `UserMemory` con 8 tipos de memoria
- [x] `createMemory` - Guardar memorias (con deduplicación)
- [x] `searchMemories` - Búsqueda por keywords (OR)
- [x] `getMemories` - Listar memorias por tipo
- [x] `getRelevantMemories` - Memorias relevantes para contexto
- [x] `deleteMemory` / `deleteMemoryByContent` - Eliminar
- [x] `getMemoryStats` - Estadísticas
- [x] `exportMemories` / `deleteAllMemories` - GDPR compliance
- [x] Integración con System Prompt (inyección de memorias)

#### Agent Tools
- [x] `remember` - Guardar memoria
- [x] `recall` - Buscar en memoria
- [x] `forget` - Eliminar memoria
- [x] `get_memories` - Listar memorias
- [x] `read_email` - Leer correo completo
- [x] `reply_email` - Responder correo
- [x] `archive_email` - Archivar
- [x] `get_unread_count` - Contador no leídos

---

## Parte 8: Próximos Pasos (Diferidos)

### 🔮 Funcionalidades Futuras

Estas funcionalidades están planificadas pero diferidas para desarrollo futuro:

#### 1. Proactividad Inteligente
- **Descripción**: Nexora sugiere acciones sin que el usuario las pida
- **Ejemplos**:
  - "Vi que tienes una reunión con Juan en 30 minutos. ¿Quieres que te prepare un resumen?"
  - "Tienes 3 tareas vencidas de la semana pasada. ¿Las reprogramamos?"
  - "María te envió un correo urgente hace 2 horas. ¿Lo revisamos?"
- **Requisitos técnicos**:
  - Cron job para análisis periódico
  - WebSocket para notificaciones en tiempo real
  - Sistema de priorización de alertas
  - Configuración de preferencias de notificación por usuario

#### 2. Auto-Memory (Extracción Automática)
- **Descripción**: Extraer memorias automáticamente de las conversaciones
- **Implementación sugerida**:
  ```typescript
  async extractMemoriesFromConversation(userId: string, messages: Message[]): Promise<void> {
    const extractionPrompt = `Analiza esta conversación y extrae información memorable...`;
    // Usar LLM para identificar preferencias, contactos, proyectos mencionados
    // Guardar automáticamente con confidence < 1.0
  }
  ```
- **Triggers**:
  - Al finalizar cada conversación
  - Cuando se detectan patrones específicos (nombres, emails, fechas)
- **Configuración**:
  - Toggle para activar/desactivar
  - Nivel de confianza mínimo para auto-guardar

#### 3. Microsoft 365 Integration
- **Descripción**: Integrar Outlook, Teams, OneDrive
- **Componentes**:
  - OAuth 2.0 con Microsoft Graph API
  - `OutlookService` - Correos y calendario
  - `TeamsService` - Chat y reuniones
  - `OneDriveService` - Archivos
- **Consideraciones**:
  - Diferentes scopes de permisos
  - Rate limits de Graph API
  - Soporte para cuentas personales y de trabajo

#### 4. Workflows Automatizados
- **Descripción**: Secuencias de acciones automáticas
- **Ejemplos**:
  - "Cuando reciba un correo de [cliente], crea una tarea y notifícame"
  - "Todos los viernes a las 5pm, envía resumen semanal al equipo"
  - "Si una tarea está vencida por 3 días, enviar recordatorio"
- **Arquitectura**:
  ```
  WorkflowEntity {
    trigger: TriggerType (email, calendar, time, task)
    conditions: Condition[]
    actions: Action[]
    isActive: boolean
  }
  ```
- **Requisitos**:
  - Motor de reglas
  - Cola de trabajos (Bull/BullMQ)
  - UI para crear workflows

#### 5. Búsqueda Semántica con Embeddings
- **Descripción**: Mejorar búsqueda de memorias usando vectores
- **Implementación**:
  - Agregar columna `embedding VECTOR(1536)` a UserMemory
  - Usar OpenAI/Cohere embeddings
  - Búsqueda por similitud coseno con pgvector
- **Beneficios**:
  - Encontrar memorias por significado, no solo keywords
  - "¿Qué sé sobre productividad?" encuentra preferencias de reuniones, estilo de trabajo, etc.

#### 6. Voice Interface
- **Descripción**: Interactuar con Nexora por voz
- **Componentes**:
  - Speech-to-Text (Whisper, Google Speech)
  - Text-to-Speech (ElevenLabs, Google TTS)
  - Wake word detection
- **Integraciones**:
  - Alexa Skill
  - Google Assistant Action
  - App móvil con push-to-talk

---

## Parte 9: Casos de Prueba Gmail

### Validación de Funcionalidades

#### 1. Obtener correos no leídos
```
Prompt: "¿Tengo correos sin leer?"
        "¿Cuántos emails nuevos tengo?"
        "Muéstrame mis correos no leídos"
Esperado: Lista de correos con remitente, asunto, fecha
```

#### 2. Leer correo específico
```
Prompt: "Lee el primer correo"
        "¿De qué trata el correo de [nombre]?"
        "Muéstrame el contenido del email sobre [tema]"
Esperado: Contenido completo del correo seleccionado
```

#### 3. Enviar correo nuevo
```
Prompt: "Envía un correo a test@example.com con asunto 'Prueba' diciendo 'Hola'"
        "Escribe un email a [contacto] diciendo que confirmo la cita"
Esperado: Confirmación de envío con ID del mensaje
Verificar: El correo llega correctamente al destinatario
```

#### 4. Responder a correo
```
Prompt: "Responde al último correo diciendo 'Gracias, lo revisaré'"
        "Responde al correo de [nombre] confirmando asistencia"
Esperado: Respuesta en el mismo hilo (thread)
Verificar: El threading funciona (In-Reply-To header)
```

#### 5. Buscar correos
```
Prompt: "Busca correos de [remitente]"
        "¿Tengo emails sobre [tema]?"
        "Busca correos con 'factura' en el asunto"
Esperado: Lista filtrada de correos que coinciden
```

#### 6. Archivar correo
```
Prompt: "Archiva el correo de [remitente]"
        "Archiva el último email"
Esperado: Correo movido fuera de inbox
Verificar: Ya no aparece en bandeja de entrada
```

#### 7. Integración con Memoria
```
Prompt 1: "Recuerda que el correo de María es maria@empresa.com"
Prompt 2: "Envía un correo a María preguntando por el proyecto"
Esperado: Nexora usa la memoria para encontrar el email y enviar
```

---

**Última actualización**: 2026-01-15
**Siguiente revisión**: Cuando se implemente alguna funcionalidad diferida
