import { Controller, Get, UseGuards, Req, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

@ApiTags('Calendar')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  @ApiOperation({ summary: 'Get calendar events (Coming Soon)' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'List of events' })
  getEvents(
    @Req() req: { user: { userId: string } },
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.calendarService.getEvents(
      req.user.userId,
      startDate ? new Date(startDate) : new Date(),
      endDate ? new Date(endDate) : new Date(),
    );
  }

  @Get('availability')
  @ApiOperation({ summary: 'Get availability for a date (Coming Soon)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiResponse({ status: 200, description: 'Available time slots' })
  getAvailability(
    @Req() req: { user: { userId: string } },
    @Query('date') date?: string,
  ) {
    return this.calendarService.getAvailability(
      req.user.userId,
      date ? new Date(date) : new Date(),
    );
  }
}
