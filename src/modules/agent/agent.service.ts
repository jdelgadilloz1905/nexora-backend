import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessageDto, AgentResponseDto } from './dto/agent.dto';
import { TasksService } from '@/modules/tasks/tasks.service';

@Injectable()
export class AgentService {
  constructor(private readonly tasksService: TasksService) {}

  async chat(userId: string, dto: ChatMessageDto): Promise<AgentResponseDto> {
    const conversationId = dto.conversationId || uuidv4();
    const message = dto.message.toLowerCase();

    // Simple intent detection (will be replaced with LangGraph/LLM later)
    if (
      message.includes('qué tengo') ||
      message.includes('pendiente') ||
      message.includes('hoy')
    ) {
      return this.handleBriefingIntent(userId, conversationId);
    }

    if (message.includes('crear tarea') || message.includes('agregar tarea')) {
      return this.handleCreateTaskIntent(conversationId);
    }

    // Default response
    return {
      message:
        'Entiendo tu mensaje. ¿En qué puedo ayudarte hoy? Puedes preguntarme sobre tus tareas pendientes, crear nuevas tareas, o revisar tu agenda.',
      conversationId,
      suggestions: [
        '¿Qué tengo pendiente hoy?',
        'Crear una tarea nueva',
        '¿Cuántas tareas HIGH tengo?',
      ],
    };
  }

  private async handleBriefingIntent(
    userId: string,
    conversationId: string,
  ): Promise<AgentResponseDto> {
    const briefing = await this.tasksService.getTodaysBriefing(userId);

    let message = 'Buenos días. Tu día:\n\n';

    if (briefing.summary.high > 0) {
      message += `🔴 HIGH (${briefing.summary.high}):\n`;
      briefing.tasks.high.forEach((task) => {
        message += `  • ${task.title}\n`;
      });
      message += '\n';
    }

    if (briefing.summary.medium > 0) {
      message += `🟡 MEDIUM (${briefing.summary.medium}):\n`;
      briefing.tasks.medium.slice(0, 3).forEach((task) => {
        message += `  • ${task.title}\n`;
      });
      message += '\n';
    }

    if (briefing.summary.noise > 0) {
      message += `💭 NOISE (${briefing.summary.noise} pendiente):\n`;
      message += '  ¿Quieres que te muestre los elementos sin clasificar?\n\n';
    }

    if (briefing.summary.total === 0) {
      message = '¡No tienes tareas pendientes! ¿Quieres crear una nueva?';
    } else {
      message += '¿Empezamos con alguna tarea específica?';
    }

    return {
      message,
      conversationId,
      actions:
        briefing.tasks.high.length > 0
          ? [
              {
                type: 'show_task',
                description: `Ver detalles de: ${briefing.tasks.high[0].title}`,
                data: { taskId: briefing.tasks.high[0].id },
              },
            ]
          : undefined,
      suggestions: [
        'Empezar con la primera tarea HIGH',
        'Ver todas las tareas',
        'Crear una tarea nueva',
      ],
    };
  }

  private handleCreateTaskIntent(conversationId: string): AgentResponseDto {
    return {
      message:
        '¿Qué tarea quieres crear? Dime el título y la prioridad (HIGH, MEDIUM, LOW).',
      conversationId,
      suggestions: [
        'Llamar a cliente - HIGH',
        'Revisar presupuesto - MEDIUM',
        'Organizar archivos - LOW',
      ],
    };
  }
}
