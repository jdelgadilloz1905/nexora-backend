import { Injectable, Logger } from '@nestjs/common';
import { GoogleService } from './google.service';

export interface Contact {
  resourceName: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  photoUrl?: string;
}

@Injectable()
export class GoogleContactsService {
  private readonly logger = new Logger(GoogleContactsService.name);

  constructor(private readonly googleService: GoogleService) {}

  /**
   * Get contacts list with optional pagination
   */
  async getContacts(
    userId: string,
    options: {
      pageSize?: number;
      pageToken?: string;
    } = {},
  ): Promise<{ contacts: Contact[]; nextPageToken?: string }> {
    const people = await this.googleService.getPeopleClient(userId);
    const { pageSize = 50, pageToken } = options;

    const response = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize,
      pageToken,
      personFields: 'names,emailAddresses,phoneNumbers,organizations,photos',
      sortOrder: 'FIRST_NAME_ASCENDING',
    });

    const connections = response.data.connections || [];
    const contacts: Contact[] = connections.map((person) => this.mapPersonToContact(person));

    return {
      contacts,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  /**
   * Search contacts by name or email
   */
  async searchContacts(userId: string, query: string, maxResults: number = 20): Promise<Contact[]> {
    const people = await this.googleService.getPeopleClient(userId);

    try {
      // Try using searchContacts API (requires specific scope)
      const response = await people.people.searchContacts({
        query,
        pageSize: maxResults,
        readMask: 'names,emailAddresses,phoneNumbers,organizations,photos',
      });

      const results = response.data.results || [];
      return results
        .filter((r) => r.person)
        .map((r) => this.mapPersonToContact(r.person!));
    } catch (error) {
      // Fallback: get all contacts and filter locally
      this.logger.warn('searchContacts API failed, using fallback:', error);
      return this.searchContactsFallback(userId, query, maxResults);
    }
  }

  /**
   * Fallback search: fetch contacts and filter locally
   */
  private async searchContactsFallback(
    userId: string,
    query: string,
    maxResults: number,
  ): Promise<Contact[]> {
    const lowerQuery = query.toLowerCase();
    const allContacts: Contact[] = [];
    let pageToken: string | undefined;

    // Fetch up to 200 contacts to search through
    while (allContacts.length < 200) {
      const { contacts, nextPageToken } = await this.getContacts(userId, {
        pageSize: 100,
        pageToken,
      });
      allContacts.push(...contacts);

      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }

    // Filter contacts by query
    const filtered = allContacts.filter((contact) => {
      const nameMatch = contact.name?.toLowerCase().includes(lowerQuery);
      const emailMatch = contact.email?.toLowerCase().includes(lowerQuery);
      const companyMatch = contact.company?.toLowerCase().includes(lowerQuery);
      return nameMatch || emailMatch || companyMatch;
    });

    return filtered.slice(0, maxResults);
  }

  /**
   * Get a specific contact by resource name
   */
  async getContact(userId: string, resourceName: string): Promise<Contact | null> {
    const people = await this.googleService.getPeopleClient(userId);

    try {
      const response = await people.people.get({
        resourceName,
        personFields: 'names,emailAddresses,phoneNumbers,organizations,photos',
      });

      return this.mapPersonToContact(response.data);
    } catch (error) {
      this.logger.warn(`Failed to get contact ${resourceName}:`, error);
      return null;
    }
  }

  /**
   * Get total contacts count
   */
  async getContactsCount(userId: string): Promise<number> {
    const people = await this.googleService.getPeopleClient(userId);

    const response = await people.people.connections.list({
      resourceName: 'people/me',
      pageSize: 1,
      personFields: 'names',
    });

    return response.data.totalPeople || 0;
  }

  /**
   * Map Google People API person to Contact interface
   */
  private mapPersonToContact(person: any): Contact {
    const name = person.names?.[0];
    const email = person.emailAddresses?.[0];
    const phone = person.phoneNumbers?.[0];
    const org = person.organizations?.[0];
    const photo = person.photos?.[0];

    return {
      resourceName: person.resourceName || '',
      name: name?.displayName || '(Sin nombre)',
      email: email?.value,
      phone: phone?.value,
      company: org?.name,
      jobTitle: org?.title,
      photoUrl: photo?.url,
    };
  }
}
