import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAIProvider, AIProvider } from './ai-provider.interface';
import { ClaudeProvider } from './claude.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAIProvider } from './openai.provider';

@Injectable()
export class AIProviderFactory {
  private readonly logger = new Logger(AIProviderFactory.name);
  private readonly providers: Map<AIProvider, IAIProvider> = new Map();
  private readonly defaultProvider: AIProvider;
  private readonly fallbackOrder: AIProvider[];

  constructor(
    private readonly configService: ConfigService,
    private readonly claudeProvider: ClaudeProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly openaiProvider: OpenAIProvider,
  ) {
    // Register all providers
    this.providers.set(AIProvider.CLAUDE, claudeProvider);
    this.providers.set(AIProvider.GEMINI, geminiProvider);
    this.providers.set(AIProvider.OPENAI, openaiProvider);

    // Get default provider from config
    const configuredDefault = this.configService.get<string>('AI_PROVIDER');
    this.defaultProvider = this.parseProvider(configuredDefault) || AIProvider.GEMINI;

    // Get fallback order from config or use default
    const configuredFallback = this.configService.get<string>('AI_PROVIDER_FALLBACK');
    this.fallbackOrder = this.parseFallbackOrder(configuredFallback);

    this.logger.log(`AI Provider initialized - Default: ${this.defaultProvider}, Fallback: ${this.fallbackOrder.join(' -> ')}`);
  }

  private parseProvider(value: string | undefined): AIProvider | null {
    if (!value) return null;
    const normalized = value.toLowerCase().trim();
    if (Object.values(AIProvider).includes(normalized as AIProvider)) {
      return normalized as AIProvider;
    }
    return null;
  }

  private parseFallbackOrder(value: string | undefined): AIProvider[] {
    if (!value) {
      // Default fallback order: gemini -> claude -> openai
      return [AIProvider.GEMINI, AIProvider.CLAUDE, AIProvider.OPENAI];
    }
    return value
      .split(',')
      .map((p) => this.parseProvider(p.trim()))
      .filter((p): p is AIProvider => p !== null);
  }

  /**
   * Get the configured default provider
   */
  getDefaultProvider(): IAIProvider {
    const provider = this.providers.get(this.defaultProvider);
    if (!provider) {
      throw new Error(`Default provider ${this.defaultProvider} not found`);
    }
    return provider;
  }

  /**
   * Get a specific provider by name
   */
  getProvider(name: AIProvider): IAIProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  /**
   * Get the first available (configured) provider
   * Uses fallback order if the default is not configured
   */
  getAvailableProvider(): IAIProvider | null {
    // First try the default provider
    const defaultProvider = this.providers.get(this.defaultProvider);
    if (defaultProvider?.isConfigured()) {
      return defaultProvider;
    }

    // Fall back to other providers in order
    for (const providerName of this.fallbackOrder) {
      if (providerName === this.defaultProvider) continue;

      const provider = this.providers.get(providerName);
      if (provider?.isConfigured()) {
        this.logger.warn(
          `Default provider ${this.defaultProvider} not configured, falling back to ${providerName}`,
        );
        return provider;
      }
    }

    this.logger.error('No AI provider is configured');
    return null;
  }

  /**
   * Get all available (configured) providers
   */
  getAvailableProviders(): IAIProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.isConfigured());
  }

  /**
   * Check if any provider is configured
   */
  hasAnyProvider(): boolean {
    return this.getAvailableProviders().length > 0;
  }

  /**
   * Get provider status for debugging/admin
   */
  getProviderStatus(): Record<string, { configured: boolean; isDefault: boolean }> {
    const status: Record<string, { configured: boolean; isDefault: boolean }> = {};
    for (const [name, provider] of this.providers) {
      status[name] = {
        configured: provider.isConfigured(),
        isDefault: name === this.defaultProvider,
      };
    }
    return status;
  }
}
