import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
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

  @Get('conversations')
  @ApiOperation({ summary: 'Get all conversations for the current user' })
  getConversations(@Req() req: { user: { userId: string } }) {
    return this.agentService.getConversations(req.user.userId);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get a specific conversation with messages' })
  getConversation(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.agentService.getConversation(req.user.userId, id);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete a conversation' })
  deleteConversation(
    @Req() req: { user: { userId: string } },
    @Param('id') id: string,
  ) {
    return this.agentService.deleteConversation(req.user.userId, id);
  }

  @Get('providers/status')
  @ApiOperation({ summary: 'Get AI providers status' })
  getProviderStatus() {
    return this.agentService.getProviderStatus();
  }
}
