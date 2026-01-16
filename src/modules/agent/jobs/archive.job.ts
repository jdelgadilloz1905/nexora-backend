import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ArchiveService } from '../services/archive.service';
import { User } from '@/modules/auth/entities/user.entity';

/**
 * FASE 3: Archive Job
 * Runs daily at 3 AM to archive old messages for all users
 */
@Injectable()
export class ArchiveJob {
  private readonly logger = new Logger(ArchiveJob.name);
  private isRunning = false;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly archiveService: ArchiveService,
  ) {}

  /**
   * Run archive job every day at 3 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleArchive() {
    if (this.isRunning) {
      this.logger.warn('Archive job already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.logger.log('Starting daily archive job...');

    try {
      // Get all users
      const users = await this.userRepository.find({
        select: ['id', 'email'],
      });

      this.logger.log(`Processing ${users.length} users for archiving`);

      let archivedCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          const result = await this.archiveService.archiveOldMessages(user.id);

          if (result.archived) {
            archivedCount++;
            this.logger.log(
              `Archived ${result.messageCount} messages for user ${user.email}`,
            );
          }
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Error archiving messages for user ${user.email}:`,
            error,
          );
        }
      }

      this.logger.log(
        `Archive job completed: ${archivedCount} users archived, ${errorCount} errors`,
      );
    } catch (error) {
      this.logger.error('Archive job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manual trigger for testing
   */
  async runManually(): Promise<{
    processed: number;
    archived: number;
    errors: number;
  }> {
    this.logger.log('Running manual archive job...');

    const users = await this.userRepository.find({
      select: ['id', 'email'],
    });

    let archived = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const result = await this.archiveService.archiveOldMessages(user.id);
        if (result.archived) {
          archived++;
        }
      } catch (error) {
        errors++;
        this.logger.error(`Error for user ${user.email}:`, error);
      }
    }

    return {
      processed: users.length,
      archived,
      errors,
    };
  }
}
