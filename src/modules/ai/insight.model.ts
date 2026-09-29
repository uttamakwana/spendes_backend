import { model, Schema, type Types } from 'mongoose';
import type { BaseDocument } from '../../database/base.repository';
import type { AiSource } from './ai.types';
import type { InsightSentiment, SpendBrief } from './ai-response';

/**
 * A generated monthly summary, stored so it is written once rather than on every
 * time the dashboard loads.
 *
 * Caching an LLM response is not just a latency win here — a month's narrative
 * costs real money to produce and does not change between two page loads, so
 * regenerating it per request would be paying repeatedly for the same paragraph.
 *
 * Identity is the `(userId, periodKey)` pair. `fingerprint` is a hash of the figures
 * the narrative was written from: when the user adds expenses the fingerprint moves,
 * and the stale summary is regenerated on the next read. That is what keeps a cached
 * paragraph from quietly contradicting the numbers displayed beside it.
 */
export interface InsightItemSub {
  title: string;
  detail: string;
  sentiment: InsightSentiment;
  category?: string;
}

export interface InsightDocument extends BaseDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** `YYYY-MM` in the owner's timezone. */
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  headline: string;
  items: InsightItemSub[];
  suggestions: string[];
  /** Snapshot of the figures this narrative was written from. */
  brief: SpendBrief;
  /** Hash of {@link brief} — a change means the summary no longer matches the data. */
  fingerprint: string;
  source: AiSource;
  /** Model that wrote it, or `mock` / the model that was skipped when degraded. */
  model: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const insightItemSchema = new Schema<InsightItemSub>(
  {
    title: { type: String, required: true, trim: true },
    detail: { type: String, required: true, trim: true },
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'warning'],
      default: 'neutral',
    },
    category: { type: String, trim: true },
  },
  { _id: false },
);

const insightSchema = new Schema<InsightDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    periodKey: { type: String, required: true, trim: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    headline: { type: String, required: true, trim: true },
    items: { type: [insightItemSchema], default: [] },
    suggestions: { type: [String], default: [] },
    // Free-form by design: the brief's shape is owned by the insights service and
    // is stored verbatim so a cached narrative can always be shown next to the
    // exact figures it was written from.
    brief: { type: Schema.Types.Mixed, required: true },
    fingerprint: { type: String, required: true, index: true },
    source: { type: String, enum: ['model', 'heuristic'], required: true },
    model: { type: String, required: true, trim: true },
    generatedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: 'insights' },
);

// One stored summary per user per month — the read path and the upsert both key on this.
insightSchema.index({ userId: 1, periodKey: 1 }, { unique: true });

export const InsightModel = model<InsightDocument>('Insight', insightSchema);
