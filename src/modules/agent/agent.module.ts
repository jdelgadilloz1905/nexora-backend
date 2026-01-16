import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { ArchiveService } from './services/archive.service';
import { ArchiveJob } from './jobs/archive.job';
import { TasksModule } from '@/modules/tasks/tasks.module';
import { IntegrationsModule } from '@/modules/integrations/integrations.module';
import { MemoryModule } from '@/modules/memory/memory.module';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { ConversationHistory } from './entities/conversation-history.entity';
import { User } from '@/modules/auth/entities/user.entity';
import {
  AIProviderFactory,
  ClaudeProvider,
  GeminiProvider,
  OpenAIProvider,
} from './providers';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Conversation, Message, ConversationHistory, User]),
    TasksModule,
    IntegrationsModule,
    MemoryModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    ArchiveService,
    ArchiveJob,
    AIProviderFactory,
    ClaudeProvider,
    GeminiProvider,
    OpenAIProvider,
  ],
  exports: [AgentService, ArchiveService],
})
export class AgentModule {}
