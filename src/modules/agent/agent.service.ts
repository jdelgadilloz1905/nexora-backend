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

const SYSTEM_PROMPT = `Eres Nexora, un asistente ejecutivo digital (Chief of Staff Digital) inteligente y proactivo.

Tu personalidad:
- Profesional pero cercano, como un asistente ejecutivo de confianza
- Eficiente y directo en tus respuestas
- Proactivo: anticipas necesidades y ofreces sugerencias
- Hablas en español

Tus capacidades actuales:
- Gestión de tareas: crear, listar, completar y eliminar tareas
- Las tareas tienen prioridades: HIGH (urgente), MEDIUM (importante), LOW (puede esperar), NOISE (ruido/sin clasificar)

Reglas:
1. Cuando el usuario pida crear una tarea, usa la herramienta create_task
2. Cuando pregunte por sus tareas o pendientes, usa get_tasks
3. Cuando pida completar una tarea, usa complete_task
4. Sé conciso pero informativo
5. Ofrece sugerencias de acciones cuando sea apropiado
6. Si no entiendes algo, pide clarificación

Formato de respuestas:
- Usa viñetas para listas
- Mantén las respuestas cortas y útiles
- Incluye emojis ocasionalmente para hacerlo más amigable`;

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
        messages: [],
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
        conversation.title = dto.message.substring(0, 50);
        await this.conversationRepository.save(conversation);
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

    if (response.includes('tarea') || response.includes('creada')) {
      suggestions.push('Ver mis tareas pendientes');
    }
    if (response.includes('pendiente') || response.includes('HIGH')) {
      suggestions.push('Completar la primera tarea');
    }
    if (!response.includes('crear')) {
      suggestions.push('Crear una nueva tarea');
    }
    suggestions.push('Dame un resumen de mi día');

    return suggestions.slice(0, 3);
  }

  private async fallbackResponse(
    userId: string,
    message: string,
    conversationId: string,
  ): Promise<AgentResponseDto> {
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes('pendiente') ||
      lowerMessage.includes('tareas') ||
      lowerMessage.includes('día')
    ) {
      const briefing = await this.tasksService.getTodaysBriefing(userId);
      let responseMessage = `📋 Tienes ${briefing.summary.total} tareas pendientes:\n\n`;

      if (briefing.summary.high > 0) {
        responseMessage += `🔴 Alta prioridad: ${briefing.summary.high}\n`;
      }
      if (briefing.summary.medium > 0) {
        responseMessage += `🟡 Media prioridad: ${briefing.summary.medium}\n`;
      }
      if (briefing.summary.low > 0) {
        responseMessage += `🟢 Baja prioridad: ${briefing.summary.low}\n`;
      }

      // Save response
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
        suggestions: ['Crear una tarea', 'Ver tareas de alta prioridad'],
      };
    }

    const defaultResponse =
      'Hola, soy Nexora tu asistente digital. Puedo ayudarte a gestionar tus tareas. ¿Qué necesitas?';

    await this.messageRepository.save(
      this.messageRepository.create({
        role: MessageRole.ASSISTANT,
        content: defaultResponse,
        conversationId,
      }),
    );

    return {
      message: defaultResponse,
      conversationId,
      suggestions: [
        '¿Qué tareas tengo pendientes?',
        'Crear una tarea nueva',
        'Dame un resumen de mi día',
      ],
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
