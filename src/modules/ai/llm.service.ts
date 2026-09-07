import { AiProviderName, config } from '../../config';
import { createLogger } from '../../logger';
import type { AiProvider, StructuredRequest, StructuredResult } from './ai.types';
import { AnthropicAiProvider } from './anthropic.provider';
import { MockAiProvider } from './mock.provider';

/**
 * Selects the active {@link AiProvider} from `AI_PROVIDER`. Fail-fast: an unknown
 * or misconfigured provider throws at startup (mirrors the storage/payments
 * factories). Misconfiguration here means a missing key, and finding that out on
 * boot beats finding it out on a user's first tap.
 */
function createAiProvider(): AiProvider {
  switch (config.ai.provider) {
    case AiProviderName.Mock:
      return new MockAiProvider();
    case AiProviderName.Anthropic:
      return new AnthropicAiProvider();
    default:
      throw new Error(`AI provider "${config.ai.provider}" is not implemented.`);
  }
}

/**
 * Application-facing LLM API. The two AI features (natural-language expense entry
 * and monthly spending insights) depend only on this seam — neither imports a
 * vendor SDK, so swapping or adding a provider is a one-file change.
 */
export class LlmService {
  private readonly logger = createLogger('LlmService');
  private readonly provider: AiProvider;

  constructor(provider: AiProvider = createAiProvider()) {
    this.provider = provider;
    this.logger.info(`AI provider: ${this.provider.name} (${this.provider.model})`);
  }

  /** True when a real model is behind the seam — surfaced to clients as a capability flag. */
  get isModelBacked(): boolean {
    return this.provider.name !== 'mock';
  }

  get model(): string {
    return this.provider.model;
  }

  complete(request: StructuredRequest): Promise<StructuredResult> {
    return this.provider.complete(request);
  }
}

/** Shared singleton used across the app. */
export const llmService = new LlmService();
