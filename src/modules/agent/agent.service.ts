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
- search_emails: Buscar correos
- send_email: Enviar un correo nuevo
- mark_email_read: Marcar correo como leído

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

## APRENDIZAJE Y CONTEXTO

Nexora aprende y recuerda:
- Contactos frecuentes: Sabe quién es "Pedro" sin apellido
- Proyectos activos: Reconoce "el presupuesto" o "el contrato"
- Preferencias: Horarios preferidos, estilo de comunicación
- Patrones: Reuniones recurrentes, tareas típicas
- Contexto de negocio: Clientes, proyectos, prioridades

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
        description: 'Envía un correo electrónico a través de Gmail.',
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
          },
          required: ['to', 'subject', 'body'],
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
          const ccStr = toolInput.cc as string;
          const cc = ccStr ? ccStr.split(',').map(e => e.trim()) : undefined;
          const result = await this.gmailService.sendEmail(userId, {
            to: toolInput.to as string,
            subject: toolInput.subject as string,
            body: toolInput.body as string,
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

      case 'mark_email_read': {
        try {
          await this.gmailService.markAsRead(userId, toolInput.messageId as string);
          return JSON.stringify({ success: true, message: 'Correo marcado como leído' });
        } catch (error) {
          return JSON.stringify({ error: 'Google no conectado o correo no encontrado.' });
        }
      }

      default:
        return JSON.stringify({ error: 'Herramienta no reconocida' });
    }
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
      const systemPrompt = getSystemPrompt(); // Generate prompt with current date/time

      // Call AI provider
      let response = await provider.chat(messages, systemPrompt, tools);

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
        this.logger.warn('AI returned empty response after tool execution');
        // If we had tool results, try to generate a fallback based on them
        assistantMessage = 'Lo siento, no pude procesar tu solicitud. Por favor intenta de nuevo.';
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
