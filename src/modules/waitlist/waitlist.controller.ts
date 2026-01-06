import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JoinWaitlistDto, WaitlistResponseDto } from './dto/waitlist.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

@ApiTags('Waitlist')
@Controller('waitlist')
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @ApiOperation({ summary: 'Join the waitlist' })
  @ApiResponse({
    status: 201,
    description: 'Successfully joined waitlist',
    type: WaitlistResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid email' })
  async join(@Body() dto: JoinWaitlistDto): Promise<WaitlistResponseDto> {
    return this.waitlistService.join(dto);
  }

  @Get('count')
  @ApiOperation({ summary: 'Get waitlist count' })
  @ApiResponse({ status: 200, description: 'Total people on waitlist' })
  async getCount(): Promise<{ count: number }> {
    const count = await this.waitlistService.getCount();
    return { count };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all waitlist entries (admin only)' })
  @ApiResponse({ status: 200, description: 'List of all waitlist entries' })
  async getAll() {
    return this.waitlistService.getAll();
  }
}
