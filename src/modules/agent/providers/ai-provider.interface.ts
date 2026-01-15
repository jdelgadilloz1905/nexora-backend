export enum AIProvider {
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  OPENAI = 'openai',
}

export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIResponse {
  content: string;
  toolCalls?: AIToolCall[];
  stopReason: 'end' | 'tool_use' | 'max_tokens' | 'error';
}

export interface AIProviderConfig {
  apiKey: string;
  model?: string;
}

export interface IAIProvider {
  readonly name: AIProvider;

  /**
   * Send a message to the AI and get a response
   */
  chat(
    messages: AIMessage[],
    systemPrompt: string,
    tools?: AITool[],
  ): Promise<AIResponse>;

  /**
   * Continue conversation after tool execution
   */
  continueWithToolResults(
    messages: AIMessage[],
    systemPrompt: string,
    tools: AITool[],
    toolResults: Array<{ toolCallId: string; result: string }>,
    previousResponse: AIResponse,
  ): Promise<AIResponse>;

  /**
   * Check if provider is properly configured
   */
  isConfigured(): boolean;
}
