import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, In } from 'typeorm';
import { UserMemory, MemoryType, MemoryMetadata } from './entities/user-memory.entity';
import { CreateMemoryDto, UpdateMemoryDto } from './dto/create-memory.dto';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(UserMemory)
    private readonly memoryRepository: Repository<UserMemory>,
  ) {}

  /**
   * Create a new memory for a user
   */
  async createMemory(
    userId: string,
    dto: CreateMemoryDto,
  ): Promise<UserMemory> {
    // Check for duplicate content to avoid storing the same memory twice
    const existing = await this.memoryRepository.findOne({
      where: {
        userId,
        type: dto.type,
        content: dto.content,
        isActive: true,
      },
    });

    if (existing) {
      this.logger.debug(`Memory already exists: ${existing.id}`);
      // Update access count and return existing
      existing.accessCount += 1;
      existing.lastAccessed = new Date();
      return this.memoryRepository.save(existing);
    }

    const memory = this.memoryRepository.create({
      userId,
      type: dto.type,
      content: dto.content,
      importance: dto.importance || 5,
      metadata: {
        ...dto.metadata,
        source: dto.metadata?.source || 'explicit',
      },
    });

    const saved = await this.memoryRepository.save(memory);
    this.logger.log(`Memory created: ${saved.id} (${dto.type})`);
    return saved;
  }

  /**
   * Get all memories for a user, optionally filtered by type
   */
  async getMemories(
    userId: string,
    type?: MemoryType,
    limit: number = 50,
  ): Promise<UserMemory[]> {
    const where: any = { userId, isActive: true };
    if (type) {
      where.type = type;
    }

    return this.memoryRepository.find({
      where,
      order: {
        importance: 'DESC',
        lastAccessed: 'DESC',
        createdAt: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Search memories by content (simple text search)
   */
  async searchMemories(
    userId: string,
    query: string,
    type?: MemoryType,
    limit: number = 20,
  ): Promise<UserMemory[]> {
    const queryBuilder = this.memoryRepository
      .createQueryBuilder('memory')
      .where('memory.userId = :userId', { userId })
      .andWhere('memory.isActive = :isActive', { isActive: true })
      .andWhere('LOWER(memory.content) LIKE LOWER(:query)', {
        query: `%${query}%`,
      });

    if (type) {
      queryBuilder.andWhere('memory.type = :type', { type });
    }

    const memories = await queryBuilder
      .orderBy('memory.importance', 'DESC')
      .addOrderBy('memory.lastAccessed', 'DESC')
      .take(limit)
      .getMany();

    // Update access stats for found memories
    if (memories.length > 0) {
      await this.memoryRepository.update(
        { id: In(memories.map((m) => m.id)) },
        {
          lastAccessed: new Date(),
          accessCount: () => 'accessCount + 1',
        },
      );
    }

    return memories;
  }

  /**
   * Get relevant memories for a given context
   * Used to inject into system prompt
   */
  async getRelevantMemories(
    userId: string,
    context?: string,
    maxMemories: number = 10,
  ): Promise<UserMemory[]> {
    // Start with high-importance memories
    const highImportance = await this.memoryRepository.find({
      where: {
        userId,
        isActive: true,
        importance: 8, // 8+ importance
      },
      order: { importance: 'DESC', lastAccessed: 'DESC' },
      take: 5,
    });

    // Get recently accessed memories
    const recentlyAccessed = await this.memoryRepository.find({
      where: {
        userId,
        isActive: true,
      },
      order: { lastAccessed: 'DESC' },
      take: 5,
    });

    // If context provided, search for related memories
    let contextRelated: UserMemory[] = [];
    if (context) {
      contextRelated = await this.searchMemories(userId, context, undefined, 5);
    }

    // Combine and deduplicate
    const allMemories = [...highImportance, ...recentlyAccessed, ...contextRelated];
    const uniqueMemories = allMemories.filter(
      (memory, index, self) =>
        index === self.findIndex((m) => m.id === memory.id),
    );

    // Sort by importance and return top N
    return uniqueMemories
      .sort((a, b) => b.importance - a.importance)
      .slice(0, maxMemories);
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(userId: string, memoryId: string): Promise<UserMemory | null> {
    const memory = await this.memoryRepository.findOne({
      where: { id: memoryId, userId, isActive: true },
    });

    if (memory) {
      memory.accessCount += 1;
      memory.lastAccessed = new Date();
      await this.memoryRepository.save(memory);
    }

    return memory;
  }

  /**
   * Update a memory
   */
  async updateMemory(
    userId: string,
    memoryId: string,
    dto: UpdateMemoryDto,
  ): Promise<UserMemory | null> {
    const memory = await this.memoryRepository.findOne({
      where: { id: memoryId, userId },
    });

    if (!memory) {
      return null;
    }

    if (dto.content !== undefined) memory.content = dto.content;
    if (dto.importance !== undefined) memory.importance = dto.importance;
    if (dto.isActive !== undefined) memory.isActive = dto.isActive;
    if (dto.metadata) {
      memory.metadata = { ...memory.metadata, ...dto.metadata };
    }

    return this.memoryRepository.save(memory);
  }

  /**
   * Delete (soft delete) a memory
   */
  async deleteMemory(userId: string, memoryId: string): Promise<boolean> {
    const result = await this.memoryRepository.update(
      { id: memoryId, userId },
      { isActive: false },
    );
    return result.affected ? result.affected > 0 : false;
  }

  /**
   * Delete memory by content search (for "forget" command)
   */
  async deleteMemoryByContent(userId: string, query: string): Promise<number> {
    const memories = await this.searchMemories(userId, query, undefined, 5);

    if (memories.length === 0) {
      return 0;
    }

    const result = await this.memoryRepository.update(
      { id: In(memories.map((m) => m.id)) },
      { isActive: false },
    );

    return result.affected || 0;
  }

  /**
   * Get memory statistics for a user
   */
  async getMemoryStats(userId: string): Promise<{
    total: number;
    byType: Record<MemoryType, number>;
    avgImportance: number;
  }> {
    const memories = await this.memoryRepository.find({
      where: { userId, isActive: true },
    });

    const byType = {} as Record<MemoryType, number>;
    let totalImportance = 0;

    for (const memory of memories) {
      byType[memory.type] = (byType[memory.type] || 0) + 1;
      totalImportance += memory.importance;
    }

    return {
      total: memories.length,
      byType,
      avgImportance: memories.length > 0 ? totalImportance / memories.length : 0,
    };
  }

  /**
   * Export all memories for a user (GDPR compliance)
   */
  async exportMemories(userId: string): Promise<UserMemory[]> {
    return this.memoryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Delete all memories for a user (GDPR compliance)
   */
  async deleteAllMemories(userId: string): Promise<number> {
    const result = await this.memoryRepository.delete({ userId });
    this.logger.log(`Deleted all memories for user ${userId}`);
    return result.affected || 0;
  }

  /**
   * Find contact by name or email
   */
  async findContact(
    userId: string,
    searchTerm: string,
  ): Promise<UserMemory | null> {
    const contacts = await this.memoryRepository
      .createQueryBuilder('memory')
      .where('memory.userId = :userId', { userId })
      .andWhere('memory.type = :type', { type: MemoryType.CONTACT })
      .andWhere('memory.isActive = :isActive', { isActive: true })
      .andWhere(
        '(LOWER(memory.content) LIKE LOWER(:search) OR ' +
          "LOWER(memory.metadata->>'email') LIKE LOWER(:search) OR " +
          "LOWER(memory.metadata->>'company') LIKE LOWER(:search))",
        { search: `%${searchTerm}%` },
      )
      .orderBy('memory.importance', 'DESC')
      .getOne();

    if (contacts) {
      contacts.accessCount += 1;
      contacts.lastAccessed = new Date();
      await this.memoryRepository.save(contacts);
    }

    return contacts;
  }

  /**
   * Get user preferences by category
   */
  async getPreferences(
    userId: string,
    category?: string,
  ): Promise<UserMemory[]> {
    const queryBuilder = this.memoryRepository
      .createQueryBuilder('memory')
      .where('memory.userId = :userId', { userId })
      .andWhere('memory.type = :type', { type: MemoryType.PREFERENCE })
      .andWhere('memory.isActive = :isActive', { isActive: true });

    if (category) {
      queryBuilder.andWhere("memory.metadata->>'category' = :category", {
        category,
      });
    }

    return queryBuilder.orderBy('memory.importance', 'DESC').getMany();
  }
}
