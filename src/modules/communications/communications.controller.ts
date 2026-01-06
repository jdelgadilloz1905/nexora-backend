import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CommunicationsService } from './communications.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

@ApiTags('Communications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('communications')
export class CommunicationsController {
  constructor(private readonly communicationsService: CommunicationsService) {}

  @Get('emails')
  @ApiOperation({ summary: 'Get user emails (Coming Soon)' })
  @ApiResponse({ status: 200, description: 'List of emails' })
  getEmails(@Req() req: { user: { userId: string } }) {
    return this.communicationsService.getEmails(req.user.userId);
  }
}
