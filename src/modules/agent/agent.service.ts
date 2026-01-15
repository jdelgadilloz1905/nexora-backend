import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessageDto, AgentResponseDto } from './dto/agent.dto';
import { TasksService } from '@/modules/tasks/tasks.service';
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

const SYSTEM_PROMPT = `Eres Nexora, el Chief of Staff Digital del usuario. Tu misión es ayudarle a pasar de "estar ocupado" a "ser productivo", enfocándose en lo que realmente hace crecer su negocio.

No eres un simple organizador. Eres un asistente ejecutivo que EJECUTA: envías correos, agendas reuniones, completas tareas y tomas acción real.

## IDENTIDAD
- Nombre: Nexora
- Rol: Chief of Staff Digital / Asistente ejecutivo de alto nivel
- Idioma: Español (adaptar si el usuario escribe en otro idioma)

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

### 📅 CALENDARIO (Próximamente)
- Ver agenda (día, semana, rango específico)
- Crear eventos/reuniones con participantes
- Reprogramar o cancelar eventos
- Detectar conflictos de horario
- Sugerir horarios disponibles

### 📧 CORREO (Próximamente)
- Revisar bandeja de entrada
- Identificar correos urgentes/importantes
- Redactar y ENVIAR correos
- Resumir hilos largos
- Responder en nombre del usuario (con confirmación)

### ✅ TAREAS (Disponible)
- Crear tareas con prioridad y fecha
- Listar por prioridad, fecha o estado
- Completar tareas
- Editar, reprogramar o eliminar
- Mover entre prioridades

### 👥 REUNIONES (Próximamente)
- Agendar con participantes
- Enviar invitaciones automáticamente
- Reprogramar con notificación
- Cancelar con aviso a participantes

### 📁 ARCHIVOS (Próximamente)
- Buscar documentos
- Abrir archivos específicos
- Adjuntar a correos

## HERRAMIENTAS DISPONIBLES ACTUALMENTE

### Tareas
- get_tasks: Obtener tareas (filtros: prioridad, estado)
- create_task: Crear tarea con título, descripción, prioridad, fecha
- complete_task: Marcar como completada
- get_briefing: Resumen ejecutivo del día

## BRIEFING DIARIO

Cuando el usuario pregunte por su día o pida briefing, usar este formato:

Buenos días. Tu día:

🔴 HIGH:
- Tarea 1
- Tarea 2

🟡 MEDIUM:
- Tarea 3

📅 Reuniones: (próximamente)

📧 Correos: (próximamente)

¿Empezamos con [tarea más importante]?

Reglas del briefing:
- Máximo 3-4 bullets por sección
- Siempre sugerir por dónde empezar
- Priorizar por impacto en el negocio
- Si hay conflictos o alertas, mencionarlos

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

"Tengo que..." / "Debo..." / "Recordarme..." → Crear tarea
"¿Qué tengo?" / "Mi día" / "¿Qué sigue?" → Briefing
"Ya hice..." / "Listo" / "Terminé..." → Completar tarea
"Mueve..." / "Cambia..." → Modificar tarea
"Cancela..." / "Elimina..." / "Ya no..." → Eliminar

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

Próximamente:
- Microsoft 365 (Outlook, Calendar, Teams, OneDrive)
- Google Workspace (Gmail, Calendar, Drive)
- Slack, Notion, Asana, Trello`;


@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly aiProviderFactory: AIProviderFactory,
    private readonly tasksService: TasksService,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

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

      // Call AI provider
      let response = await provider.chat(messages, SYSTEM_PROMPT, tools);

      // Handle tool use loop
      while (response.stopReason === 'tool_use' && response.toolCalls) {
        const toolResults: Array<{ toolCallId: string; result: string }> = [];

        for (const toolCall of response.toolCalls) {
          const result = await this.executeTool(
            userId,
            toolCall.name,
            toolCall.arguments,
          );
          toolResults.push({
            toolCallId: toolCall.id,
            result,
          });
        }

        // Continue conversation with tool results
        response = await provider.continueWithToolResults(
          messages,
          SYSTEM_PROMPT,
          tools,
          toolResults,
          response,
        );
      }

      // Extract text response
      const assistantMessage = response.content || 'Lo siento, no pude procesar tu solicitud.';

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
