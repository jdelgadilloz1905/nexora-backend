import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentService } from './agent.service';
import { TasksService } from '@/modules/tasks/tasks.service';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';
import { Priority } from '@/common/constants/priorities';
import { TaskStatus } from '@/common/constants/status';

describe('AgentService', () => {
  let service: AgentService;
  let tasksService: jest.Mocked<TasksService>;
  let conversationRepository: jest.Mocked<Repository<Conversation>>;
  let messageRepository: jest.Mocked<Repository<Message>>;

  const mockUserId = 'test-user-id';
  const mockConversationId = 'test-conversation-id';

  const mockConversation: Partial<Conversation> = {
    id: mockConversationId,
    userId: mockUserId,
    title: 'Test Conversation',
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMessage: Partial<Message> = {
    id: 'test-message-id',
    role: MessageRole.USER,
    content: 'Test message',
    conversationId: mockConversationId,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockTasksService = {
      findAll: jest.fn(),
      create: jest.fn(),
      complete: jest.fn(),
      getTodaysBriefing: jest.fn(),
    };

    const mockConversationRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const mockMessageRepo = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(null), // No API key for testing fallback
          },
        },
        {
          provide: TasksService,
          useValue: mockTasksService,
        },
        {
          provide: getRepositoryToken(Conversation),
          useValue: mockConversationRepo,
        },
        {
          provide: getRepositoryToken(Message),
          useValue: mockMessageRepo,
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
    tasksService = module.get(TasksService);
    conversationRepository = module.get(getRepositoryToken(Conversation));
    messageRepository = module.get(getRepositoryToken(Message));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chat', () => {
    beforeEach(() => {
      conversationRepository.create.mockReturnValue(mockConversation as Conversation);
      conversationRepository.save.mockResolvedValue(mockConversation as Conversation);
      messageRepository.create.mockReturnValue(mockMessage as Message);
      messageRepository.save.mockResolvedValue(mockMessage as Message);
      messageRepository.find.mockResolvedValue([]); // Mock message history
    });

    it('should create a new conversation when no conversationId is provided', async () => {
      conversationRepository.findOne.mockResolvedValue(null);

      const result = await service.chat(mockUserId, {
        message: 'Hola',
      });

      expect(result).toBeDefined();
      expect(result.conversationId).toBeDefined();
      expect(result.message).toBeDefined();
      expect(conversationRepository.create).toHaveBeenCalled();
      expect(conversationRepository.save).toHaveBeenCalled();
    });

    it('should use existing conversation when conversationId is provided', async () => {
      conversationRepository.findOne.mockResolvedValue(mockConversation as Conversation);

      const result = await service.chat(mockUserId, {
        message: 'Hola',
        conversationId: mockConversationId,
      });

      expect(result).toBeDefined();
      expect(conversationRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockConversationId, userId: mockUserId },
        relations: ['messages'],
      });
    });

    it('should use fallback response when asking about tasks (no API key)', async () => {
      conversationRepository.findOne.mockResolvedValue(null);
      tasksService.getTodaysBriefing.mockResolvedValue({
        date: new Date().toISOString(),
        tasks: {
          high: [],
          medium: [],
          low: [],
          noise: [],
        },
        summary: {
          total: 5,
          high: 2,
          medium: 2,
          low: 1,
          noise: 0,
        },
      });

      const result = await service.chat(mockUserId, {
        message: '¿Qué tareas tengo pendientes?',
      });

      expect(result.message).toContain('5 tareas pendientes');
      expect(tasksService.getTodaysBriefing).toHaveBeenCalledWith(mockUserId);
    });

    it('should return default fallback response for general messages', async () => {
      conversationRepository.findOne.mockResolvedValue(null);

      const result = await service.chat(mockUserId, {
        message: 'Hola',
      });

      expect(result.message).toContain('Nexora');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.length).toBeGreaterThan(0);
    });
  });

  describe('getConversations', () => {
    it('should return user conversations ordered by updatedAt', async () => {
      const mockConversations = [
        { ...mockConversation, id: '1' },
        { ...mockConversation, id: '2' },
      ] as Conversation[];

      conversationRepository.find.mockResolvedValue(mockConversations);

      const result = await service.getConversations(mockUserId);

      expect(result).toEqual(mockConversations);
      expect(conversationRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        order: { updatedAt: 'DESC' },
        take: 20,
      });
    });
  });

  describe('getConversation', () => {
    it('should return a specific conversation with messages', async () => {
      const conversationWithMessages = {
        ...mockConversation,
        messages: [mockMessage],
      } as Conversation;

      conversationRepository.findOne.mockResolvedValue(conversationWithMessages);

      const result = await service.getConversation(mockUserId, mockConversationId);

      expect(result).toEqual(conversationWithMessages);
      expect(conversationRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockConversationId, userId: mockUserId },
        relations: ['messages'],
        order: { messages: { createdAt: 'ASC' } },
      });
    });

    it('should return null when conversation not found', async () => {
      conversationRepository.findOne.mockResolvedValue(null);

      const result = await service.getConversation(mockUserId, 'non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      conversationRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.deleteConversation(mockUserId, mockConversationId);

      expect(conversationRepository.delete).toHaveBeenCalledWith({
        id: mockConversationId,
        userId: mockUserId,
      });
    });
  });
});
