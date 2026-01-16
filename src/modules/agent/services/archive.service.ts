import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Message } from '../entities/message.entity';
import { Conversation } from '../entities/conversation.entity';
import { ConversationHistory } from '../entities/conversation-history.entity';
import { AIProviderFactory, AIMessage } from '../providers';
import { MemoryService } from '@/modules/memory/memory.service';
import { MemoryType } from '@/modules/memory/entities/user-memory.entity';

/**
 * FASE 3: Archive Service
 * Handles archiving of old messages with AI-generated summaries
 */
@Injectable()
export class ArchiveService {
  private readonly logger = new Logger(ArchiveService.name);

  // Configuration
  private readonly ARCHIVE_AFTER_DAYS = 30; // Archive messages older than 30 days
  private readonly MIN_MESSAGES_TO_ARCHIVE = 10; // Don't archive if less than 10 messages

  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationHistory)
    private readonly historyRepository: Repository<ConversationHistory>,
    private readonly aiProviderFactory: AIProviderFactory,
    private readonly memoryService: MemoryService,
  ) {}

  /**
   * Archive old messages for a specific user
   */
  async archiveOldMessages(userId: string): Promise<{
    archived: boolean;
    messageCount?: number;
    periodId?: string;
  }> {
    this.logger.log(`Starting archive process for user ${userId}`);

    // 1. Get user's primary conversation
    const conversation = await this.conversationRepository.findOne({
      where: { userId, isPrimary: true },
    });

    if (!conversation) {
      this.logger.log(`No primary conversation found for user ${userId}`);
      return { archived: false };
    }

    // 2. Get old non-archived messages
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() - this.ARCHIVE_AFTER_DAYS);

    const oldMessages = await this.messageRepository.find({
      where: {
        conversationId: conversation.id,
        archived: false,
        createdAt: LessThan(archiveDate),
      },
      order: { createdAt: 'ASC' },
    });

    if (oldMessages.length < this.MIN_MESSAGES_TO_ARCHIVE) {
      this.logger.log(`Not enough messages to archive for user ${userId} (${oldMessages.length} < ${this.MIN_MESSAGES_TO_ARCHIVE})`);
      return { archived: false };
    }

    this.logger.log(`Found ${oldMessages.length} messages to archive for user ${userId}`);

    // 3. Generate AI summary
    const summary = await this.generateSummary(oldMessages);

    // 4. Extract topics and entities
    const { topics, entities } = await this.extractMetadata(oldMessages);

    // 5. FASE 5: Extract important info to Memory
    await this.extractToMemory(userId, oldMessages, entities);

    // 6. Save to history
    const periodStart = oldMessages[0].createdAt;
    const periodEnd = oldMessages[oldMessages.length - 1].createdAt;

    const historyEntry = this.historyRepository.create({
      userId,
      periodStart,
      periodEnd,
      messagesJson: oldMessages.map(m => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
      messageCount: oldMessages.length,
      summary,
      topics,
      entities,
    });

    await this.historyRepository.save(historyEntry);

    // 7. Mark messages as archived
    const messageIds = oldMessages.map(m => m.id);
    await this.messageRepository.update(
      { id: In(messageIds) },
      { archived: true, archivedAt: new Date() },
    );

    // 8. Update conversation's lastArchivedAt
    await this.conversationRepository.update(
      { id: conversation.id },
      { lastArchivedAt: new Date() },
    );

    this.logger.log(`Archived ${oldMessages.length} messages for user ${userId}, period: ${periodStart.toISOString()} - ${periodEnd.toISOString()}`);

    return {
      archived: true,
      messageCount: oldMessages.length,
      periodId: historyEntry.id,
    };
  }

  /**
   * Generate AI summary of messages
   */
  private async generateSummary(messages: Message[]): Promise<string> {
    const provider = this.aiProviderFactory.getAvailableProvider();

    if (!provider) {
      this.logger.warn('No AI provider available for summary generation');
      return 'Resumen no disponible (sin proveedor de IA)';
    }

    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'Usuario' : 'Nexora'}: ${m.content}`)
      .join('\n\n');

    const systemPrompt = `Eres un asistente que genera resúmenes concisos de conversaciones.
Genera un resumen en español de 2-3 párrafos que incluya:
- Temas principales discutidos
- Decisiones importantes tomadas
- Tareas o pendientes mencionados
- Personas o empresas relevantes mencionadas

Sé conciso pero informativo. El resumen debe permitir entender el contexto general sin leer toda la conversación.`;

    const aiMessages: AIMessage[] = [
      {
        role: 'user',
        content: `Resume la siguiente conversación:\n\n${conversationText}`,
      },
    ];

    try {
      const response = await provider.chat(aiMessages, systemPrompt, []);
      return response.content || 'Resumen no disponible';
    } catch (error) {
      this.logger.error('Error generating summary:', error);
      return 'Resumen no disponible (error de generación)';
    }
  }

  /**
   * Extract topics and entities from messages using AI
   */
  private async extractMetadata(messages: Message[]): Promise<{
    topics: string[];
    entities: {
      contacts: string[];
      projects: string[];
      amounts: string[];
      dates: string[];
      decisions: string[];
    };
  }> {
    const provider = this.aiProviderFactory.getAvailableProvider();

    if (!provider) {
      return {
        topics: [],
        entities: { contacts: [], projects: [], amounts: [], dates: [], decisions: [] },
      };
    }

    const conversationText = messages
      .map(m => `${m.role === 'user' ? 'Usuario' : 'Nexora'}: ${m.content}`)
      .join('\n\n');

    const systemPrompt = `Eres un asistente que extrae información estructurada de conversaciones.
Analiza la conversación y extrae la información en formato JSON exacto.
Responde SOLO con el JSON, sin explicaciones adicionales.`;

    const aiMessages: AIMessage[] = [
      {
        role: 'user',
        content: `Extrae información de esta conversación en el siguiente formato JSON:
{
  "topics": ["tema1", "tema2"],
  "entities": {
    "contacts": ["Nombre - empresa/rol si se menciona"],
    "projects": ["nombre del proyecto"],
    "amounts": ["$1,000 - contexto"],
    "dates": ["fecha - evento relacionado"],
    "decisions": ["decisión tomada"]
  }
}

Conversación:
${conversationText}`,
      },
    ];

    try {
      const response = await provider.chat(aiMessages, systemPrompt, []);
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          topics: parsed.topics || [],
          entities: {
            contacts: parsed.entities?.contacts || [],
            projects: parsed.entities?.projects || [],
            amounts: parsed.entities?.amounts || [],
            dates: parsed.entities?.dates || [],
            decisions: parsed.entities?.decisions || [],
          },
        };
      }
    } catch (error) {
      this.logger.error('Error extracting metadata:', error);
    }

    return {
      topics: [],
      entities: { contacts: [], projects: [], amounts: [], dates: [], decisions: [] },
    };
  }

  /**
   * FASE 5: Extract important information to Memory system
   */
  private async extractToMemory(
    userId: string,
    messages: Message[],
    entities: {
      contacts: string[];
      projects: string[];
      amounts: string[];
      dates: string[];
      decisions: string[];
    },
  ): Promise<void> {
    this.logger.log(`Extracting entities to memory for user ${userId}`);

    // Save contacts to memory
    for (const contact of entities.contacts) {
      try {
        await this.memoryService.createMemory(userId, {
          type: MemoryType.CONTACT,
          content: contact,
          importance: 7,
          metadata: { source: 'conversation' },
        });
      } catch (error) {
        this.logger.warn(`Failed to save contact to memory: ${contact}`);
      }
    }

    // Save projects to memory
    for (const project of entities.projects) {
      try {
        await this.memoryService.createMemory(userId, {
          type: MemoryType.PROJECT,
          content: project,
          importance: 8,
          metadata: { source: 'conversation' },
        });
      } catch (error) {
        this.logger.warn(`Failed to save project to memory: ${project}`);
      }
    }

    // Save important decisions
    for (const decision of entities.decisions) {
      try {
        await this.memoryService.createMemory(userId, {
          type: MemoryType.DECISION,
          content: `Decisión: ${decision}`,
          importance: 6,
          metadata: { source: 'conversation' },
        });
      } catch (error) {
        this.logger.warn(`Failed to save decision to memory: ${decision}`);
      }
    }

    this.logger.log(`Extracted ${entities.contacts.length} contacts, ${entities.projects.length} projects, ${entities.decisions.length} decisions to memory`);
  }

  /**
   * FASE 4: Search in archived conversations
   */
  async searchHistory(
    userId: string,
    query: string,
    options?: { dateFrom?: string; dateTo?: string; limit?: number },
  ): Promise<Array<{
    id: string;
    periodStart: Date;
    periodEnd: Date;
    summary: string;
    topics: string[];
    relevantSnippets: string[];
    messageCount: number;
  }>> {
    const limit = options?.limit || 5;

    // Build the query
    let queryBuilder = this.historyRepository
      .createQueryBuilder('history')
      .where('history.userId = :userId', { userId });

    // Date filters
    if (options?.dateFrom) {
      queryBuilder = queryBuilder.andWhere('history.periodEnd >= :dateFrom', {
        dateFrom: new Date(options.dateFrom),
      });
    }

    if (options?.dateTo) {
      queryBuilder = queryBuilder.andWhere('history.periodStart <= :dateTo', {
        dateTo: new Date(options.dateTo),
      });
    }

    // Text search in summary, topics, and messages
    // Using ILIKE for simple pattern matching (works without full-text setup)
    const searchPattern = `%${query}%`;
    queryBuilder = queryBuilder.andWhere(
      `(history.summary ILIKE :pattern OR
        EXISTS (SELECT 1 FROM unnest(history.topics) AS topic WHERE topic ILIKE :pattern) OR
        history."messagesJson"::text ILIKE :pattern)`,
      { pattern: searchPattern },
    );

    queryBuilder = queryBuilder
      .orderBy('history.periodEnd', 'DESC')
      .limit(limit);

    const results = await queryBuilder.getMany();

    // Extract relevant snippets from each result
    return results.map(result => ({
      id: result.id,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      summary: result.summary,
      topics: result.topics || [],
      messageCount: result.messageCount,
      relevantSnippets: this.extractRelevantSnippets(result.messagesJson, query),
    }));
  }

  /**
   * Extract relevant message snippets that match the query
   */
  private extractRelevantSnippets(
    messages: Array<{ role: string; content: string; createdAt: string }>,
    query: string,
  ): string[] {
    const queryLower = query.toLowerCase();
    const snippets: string[] = [];

    for (const msg of messages) {
      if (msg.content.toLowerCase().includes(queryLower)) {
        // Truncate long messages
        const snippet = msg.content.length > 200
          ? msg.content.substring(0, 200) + '...'
          : msg.content;
        snippets.push(`[${msg.role}] ${snippet}`);

        if (snippets.length >= 3) break; // Max 3 snippets per period
      }
    }

    return snippets;
  }

  /**
   * Get user's archive statistics
   */
  async getArchiveStats(userId: string): Promise<{
    totalPeriods: number;
    totalArchivedMessages: number;
    oldestArchive: Date | null;
    newestArchive: Date | null;
  }> {
    const periods = await this.historyRepository.find({
      where: { userId },
      select: ['id', 'messageCount', 'periodStart', 'archivedAt'],
      order: { periodStart: 'ASC' },
    });

    return {
      totalPeriods: periods.length,
      totalArchivedMessages: periods.reduce((sum, p) => sum + p.messageCount, 0),
      oldestArchive: periods.length > 0 ? periods[0].periodStart : null,
      newestArchive: periods.length > 0 ? periods[periods.length - 1].periodStart : null,
    };
  }
}
