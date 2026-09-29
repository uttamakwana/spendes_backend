import { createLogger } from '../../logger';
import {
  NO_USAGE,
  type AiProvider,
  type StructuredRequest,
  type StructuredResult,
} from './ai.types';

/**
 * The offline {@link AiProvider}: returns the caller's own `fallback` verbatim.
 *
 * This is not a stub that throws "not implemented" — it is the reason the AI
 * features are demoable and testable without an API key or a network. Each feature
 * service computes a real, deterministic answer with ordinary code (a regex parse
 * of the sentence, a templated read of the month's numbers) and hands it over as
 * `fallback`; with `AI_PROVIDER=mock` that answer *is* the response, tagged
 * `source: 'heuristic'` so nothing pretends a model was involved.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock';

  private readonly logger = createLogger('MockAiProvider');

  async complete(request: StructuredRequest): Promise<StructuredResult> {
    this.logger.debug(`Mock completion for "${request.schemaName}" — returning caller fallback`);
    return {
      data: request.fallback,
      source: 'heuristic',
      model: this.model,
      usage: NO_USAGE,
    };
  }
}
