import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  IAIProvider,
  AIProvider,
  AIMessage,
  AITool,
  AIResponse,
  AIToolCall,
} from './ai-provider.interface';

@Injectable()
export class ClaudeProvider implements IAIProvider {
  readonly name = AIProvider.CLAUDE;
  private readonly logger = new Logger(ClaudeProvider.name);
  private client: Anthropic | null = null;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    this.model = this.configService.get<string>('ANTHROPIC_MODEL') || 'claude-sonnet-4-20250514';

    if (apiKey) {
      this.client = new Anthropic({ apiKey });
      this.logger.log('Claude provider initialized');
    } else {
      this.logger.warn('Claude provider not configured - missing API key');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private convertTools(tools: AITool[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    }));
  }

  private convertMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));
  }

  async chat(
    messages: AIMessage[],
    systemPrompt: string,
    tools?: AITool[],
  ): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Claude provider not configured');
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools ? this.convertTools(tools) : undefined,
        messages: this.convertMessages(messages),
      });

      return this.parseResponse(response);
    } catch (error) {
      this.logger.error('Error calling Claude API:', error);
      throw error;
    }
  }

  async continueWithToolResults(
    messages: AIMessage[],
    systemPrompt: string,
    tools: AITool[],
    toolResults: Array<{ toolCallId: string; result: string }>,
    previousResponse: AIResponse,
  ): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Claude provider not configured');
    }

    // Build the full message history including tool use and results
    const anthropicMessages = this.convertMessages(messages);

    // Add assistant message with tool use
    const toolUseContent: Anthropic.ContentBlock[] = [];

    if (previousResponse.toolCalls) {
      for (const toolCall of previousResponse.toolCalls) {
        toolUseContent.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.arguments,
        });
      }
    }

    anthropicMessages.push({
      role: 'assistant',
      content: toolUseContent,
    });

    // Add tool results
    const toolResultContent: Anthropic.ToolResultBlockParam[] = toolResults.map(
      (result) => ({
        type: 'tool_result' as const,
        tool_use_id: result.toolCallId,
        content: result.result,
      }),
    );

    anthropicMessages.push({
      role: 'user',
      content: toolResultContent,
    });

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: systemPrompt,
        tools: this.convertTools(tools),
        messages: anthropicMessages,
      });

      return this.parseResponse(response);
    } catch (error) {
      this.logger.error('Error continuing Claude conversation:', error);
      throw error;
    }
  }

  private parseResponse(response: Anthropic.Message): AIResponse {
    const toolCalls: AIToolCall[] = [];
    let content = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        content = block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    let stopReason: AIResponse['stopReason'] = 'end';
    if (response.stop_reason === 'tool_use') {
      stopReason = 'tool_use';
    } else if (response.stop_reason === 'max_tokens') {
      stopReason = 'max_tokens';
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason,
    };
  }
}
