import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessageDto, AgentResponseDto } from './dto/agent.dto';
import { TasksService } from '@/modules/tasks/tasks.service';
import { GoogleCalendarService, CalendarEvent } from '@/modules/integrations/google-calendar.service';
import { GoogleGmailService } from '@/modules/integrations/google-gmail.service';
import { GoogleService } from '@/modules/integrations/google.service';
import { GoogleTasksService } from '@/modules/integrations/google-tasks.service';
import { GoogleContactsService } from '@/modules/integrations/google-contacts.service';
import { GoogleDriveService } from '@/modules/integrations/google-drive.service';
import { MemoryService } from '@/modules/memory/memory.service';
import { MemoryType } from '@/modules/memory/entities/user-memory.entity';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';
import { Priority } from '@/common/constants/priorities';
import { TaskStatus } from '@/common/constants/status';
import {
  AIProviderFactory,
  AITool,
  AIMessage,
  AIResponse,
} from './providers';

// Helper function to format dates in a human-readable format for the AI
function formatDateTimeForAI(date: Date): string {
  return date.toLocaleString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatTimeForAI(date: Date): string {
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// Helper to detect if a calendar event is actually a Google Task
function isGoogleTaskEvent(description?: string): { isTask: boolean; taskUrl?: string } {
  if (!description) return { isTask: false };

  // Google Tasks linked to Calendar have a description that contains a tasks.google.com link
  const taskUrlMatch = description.match(/https:\/\/tasks\.google\.com\/task\/([a-zA-Z0-9_-]+)/);
  if (taskUrlMatch) {
    return { isTask: true, taskUrl: taskUrlMatch[0] };
  }

  return { isTask: false };
}

// Helper to find event by context (title, time, or partial match)
function findEventByContext(
  events: CalendarEvent[],
  searchTitle?: string,
  searchTime?: string,
  eventId?: string,
): { found: CalendarEvent | null; multiple: CalendarEvent[] | null; confidence: 'exact' | 'high' | 'low' | 'none' } {
  if (!events || events.length === 0) {
    return { found: null, multiple: null, confidence: 'none' };
  }

  // 1. Try exact ID match first
  if (eventId) {
    const exactMatch = events.find(e => e.id === eventId);
    if (exactMatch) {
      return { found: exactMatch, multiple: null, confidence: 'exact' };
    }
  }

  // 2. Try title match (case insensitive, partial match)
  if (searchTitle) {
    const titleLower = searchTitle.toLowerCase().trim();
    const titleMatches = events.filter(e =>
      e.title.toLowerCase().includes(titleLower) ||
      titleLower.includes(e.title.toLowerCase())
    );

    if (titleMatches.length === 1) {
      return { found: titleMatches[0], multiple: null, confidence: 'high' };
    }
    if (titleMatches.length > 1) {
      return { found: null, multiple: titleMatches, confidence: 'low' };
    }
  }

  // 3. Try time match (format: "22:00", "10pm", "22", etc.)
  if (searchTime) {
    const timeMatches = events.filter(e => {
      const eventHour = e.start.getHours();
      const eventTime = formatTimeForAI(e.start);

      // Try different time formats
      const searchLower = searchTime.toLowerCase().replace(/\s/g, '');

      // Match "22:00", "22", "10pm", "10 pm", "22h", etc.
      if (eventTime.startsWith(searchLower)) return true;
      if (searchLower === String(eventHour)) return true;
      if (searchLower === `${eventHour}:00`) return true;

      // Handle AM/PM format
      const pmMatch = searchLower.match(/^(\d{1,2})\s*pm$/);
      if (pmMatch) {
        const pmHour = parseInt(pmMatch[1]);
        const expected24 = pmHour === 12 ? 12 : pmHour + 12;
        if (eventHour === expected24) return true;
      }

      const amMatch = searchLower.match(/^(\d{1,2})\s*am$/);
      if (amMatch) {
        const amHour = parseInt(amMatch[1]);
        const expected24 = amHour === 12 ? 0 : amHour;
        if (eventHour === expected24) return true;
      }

      return false;
    });

    if (timeMatches.length === 1) {
      return { found: timeMatches[0], multiple: null, confidence: 'high' };
    }
    if (timeMatches.length > 1) {
      return { found: null, multiple: timeMatches, confidence: 'low' };
    }
  }

  // 4. If only one event exists, high confidence it's the one
  if (events.length === 1) {
    return { found: events[0], multiple: null, confidence: 'high' };
  }

  // 5. Multiple events, no clear match
  return { found: null, multiple: events, confidence: 'low' };
}

// Helper to get local ISO date string (YYYY-MM-DD) without timezone issues
function getLocalISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Function to generate system prompt with current date/time
function getSystemPrompt(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // Use local date, not UTC
  const isoDate = getLocalISODate(now);

  // Calculate tomorrow's date (local)
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = getLocalISODate(tomorrow);

  return `Eres Nexora, el Chief of Staff Digital del usuario. Tu misión es ayudarle a pasar de "estar ocupado" a "ser productivo", enfocándose en lo que realmente hace crecer su negocio.

No eres un simple organizador. Eres un asistente ejecutivo que EJECUTA: envías correos, agendas reuniones, completas tareas y tomas acción real.

## CONTEXTO TEMPORAL (MUY IMPORTANTE)
- Fecha actual: ${dateStr}
- Hora actual: ${timeStr}
- Cuando el usuario diga "hoy", usa la fecha: ${isoDate}
- Cuando el usuario diga "mañana", usa la fecha: ${tomorrowIso}
- NUNCA uses fechas del pasado. El año actual es ${now.getFullYear()}.
- Para crear/modificar eventos, usa siempre el formato ISO: YYYY-MM-DDTHH:mm:ss

## IDENTIDAD
- Nombre: **Nexora** (responde cuando te llamen por tu nombre)
- Rol: Chief of Staff Digital / Asistente ejecutivo de alto nivel
- Idioma: Español (adaptar si el usuario escribe en otro idioma)
- Cuando el usuario diga "Nexora", "Oye Nexora", "Hey Nexora", etc., responde de forma natural reconociendo que te hablan a ti

## PERSONALIDAD
- Profesional pero cercano, como un asistente ejecutivo de confianza
- Eficiente y directo: vas al grano sin rodeos innecesarios
- Proactivo: sugieres por dónde empezar y anticipas necesidades
- Empático: entiendes la carga de trabajo y el estrés del usuario
- Discreto: manejas información sensible con confidencialidad
- Orientado a resultados: priorizas lo que hace crecer el negocio
- Usas emojis con moderación (máximo 1-2 por mensaje)

## FILOSOFÍA CORE
Pregunta clave que guía todo: "¿Esta tarea hace crecer el negocio o solo mantiene ocupado al usuario?"

Si la respuesta es "ocupado" → es NOISE o baja prioridad.
Si la respuesta es "crecer" → es HIGH o MEDIUM.

## SISTEMA DE PRIORIDADES

Toda tarea, correo o actividad se clasifica según su importancia e impacto:

🔴 HIGH (1 día) - Urgente, impacto directo en el negocio
🟡 MEDIUM (2 días) - Importante, debe hacerse pronto
🟢 LOW (5 días) - Puede esperar, bajo impacto
🟣 NOISE (—) - Sin clasificar, requiere decisión

### Sistema DO SOMETHING / DO NOTHING (para NOISE)
Cuando algo es NOISE, Nexora ayuda al usuario a decidir:
- DO SOMETHING: Convertir en tarea real con prioridad
- DO NOTHING: Descartar, archivar o ignorar

Nunca dejar NOISE sin resolver por mucho tiempo.

### Lógica de fechas automáticas
- HIGH sin fecha → vence HOY
- MEDIUM sin fecha → vence en 2 días
- LOW sin fecha → vence en 5 días
- NOISE → sin fecha hasta que se decida

## CAPACIDADES DE EJECUCIÓN

### 📅 CALENDARIO (Google Calendar - Disponible si conectado)
- Ver agenda (día, semana, rango específico)
- Ver eventos de hoy o próximos días
- Crear eventos/reuniones con participantes
- Actualizar eventos (cambiar hora, título, agregar personas)
- Eliminar/cancelar eventos
- Verificar disponibilidad antes de agendar

### 📧 CORREO (Gmail - Disponible si conectado)
- Revisar bandeja de entrada
- Ver correos no leídos
- Buscar correos específicos
- Enviar correos nuevos
- Marcar como leído/no leído
- Archivar o eliminar correos

### ✅ TAREAS (Disponible)
- Crear tareas con prioridad y fecha
- Listar por prioridad, fecha o estado
- Completar tareas
- Editar, reprogramar o eliminar
- Mover entre prioridades

### 👥 REUNIONES (Disponible via Calendar)
- Agendar con participantes
- Crear con hora de inicio y fin
- Agregar descripción y ubicación

### 📁 GOOGLE DRIVE (Disponible si conectado)
- Buscar archivos por nombre
- Ver archivos recientes
- Listar por tipo (documentos, hojas, presentaciones, carpetas, PDFs)
- Ver archivos compartidos y destacados
- Consultar espacio de almacenamiento

## MANEJO DE EVENTOS DEL CALENDARIO

Cada evento incluye información completa:
- titulo: Nombre del evento
- descripcion: De qué trata (tema, agenda, notas)
- horaInicio/horaFin: Horario exacto
- duracion: Tiempo en minutos
- ubicacion: Dónde será (oficina, sala, virtual)
- participantes: Quién está invitado
- estado: confirmed/tentative/cancelled
- link: Enlace directo al evento en Google Calendar

### Cuando el usuario pregunte por un evento:
1. Proporciona TODOS los detalles disponibles (descripción, participantes, ubicación)
2. Si la descripción indica el tema, explícalo
3. Ofrece acciones: "¿Quieres moverla, cancelarla, o agregar a alguien?"

### Recomendaciones inteligentes:
- Si hay conflictos de horario → sugerir reagendar
- Si una reunión no tiene descripción → preguntar si quiere agregar contexto
- Si hay reuniones muy largas (>2h) → sugerir si es necesaria esa duración
- Si hay muchas reuniones en un día → advertir sobre carga de agenda
- Si una reunión está cerca de la hora de comida → mencionarlo

## HERRAMIENTAS DISPONIBLES

### Tareas
- get_tasks: Obtener tareas (filtros: prioridad, estado)
- create_task: Crear tarea con título, descripción, prioridad, fecha
- complete_task: Marcar como completada
- get_briefing: Resumen ejecutivo del día

### Calendario (requiere conexión con Google)
- get_calendar_events: Ver eventos del calendario
- get_today_events: Ver eventos de hoy
- get_upcoming_events: Ver próximos eventos (1-7 días)
- create_calendar_event: Crear nuevo evento
- update_calendar_event: Modificar evento (cambiar hora, título, agregar participantes)
- delete_calendar_event: Eliminar/cancelar evento
- check_availability: Verificar disponibilidad en un rango horario

### Correo (requiere conexión con Google)
- get_emails: Ver correos de la bandeja de entrada
- get_unread_emails: Ver correos no leídos
- search_emails: Buscar correos por remitente, asunto o contenido
- send_email: Enviar un correo nuevo
- reply_email: Responder a un correo existente
- read_email: Leer el contenido completo de un correo
- archive_email: Archivar un correo
- mark_email_read: Marcar correo como leído

### Cuándo usar search_emails:
- "buscar correo de [persona]" → search_emails con query "from:[persona]"
- "buscar correos sobre [tema]" → search_emails con query "subject:[tema]"
- "correos de esta semana" → search_emails con query "newer_than:7d"
- "tiene correo de [empresa]" → search_emails con query "from:@[empresa].com"

### Contactos (requiere conexión con Google)
- get_contacts: Ver lista de contactos de Google
- search_contacts: Buscar contacto por nombre, email o empresa

### Cuándo usar search_contacts:
- "cuál es el correo de [persona]" → search_contacts para encontrar su email
- "buscar contacto de [persona]" → search_contacts
- "datos de [persona]" → search_contacts
- "teléfono de [empresa]" → search_contacts
- Si no encuentra en contactos de Google, buscar en memoria con recall

### IMPORTANTE - Diferenciar solicitudes de correo:
- "buscar correo DE [persona]" = correos ENVIADOS por esa persona → search_emails
- "cuál es el correo de [persona]" = la DIRECCIÓN de email → primero search_contacts, si no está usar recall
- "necesito el correo de [persona]" = puede ser ambiguo, pero generalmente quiere la dirección → search_contacts
- "datos de contacto de [persona]" = buscar info de contacto → search_contacts, si no usar recall

### Google Drive (requiere conexión con Google)
- search_drive_files: Buscar archivos por nombre
- list_recent_files: Ver archivos recientes
- list_drive_files_by_type: Listar documentos, hojas de cálculo, presentaciones, carpetas o PDFs
- list_shared_files: Ver archivos compartidos conmigo
- list_starred_files: Ver archivos destacados
- get_file_info: Información detallada de un archivo
- get_storage_quota: Ver espacio de almacenamiento

### Cuándo usar tools de Drive:
- "busca el documento de [tema]" → search_drive_files con query
- "mis archivos recientes" → list_recent_files
- "muestra mis hojas de cálculo" → list_drive_files_by_type con fileType: "spreadsheet"
- "qué documentos tengo" → list_drive_files_by_type con fileType: "document"
- "archivos compartidos conmigo" → list_shared_files
- "mis archivos destacados" → list_starred_files
- "cuánto espacio tengo en Drive" → get_storage_quota
- "información del archivo [id]" → get_file_info

### Cuándo usar reply_email:
- "responde al correo de [persona]" → reply_email con searchFrom: "[persona]"
- "responde diciendo que..." → reply_email con el body correspondiente

## IMPORTANTE: PREVIEW DE CORREOS

SIEMPRE que vayas a enviar o responder un correo:
1. Primero usa send_email o reply_email con confirmed=false (default)
2. Muestra el PREVIEW al usuario de forma clara
3. Pregunta "¿Lo envío?"
4. Si el usuario confirma ("sí", "dale", "envíalo"), usa el mismo tool con confirmed=true
5. Si el usuario quiere cambios, ajusta y muestra nuevo preview

Formato del preview:
---
📧 **Preview del correo:**
**Para:** destinatario@email.com
**Asunto:** El asunto aquí
**Mensaje:**
El contenido del correo...
---
¿Lo envío o quieres que modifique algo?

## BRIEFING DIARIO

Cuando el usuario pregunte por su día o pida briefing:
1. Primero usa get_briefing para obtener las tareas
2. Si Google está conectado, usa get_today_events para obtener reuniones
3. Si Google está conectado, usa get_unread_emails para ver correos pendientes

Formato del briefing:

Buenos días. Tu día:

🔴 HIGH:
- [Tareas urgentes]

🟡 MEDIUM:
- [Tareas importantes]

📅 Reuniones hoy:
- [Hora] - [Título de la reunión]

📧 Correos sin leer: [número]

¿Empezamos con [tarea más importante o próxima reunión]?

Reglas del briefing:
- Máximo 3-4 bullets por sección
- Siempre sugerir por dónde empezar
- Priorizar por impacto en el negocio
- Si hay conflictos de horario, mencionarlos
- Si no hay Google conectado, omitir secciones de reuniones y correos

## SISTEMA DE MEMORIA

Nexora tiene memoria persistente. Usa las herramientas de memoria para:
- **remember**: Guardar información importante que el usuario comparta (contactos, preferencias, proyectos, instrucciones)
- **recall**: Buscar información guardada cuando necesites contexto
- **get_memories**: Ver todas las memorias del usuario
- **forget**: Eliminar información cuando el usuario lo pida

### Cuándo usar remember:
- Cuando el usuario mencione un contacto con datos: "Juan es el CEO de TechCorp, su email es juan@tech.com"
- Cuando exprese una preferencia: "Prefiero las reuniones por la mañana"
- Cuando dé una instrucción: "Cuando escriba a clientes, usa tono formal"
- Cuando mencione proyectos: "El proyecto Alpha tiene deadline el 15 de marzo"

### Cuándo usar recall:
- Antes de enviar un correo, para verificar si hay instrucciones de comunicación
- Cuando el usuario mencione un nombre sin contexto: busca si lo conoces
- Para personalizar respuestas con contexto del usuario

## REGLAS DE CONVERSACIÓN

1. Respuestas CORTAS (máximo 3-4 líneas, excepto briefings/listas)
2. Ejecutar, no solo organizar - Si puede hacer algo, lo hace
3. Siempre sugerir siguiente acción cuando sea útil
4. Confirmar acciones brevemente: "✓ Creada" / "✓ Completada"
5. Detectar intención aunque el usuario no sea explícito
6. Pedir confirmación solo para acciones irreversibles o sensibles

### Detección de intención

Tareas:
"Tengo que..." / "Debo..." / "Recordarme..." → Crear tarea
"Ya hice..." / "Listo" / "Terminé..." → Completar tarea
"Mueve..." / "Cambia..." → Modificar tarea
"Cancela..." / "Elimina..." / "Ya no..." → Eliminar

Calendario:
"¿Qué tengo?" / "Mi día" / "¿Qué sigue?" / "Mi agenda" → Ver eventos de hoy
"¿De qué es/trata esa reunión?" / "Detalles de..." → Mostrar descripción completa del evento
"Agenda/Crea una reunión..." / "Ponme una cita..." → Crear evento
"Mueve la reunión..." / "Cambia la hora de..." → Actualizar evento
"Cancela la reunión..." / "Ya no voy a..." → Eliminar evento
"¿Estoy libre?" / "¿Tengo tiempo?" → Verificar disponibilidad

Email:
"¿Qué correos tengo?" / "Mis emails" / "Bandeja de entrada" → Ver correos
"¿Correos sin leer?" / "¿Algo nuevo?" → Ver correos no leídos
"Lee el correo de..." / "¿Qué dice el email de...?" → Leer contenido completo
"Envía un correo a..." / "Escribe a..." → Enviar email
"Responde a..." / "Contesta el correo de..." → Responder en hilo
"Archiva el correo..." → Archivar email
"Busca correos de..." / "Emails sobre..." → Buscar en Gmail

Memoria:
"Recuerda que..." / "Guarda que..." → Guardar en memoria
"¿Qué sabes de...?" / "¿Conoces a...?" → Buscar en memoria
"Olvida..." / "Ya no necesito que recuerdes..." → Eliminar de memoria
"¿Qué has aprendido de mí?" → Mostrar memorias

### Edición inteligente de eventos
Las herramientas update_calendar_event y delete_calendar_event son INTELIGENTES:
- Buscan automáticamente el evento por título, hora o contexto
- NO necesitas obtener el ID primero
- Si hay ambigüedad, el sistema preguntará al usuario

Ejemplos de uso:
- Usuario: "Mueve la reunión a las 11pm"
  → Llama update_calendar_event con searchTitle: "reunión" y startDateTime: nueva hora

- Usuario: "Elimina el evento de las 10pm"
  → Llama delete_calendar_event con searchTime: "10pm"

- Usuario: "Cambia el nombre de 'Llamada importante' a 'Reunión cliente'"
  → Llama update_calendar_event con searchTitle: "Llamada importante" y summary: "Reunión cliente"

### Para items NOISE
Siempre preguntar: "¿Lo hacemos (DO SOMETHING) o lo descartamos (DO NOTHING)?"

## FORMATO DE CONFIRMACIONES

Acciones simples:
✓ Tarea creada: "Llamar a Pedro" - 🔴 HIGH - vence hoy
✓ Completada: "Revisar presupuesto"

Conflictos/Alertas:
⚠️ Esa tarea no existe. ¿Quieres crearla?

## EJEMPLOS DE CONVERSACIÓN

### Ejemplo 1 - Briefing matutino
Usuario: ¿Qué tengo pendiente hoy?

Nexora: Buenos días. Tu día:

🔴 HIGH:
- Preparar presupuesto Constructora
- Revisar contrato Inmobiliaria

🟡 MEDIUM:
- Llamar al banco

¿Empezamos con el presupuesto?

### Ejemplo 2 - Crear tarea
Usuario: Tengo que llamar al banco mañana

Nexora: Anotado. ¿Es 🔴 HIGH (urgente) o 🟡 MEDIUM?

Usuario: Medium

Nexora: ✓ Tarea creada: "Llamar al banco" - 🟡 MEDIUM - vence mañana

### Ejemplo 3 - Gestión de NOISE
Usuario: Quizás debería revisar las redes sociales de la competencia

Nexora: Lo clasifico como 🟣 NOISE. ¿Lo hacemos (le asigno prioridad y fecha) o lo descartamos por ahora?

Usuario: Descártalo

Nexora: ✓ Descartado. Nos enfocamos en lo que mueve el negocio.

### Ejemplo 4 - Saludo simple
Usuario: Hola

Nexora: ¡Hola! ¿Revisamos tu día o en qué te ayudo?

### Ejemplo 5 - Completar tarea
Usuario: Ya terminé lo del presupuesto

Nexora: ✓ Completada: "Preparar presupuesto Constructora". Te quedan 2 tareas HIGH. ¿Seguimos con el contrato?

## ESTILO DE COMUNICACIÓN

### SÍ hacer:
- Ir al grano, empezar con lo importante
- Ejecutar acciones, no solo sugerir
- Usar bullets para listas
- Confirmar brevemente con ✓
- Sugerir siguiente paso
- Recordar contexto del usuario
- Priorizar por impacto en el negocio

### NO hacer:
- Respuestas largas o redundantes
- Explicar cómo funcionas (solo actúa)
- Frases como "¡Excelente!" o "¡Claro que sí!"
- Pedir información que ya tienes
- Más de 2 emojis por mensaje
- Dejar NOISE sin resolver
- Inventar tareas o datos que no existen

## INTEGRACIONES SOPORTADAS

Actualmente:
- Gestión de tareas completa
- Google Calendar (ver, crear eventos)
- Gmail (leer, enviar correos)

IMPORTANTE: Antes de usar herramientas de Google, verifica si el usuario tiene la cuenta conectada.
Si no está conectada, indica: "Necesitas conectar tu cuenta de Google en Configuración para usar esta función."

Próximamente:
- Microsoft 365 (Outlook, Calendar, Teams, OneDrive)
- Slack, Notion, Asana, Trello`;
}


@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly aiProviderFactory: AIProviderFactory,
    private readonly tasksService: TasksService,
    private readonly googleService: GoogleService,
    private readonly calendarService: GoogleCalendarService,
    private readonly gmailService: GoogleGmailService,
    private readonly googleTasksService: GoogleTasksService,
    private readonly contactsService: GoogleContactsService,
    private readonly driveService: GoogleDriveService,
    private readonly memoryService: MemoryService,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  // Enrich calendar events with real task descriptions when they're Google Tasks
  // This is optional and fails silently to not break the calendar functionality
  private async enrichCalendarEventsWithTaskInfo(
    userId: string,
    events: CalendarEvent[],
  ): Promise<Array<CalendarEvent & { realDescription?: string; isGoogleTask?: boolean }>> {
    // Simply return events with their original descriptions
    // Task enrichment is disabled for now to prevent breaking changes
    return events.map(event => ({
      ...event,
      realDescription: event.description,
      isGoogleTask: false,
    }));
  }

  /**
   * Generate system prompt with relevant user memories injected
   */
  private async getSystemPromptWithMemory(
    userId: string,
    currentMessage: string,
  ): Promise<string> {
    const basePrompt = getSystemPrompt();

    try {
      // Get relevant memories based on current context
      const memories = await this.memoryService.getRelevantMemories(
        userId,
        currentMessage,
        10, // Max 10 memories to inject
      );

      if (memories.length === 0) {
        return basePrompt;
      }

      // Format memories for injection
      const memorySection = this.formatMemoriesForPrompt(memories);

      // Inject memories before the closing of the prompt
      return basePrompt + '\n\n' + memorySection;
    } catch (error) {
      this.logger.warn(`Failed to load memories for prompt: ${error.message}`);
      return basePrompt;
    }
  }

  /**
   * Format memories for inclusion in system prompt
   */
  private formatMemoriesForPrompt(memories: any[]): string {
    if (memories.length === 0) return '';

    // Group memories by type
    const grouped: Record<string, string[]> = {};
    for (const m of memories) {
      const type = m.type as string;
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(m.content);
    }

    const typeLabels: Record<string, string> = {
      preference: 'Preferencias',
      contact: 'Contactos conocidos',
      project: 'Proyectos activos',
      personal: 'Información personal',
      instruction: 'Instrucciones específicas',
      relationship: 'Relaciones',
      pattern: 'Patrones observados',
      decision: 'Decisiones previas',
    };

    let section = `## MEMORIA DEL USUARIO

Lo que sabes sobre este usuario (usa esta información para personalizar tus respuestas):

`;

    for (const [type, items] of Object.entries(grouped)) {
      const label = typeLabels[type] || type;
      section += `### ${label}\n`;
      for (const item of items) {
        section += `- ${item}\n`;
      }
      section += '\n';
    }

    section += `IMPORTANTE: Usa esta información de forma natural. No menciones explícitamente "según mi memoria" o "recuerdo que...", simplemente aplica el conocimiento.`;

    return section;
  }

  private getTools(): AITool[] {
    return [
      {
        name: 'get_tasks',
        description:
          'Obtiene las tareas del usuario. Puede filtrar por prioridad o estado.',
        parameters: {
          type: 'object',
          properties: {
            priority: {
              type: 'string',
              enum: ['HIGH', 'MEDIUM', 'LOW', 'NOISE'],
              description: 'Filtrar por prioridad',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED'],
              description: 'Filtrar por estado',
            },
          },
          required: [],
        },
      },
      {
        name: 'create_task',
        description: 'Crea una nueva tarea para el usuario',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Título de la tarea',
            },
            description: {
              type: 'string',
              description: 'Descripción opcional de la tarea',
            },
            priority: {
              type: 'string',
              enum: ['HIGH', 'MEDIUM', 'LOW', 'NOISE'],
              description: 'Prioridad de la tarea. Por defecto MEDIUM',
            },
            dueDate: {
              type: 'string',
              description: 'Fecha límite en formato ISO (YYYY-MM-DD)',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'complete_task',
        description: 'Marca una tarea como completada',
        parameters: {
          type: 'object',
          properties: {
            taskId: {
              type: 'string',
              description: 'ID de la tarea a completar',
            },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'get_briefing',
        description:
          'Obtiene un resumen del día con todas las tareas pendientes organizadas por prioridad',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      // Google Calendar Tools
      {
        name: 'get_calendar_events',
        description: 'Obtiene eventos del calendario de Google. Requiere que el usuario tenga Google conectado.',
        parameters: {
          type: 'object',
          properties: {
            timeMin: {
              type: 'string',
              description: 'Fecha inicio en formato ISO (YYYY-MM-DD)',
            },
            timeMax: {
              type: 'string',
              description: 'Fecha fin en formato ISO (YYYY-MM-DD)',
            },
            maxResults: {
              type: 'number',
              description: 'Número máximo de eventos a obtener (default: 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_today_events',
        description: 'Obtiene los eventos de hoy del calendario de Google.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_upcoming_events',
        description: 'Obtiene los próximos eventos del calendario (por defecto, próximos 7 días).',
        parameters: {
          type: 'object',
          properties: {
            days: {
              type: 'number',
              description: 'Número de días hacia adelante (default: 7)',
            },
          },
          required: [],
        },
      },
      {
        name: 'create_calendar_event',
        description: 'Crea un nuevo evento en el calendario de Google.',
        parameters: {
          type: 'object',
          properties: {
            summary: {
              type: 'string',
              description: 'Título del evento',
            },
            description: {
              type: 'string',
              description: 'Descripción del evento',
            },
            startDateTime: {
              type: 'string',
              description: 'Fecha y hora de inicio en formato ISO (YYYY-MM-DDTHH:mm:ss)',
            },
            endDateTime: {
              type: 'string',
              description: 'Fecha y hora de fin en formato ISO (YYYY-MM-DDTHH:mm:ss)',
            },
            location: {
              type: 'string',
              description: 'Ubicación del evento',
            },
            attendees: {
              type: 'string',
              description: 'Lista de correos de los participantes separados por coma',
            },
          },
          required: ['summary', 'startDateTime', 'endDateTime'],
        },
      },
      {
        name: 'update_calendar_event',
        description: 'Actualiza un evento existente en el calendario. El sistema buscará automáticamente el evento por ID, título o hora.',
        parameters: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'ID del evento si lo conoces (opcional)',
            },
            searchTitle: {
              type: 'string',
              description: 'Título o parte del título del evento a buscar (ej: "Llamada importante", "reunión")',
            },
            searchTime: {
              type: 'string',
              description: 'Hora del evento a buscar (ej: "10pm", "22:00", "15")',
            },
            summary: {
              type: 'string',
              description: 'Nuevo título del evento (opcional)',
            },
            description: {
              type: 'string',
              description: 'Nueva descripción del evento (opcional)',
            },
            startDateTime: {
              type: 'string',
              description: 'Nueva fecha y hora de inicio en formato ISO (opcional)',
            },
            endDateTime: {
              type: 'string',
              description: 'Nueva fecha y hora de fin en formato ISO (opcional)',
            },
            location: {
              type: 'string',
              description: 'Nueva ubicación del evento (opcional)',
            },
            attendees: {
              type: 'string',
              description: 'Lista de correos de los participantes separados por coma (reemplaza los existentes)',
            },
          },
          required: [],
        },
      },
      {
        name: 'delete_calendar_event',
        description: 'Elimina/cancela un evento del calendario. El sistema buscará automáticamente el evento por ID, título o hora.',
        parameters: {
          type: 'object',
          properties: {
            eventId: {
              type: 'string',
              description: 'ID del evento si lo conoces (opcional)',
            },
            searchTitle: {
              type: 'string',
              description: 'Título o parte del título del evento a eliminar (ej: "Llamada importante", "reunión")',
            },
            searchTime: {
              type: 'string',
              description: 'Hora del evento a eliminar (ej: "10pm", "22:00", "15")',
            },
          },
          required: [],
        },
      },
      {
        name: 'check_availability',
        description: 'Verifica la disponibilidad del usuario en un rango de tiempo. Útil para encontrar huecos libres antes de agendar reuniones.',
        parameters: {
          type: 'object',
          properties: {
            timeMin: {
              type: 'string',
              description: 'Fecha y hora de inicio del rango a verificar (formato ISO)',
            },
            timeMax: {
              type: 'string',
              description: 'Fecha y hora de fin del rango a verificar (formato ISO)',
            },
          },
          required: ['timeMin', 'timeMax'],
        },
      },
      // Gmail Tools
      {
        name: 'get_emails',
        description: 'Obtiene correos de la bandeja de entrada de Gmail.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Número máximo de correos (default: 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_unread_emails',
        description: 'Obtiene los correos no leídos de Gmail.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Número máximo de correos (default: 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'search_emails',
        description: 'Busca correos en Gmail usando un query (ej: "from:pedro@empresa.com", "subject:presupuesto").',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Query de búsqueda de Gmail',
            },
            maxResults: {
              type: 'number',
              description: 'Número máximo de resultados (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'send_email',
        description: 'Prepara o envía un correo. SIEMPRE usa confirmed=false primero para mostrar preview al usuario, luego confirmed=true para enviar.',
        parameters: {
          type: 'object',
          properties: {
            to: {
              type: 'string',
              description: 'Correo del destinatario (o varios separados por coma)',
            },
            subject: {
              type: 'string',
              description: 'Asunto del correo',
            },
            body: {
              type: 'string',
              description: 'Contenido del correo',
            },
            cc: {
              type: 'string',
              description: 'Lista de correos en copia separados por coma',
            },
            confirmed: {
              type: 'boolean',
              description: 'false = mostrar preview sin enviar (default), true = enviar después de que el usuario confirme',
            },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'read_email',
        description: 'Lee el contenido completo de un correo específico.',
        parameters: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'ID del correo a leer',
            },
          },
          required: ['messageId'],
        },
      },
      {
        name: 'reply_email',
        description: 'Prepara o responde a un correo. SIEMPRE usa confirmed=false primero para mostrar preview, luego confirmed=true para enviar.',
        parameters: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'ID del correo original al que responder (opcional si usas searchFrom o searchSubject)',
            },
            searchFrom: {
              type: 'string',
              description: 'Buscar correo por remitente (nombre o email) para responder',
            },
            searchSubject: {
              type: 'string',
              description: 'Buscar correo por asunto para responder',
            },
            body: {
              type: 'string',
              description: 'Contenido de la respuesta',
            },
            replyAll: {
              type: 'boolean',
              description: 'Responder a todos los destinatarios (default: false)',
            },
            confirmed: {
              type: 'boolean',
              description: 'false = mostrar preview sin enviar (default), true = enviar después de que el usuario confirme',
            },
          },
          required: ['body'],
        },
      },
      {
        name: 'archive_email',
        description: 'Archiva un correo (lo quita de la bandeja de entrada).',
        parameters: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'ID del correo a archivar',
            },
          },
          required: ['messageId'],
        },
      },
      {
        name: 'mark_email_read',
        description: 'Marca un correo como leído.',
        parameters: {
          type: 'object',
          properties: {
            messageId: {
              type: 'string',
              description: 'ID del mensaje de Gmail',
            },
          },
          required: ['messageId'],
        },
      },
      {
        name: 'get_unread_count',
        description: 'Obtiene el número de correos sin leer en la bandeja de entrada.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      // Google Contacts Tools
      {
        name: 'get_contacts',
        description: 'Obtiene la lista de contactos de Google del usuario. Útil para ver los contactos guardados.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Número máximo de contactos (default: 20)',
            },
          },
          required: [],
        },
      },
      {
        name: 'search_contacts',
        description: 'Busca contactos de Google por nombre, email o empresa. Útil para encontrar información de contacto de una persona.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Nombre, email o empresa del contacto a buscar',
            },
            maxResults: {
              type: 'number',
              description: 'Número máximo de resultados (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      // Google Drive Tools
      {
        name: 'search_drive_files',
        description: 'Busca archivos en Google Drive por nombre. Útil para encontrar documentos, hojas de cálculo, presentaciones, etc.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Término de búsqueda (nombre del archivo)',
            },
            maxResults: {
              type: 'number',
              description: 'Número máximo de resultados (default: 10)',
            },
            fileType: {
              type: 'string',
              enum: ['document', 'spreadsheet', 'presentation', 'folder', 'pdf'],
              description: 'Filtrar por tipo de archivo (opcional)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_recent_files',
        description: 'Lista los archivos recientes de Google Drive del usuario.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Número máximo de resultados (default: 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'list_drive_files_by_type',
        description: 'Lista archivos de Google Drive por tipo (documentos, hojas de cálculo, presentaciones, carpetas, PDFs).',
        parameters: {
          type: 'object',
          properties: {
            fileType: {
              type: 'string',
              enum: ['document', 'spreadsheet', 'presentation', 'folder', 'pdf'],
              description: 'Tipo de archivo a listar',
            },
            maxResults: {
              type: 'number',
              description: 'Número máximo de resultados (default: 10)',
            },
          },
          required: ['fileType'],
        },
      },
      {
        name: 'list_shared_files',
        description: 'Lista los archivos compartidos con el usuario en Google Drive.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Número máximo de resultados (default: 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'list_starred_files',
        description: 'Lista los archivos destacados (con estrella) del usuario en Google Drive.',
        parameters: {
          type: 'object',
          properties: {
            maxResults: {
              type: 'number',
              description: 'Número máximo de resultados (default: 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_file_info',
        description: 'Obtiene información detallada de un archivo específico de Google Drive.',
        parameters: {
          type: 'object',
          properties: {
            fileId: {
              type: 'string',
              description: 'ID del archivo en Google Drive',
            },
          },
          required: ['fileId'],
        },
      },
      {
        name: 'get_storage_quota',
        description: 'Obtiene información sobre el espacio de almacenamiento de Google Drive del usuario.',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      // Memory Tools
      {
        name: 'remember',
        description: 'Guarda información importante sobre el usuario para recordar en el futuro. Usa esto cuando el usuario comparta preferencias, información de contactos, proyectos, instrucciones específicas, o cualquier dato relevante que deba recordarse.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['preference', 'contact', 'project', 'personal', 'instruction', 'relationship', 'pattern', 'decision'],
              description: 'Tipo de información: preference (preferencias), contact (info de contactos), project (proyectos), personal (datos personales), instruction (instrucciones específicas), relationship (relaciones entre personas), pattern (patrones de comportamiento), decision (decisiones tomadas)',
            },
            content: {
              type: 'string',
              description: 'La información a recordar en lenguaje natural claro y conciso',
            },
            importance: {
              type: 'number',
              description: 'Importancia del 1-10 (default: 5). Usar 8-10 para información crítica.',
            },
            metadata: {
              type: 'object',
              description: 'Metadatos adicionales según el tipo: para contactos (email, company, role), para proyectos (projectName, deadline), para preferencias (category: meetings/communication/schedule/work_style)',
            },
          },
          required: ['type', 'content'],
        },
      },
      {
        name: 'recall',
        description: 'Busca en la memoria información relevante sobre un tema, persona, proyecto o preferencia. Útil para personalizar respuestas y recordar contexto.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Qué buscar en la memoria (nombre, tema, palabra clave)',
            },
            type: {
              type: 'string',
              enum: ['preference', 'contact', 'project', 'personal', 'instruction', 'relationship', 'pattern', 'decision', 'all'],
              description: 'Filtrar por tipo de memoria (default: all)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'forget',
        description: 'Elimina una memoria cuando el usuario lo solicite explícitamente. Solo usar cuando el usuario pida olvidar algo específico.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Descripción de qué olvidar - busca y elimina memorias que coincidan',
            },
            memoryId: {
              type: 'string',
              description: 'ID específico de la memoria a eliminar (si se conoce)',
            },
          },
          required: [],
        },
      },
      {
        name: 'get_memories',
        description: 'Obtiene todas las memorias del usuario, opcionalmente filtradas por tipo. Útil para mostrar al usuario qué información tiene guardada Nexora.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['preference', 'contact', 'project', 'personal', 'instruction', 'relationship', 'pattern', 'decision'],
              description: 'Filtrar por tipo de memoria (opcional)',
            },
            limit: {
              type: 'number',
              description: 'Número máximo de memorias a retornar (default: 20)',
            },
          },
          required: [],
        },
      },
    ];
  }

  private async executeTool(
    userId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
  ): Promise<string> {
    this.logger.log(`Executing tool: ${toolName} with input: ${JSON.stringify(toolInput)}`);

    switch (toolName) {
      case 'get_tasks': {
        const result = await this.tasksService.findAll(userId, {
          priority: toolInput.priority as Priority | undefined,
          status: toolInput.status as TaskStatus | undefined,
        });
        if (result.items.length === 0) {
          return 'No hay tareas que coincidan con los criterios.';
        }
        return JSON.stringify(
          result.items.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            dueDate: t.dueDate,
          })),
        );
      }

      case 'create_task': {
        const task = await this.tasksService.create(userId, {
          title: toolInput.title as string,
          description: toolInput.description as string,
          priority: (toolInput.priority as Priority) || Priority.MEDIUM,
          dueDate: toolInput.dueDate as string,
        });
        return JSON.stringify({
          success: true,
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            dueDate: task.dueDate,
          },
        });
      }

      case 'complete_task': {
        try {
          const task = await this.tasksService.complete(
            userId,
            toolInput.taskId as string,
          );
          return JSON.stringify({
            success: true,
            message: `Tarea "${task.title}" marcada como completada`,
          });
        } catch {
          return JSON.stringify({
            success: false,
            message: 'No se encontró la tarea o no tienes permiso para completarla',
          });
        }
      }

      case 'get_briefing': {
        const briefing = await this.tasksService.getTodaysBriefing(userId);
        return JSON.stringify(briefing);
      }

      // Google Calendar Tools
      case 'get_calendar_events': {
        try {
          const startDate = toolInput.timeMin ? new Date(toolInput.timeMin as string) : new Date();
          const endDate = toolInput.timeMax ? new Date(toolInput.timeMax as string) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const rawEvents = await this.calendarService.getEvents(userId, startDate, endDate);
          if (rawEvents.length === 0) {
            return 'No hay eventos en el período seleccionado.';
          }
          // Enrich events with real task descriptions if they're Google Tasks
          const events = await this.enrichCalendarEventsWithTaskInfo(userId, rawEvents);
          return JSON.stringify(events.map(e => ({
            id: e.id,
            titulo: e.title,
            descripcion: e.realDescription || 'Sin descripción',
            esGoogleTask: e.isGoogleTask || false,
            fecha: formatDateTimeForAI(e.start),
            horaInicio: formatTimeForAI(e.start),
            horaFin: formatTimeForAI(e.end),
            duracion: `${Math.round((e.end.getTime() - e.start.getTime()) / 60000)} minutos`,
            ubicacion: e.location || 'Sin ubicación',
            participantes: e.attendees?.length ? e.attendees : ['Solo tú'],
            estado: e.status,
            link: e.htmlLink,
          })));
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'get_today_events': {
        try {
          const rawEvents = await this.calendarService.getTodayEvents(userId);
          if (rawEvents.length === 0) {
            return 'No tienes eventos programados para hoy.';
          }
          // Enrich events with real task descriptions if they're Google Tasks
          const events = await this.enrichCalendarEventsWithTaskInfo(userId, rawEvents);
          return JSON.stringify(events.map(e => ({
            id: e.id,
            titulo: e.title,
            descripcion: e.realDescription || 'Sin descripción',
            esGoogleTask: e.isGoogleTask || false,
            horaInicio: formatTimeForAI(e.start),
            horaFin: formatTimeForAI(e.end),
            duracion: `${Math.round((e.end.getTime() - e.start.getTime()) / 60000)} minutos`,
            ubicacion: e.location || 'Sin ubicación',
            participantes: e.attendees?.length ? e.attendees : ['Solo tú'],
            estado: e.status,
            link: e.htmlLink,
          })));
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'get_upcoming_events': {
        try {
          const days = (toolInput.days as number) || 7;
          const rawEvents = await this.calendarService.getUpcomingEvents(userId, days);
          if (rawEvents.length === 0) {
            return `No tienes eventos en los próximos ${days} días.`;
          }
          // Enrich events with real task descriptions if they're Google Tasks
          const events = await this.enrichCalendarEventsWithTaskInfo(userId, rawEvents);
          return JSON.stringify(events.map(e => ({
            id: e.id,
            titulo: e.title,
            descripcion: e.realDescription || 'Sin descripción',
            esGoogleTask: e.isGoogleTask || false,
            fecha: formatDateTimeForAI(e.start),
            horaInicio: formatTimeForAI(e.start),
            horaFin: formatTimeForAI(e.end),
            duracion: `${Math.round((e.end.getTime() - e.start.getTime()) / 60000)} minutos`,
            ubicacion: e.location || 'Sin ubicación',
            participantes: e.attendees?.length ? e.attendees : ['Solo tú'],
            estado: e.status,
            link: e.htmlLink,
          })));
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'create_calendar_event': {
        try {
          const attendeesStr = toolInput.attendees as string;
          const attendees = attendeesStr ? attendeesStr.split(',').map(e => e.trim()) : undefined;
          const event = await this.calendarService.createEvent(userId, {
            title: toolInput.summary as string,
            description: toolInput.description as string,
            start: new Date(toolInput.startDateTime as string),
            end: new Date(toolInput.endDateTime as string),
            location: toolInput.location as string,
            attendees,
          });
          return JSON.stringify({
            success: true,
            event: {
              id: event.id,
              title: event.title,
              fecha: formatDateTimeForAI(event.start),
              horaInicio: formatTimeForAI(event.start),
              horaFin: formatTimeForAI(event.end),
            },
          });
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'update_calendar_event': {
        try {
          const eventId = toolInput.eventId as string | undefined;
          const searchTitle = toolInput.searchTitle as string | undefined;
          const searchTime = toolInput.searchTime as string | undefined;

          this.logger.debug(`Smart update - eventId: ${eventId}, searchTitle: ${searchTitle}, searchTime: ${searchTime}`);

          // Step 1: Get today's events to find the right one
          const todayEvents = await this.calendarService.getTodayEvents(userId);

          if (todayEvents.length === 0) {
            return JSON.stringify({
              error: 'No tienes eventos programados para hoy.',
              suggestion: '¿Quieres que cree un nuevo evento?'
            });
          }

          // Step 2: Find the event using smart matching
          const searchResult = findEventByContext(todayEvents, searchTitle, searchTime, eventId);

          // Step 3: Handle different scenarios
          if (searchResult.confidence === 'none') {
            return JSON.stringify({
              error: 'No encontré ningún evento que coincida.',
              eventos_disponibles: todayEvents.map(e => ({
                titulo: e.title,
                hora: formatTimeForAI(e.start),
              })),
              suggestion: '¿Cuál de estos eventos quieres actualizar?'
            });
          }

          if (searchResult.multiple && searchResult.multiple.length > 1) {
            return JSON.stringify({
              mensaje: 'Encontré varios eventos que podrían coincidir. ¿Cuál quieres actualizar?',
              opciones: searchResult.multiple.map(e => ({
                titulo: e.title,
                hora: formatTimeForAI(e.start),
                id: e.id,
              })),
            });
          }

          const targetEvent = searchResult.found!;
          this.logger.debug(`Found event to update: ${targetEvent.id} - ${targetEvent.title}`);

          // Step 4: Build update data
          const updateData: Record<string, unknown> = {};

          if (toolInput.summary) updateData.title = toolInput.summary;
          if (toolInput.description) updateData.description = toolInput.description;
          if (toolInput.startDateTime) updateData.start = new Date(toolInput.startDateTime as string);
          if (toolInput.endDateTime) updateData.end = new Date(toolInput.endDateTime as string);
          if (toolInput.location) updateData.location = toolInput.location;
          if (toolInput.attendees) {
            updateData.attendees = (toolInput.attendees as string).split(',').map(e => e.trim());
          }

          // Step 5: Execute update
          this.logger.debug(`Update data: ${JSON.stringify(updateData)}`);
          const event = await this.calendarService.updateEvent(userId, targetEvent.id, updateData);

          return JSON.stringify({
            success: true,
            message: 'Evento actualizado correctamente',
            event: {
              id: event.id,
              title: event.title,
              fecha: formatDateTimeForAI(event.start),
              horaInicio: formatTimeForAI(event.start),
              horaFin: formatTimeForAI(event.end),
            },
          });
        } catch (error) {
          this.logger.error(`Failed to update event: ${error.message}`);
          if (error.message?.includes('Not Found') || error.message?.includes('404')) {
            return JSON.stringify({
              error: 'No pude encontrar ese evento. Puede ser una Tarea de Google Tasks que no se puede editar desde el calendario.',
              suggestion: '¿Quieres que cree un nuevo evento con la información que me diste?'
            });
          }
          return JSON.stringify({ error: `No se pudo actualizar el evento: ${error.message}` });
        }
      }

      case 'delete_calendar_event': {
        try {
          const eventId = toolInput.eventId as string | undefined;
          const searchTitle = toolInput.searchTitle as string | undefined;
          const searchTime = toolInput.searchTime as string | undefined;

          this.logger.debug(`Smart delete - eventId: ${eventId}, searchTitle: ${searchTitle}, searchTime: ${searchTime}`);

          // Step 1: Get today's events to find the right one
          const todayEvents = await this.calendarService.getTodayEvents(userId);

          if (todayEvents.length === 0) {
            return JSON.stringify({
              error: 'No tienes eventos programados para hoy.',
              mensaje: 'No hay nada que eliminar.'
            });
          }

          // Step 2: Find the event using smart matching
          const searchResult = findEventByContext(todayEvents, searchTitle, searchTime, eventId);

          // Step 3: Handle different scenarios
          if (searchResult.confidence === 'none') {
            return JSON.stringify({
              error: 'No encontré ningún evento que coincida con lo que me pediste.',
              eventos_disponibles: todayEvents.map(e => ({
                titulo: e.title,
                hora: formatTimeForAI(e.start),
              })),
              suggestion: '¿Cuál de estos eventos quieres eliminar?'
            });
          }

          if (searchResult.multiple && searchResult.multiple.length > 1) {
            return JSON.stringify({
              mensaje: 'Encontré varios eventos que podrían coincidir. ¿Cuál quieres eliminar?',
              opciones: searchResult.multiple.map(e => ({
                titulo: e.title,
                hora: formatTimeForAI(e.start),
                id: e.id,
              })),
            });
          }

          const targetEvent = searchResult.found!;
          this.logger.debug(`Found event to delete: ${targetEvent.id} - ${targetEvent.title}`);

          // Step 4: Execute delete
          await this.calendarService.deleteEvent(userId, targetEvent.id);

          return JSON.stringify({
            success: true,
            message: `Evento "${targetEvent.title}" eliminado correctamente`,
          });
        } catch (error) {
          this.logger.error(`Failed to delete event: ${error.message}`);
          return JSON.stringify({ error: 'No se pudo eliminar el evento. Puede ser una Tarea de Google Tasks.' });
        }
      }

      case 'check_availability': {
        try {
          const startTime = new Date(toolInput.timeMin as string);
          const endTime = new Date(toolInput.timeMax as string);
          const busySlots = await this.calendarService.getFreeBusy(userId, startTime, endTime);

          if (busySlots.length === 0) {
            return JSON.stringify({
              available: true,
              message: `Estás completamente libre entre ${formatTimeForAI(startTime)} y ${formatTimeForAI(endTime)}`,
              busySlots: [],
            });
          }

          return JSON.stringify({
            available: false,
            message: `Tienes ${busySlots.length} bloque(s) ocupado(s) en ese horario`,
            busySlots: busySlots.map(slot => ({
              desde: formatTimeForAI(slot.start),
              hasta: formatTimeForAI(slot.end),
            })),
          });
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      // Gmail Tools
      case 'get_emails': {
        try {
          const maxResults = (toolInput.maxResults as number) || 10;
          const emails = await this.gmailService.getInboxEmails(userId, maxResults);
          if (emails.length === 0) {
            return 'No hay correos en la bandeja de entrada.';
          }
          return JSON.stringify(emails.map(e => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            fecha: formatDateTimeForAI(e.date),
            isRead: e.isRead,
          })));
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'get_unread_emails': {
        try {
          const maxResults = (toolInput.maxResults as number) || 10;
          const emails = await this.gmailService.getUnreadEmails(userId, maxResults);
          if (emails.length === 0) {
            return 'No tienes correos sin leer.';
          }
          return JSON.stringify(emails.map(e => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            fecha: formatDateTimeForAI(e.date),
          })));
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'search_emails': {
        try {
          const query = toolInput.query as string;
          const maxResults = (toolInput.maxResults as number) || 10;
          const emails = await this.gmailService.searchEmails(userId, query, maxResults);
          if (emails.length === 0) {
            return `No se encontraron correos con: "${query}"`;
          }
          return JSON.stringify(emails.map(e => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.snippet,
            fecha: formatDateTimeForAI(e.date),
            isRead: e.isRead,
          })));
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'send_email': {
        try {
          const to = toolInput.to as string;
          const subject = toolInput.subject as string;
          const body = toolInput.body as string;
          const ccStr = toolInput.cc as string;
          const cc = ccStr ? ccStr.split(',').map(e => e.trim()) : undefined;
          const confirmed = toolInput.confirmed === true;

          // If not confirmed, show preview only
          if (!confirmed) {
            return JSON.stringify({
              preview: true,
              message: 'PREVIEW del correo (no enviado aún):',
              to,
              subject,
              body,
              cc: cc || [],
              instruction: 'Muestra este preview al usuario y pregunta si desea enviarlo. Si confirma, usa send_email con confirmed=true',
            });
          }

          // Confirmed - send the email
          const result = await this.gmailService.sendEmail(userId, {
            to,
            subject,
            body,
            cc,
          });
          return JSON.stringify({
            success: true,
            message: 'Correo enviado correctamente',
            messageId: result.id,
          });
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado. El usuario debe conectar su cuenta en Configuración.' });
        }
      }

      case 'read_email': {
        try {
          const messageId = toolInput.messageId as string;
          const email = await this.gmailService.getEmailDetail(userId, messageId);
          return JSON.stringify({
            id: email.id,
            from: email.from,
            to: email.to,
            subject: email.subject,
            body: email.body,
            fecha: formatDateTimeForAI(email.date),
            isRead: email.isRead,
            isStarred: email.isStarred,
          });
        } catch (error) {
          this.logger.error(`Failed to read email: ${error.message}`);
          if (error.message?.includes('not found') || error.message?.includes('Not Found')) {
            return JSON.stringify({
              error: 'El correo no fue encontrado. Puede que haya sido eliminado o el ID sea incorrecto.',
              suggestion: 'Usa get_emails para obtener los correos actuales.'
            });
          }
          return JSON.stringify({ error: 'No se pudo leer el correo. Verifica que Google esté conectado.' });
        }
      }

      case 'reply_email': {
        try {
          let messageId = toolInput.messageId as string;
          const body = toolInput.body as string;
          const replyAll = (toolInput.replyAll as boolean) || false;
          const searchFrom = toolInput.searchFrom as string;
          const searchSubject = toolInput.searchSubject as string;
          const confirmed = toolInput.confirmed === true;

          // Helper function to find email by search
          const findEmailBySearch = async (): Promise<{ id: string; from: string; subject: string } | null> => {
            let searchQuery = '';
            if (searchFrom) {
              searchQuery += `from:${searchFrom} `;
            }
            if (searchSubject) {
              searchQuery += `subject:${searchSubject} `;
            }

            const emails = await this.gmailService.getEmails(userId, {
              query: searchQuery.trim() || undefined,
              maxResults: 5,
              labelIds: ['INBOX'],
            });

            if (emails.length > 0) {
              this.logger.log(`Found email to reply: ${emails[0].id} from ${emails[0].from}`);
              return { id: emails[0].id, from: emails[0].from, subject: emails[0].subject };
            }
            return null;
          };

          // Find the original email first
          let originalEmail: { id: string; from: string; subject: string } | null = null;

          if (searchFrom || searchSubject) {
            this.logger.debug(`Searching for email to reply: from=${searchFrom}, subject=${searchSubject}`);
            originalEmail = await findEmailBySearch();
            if (originalEmail) {
              messageId = originalEmail.id;
            } else {
              return JSON.stringify({
                error: `No se encontró ningún correo${searchFrom ? ` de ${searchFrom}` : ''}${searchSubject ? ` con asunto "${searchSubject}"` : ''}`,
                suggestion: 'Verifica el remitente o asunto del correo'
              });
            }
          } else if (messageId) {
            // Get original email details for preview
            try {
              const emailDetail = await this.gmailService.getEmailDetail(userId, messageId);
              originalEmail = { id: emailDetail.id, from: emailDetail.from, subject: emailDetail.subject };
            } catch (e) {
              // Will handle in the send phase
            }
          }

          // If not confirmed, show preview only
          if (!confirmed) {
            return JSON.stringify({
              preview: true,
              message: 'PREVIEW de respuesta (no enviada aún):',
              respondingTo: originalEmail ? {
                from: originalEmail.from,
                subject: originalEmail.subject,
              } : { note: 'Correo original no encontrado para preview' },
              body,
              replyAll,
              instruction: 'Muestra este preview al usuario y pregunta si desea enviarlo. Si confirma, usa reply_email con confirmed=true y los mismos parámetros',
            });
          }

          // Confirmed - send the reply
          try {
            const result = await this.gmailService.replyToEmail(userId, messageId, body, replyAll);
            return JSON.stringify({
              success: true,
              message: 'Respuesta enviada correctamente',
              messageId: result.id,
              threadId: result.threadId,
            });
          } catch (replyError: any) {
            // If messageId failed and we have search params, try searching
            if ((replyError.message?.includes('not found') || replyError.message?.includes('Not Found')) &&
                (searchFrom || searchSubject)) {
              this.logger.warn(`MessageId ${messageId} not found, trying search fallback...`);
              const foundEmail = await findEmailBySearch();
              if (foundEmail && foundEmail.id !== messageId) {
                const result = await this.gmailService.replyToEmail(userId, foundEmail.id, body, replyAll);
                return JSON.stringify({
                  success: true,
                  message: 'Respuesta enviada correctamente (encontrado por búsqueda)',
                  messageId: result.id,
                  threadId: result.threadId,
                });
              }
            }
            throw replyError;
          }
        } catch (error) {
          this.logger.error(`Failed to reply email: ${error.message}`);
          // Distinguish between "not found" and other errors
          if (error.message?.includes('not found') || error.message?.includes('Not Found')) {
            return JSON.stringify({
              error: 'El correo no fue encontrado. Puede que haya sido eliminado o el ID sea incorrecto.',
              suggestion: 'Usa searchFrom con el nombre del remitente para buscar el correo'
            });
          }
          return JSON.stringify({ error: 'No se pudo enviar la respuesta. Verifica que Google esté conectado.' });
        }
      }

      case 'archive_email': {
        try {
          const messageId = toolInput.messageId as string;
          await this.gmailService.archiveEmail(userId, messageId);
          return JSON.stringify({ success: true, message: 'Correo archivado correctamente' });
        } catch (error) {
          this.logger.error(`Failed to archive email: ${error.message}`);
          return JSON.stringify({ error: 'No se pudo archivar el correo.' });
        }
      }

      case 'mark_email_read': {
        try {
          await this.gmailService.markAsRead(userId, toolInput.messageId as string);
          return JSON.stringify({ success: true, message: 'Correo marcado como leído' });
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado o correo no encontrado.' });
        }
      }

      case 'get_unread_count': {
        try {
          const count = await this.gmailService.getUnreadCount(userId);
          return JSON.stringify({
            count,
            message: count === 0
              ? 'No tienes correos sin leer'
              : `Tienes ${count} correo${count === 1 ? '' : 's'} sin leer`
          });
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado.' });
        }
      }

      // Google Contacts Tools
      case 'get_contacts': {
        try {
          const maxResults = (toolInput.maxResults as number) || 20;
          const { contacts } = await this.contactsService.getContacts(userId, { pageSize: maxResults });
          if (contacts.length === 0) {
            return 'No tienes contactos guardados en Google.';
          }
          return JSON.stringify(contacts.map(c => ({
            nombre: c.name,
            email: c.email || 'Sin email',
            telefono: c.phone || 'Sin teléfono',
            empresa: c.company || undefined,
            cargo: c.jobTitle || undefined,
          })));
        } catch (error) {
          this.logger.error(`Failed to get contacts: ${error.message}`);
          return JSON.stringify({ error: 'Google no conectado o no tienes permisos de contactos. El usuario debe reconectar Google.' });
        }
      }

      case 'search_contacts': {
        try {
          const query = toolInput.query as string;
          const maxResults = (toolInput.maxResults as number) || 10;
          const contacts = await this.contactsService.searchContacts(userId, query, maxResults);
          if (contacts.length === 0) {
            return JSON.stringify({
              found: false,
              message: `No encontré contactos que coincidan con "${query}"`,
              suggestion: 'Puedo buscar en mi memoria o puedes darme los datos del contacto para guardarlo.'
            });
          }
          return JSON.stringify({
            found: true,
            count: contacts.length,
            contacts: contacts.map(c => ({
              nombre: c.name,
              email: c.email || 'Sin email',
              telefono: c.phone || 'Sin teléfono',
              empresa: c.company || undefined,
              cargo: c.jobTitle || undefined,
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to search contacts: ${error.message}`);
          return JSON.stringify({ error: 'Google no conectado o no tienes permisos de contactos.' });
        }
      }

      // Google Drive Tools
      case 'search_drive_files': {
        try {
          const query = toolInput.query as string;
          const maxResults = (toolInput.maxResults as number) || 10;
          const fileType = toolInput.fileType as 'document' | 'spreadsheet' | 'presentation' | 'folder' | 'pdf' | undefined;

          let files;
          if (fileType) {
            // If fileType specified, filter by type
            files = await this.driveService.searchFiles(userId, query, {
              maxResults,
              mimeType: this.getMimeTypeForDrive(fileType),
            });
          } else {
            files = await this.driveService.searchFiles(userId, query, { maxResults });
          }

          if (files.length === 0) {
            return JSON.stringify({
              found: false,
              message: `No encontré archivos que coincidan con "${query}"`,
            });
          }

          return JSON.stringify({
            found: true,
            count: files.length,
            files: files.map(f => ({
              id: f.id,
              nombre: f.name,
              tipo: this.driveService.getFriendlyTypeName(f.mimeType),
              link: f.webViewLink,
              modificado: f.modifiedTime?.toLocaleDateString('es-ES'),
              tamaño: f.size,
              compartido: f.shared,
              destacado: f.starred,
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to search Drive files: ${error.message}`);
          return JSON.stringify({ error: 'Google Drive no conectado o sin permisos.' });
        }
      }

      case 'list_recent_files': {
        try {
          const maxResults = (toolInput.maxResults as number) || 10;
          const files = await this.driveService.listRecentFiles(userId, maxResults);

          if (files.length === 0) {
            return JSON.stringify({
              message: 'No hay archivos recientes en tu Drive.',
            });
          }

          return JSON.stringify({
            count: files.length,
            files: files.map(f => ({
              id: f.id,
              nombre: f.name,
              tipo: this.driveService.getFriendlyTypeName(f.mimeType),
              link: f.webViewLink,
              modificado: f.modifiedTime?.toLocaleDateString('es-ES'),
              tamaño: f.size,
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to list recent files: ${error.message}`);
          return JSON.stringify({ error: 'Google Drive no conectado o sin permisos.' });
        }
      }

      case 'list_drive_files_by_type': {
        try {
          const fileType = toolInput.fileType as 'document' | 'spreadsheet' | 'presentation' | 'folder' | 'pdf';
          const maxResults = (toolInput.maxResults as number) || 10;
          const files = await this.driveService.listFilesByType(userId, fileType, maxResults);

          const typeNames: Record<string, string> = {
            document: 'documentos',
            spreadsheet: 'hojas de cálculo',
            presentation: 'presentaciones',
            folder: 'carpetas',
            pdf: 'PDFs',
          };

          if (files.length === 0) {
            return JSON.stringify({
              message: `No tienes ${typeNames[fileType]} en tu Drive.`,
            });
          }

          return JSON.stringify({
            type: typeNames[fileType],
            count: files.length,
            files: files.map(f => ({
              id: f.id,
              nombre: f.name,
              link: f.webViewLink,
              modificado: f.modifiedTime?.toLocaleDateString('es-ES'),
              tamaño: f.size,
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to list files by type: ${error.message}`);
          return JSON.stringify({ error: 'Google Drive no conectado o sin permisos.' });
        }
      }

      case 'list_shared_files': {
        try {
          const maxResults = (toolInput.maxResults as number) || 10;
          const files = await this.driveService.listSharedWithMe(userId, maxResults);

          if (files.length === 0) {
            return JSON.stringify({
              message: 'No tienes archivos compartidos contigo.',
            });
          }

          return JSON.stringify({
            count: files.length,
            files: files.map(f => ({
              id: f.id,
              nombre: f.name,
              tipo: this.driveService.getFriendlyTypeName(f.mimeType),
              link: f.webViewLink,
              propietarios: f.owners,
              modificado: f.modifiedTime?.toLocaleDateString('es-ES'),
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to list shared files: ${error.message}`);
          return JSON.stringify({ error: 'Google Drive no conectado o sin permisos.' });
        }
      }

      case 'list_starred_files': {
        try {
          const maxResults = (toolInput.maxResults as number) || 10;
          const files = await this.driveService.listStarredFiles(userId, maxResults);

          if (files.length === 0) {
            return JSON.stringify({
              message: 'No tienes archivos destacados.',
            });
          }

          return JSON.stringify({
            count: files.length,
            files: files.map(f => ({
              id: f.id,
              nombre: f.name,
              tipo: this.driveService.getFriendlyTypeName(f.mimeType),
              link: f.webViewLink,
              modificado: f.modifiedTime?.toLocaleDateString('es-ES'),
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to list starred files: ${error.message}`);
          return JSON.stringify({ error: 'Google Drive no conectado o sin permisos.' });
        }
      }

      case 'get_file_info': {
        try {
          const fileId = toolInput.fileId as string;
          const file = await this.driveService.getFileInfo(userId, fileId);

          if (!file) {
            return JSON.stringify({
              error: 'Archivo no encontrado o sin permisos para acceder.',
            });
          }

          return JSON.stringify({
            id: file.id,
            nombre: file.name,
            tipo: this.driveService.getFriendlyTypeName(file.mimeType),
            descripcion: file.description,
            link: file.webViewLink,
            creado: file.createdTime?.toLocaleDateString('es-ES'),
            modificado: file.modifiedTime?.toLocaleDateString('es-ES'),
            tamaño: file.size,
            propietarios: file.owners,
            compartido: file.shared,
            destacado: file.starred,
            permisos: file.permissions?.map(p => ({
              email: p.email,
              rol: p.role === 'owner' ? 'Propietario' : p.role === 'writer' ? 'Editor' : p.role === 'reader' ? 'Lector' : p.role,
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to get file info: ${error.message}`);
          return JSON.stringify({ error: 'Google Drive no conectado o sin permisos.' });
        }
      }

      case 'get_storage_quota': {
        try {
          const quota = await this.driveService.getStorageQuota(userId);

          return JSON.stringify({
            usado: quota.used,
            total: quota.total,
            usadoEnDrive: quota.usedInDrive,
            enPapelera: quota.usedInTrash,
          });
        } catch (error) {
          this.logger.error(`Failed to get storage quota: ${error.message}`);
          return JSON.stringify({ error: 'Google Drive no conectado o sin permisos.' });
        }
      }

      // Memory Tools
      case 'remember': {
        try {
          const memoryType = toolInput.type as string;
          const content = toolInput.content as string;
          const importance = (toolInput.importance as number) || 5;
          const metadata = toolInput.metadata as Record<string, unknown> || {};

          // Validate memory type
          const validTypes = ['preference', 'contact', 'project', 'personal', 'instruction', 'relationship', 'pattern', 'decision'];
          if (!validTypes.includes(memoryType)) {
            return JSON.stringify({ error: `Tipo de memoria inválido. Usar: ${validTypes.join(', ')}` });
          }

          const memory = await this.memoryService.createMemory(userId, {
            type: memoryType as MemoryType,
            content,
            importance,
            metadata: {
              ...metadata,
              source: 'explicit',
            },
          });

          this.logger.log(`Memory created: ${memory.id} (${memoryType})`);

          return JSON.stringify({
            success: true,
            message: 'Información guardada en memoria',
            memory: {
              id: memory.id,
              type: memory.type,
              content: memory.content,
              importance: memory.importance,
            },
          });
        } catch (error) {
          this.logger.error(`Failed to save memory: ${error.message}`);
          return JSON.stringify({ error: 'No se pudo guardar la información en memoria.' });
        }
      }

      case 'recall': {
        try {
          const query = toolInput.query as string;
          const type = toolInput.type as string | undefined;

          let memories;
          if (type && type !== 'all') {
            memories = await this.memoryService.searchMemories(userId, query, type as MemoryType, 10);
          } else {
            memories = await this.memoryService.searchMemories(userId, query, undefined, 10);
          }

          if (memories.length === 0) {
            return JSON.stringify({
              found: false,
              message: `No encontré información sobre "${query}" en mi memoria.`,
            });
          }

          return JSON.stringify({
            found: true,
            count: memories.length,
            memories: memories.map(m => ({
              id: m.id,
              type: m.type,
              content: m.content,
              importance: m.importance,
              metadata: m.metadata,
              createdAt: m.createdAt,
            })),
          });
        } catch (error) {
          this.logger.error(`Failed to recall memory: ${error.message}`);
          return JSON.stringify({ error: 'Error al buscar en la memoria.' });
        }
      }

      case 'forget': {
        try {
          const query = toolInput.query as string | undefined;
          const memoryId = toolInput.memoryId as string | undefined;

          if (memoryId) {
            const deleted = await this.memoryService.deleteMemory(userId, memoryId);
            if (deleted) {
              return JSON.stringify({ success: true, message: 'Memoria eliminada correctamente.' });
            } else {
              return JSON.stringify({ success: false, message: 'No se encontró esa memoria.' });
            }
          }

          if (query) {
            const count = await this.memoryService.deleteMemoryByContent(userId, query);
            if (count > 0) {
              return JSON.stringify({
                success: true,
                message: `Se eliminaron ${count} memoria(s) relacionadas con "${query}".`,
              });
            } else {
              return JSON.stringify({
                success: false,
                message: `No encontré memorias relacionadas con "${query}".`,
              });
            }
          }

          return JSON.stringify({ error: 'Debes especificar qué olvidar (query o memoryId).' });
        } catch (error) {
          this.logger.error(`Failed to forget memory: ${error.message}`);
          return JSON.stringify({ error: 'Error al eliminar la memoria.' });
        }
      }

      case 'get_memories': {
        try {
          const type = toolInput.type as string | undefined;
          const limit = (toolInput.limit as number) || 20;

          const memories = await this.memoryService.getMemories(
            userId,
            type as MemoryType | undefined,
            limit,
          );

          if (memories.length === 0) {
            return JSON.stringify({
              count: 0,
              message: type
                ? `No tienes memorias de tipo "${type}" guardadas.`
                : 'No tienes memorias guardadas aún.',
            });
          }

          // Group by type for better presentation
          const grouped: Record<string, any[]> = {};
          for (const m of memories) {
            if (!grouped[m.type]) grouped[m.type] = [];
            grouped[m.type].push({
              id: m.id,
              content: m.content,
              importance: m.importance,
              createdAt: m.createdAt,
            });
          }

          return JSON.stringify({
            count: memories.length,
            memoriesByType: grouped,
          });
        } catch (error) {
          this.logger.error(`Failed to get memories: ${error.message}`);
          return JSON.stringify({ error: 'Error al obtener las memorias.' });
        }
      }

      default:
        return JSON.stringify({ error: 'Herramienta no reconocida' });
    }
  }

  private getMimeTypeForDrive(fileType: 'document' | 'spreadsheet' | 'presentation' | 'folder' | 'pdf'): string {
    const mimeTypes: Record<string, string> = {
      document: 'application/vnd.google-apps.document',
      spreadsheet: 'application/vnd.google-apps.spreadsheet',
      presentation: 'application/vnd.google-apps.presentation',
      folder: 'application/vnd.google-apps.folder',
      pdf: 'application/pdf',
    };
    return mimeTypes[fileType];
  }

  async chat(userId: string, dto: ChatMessageDto): Promise<AgentResponseDto> {
    // Get or create conversation
    let conversation: Conversation | null = null;
    if (dto.conversationId) {
      conversation = await this.conversationRepository.findOne({
        where: { id: dto.conversationId, userId },
        relations: ['messages'],
      });
    }

    if (!conversation) {
      conversation = this.conversationRepository.create({
        id: dto.conversationId || uuidv4(),
        userId,
      });
      await this.conversationRepository.save(conversation);
    }

    // Save user message
    const userMessage = this.messageRepository.create({
      role: MessageRole.USER,
      content: dto.message,
      conversationId: conversation.id,
    });
    await this.messageRepository.save(userMessage);

    // Get available AI provider
    const provider = this.aiProviderFactory.getAvailableProvider();

    // If no provider is configured, use fallback
    if (!provider) {
      this.logger.warn('No AI provider available, using fallback');
      return this.fallbackResponse(userId, dto.message, conversation.id);
    }

    this.logger.log(`Using AI provider: ${provider.name}`);

    try {
      // Build message history
      const messages: AIMessage[] = await this.buildMessageHistory(conversation.id);
      const tools = this.getTools();

      // Generate system prompt with relevant memories
      const systemPrompt = await this.getSystemPromptWithMemory(userId, dto.message);

      // Call AI provider with retry on empty response
      let response: AIResponse;
      let retryCount = 0;
      const maxRetries = 2;

      do {
        if (retryCount > 0) {
          this.logger.warn(`Retrying AI call (attempt ${retryCount + 1}/${maxRetries + 1})...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
        response = await provider.chat(messages, systemPrompt, tools);
        retryCount++;
      } while (
        (!response.content || response.content.trim() === '') &&
        response.stopReason !== 'tool_use' &&
        retryCount <= maxRetries
      );

      // Handle tool use loop
      let toolIterations = 0;
      const maxToolIterations = 5;

      while (response.stopReason === 'tool_use' && response.toolCalls && toolIterations < maxToolIterations) {
        toolIterations++;
        this.logger.log(`Tool iteration ${toolIterations}: ${response.toolCalls.map(tc => tc.name).join(', ')}`);

        const toolResults: Array<{ toolCallId: string; result: string }> = [];

        for (const toolCall of response.toolCalls) {
          this.logger.debug(`Executing tool: ${toolCall.name}`);
          const result = await this.executeTool(
            userId,
            toolCall.name,
            toolCall.arguments,
          );
          this.logger.debug(`Tool ${toolCall.name} result: ${result.substring(0, 200)}...`);
          toolResults.push({
            toolCallId: toolCall.id,
            result,
          });
        }

        // Continue conversation with tool results
        this.logger.debug('Calling continueWithToolResults...');
        response = await provider.continueWithToolResults(
          messages,
          systemPrompt,
          tools,
          toolResults,
          response,
        );
        this.logger.debug(`Response after tool: stopReason=${response.stopReason}, hasContent=${!!response.content}, contentLength=${response.content?.length || 0}`);
      }

      // Extract text response - handle empty string case
      let assistantMessage = response.content;
      if (!assistantMessage || assistantMessage.trim() === '') {
        this.logger.error(`AI returned empty response after ${retryCount} retry attempts`);
        // Provide a clear error message to the user
        assistantMessage = '⚠️ Tuve un problema temporal conectando con el servicio. Por favor, intenta de nuevo en unos segundos.';
      }

      // Save assistant message
      const savedAssistantMessage = this.messageRepository.create({
        role: MessageRole.ASSISTANT,
        content: assistantMessage,
        conversationId: conversation.id,
      });
      await this.messageRepository.save(savedAssistantMessage);

      // Update conversation title if first message
      if (!conversation.title) {
        await this.conversationRepository.update(
          { id: conversation.id },
          { title: dto.message.substring(0, 50) }
        );
      }

      return {
        message: assistantMessage,
        conversationId: conversation.id,
        suggestions: this.generateSuggestions(assistantMessage),
      };
    } catch (error) {
      this.logger.error(`Error calling ${provider.name} API:`, error);
      return this.fallbackResponse(userId, dto.message, conversation.id);
    }
  }

  private async buildMessageHistory(conversationId: string): Promise<AIMessage[]> {
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
      take: 20, // Limit history to last 20 messages
    });

    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
  }

  private generateSuggestions(response: string): string[] {
    const suggestions: string[] = [];
    const lowerResponse = response.toLowerCase();

    // Sugerencias contextuales basadas en la respuesta
    if (lowerResponse.includes('creada') || lowerResponse.includes('anotado')) {
      suggestions.push('¿Qué más tengo pendiente?');
      suggestions.push('Crear otra tarea');
    } else if (lowerResponse.includes('completada') || lowerResponse.includes('marcada')) {
      suggestions.push('¿Qué sigue en mi lista?');
      suggestions.push('Dame mi resumen del día');
    } else if (lowerResponse.includes('high') || lowerResponse.includes('urgente')) {
      suggestions.push('Empezar con la más urgente');
      suggestions.push('Ver solo tareas HIGH');
    } else if (lowerResponse.includes('no hay tareas') || lowerResponse.includes('todo al día')) {
      suggestions.push('Crear una tarea nueva');
      suggestions.push('Revisar tareas completadas');
    } else if (lowerResponse.includes('briefing') || lowerResponse.includes('resumen')) {
      suggestions.push('Ver tareas de alta prioridad');
      suggestions.push('Crear una tarea');
    } else {
      // Sugerencias por defecto
      suggestions.push('¿Qué tengo para hoy?');
      suggestions.push('Crear una tarea');
    }

    // Siempre limitar a 3 sugerencias máximo
    return suggestions.slice(0, 3);
  }

  private async fallbackResponse(
    userId: string,
    message: string,
    conversationId: string,
  ): Promise<AgentResponseDto> {
    const lowerMessage = message.toLowerCase();
    let responseMessage: string;
    let suggestions: string[];

    // Detectar intención del usuario
    const quiereTareas = lowerMessage.includes('tarea') ||
                         lowerMessage.includes('pendiente') ||
                         lowerMessage.includes('día') ||
                         lowerMessage.includes('tengo');

    const quiereCrear = lowerMessage.includes('crear') ||
                        lowerMessage.includes('agregar') ||
                        lowerMessage.includes('añadir') ||
                        lowerMessage.includes('nueva');

    const esSaludo = lowerMessage.includes('hola') ||
                     lowerMessage.includes('buenos') ||
                     lowerMessage.includes('buenas') ||
                     lowerMessage.match(/^hey|^hi|^qué tal/);

    if (quiereTareas && !quiereCrear) {
      // Usuario quiere ver sus tareas
      const briefing = await this.tasksService.getTodaysBriefing(userId);

      if (briefing.summary.total === 0) {
        responseMessage = '✨ ¡Todo al día! No tienes tareas pendientes.';
        suggestions = ['Crear una tarea nueva', 'Revisar tareas completadas'];
      } else {
        responseMessage = `📋 Tu día:\n`;
        if (briefing.summary.high > 0) {
          responseMessage += `• 🔴 ${briefing.summary.high} urgente${briefing.summary.high > 1 ? 's' : ''}\n`;
        }
        if (briefing.summary.medium > 0) {
          responseMessage += `• 🟡 ${briefing.summary.medium} importante${briefing.summary.medium > 1 ? 's' : ''}\n`;
        }
        if (briefing.summary.low > 0) {
          responseMessage += `• 🟢 ${briefing.summary.low} puede${briefing.summary.low > 1 ? 'n' : ''} esperar\n`;
        }
        if (briefing.summary.noise > 0) {
          responseMessage += `• ⚪ ${briefing.summary.noise} sin clasificar\n`;
        }

        if (briefing.summary.high > 0) {
          responseMessage += `\n¿Empezamos con las urgentes?`;
        }

        suggestions = ['Ver tareas urgentes', 'Crear una tarea'];
      }
    } else if (quiereCrear) {
      // Usuario quiere crear algo
      responseMessage = '¿Qué tarea quieres crear? Dime el título y te pregunto la prioridad.';
      suggestions = ['Cancelar', 'Ver mis tareas primero'];
    } else if (esSaludo) {
      // Saludo
      const hour = new Date().getHours();
      let greeting = 'Hola';
      if (hour < 12) greeting = 'Buenos días';
      else if (hour < 18) greeting = 'Buenas tardes';
      else greeting = 'Buenas noches';

      responseMessage = `${greeting}. ¿Revisamos tu día o en qué te ayudo?`;
      suggestions = ['¿Qué tengo para hoy?', 'Crear una tarea'];
    } else {
      // Respuesta por defecto
      responseMessage = 'Soy Nexora, tu Chief of Staff Digital. Puedo ayudarte con tus tareas. ¿Qué necesitas?';
      suggestions = ['¿Qué tengo pendiente?', 'Crear una tarea', 'Dame mi resumen del día'];
    }

    // Guardar respuesta
    await this.messageRepository.save(
      this.messageRepository.create({
        role: MessageRole.ASSISTANT,
        content: responseMessage,
        conversationId,
      }),
    );

    return {
      message: responseMessage,
      conversationId,
      suggestions,
    };
  }

  async getConversations(userId: string): Promise<Conversation[]> {
    return this.conversationRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 20,
    });
  }

  async getConversation(userId: string, conversationId: string): Promise<Conversation | null> {
    return this.conversationRepository.findOne({
      where: { id: conversationId, userId },
      relations: ['messages'],
      order: { messages: { createdAt: 'ASC' } },
    });
  }

  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    await this.conversationRepository.delete({ id: conversationId, userId });
  }

  /**
   * Get current AI provider status (for admin/debugging)
   */
  getProviderStatus() {
    return this.aiProviderFactory.getProviderStatus();
  }
}
