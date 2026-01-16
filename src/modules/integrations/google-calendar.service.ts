import { Injectable, Logger } from '@nestjs/common';
import { GoogleService } from './google.service';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
  isAllDay: boolean;
  status: string;
  htmlLink?: string;
}

export interface CreateEventDto {
  title: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[];
  isAllDay?: boolean;
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(private readonly googleService: GoogleService) {}

  async getEvents(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<CalendarEvent[]> {
    const calendar = await this.googleService.getCalendarClient(userId);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const events = response.data.items || [];

    return events.map((event) => ({
      id: event.id!,
      title: event.summary || 'Sin título',
      description: event.description || undefined,
      start: new Date(event.start?.dateTime || event.start?.date!),
      end: new Date(event.end?.dateTime || event.end?.date!),
      location: event.location || undefined,
      attendees: event.attendees?.map((a) => a.email!).filter(Boolean),
      isAllDay: !event.start?.dateTime,
      status: event.status || 'confirmed',
      htmlLink: event.htmlLink || undefined,
    }));
  }

  async getTodayEvents(userId: string): Promise<CalendarEvent[]> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    return this.getEvents(userId, startOfDay, endOfDay);
  }

  async getUpcomingEvents(userId: string, days: number = 7): Promise<CalendarEvent[]> {
    const now = new Date();
    const endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.getEvents(userId, now, endDate);
  }

  async createEvent(userId: string, eventData: CreateEventDto): Promise<CalendarEvent> {
    const calendar = await this.googleService.getCalendarClient(userId);

    const eventBody: any = {
      summary: eventData.title,
      description: eventData.description,
      location: eventData.location,
    };

    if (eventData.isAllDay) {
      eventBody.start = { date: eventData.start.toISOString().split('T')[0] };
      eventBody.end = { date: eventData.end.toISOString().split('T')[0] };
    } else {
      eventBody.start = { dateTime: eventData.start.toISOString() };
      eventBody.end = { dateTime: eventData.end.toISOString() };
    }

    if (eventData.attendees?.length) {
      eventBody.attendees = eventData.attendees.map((email) => ({ email }));
    }

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
      sendUpdates: eventData.attendees?.length ? 'all' : 'none',
    });

    const event = response.data;

    this.logger.log(`Event created: ${event.id}`);

    return {
      id: event.id!,
      title: event.summary || eventData.title,
      description: event.description || undefined,
      start: new Date(event.start?.dateTime || event.start?.date!),
      end: new Date(event.end?.dateTime || event.end?.date!),
      location: event.location || undefined,
      attendees: event.attendees?.map((a) => a.email!).filter(Boolean),
      isAllDay: !event.start?.dateTime,
      status: event.status || 'confirmed',
      htmlLink: event.htmlLink || undefined,
    };
  }

  async updateEvent(
    userId: string,
    eventId: string,
    eventData: Partial<CreateEventDto>,
  ): Promise<CalendarEvent> {
    const calendar = await this.googleService.getCalendarClient(userId);

    const updateBody: any = {};

    if (eventData.title) updateBody.summary = eventData.title;
    if (eventData.description) updateBody.description = eventData.description;
    if (eventData.location) updateBody.location = eventData.location;

    if (eventData.start) {
      updateBody.start = eventData.isAllDay
        ? { date: eventData.start.toISOString().split('T')[0] }
        : { dateTime: eventData.start.toISOString() };
    }

    if (eventData.end) {
      updateBody.end = eventData.isAllDay
        ? { date: eventData.end.toISOString().split('T')[0] }
        : { dateTime: eventData.end.toISOString() };
    }

    if (eventData.attendees) {
      updateBody.attendees = eventData.attendees.map((email) => ({ email }));
    }

    this.logger.debug(`Updating event ${eventId} with data: ${JSON.stringify(updateBody)}`);

    try {
      const response = await calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: updateBody,
        sendUpdates: eventData.attendees?.length ? 'all' : 'none',
      });

      const event = response.data;

      this.logger.log(`Event updated: ${eventId}`);
      return {
        id: event.id!,
        title: event.summary || 'Sin título',
        description: event.description || undefined,
        start: new Date(event.start?.dateTime || event.start?.date!),
        end: new Date(event.end?.dateTime || event.end?.date!),
        location: event.location || undefined,
        attendees: event.attendees?.map((a) => a.email!).filter(Boolean),
        isAllDay: !event.start?.dateTime,
        status: event.status || 'confirmed',
        htmlLink: event.htmlLink || undefined,
      };
    } catch (error) {
      this.logger.error(`Failed to update event ${eventId}: ${error.message}`);
      throw error;
    }
  }

  async deleteEvent(userId: string, eventId: string): Promise<void> {
    const calendar = await this.googleService.getCalendarClient(userId);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });

    this.logger.log(`Event deleted: ${eventId}`);
  }

  async getFreeBusy(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ start: Date; end: Date }[]> {
    const calendar = await this.googleService.getCalendarClient(userId);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busy = response.data.calendars?.primary?.busy || [];

    return busy.map((slot) => ({
      start: new Date(slot.start!),
      end: new Date(slot.end!),
    }));
  }
}
