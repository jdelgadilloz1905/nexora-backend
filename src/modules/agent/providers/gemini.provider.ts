import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
  GenerateContentResult,
} from '@google/generative-ai';
import {
  IAIProvider,
  AIProvider,
  AIMessage,
  AITool,
  AIResponse,
  AIToolCall,
} from './ai-provider.interface';

@Injectable()
export class GeminiProvider implements IAIProvider {
  readonly name = AIProvider.GEMINI;
  private readonly logger = new Logger(GeminiProvider.name);
  private client: GoogleGenerativeAI | null = null;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.modelName = this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';

    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
      this.logger.log('Gemini provider initialized');
    } else {
      this.logger.warn('Gemini provider not configured - missing API key');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private convertTools(tools: AITool[]): Array<{ functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  }> }> {
    return [{
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'OBJECT',
          properties: Object.fromEntries(
            Object.entries(tool.parameters.properties).map(([key, value]) => [
              key,
              {
                type: value.type.toUpperCase(),
                description: value.description,
                enum: value.enum,
              },
            ]),
          ),
          required: tool.parameters.required,
        },
      })),
    }];
  }

  private convertMessages(messages: AIMessage[]): Content[] {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));
  }

  async chat(
    messages: AIMessage[],
    systemPrompt: string,
    tools?: AITool[],
  ): Promise<AIResponse> {
    if (!this.client) {
      throw new Error('Gemini provider not configured');
    }

    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        systemInstruction: systemPrompt,
        tools: tools ? this.convertTools(tools) as any : undefined,
      });

      const chat = model.startChat({
        history: this.convertMessages(messages.slice(0, -1)),
      });

      const lastMessage = messages[messages.length - 1];
      const result = await chat.sendMessage(lastMessage.content);

      return this.parseResponse(result);
    } catch (error) {
      this.logger.error('Error calling Gemini API:', error);
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
      throw new Error('Gemini provider not configured');
    }

    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        systemInstruction: systemPrompt,
        tools: this.convertTools(tools) as any,
      });

      // Build conversation history
      const history = this.convertMessages(messages);

      // Add model's function call response
      if (previousResponse.toolCalls) {
        const functionCallParts: Part[] = previousResponse.toolCalls.map(
          (toolCall) => ({
            functionCall: {
              name: toolCall.name,
              args: toolCall.arguments,
            },
          }),
        );
        history.push({
          role: 'model',
          parts: functionCallParts,
        });
      }

      // Add function responses
      const functionResponseParts: Part[] = toolResults.map((result) => {
        const toolCall = previousResponse.toolCalls?.find(
          (tc) => tc.id === result.toolCallId,
        );
        return {
          functionResponse: {
            name: toolCall?.name || 'unknown',
            response: { result: result.result },
          },
        };
      });

      history.push({
        role: 'user',
        parts: functionResponseParts,
      });

      const chat = model.startChat({
        history: history.slice(0, -1),
      });

      const lastContent = history[history.length - 1];
      const result = await chat.sendMessage(lastContent.parts);

      return this.parseResponse(result);
    } catch (error) {
      this.logger.error('Error continuing Gemini conversation:', error);
      throw error;
    }
  }

  private parseResponse(result: GenerateContentResult): AIResponse {
    const response = result.response;
    const toolCalls: AIToolCall[] = [];

    // Check for function calls
    const functionCalls = response.functionCalls?.();
    if (functionCalls && functionCalls.length > 0) {
      for (let i = 0; i < functionCalls.length; i++) {
        const fc = functionCalls[i];
        toolCalls.push({
          id: `gemini-${Date.now()}-${i}`,
          name: fc.name,
          arguments: fc.args as Record<string, unknown>,
        });
      }
    }

    let content = '';
    try {
      content = response.text();
    } catch {
      // If there are only function calls, text() might throw
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end',
    };
  }
}
