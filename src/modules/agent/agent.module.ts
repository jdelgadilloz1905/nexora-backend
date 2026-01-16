import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { TasksModule } from '@/modules/tasks/tasks.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { MemoryModule } from '@/modules/memory/memory.module';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import {
  AIProviderFactory,
  ClaudeProvider,
  GeminiProvider,
  OpenAIProvider,
} from './providers';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Conversation, Message]),
    TasksModule,
    IntegrationsModule,
    MemoryModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AIProviderFactory,
    ClaudeProvider,
    GeminiProvider,
    OpenAIProvider,
  ],
  exports: [AgentService],
})
export class AgentModule {}
