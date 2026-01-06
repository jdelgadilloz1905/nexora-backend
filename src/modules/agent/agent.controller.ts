import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AgentService } from './agent.service';
import { ChatMessageDto, AgentResponseDto } from './dto/agent.dto';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

@ApiTags('Agent')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a message to the AI agent' })
  @ApiResponse({ status: 200, type: AgentResponseDto })
  chat(
    @Req() req: { user: { userId: string } },
    @Body() dto: ChatMessageDto,
  ): Promise<AgentResponseDto> {
    return this.agentService.chat(req.user.userId, dto);
  }
}
