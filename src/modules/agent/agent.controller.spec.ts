import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ChatMessageDto, AgentResponseDto } from './dto/agent.dto';

describe('AgentController', () => {
  let controller: AgentController;
  let service: jest.Mocked<AgentService>;

  const mockUserId = 'test-user-id';
  const mockRequest = { user: { userId: mockUserId } };

  beforeEach(async () => {
    const mockAgentService = {
      chat: jest.fn(),
      getConversations: jest.fn(),
      getConversation: jest.fn(),
      deleteConversation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [
        {
          provide: AgentService,
          useValue: mockAgentService,
        },
      ],
    }).compile();

    controller = module.get<AgentController>(AgentController);
    service = module.get(AgentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('chat', () => {
    it('should send a message and return agent response', async () => {
      const dto: ChatMessageDto = {
        message: 'Hola, ¿qué tareas tengo?',
      };

      const expectedResponse: AgentResponseDto = {
        message: 'Tienes 3 tareas pendientes',
        conversationId: 'conv-123',
        suggestions: ['Ver detalles', 'Crear tarea'],
      };

      service.chat.mockResolvedValue(expectedResponse);

      const result = await controller.chat(mockRequest, dto);

      expect(result).toEqual(expectedResponse);
      expect(service.chat).toHaveBeenCalledWith(mockUserId, dto);
    });

    it('should include conversationId when provided', async () => {
      const dto: ChatMessageDto = {
        message: 'Continuar conversación',
        conversationId: 'existing-conv-id',
      };

      const expectedResponse: AgentResponseDto = {
        message: 'Continuando...',
        conversationId: 'existing-conv-id',
      };

      service.chat.mockResolvedValue(expectedResponse);

      const result = await controller.chat(mockRequest, dto);

      expect(result).toEqual(expectedResponse);
      expect(service.chat).toHaveBeenCalledWith(mockUserId, dto);
    });
  });

  describe('getConversations', () => {
    it('should return all user conversations', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'Conv 1', userId: mockUserId },
        { id: 'conv-2', title: 'Conv 2', userId: mockUserId },
      ];

      service.getConversations.mockResolvedValue(mockConversations as any);

      const result = await controller.getConversations(mockRequest);

      expect(result).toEqual(mockConversations);
      expect(service.getConversations).toHaveBeenCalledWith(mockUserId);
    });
  });

  describe('getConversation', () => {
    it('should return a specific conversation with messages', async () => {
      const conversationId = 'conv-123';
      const mockConversation = {
        id: conversationId,
        title: 'Test Conversation',
        userId: mockUserId,
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      service.getConversation.mockResolvedValue(mockConversation as any);

      const result = await controller.getConversation(mockRequest, conversationId);

      expect(result).toEqual(mockConversation);
      expect(service.getConversation).toHaveBeenCalledWith(mockUserId, conversationId);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      const conversationId = 'conv-to-delete';
      service.deleteConversation.mockResolvedValue(undefined);

      await controller.deleteConversation(mockRequest, conversationId);

      expect(service.deleteConversation).toHaveBeenCalledWith(mockUserId, conversationId);
    });
  });
});
