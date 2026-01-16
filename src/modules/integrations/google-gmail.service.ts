import { Injectable, Logger } from '@nestjs/common';
import { GoogleService } from './google.service';

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  snippet: string;
  body?: string;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
}

export interface SendEmailDto {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}

@Injectable()
export class GoogleGmailService {
  private readonly logger = new Logger(GoogleGmailService.name);

  constructor(private readonly googleService: GoogleService) {}

  async getEmails(
    userId: string,
    options: {
      maxResults?: number;
      query?: string;
      labelIds?: string[];
    } = {},
  ): Promise<EmailMessage[]> {
    const gmail = await this.googleService.getGmailClient(userId);
    const { maxResults = 20, query, labelIds } = options;

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: query,
      labelIds,
    });

    const messages = response.data.messages || [];
    const emails: EmailMessage[] = [];

    for (const msg of messages.slice(0, maxResults)) {
      try {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        });

        const headers = detail.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

        emails.push({
          id: msg.id!,
          threadId: msg.threadId!,
          from: getHeader('From'),
          to: getHeader('To').split(',').map((e) => e.trim()),
          subject: getHeader('Subject') || '(Sin asunto)',
          snippet: detail.data.snippet || '',
          date: new Date(getHeader('Date')),
          isRead: !detail.data.labelIds?.includes('UNREAD'),
          isStarred: detail.data.labelIds?.includes('STARRED') || false,
          labels: detail.data.labelIds || [],
        });
      } catch (error) {
        this.logger.warn(`Failed to get email ${msg.id}:`, error);
      }
    }

    return emails;
  }

  async getUnreadEmails(userId: string, maxResults: number = 10): Promise<EmailMessage[]> {
    return this.getEmails(userId, {
      maxResults,
      query: 'is:unread',
      labelIds: ['INBOX'],
    });
  }

  async getInboxEmails(userId: string, maxResults: number = 20): Promise<EmailMessage[]> {
    return this.getEmails(userId, {
      maxResults,
      labelIds: ['INBOX'],
    });
  }

  async getEmailDetail(userId: string, messageId: string): Promise<EmailMessage & { body: string }> {
    const gmail = await this.googleService.getGmailClient(userId);

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    // Extract body
    let body = '';
    const extractBody = (part: any): string => {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts) {
        for (const subPart of part.parts) {
          const result = extractBody(subPart);
          if (result) return result;
        }
      }
      return '';
    };

    if (message.payload) {
      body = extractBody(message.payload);
      if (!body && message.payload.body?.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      }
    }

    return {
      id: message.id!,
      threadId: message.threadId!,
      from: getHeader('From'),
      to: getHeader('To').split(',').map((e) => e.trim()),
      subject: getHeader('Subject') || '(Sin asunto)',
      snippet: message.snippet || '',
      body,
      date: new Date(getHeader('Date')),
      isRead: !message.labelIds?.includes('UNREAD'),
      isStarred: message.labelIds?.includes('STARRED') || false,
      labels: message.labelIds || [],
    };
  }

  async sendEmail(userId: string, emailData: SendEmailDto): Promise<{ id: string; threadId: string }> {
    const gmail = await this.googleService.getGmailClient(userId);

    const to = Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to;

    let emailContent = [
      `To: ${to}`,
      `Subject: ${emailData.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailData.body,
    ];

    if (emailData.cc?.length) {
      emailContent.splice(1, 0, `Cc: ${emailData.cc.join(', ')}`);
    }
    if (emailData.bcc?.length) {
      emailContent.splice(1, 0, `Bcc: ${emailData.bcc.join(', ')}`);
    }

    const raw = Buffer.from(emailContent.join('\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    this.logger.log(`Email sent: ${response.data.id}`);

    return {
      id: response.data.id!,
      threadId: response.data.threadId!,
    };
  }

  async markAsRead(userId: string, messageId: string): Promise<void> {
    const gmail = await this.googleService.getGmailClient(userId);

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    });

    this.logger.log(`Email marked as read: ${messageId}`);
  }

  async markAsUnread(userId: string, messageId: string): Promise<void> {
    const gmail = await this.googleService.getGmailClient(userId);

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['UNREAD'],
      },
    });
  }

  async starEmail(userId: string, messageId: string): Promise<void> {
    const gmail = await this.googleService.getGmailClient(userId);

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: ['STARRED'],
      },
    });
  }

  async archiveEmail(userId: string, messageId: string): Promise<void> {
    const gmail = await this.googleService.getGmailClient(userId);

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    });

    this.logger.log(`Email archived: ${messageId}`);
  }

  async deleteEmail(userId: string, messageId: string): Promise<void> {
    const gmail = await this.googleService.getGmailClient(userId);

    await gmail.users.messages.trash({
      userId: 'me',
      id: messageId,
    });

    this.logger.log(`Email deleted: ${messageId}`);
  }

  async searchEmails(userId: string, query: string, maxResults: number = 20): Promise<EmailMessage[]> {
    return this.getEmails(userId, { query, maxResults });
  }
}
