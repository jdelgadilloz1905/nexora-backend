# Plan de Acción: Sistema de Conversación Única con Histórico

## Visión General

Transformar Nexora de "múltiples conversaciones" a **una conversación continua por usuario** con sistema de archivado inteligente, similar a historias clínicas en hospitales.

---

## Arquitectura Propuesta

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            CONVERSACIÓN ACTIVA (messages)                │   │
│  │  • Últimos 30 días de mensajes                          │   │
│  │  • Máximo 100 mensajes                                   │   │
│  │  • Se envía a Gemini como contexto                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼ (Archivado automático)           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         HISTÓRICO (conversation_history)                 │   │
│  │  • Mensajes archivados por período                      │   │
│  │  • Resumen generado por IA                              │   │
│  │  • Búsqueda por palabras clave                          │   │
│  │  • Información importante → Memory                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              MEMORIA (user_memories)                     │   │
│  │  • Información crítica extraída                         │   │
│  │  • Contactos, proyectos, preferencias                   │   │
│  │  • Siempre disponible para la IA                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Modelo de Datos

### 1. Tabla: `conversation_history` (NUEVA)

```sql
CREATE TABLE conversation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),

  -- Período archivado
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,

  -- Contenido
  messages_json JSONB NOT NULL,        -- Mensajes completos del período
  message_count INTEGER NOT NULL,

  -- Resumen generado por IA
  summary TEXT,                         -- Resumen del período
  topics TEXT[],                        -- Temas principales ["presupuesto", "cliente X", "proyecto Y"]
  entities JSONB,                       -- Entidades mencionadas {contacts: [], projects: [], amounts: []}

  -- Metadatos
  archived_at TIMESTAMP DEFAULT NOW(),

  -- Índices para búsqueda
  search_vector TSVECTOR                -- Full-text search
);

-- Índices
CREATE INDEX idx_history_user ON conversation_history(user_id);
CREATE INDEX idx_history_period ON conversation_history(period_start, period_end);
CREATE INDEX idx_history_search ON conversation_history USING GIN(search_vector);
CREATE INDEX idx_history_topics ON conversation_history USING GIN(topics);
```

### 2. Modificar tabla `conversations`

```sql
-- Agregar campo para marcar conversación principal
ALTER TABLE conversations ADD COLUMN is_primary BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN last_archived_at TIMESTAMP;

-- Cada usuario tiene UNA conversación principal
CREATE UNIQUE INDEX idx_primary_conversation ON conversations(user_id) WHERE is_primary = true;
```

### 3. Modificar tabla `messages`

```sql
-- Agregar campo para saber si ya fue archivado
ALTER TABLE messages ADD COLUMN archived BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN archived_at TIMESTAMP;
```

---

## Fases de Implementación

### FASE 1: Conversación Única (1-2 días)
**Objetivo**: Un usuario = Una conversación

- [ ] Modificar `agent.service.ts`:
  - Al iniciar chat, buscar conversación existente o crear una
  - Eliminar creación de nuevas conversaciones
  - Marcar conversación como `is_primary = true`

- [ ] Modificar frontend:
  - Eliminar botón "Nueva conversación"
  - Siempre mostrar la conversación principal
  - Ocultar lista de conversaciones (o mostrar solo la principal)

**Cambios mínimos, impacto inmediato.**

---

### FASE 2: Límite de Contexto (1 día)
**Objetivo**: Gemini solo recibe últimos N mensajes

- [ ] Modificar `buildMessageHistory()`:
  ```typescript
  // Antes: Últimos 20 mensajes
  // Después: Últimos 50 mensajes O últimos 7 días (lo que sea menor)
  ```

- [ ] Agregar lógica de ventana deslizante:
  ```typescript
  const MAX_MESSAGES = 50;
  const MAX_DAYS = 7;

  // Obtener mensajes dentro de la ventana
  const messages = await this.messageRepository.find({
    where: {
      conversationId,
      archived: false,
      createdAt: MoreThan(subDays(new Date(), MAX_DAYS)),
    },
    order: { createdAt: 'DESC' },
    take: MAX_MESSAGES,
  });
  ```

**Esto soluciona el problema de Gemini ahogándose.**

---

### FASE 3: Sistema de Archivado (2-3 días)
**Objetivo**: Archivar mensajes antiguos automáticamente

#### 3.1 Crear entidad `ConversationHistory`

```typescript
// src/modules/agent/entities/conversation-history.entity.ts
@Entity('conversation_history')
export class ConversationHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('timestamp')
  periodStart: Date;

  @Column('timestamp')
  periodEnd: Date;

  @Column('jsonb')
  messagesJson: Array<{role: string; content: string; createdAt: Date}>;

  @Column('int')
  messageCount: number;

  @Column('text', { nullable: true })
  summary: string;

  @Column('text', { array: true, nullable: true })
  topics: string[];

  @Column('jsonb', { nullable: true })
  entities: {
    contacts: string[];
    projects: string[];
    amounts: string[];
    dates: string[];
  };

  @CreateDateColumn()
  archivedAt: Date;
}
```

#### 3.2 Crear servicio de archivado

```typescript
// src/modules/agent/services/archive.service.ts
@Injectable()
export class ArchiveService {

  // Archivar mensajes antiguos de un usuario
  async archiveOldMessages(userId: string): Promise<void> {
    const ARCHIVE_AFTER_DAYS = 30;

    // 1. Obtener mensajes antiguos no archivados
    const oldMessages = await this.getOldMessages(userId, ARCHIVE_AFTER_DAYS);

    if (oldMessages.length < 10) return; // No archivar si hay pocos

    // 2. Generar resumen con IA
    const summary = await this.generateSummary(oldMessages);

    // 3. Extraer temas y entidades
    const { topics, entities } = await this.extractMetadata(oldMessages);

    // 4. Extraer información importante → Memory
    await this.extractToMemory(userId, oldMessages);

    // 5. Guardar en histórico
    await this.saveToHistory(userId, oldMessages, summary, topics, entities);

    // 6. Marcar mensajes como archivados
    await this.markAsArchived(oldMessages);
  }

  // Generar resumen del período
  private async generateSummary(messages: Message[]): Promise<string> {
    // Usar Gemini para generar resumen
    const prompt = `Resume esta conversación en 2-3 párrafos,
    destacando: temas principales, decisiones tomadas,
    pendientes mencionados, y personas/empresas relevantes.`;

    return await this.aiProvider.summarize(messages, prompt);
  }
}
```

#### 3.3 Crear job programado (CRON)

```typescript
// src/modules/agent/jobs/archive.job.ts
@Injectable()
export class ArchiveJob {
  @Cron('0 3 * * *') // Todos los días a las 3 AM
  async archiveAllUsers() {
    const users = await this.userRepository.find();

    for (const user of users) {
      await this.archiveService.archiveOldMessages(user.id);
    }
  }
}
```

---

### FASE 4: Búsqueda en Histórico (2 días)
**Objetivo**: La IA puede buscar en conversaciones archivadas

#### 4.1 Agregar tool `search_history`

```typescript
{
  name: 'search_history',
  description: 'Busca en el histórico de conversaciones del usuario. Útil cuando el usuario pregunta por algo que pasó hace tiempo (presupuestos, acuerdos, conversaciones antiguas).',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Términos de búsqueda (ej: "presupuesto cliente ABC", "reunión marzo")',
      },
      dateFrom: {
        type: 'string',
        description: 'Fecha desde (YYYY-MM-DD)',
      },
      dateTo: {
        type: 'string',
        description: 'Fecha hasta (YYYY-MM-DD)',
      },
    },
    required: ['query'],
  },
}
```

#### 4.2 Implementar búsqueda

```typescript
case 'search_history': {
  const query = toolInput.query as string;
  const results = await this.historyService.search(userId, query, {
    dateFrom: toolInput.dateFrom,
    dateTo: toolInput.dateTo,
  });

  if (results.length === 0) {
    return JSON.stringify({
      found: false,
      message: 'No encontré nada relacionado en tu historial.',
    });
  }

  return JSON.stringify({
    found: true,
    results: results.map(r => ({
      period: `${r.periodStart} - ${r.periodEnd}`,
      summary: r.summary,
      relevantMessages: r.relevantSnippets,
    })),
  });
}
```

#### 4.3 Actualizar system prompt

```
### Histórico de Conversaciones
- search_history: Buscar en conversaciones archivadas

### Cuándo usar search_history:
- "¿Qué hablamos del presupuesto hace 2 meses?" → search_history
- "El cliente que mencioné en enero" → search_history
- "¿Cuándo fue la última vez que hablamos de X?" → search_history
- Usuario menciona algo que NO está en el contexto actual → search_history
```

---

### FASE 5: Extracción Inteligente a Memory (1 día)
**Objetivo**: Al archivar, extraer información importante a Memory

```typescript
private async extractToMemory(userId: string, messages: Message[]): Promise<void> {
  const prompt = `Analiza esta conversación y extrae información importante:

  1. CONTACTOS mencionados (nombre, empresa, email, rol)
  2. PROYECTOS o NEGOCIOS discutidos
  3. DECISIONES tomadas
  4. PREFERENCIAS del usuario
  5. MONTOS o PRESUPUESTOS mencionados
  6. FECHAS IMPORTANTES (deadlines, reuniones)

  Formato JSON:
  {
    "contacts": [...],
    "projects": [...],
    "decisions": [...],
    "preferences": [...],
    "amounts": [...],
    "dates": [...]
  }`;

  const extracted = await this.aiProvider.extract(messages, prompt);

  // Guardar cada item extraído en Memory
  for (const contact of extracted.contacts) {
    await this.memoryService.remember(userId, {
      type: 'contact',
      content: `${contact.name} - ${contact.company}`,
      metadata: contact,
    });
  }
  // ... similar para otros tipos
}
```

---

## Cronograma Sugerido

| Fase | Descripción | Duración | Dependencias |
|------|-------------|----------|--------------|
| 1 | Conversación Única | 1-2 días | Ninguna |
| 2 | Límite de Contexto | 1 día | Fase 1 |
| 3 | Sistema de Archivado | 2-3 días | Fase 2 |
| 4 | Búsqueda en Histórico | 2 días | Fase 3 |
| 5 | Extracción a Memory | 1 día | Fase 3, 4 |

**Total estimado: 7-9 días de desarrollo**

---

## Casos de Uso Ejemplo

### Caso 1: Usuario retoma tema de hace 2 meses
```
Usuario: "¿Te acuerdas del presupuesto que le mandé a TechCorp?"

Nexora: [usa search_history con query="presupuesto TechCorp"]
→ "Sí, el 15 de noviembre enviaste un presupuesto de $5,000 a TechCorp
   para el proyecto de migración. María García lo recibió y quedaron
   en responder después de año nuevo. ¿Quieres que le envíe un seguimiento?"
```

### Caso 2: Búsqueda de contexto antiguo
```
Usuario: "¿Cuándo fue la última vez que hablamos de mi aumento de sueldo?"

Nexora: [usa search_history con query="aumento sueldo"]
→ "La última vez que hablamos de tu aumento fue el 5 de diciembre.
   Mencionaste que tenías una reunión programada para enero.
   De hecho, veo que tienes 'Reunión Aumento de Sueldo' hoy a las 4pm."
```

### Caso 3: Información extraída en Memory
```
Usuario: "¿Cuál era el email del contacto de Microsoft?"

Nexora: [usa recall con query="Microsoft contacto"]
→ "Juan Pérez de Microsoft: juan.perez@microsoft.com.
   Lo mencionaste en una conversación de hace 3 meses cuando
   estabas negociando la licencia de Office."
```

---

## Beneficios Finales

1. **Para el usuario**:
   - Una sola conversación continua (como WhatsApp)
   - Nunca pierde información
   - Puede preguntar por cosas antiguas

2. **Para Gemini**:
   - Contexto limitado y manejable
   - No se ahoga con historial largo
   - Respuestas más rápidas

3. **Para el sistema**:
   - Base de datos optimizada
   - Búsqueda eficiente
   - Escalable a miles de usuarios

---

## Próximo Paso

**¿Comenzamos con FASE 1 (Conversación Única)?**

Es el cambio más simple y resuelve el problema inmediato de crear nuevas conversaciones constantemente.

---

**Fecha**: 2026-01-16
**Autor**: Claude + Usuario
