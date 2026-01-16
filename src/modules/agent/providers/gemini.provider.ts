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
  private readonly modelsToTry: string[];

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const configuredModel = this.configService.get<string>('GEMINI_MODEL');

    // Lista de modelos a probar en orden (fallback) - modelos más recientes primero
    this.modelsToTry = [
      configuredModel || 'gemini-2.5-flash',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ].filter((v, i, a) => a.indexOf(v) === i); // Eliminar duplicados

    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
      this.logger.log(`Gemini provider initialized with models: ${this.modelsToTry.join(', ')}`);
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

    let lastError: Error | null = null;

    // Intentar con cada modelo en orden
    for (const modelName of this.modelsToTry) {
      try {
        this.logger.debug(`Trying Gemini model: ${modelName}`);

        const model = this.client.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          tools: tools ? this.convertTools(tools) as any : undefined,
        });

        const chat = model.startChat({
          history: this.convertMessages(messages.slice(0, -1)),
        });

        const lastMessage = messages[messages.length - 1];
        const result = await chat.sendMessage(lastMessage.content);

        this.logger.log(`Gemini model ${modelName} succeeded`);
        return this.parseResponse(result);
      } catch (error) {
        this.logger.warn(`Gemini model ${modelName} failed: ${error.message}`);
        lastError = error;
        // Continuar con el siguiente modelo
      }
    }

    // Si todos los modelos fallaron
    this.logger.error('All Gemini models failed:', lastError);
    throw lastError || new Error('All Gemini models failed');
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

    let lastError: Error | null = null;

    // Intentar con cada modelo en orden
    for (const modelName of this.modelsToTry) {
      try {
        const model = this.client.getGenerativeModel({
          model: modelName,
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
        this.logger.debug(`Sending function response to Gemini, parts count: ${lastContent.parts.length}`);
        const result = await chat.sendMessage(lastContent.parts);

        const parsed = this.parseResponse(result);
        this.logger.debug(`Gemini response after tool: content="${parsed.content?.substring(0, 100) || 'EMPTY'}", stopReason=${parsed.stopReason}`);
        return parsed;
      } catch (error) {
        this.logger.warn(`Gemini continueWithToolResults ${modelName} failed: ${error.message}`);
        lastError = error;
      }
    }

    this.logger.error('All Gemini models failed in continueWithToolResults:', lastError);
    throw lastError || new Error('All Gemini models failed');
  }

  private parseResponse(result: GenerateContentResult): AIResponse {
    const response = result.response;
    const toolCalls: AIToolCall[] = [];

    // Log raw response for debugging
    const candidates = response.candidates;
    const finishReason = candidates?.[0]?.finishReason;
    this.logger.debug(`Gemini raw response: finishReason=${finishReason}, candidatesCount=${candidates?.length || 0}`);

    // Check for function calls
    const functionCalls = response.functionCalls?.();
    if (functionCalls && functionCalls.length > 0) {
      this.logger.debug(`Gemini function calls: ${functionCalls.map(fc => fc.name).join(', ')}`);
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
    } catch (error) {
      // If there are only function calls, text() might throw
      this.logger.debug(`Could not get text from response: ${error.message}`);

      // Try to extract text from parts directly
      if (candidates && candidates.length > 0) {
        const parts = candidates[0].content?.parts || [];
        for (const part of parts) {
          if ('text' in part && part.text) {
            content += part.text;
          }
        }
      }
    }

    // Log if content is empty but no tool calls
    if (!content && toolCalls.length === 0) {
      this.logger.warn(`Gemini returned empty response with no tool calls. finishReason=${finishReason}`);
      // Log parts for debugging
      if (candidates?.[0]?.content?.parts) {
        this.logger.debug(`Gemini parts: ${JSON.stringify(candidates[0].content.parts)}`);
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: toolCalls.length > 0 ? 'tool_use' : 'end',
    };
  }
}
