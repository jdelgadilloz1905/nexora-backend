import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MaxLength, IsOptional } from 'class-validator';

export class ChatMessageDto {
  @ApiProperty({ example: '¿Qué tengo pendiente hoy?' })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({ example: 'conversation-123' })
  @IsString()
  @IsOptional()
  conversationId?: string;
}

export class AgentResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  conversationId: string;

  @ApiPropertyOptional()
  actions?: AgentAction[];

  @ApiPropertyOptional()
  suggestions?: string[];
}

export class AgentAction {
  @ApiProperty()
  type: string;

  @ApiProperty()
  description: string;

  @ApiPropertyOptional()
  data?: Record<string, unknown>;
}
