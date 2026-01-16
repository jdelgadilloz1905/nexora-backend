import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserIntegration } from './entities/user-integration.entity';
import { GoogleService } from './google.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleGmailService } from './google-gmail.service';
import { GoogleTasksService } from './google-tasks.service';
import { IntegrationsController } from './integrations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserIntegration]),
    ConfigModule,
  ],
  controllers: [IntegrationsController],
  providers: [
    GoogleService,
    GoogleCalendarService,
    GoogleGmailService,
    GoogleTasksService,
  ],
  exports: [
    GoogleService,
    GoogleCalendarService,
    GoogleGmailService,
    GoogleTasksService,
  ],
})
export class IntegrationsModule {}
