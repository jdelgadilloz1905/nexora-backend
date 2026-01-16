import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UserIntegration } from './entities/user-integration.entity';
import { GoogleService } from './google.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleGmailService } from './google-gmail.service';
import { GoogleTasksService } from './google-tasks.service';
import { GoogleContactsService } from './google-contacts.service';
import { GoogleDriveService } from './google-drive.service';
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
    GoogleContactsService,
    GoogleDriveService,
  ],
  exports: [
    GoogleService,
    GoogleCalendarService,
    GoogleGmailService,
    GoogleTasksService,
    GoogleContactsService,
    GoogleDriveService,
  ],
})
export class IntegrationsModule {}
