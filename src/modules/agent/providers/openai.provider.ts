import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  IAIProvider,
  AIProvider,
  AIMessage,
  AITool,
  AIResponse,
  AIToolCall,
} from './ai-provider.interface';

@Injectable()
export class OpenAIProvider implements IAIProvider {
  readonly name = AIProvider.OPENAI;
  private readonly logger = new Logger(OpenAIProvider.name);
  private client: OpenAI | null = null;
  private readonly model: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    if (apiKey) {
      this.client = new OpenAI({ apiKey });
      this.logger.log('OpenAI provider initialized');
    } else {
      this.logger.warn('OpenAI provider not configured - missing API key');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private convertTools(tools: AITool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required,
        },
      },
    }));
  }

  private convertMessages(
    messages: AIMessage[],
    systemPrompt: string,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of messages) {
      if (msg.role === 'system') continue;
      result.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    return result;
  }

  async chat(
    messages: AIMessage[],
    systemPrompt: string,
    tools?: AITool[],
  ): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not configured');
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: this.convertMessages(messages, systemPrompt),
        tools: tools ? this.convertTools(tools) : undefined,
        max_tokens: 1024,
      });

      return this.parseResponse(response);
    } catch (error) {
      this.logger.error('Error calling OpenAI API:', error);
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
      throw new Error('OpenAI provider not configured');
    }

    // Build the full message history
    const openaiMessages = this.convertMessages(messages, systemPrompt);

    // Add assistant message with tool calls
    if (previousResponse.toolCalls) {
      openaiMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: previousResponse.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
      });

      // Add tool results
      for (const result of toolResults) {
        openaiMessages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: result.result,
        });
      }
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        tools: this.convertTools(tools),
        max_tokens: 1024,
      });

      return this.parseResponse(response);
    } catch (error) {
      this.logger.error('Error continuing OpenAI conversation:', error);
      throw error;
    }
  }

  private parseResponse(response: OpenAI.Chat.Completions.ChatCompletion): AIResponse {
    const choice = response.choices[0];
    const message = choice.message;

    const toolCalls: AIToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        // Only process function type tool calls
        if (tc.type === 'function') {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments),
          });
        }
      }
    }

    let stopReason: AIResponse['stopReason'] = 'end';
    if (choice.finish_reason === 'tool_calls') {
      stopReason = 'tool_use';
    } else if (choice.finish_reason === 'length') {
      stopReason = 'max_tokens';
    }

    return {
      content: message.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason,
    };
  }
}
