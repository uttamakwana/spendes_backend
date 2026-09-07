/**
 * The LLM seam. One interface, swapped by `AI_PROVIDER` (mock for dev/CI/demo,
 * Anthropic for real inference) — callers depend only on this, never on a specific
 * vendor's SDK. Mirrors the StorageProvider / SmsProvider / PaymentProvider pattern.
 *
 * Every request here is *structured*: the caller supplies a JSON Schema and gets an
 * object back. Free-form prose is deliberately not part of the seam — nothing in
 * this app wants a paragraph it then has to parse.
 */

/** A JSON Schema object describing the response the model must produce. */
export type JsonSchemaObject = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
};

/**
 * How hard the model should think. Extraction from a single sentence is a `low`
 * job; reading a month of spending and finding what matters is not.
 */
export type AiEffort = 'low' | 'medium' | 'high';

export interface StructuredRequest {
  /** Operator instructions — the role and the rules, never the user's own words. */
  system: string;
  /** The turn itself: the data or text to work on. */
  prompt: string;
  /** Names the schema for the model, e.g. `expense_draft`. */
  schemaName: string;
  schema: JsonSchemaObject;
  effort?: AiEffort;
  /**
   * What to return when no model is available — the mock provider's answer, and the
   * degraded answer when a real call fails. Supplying it is what lets every AI route
   * keep working with `AI_PROVIDER=mock`, offline, or during an outage.
   */
  fallback: unknown;
}

/** Token accounting for one call, surfaced for logging and cost tracking. */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from the prompt cache (cheap); 0 when nothing hit. */
  cachedInputTokens: number;
}

/** Whether an answer came from the model or from the caller's own fallback. */
export type AiSource = 'model' | 'heuristic';

export interface StructuredResult {
  /**
   * The model's object. Shaped by `schema` but *not* trusted — every caller
   * re-validates it against the app's own contract before it touches the database.
   */
  data: unknown;
  source: AiSource;
  /** Model that answered, or `mock` / `heuristic` when none did. */
  model: string;
  usage: AiUsage;
}

export interface AiProvider {
  /** Provider name, for logging/diagnostics. */
  readonly name: string;
  /** The model this provider will use, for display in responses. */
  readonly model: string;
  /** Runs one structured completion. Never throws — degrades to `request.fallback`. */
  complete(request: StructuredRequest): Promise<StructuredResult>;
}

/** Zero usage — what the mock and the degraded paths report. */
export const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
