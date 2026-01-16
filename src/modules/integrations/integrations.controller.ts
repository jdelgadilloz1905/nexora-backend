import {
  Controller,
  Get,
  Delete,
  Query,
  Res,
  Req,
  UseGuards,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoogleService } from './google.service';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleGmailService } from './google-gmail.service';
import { ConfigService } from '@nestjs/config';

@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly googleService: GoogleService,
    private readonly calendarService: GoogleCalendarService,
    private readonly gmailService: GoogleGmailService,
    private readonly configService: ConfigService,
  ) {}

  // ==================== Google OAuth ====================

  @Get('google/auth-url')
  @UseGuards(JwtAuthGuard)
  async getGoogleAuthUrl(@Req() req: { user: { userId: string } }) {
    const authUrl = this.googleService.getAuthUrl(req.user.userId);
    return { authUrl };
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    if (error) {
      this.logger.error(`Google OAuth error: ${error}`);
      return res.redirect(`${frontendUrl}/app/settings?google_error=${error}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/app/settings?google_error=missing_params`);
    }

    try {
      const userId = state;
      await this.googleService.handleCallback(code, userId);
      this.logger.log(`Google connected for user: ${userId}`);
      return res.redirect(`${frontendUrl}/app/settings?google_connected=true`);
    } catch (err) {
      this.logger.error('Google callback error:', err);
      return res.redirect(`${frontendUrl}/app/settings?google_error=callback_failed`);
    }
  }

  @Delete('google/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectGoogle(@Req() req: { user: { userId: string } }) {
    await this.googleService.disconnect(req.user.userId);
    return { message: 'Google disconnected successfully' };
  }

  @Get('google/status')
  @UseGuards(JwtAuthGuard)
  async getGoogleStatus(@Req() req: { user: { userId: string } }) {
    const integration = await this.googleService.getIntegration(req.user.userId);
    return {
      connected: !!integration,
      email: integration?.email || null,
      scopes: integration?.scopes || [],
    };
  }

  // ==================== Calendar Endpoints ====================

  @Get('calendar/events')
  @UseGuards(JwtAuthGuard)
  async getCalendarEvents(
    @Req() req: { user: { userId: string } },
    @Query('timeMin') timeMin?: string,
    @Query('timeMax') timeMax?: string,
  ) {
    const startDate = timeMin ? new Date(timeMin) : new Date();
    const endDate = timeMax ? new Date(timeMax) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const events = await this.calendarService.getEvents(req.user.userId, startDate, endDate);
    return { events };
  }

  @Get('calendar/today')
  @UseGuards(JwtAuthGuard)
  async getTodayEvents(@Req() req: { user: { userId: string } }) {
    const events = await this.calendarService.getTodayEvents(req.user.userId);
    return { events };
  }

  @Get('calendar/upcoming')
  @UseGuards(JwtAuthGuard)
  async getUpcomingEvents(
    @Req() req: { user: { userId: string } },
    @Query('days') days?: string,
  ) {
    const events = await this.calendarService.getUpcomingEvents(
      req.user.userId,
      days ? parseInt(days, 10) : undefined,
    );
    return { events };
  }

  // ==================== Gmail Endpoints ====================

  @Get('gmail/inbox')
  @UseGuards(JwtAuthGuard)
  async getInboxEmails(
    @Req() req: { user: { userId: string } },
    @Query('maxResults') maxResults?: string,
  ) {
    const emails = await this.gmailService.getInboxEmails(
      req.user.userId,
      maxResults ? parseInt(maxResults, 10) : undefined,
    );
    return { emails };
  }

  @Get('gmail/unread')
  @UseGuards(JwtAuthGuard)
  async getUnreadEmails(
    @Req() req: { user: { userId: string } },
    @Query('maxResults') maxResults?: string,
  ) {
    const emails = await this.gmailService.getUnreadEmails(
      req.user.userId,
      maxResults ? parseInt(maxResults, 10) : undefined,
    );
    return { emails };
  }

  @Get('gmail/search')
  @UseGuards(JwtAuthGuard)
  async searchEmails(
    @Req() req: { user: { userId: string } },
    @Query('q') query: string,
    @Query('maxResults') maxResults?: string,
  ) {
    const emails = await this.gmailService.searchEmails(
      req.user.userId,
      query,
      maxResults ? parseInt(maxResults, 10) : undefined,
    );
    return { emails };
  }
}
