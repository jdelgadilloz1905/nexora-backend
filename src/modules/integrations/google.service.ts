import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google, Auth, calendar_v3, gmail_v1, tasks_v1, people_v1, drive_v3 } from 'googleapis';
import { UserIntegration, IntegrationProvider } from './entities/user-integration.entity';

@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private oauth2Client: Auth.OAuth2Client;
  private readonly scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/tasks.readonly',
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UserIntegration)
    private readonly integrationRepository: Repository<UserIntegration>,
  ) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  getAuthUrl(state: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
      state,
      prompt: 'consent',
    });
  }

  async handleCallback(code: string, userId: string): Promise<UserIntegration> {
    const { tokens } = await this.oauth2Client.getToken(code);

    this.oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    // Save or update integration
    let integration = await this.integrationRepository.findOne({
      where: { userId, provider: IntegrationProvider.GOOGLE },
    });

    if (integration) {
      integration.accessToken = tokens.access_token!;
      integration.refreshToken = tokens.refresh_token || integration.refreshToken;
      if (tokens.expiry_date) {
        integration.tokenExpiresAt = new Date(tokens.expiry_date);
      }
      integration.email = userInfo.email || integration.email;
      integration.scopes = this.scopes;
      integration.isActive = true;
    } else {
      integration = new UserIntegration();
      integration.userId = userId;
      integration.provider = IntegrationProvider.GOOGLE;
      integration.accessToken = tokens.access_token!;
      integration.refreshToken = tokens.refresh_token || '';
      if (tokens.expiry_date) {
        integration.tokenExpiresAt = new Date(tokens.expiry_date);
      }
      integration.email = userInfo.email || '';
      integration.scopes = this.scopes;
      integration.isActive = true;
    }

    await this.integrationRepository.save(integration);
    this.logger.log(`Google integration saved for user ${userId}`);

    return integration;
  }

  async getIntegration(userId: string): Promise<UserIntegration | null> {
    return this.integrationRepository.findOne({
      where: { userId, provider: IntegrationProvider.GOOGLE, isActive: true },
    });
  }

  async getAuthenticatedClient(userId: string): Promise<Auth.OAuth2Client> {
    const integration = await this.getIntegration(userId);

    if (!integration) {
      throw new UnauthorizedException('Google account not connected');
    }

    const client = new google.auth.OAuth2(
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_CLIENT_SECRET'),
      this.configService.get<string>('GOOGLE_REDIRECT_URI'),
    );

    client.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
      expiry_date: integration.tokenExpiresAt?.getTime(),
    });

    // Check if token needs refresh
    if (integration.tokenExpiresAt && integration.tokenExpiresAt < new Date()) {
      try {
        const { credentials } = await client.refreshAccessToken();
        integration.accessToken = credentials.access_token!;
        if (credentials.expiry_date) {
          integration.tokenExpiresAt = new Date(credentials.expiry_date);
        }
        await this.integrationRepository.save(integration);
        client.setCredentials(credentials);
      } catch (error) {
        this.logger.error('Failed to refresh Google token:', error);
        integration.isActive = false;
        await this.integrationRepository.save(integration);
        throw new UnauthorizedException('Google token expired, please reconnect');
      }
    }

    return client;
  }

  async getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
    const auth = await this.getAuthenticatedClient(userId);
    return google.calendar({ version: 'v3', auth });
  }

  async getGmailClient(userId: string): Promise<gmail_v1.Gmail> {
    const auth = await this.getAuthenticatedClient(userId);
    return google.gmail({ version: 'v1', auth });
  }

  async getTasksClient(userId: string): Promise<tasks_v1.Tasks> {
    const auth = await this.getAuthenticatedClient(userId);
    return google.tasks({ version: 'v1', auth });
  }

  async getPeopleClient(userId: string): Promise<people_v1.People> {
    const auth = await this.getAuthenticatedClient(userId);
    return google.people({ version: 'v1', auth });
  }

  async getDriveClient(userId: string): Promise<drive_v3.Drive> {
    const auth = await this.getAuthenticatedClient(userId);
    return google.drive({ version: 'v3', auth });
  }

  async disconnect(userId: string): Promise<void> {
    const integration = await this.getIntegration(userId);
    if (integration) {
      integration.isActive = false;
      await this.integrationRepository.save(integration);
      this.logger.log(`Google integration disconnected for user ${userId}`);
    }
  }

  async revokeAccess(userId: string): Promise<void> {
    const integration = await this.getIntegration(userId);
    if (integration) {
      try {
        await this.oauth2Client.revokeToken(integration.accessToken);
      } catch (error) {
        this.logger.warn('Failed to revoke token:', error);
      }
      await this.integrationRepository.remove(integration);
      this.logger.log(`Google integration revoked for user ${userId}`);
    }
  }
}
