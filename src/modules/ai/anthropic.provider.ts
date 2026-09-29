import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { config } from '../../config';
import { createLogger } from '../../logger';
import {
  NO_USAGE,
  type AiProvider,
  type StructuredRequest,
  type StructuredResult,
} from './ai.types';

/** The SDK's helper brands its own JSON-Schema type; ours is the vendor-neutral one. */
type SdkSchema = Parameters<typeof jsonSchemaOutputFormat>[0];

/**
 * Claude-backed {@link AiProvider}. Uses structured outputs (`output_config.format`)
 * so the response is schema-shaped JSON rather than prose we would have to parse —
 * `messages.parse` then hands back `parsed_output` already deserialized.
 *
 * It never throws. A refusal, a rate limit, a timeout or a malformed response all
 * resolve to the caller's `fallback` tagged `source: 'heuristic'`, because none of
 * these features are worth a 500: a natural-language expense draft the user is about
 * to confirm, and a monthly summary shown beside numbers the user can already see,
 * are both better served slightly worse than not at all.
 */
export class AnthropicAiProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private readonly logger = createLogger('AnthropicAiProvider');
  private readonly client: Anthropic;

  constructor() {
    const apiKey = config.ai.anthropic.apiKey;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic (use AI_PROVIDER=mock to run without a key).',
      );
    }

    this.model = config.ai.model;
    this.client = new Anthropic({
      apiKey,
      // Milliseconds in the TS SDK. The default is ten minutes — far past the point
      // a phone waiting on this request has given up.
      timeout: config.ai.timeoutMs,
      maxRetries: 1,
    });
  }

  async complete(request: StructuredRequest): Promise<StructuredResult> {
    const started = Date.now();

    try {
      const response = await this.client.messages.parse({
        model: this.model,
        max_tokens: config.ai.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
        output_config: {
          effort: request.effort ?? 'medium',
          format: jsonSchemaOutputFormat(request.schema as SdkSchema),
        },
      });

      // A safety decline arrives as a 200 with no usable content — check before reading.
      if (response.stop_reason === 'refusal') {
        this.logger.warn(
          `Claude declined "${request.schemaName}" (${response.stop_details?.category ?? 'no category'})`,
        );
        return this.degraded(request);
      }

      // `parsed_output` is null when the model's JSON did not parse.
      if (response.parsed_output === null || response.parsed_output === undefined) {
        this.logger.warn(`Claude returned unparseable output for "${request.schemaName}"`);
        return this.degraded(request);
      }

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
      };

      this.logger.info(
        `Claude ${request.schemaName}: ${usage.inputTokens} in / ${usage.outputTokens} out in ${Date.now() - started}ms`,
      );

      return { data: response.parsed_output, source: 'model', model: this.model, usage };
    } catch (error) {
      this.logger.error(
        { err: error },
        `Claude call for "${request.schemaName}" failed — falling back to the heuristic answer`,
      );
      return this.degraded(request);
    }
  }

  /** The caller's own answer, when the model could not supply one. */
  private degraded(request: StructuredRequest): StructuredResult {
    return { data: request.fallback, source: 'heuristic', model: this.model, usage: NO_USAGE };
  }
}
