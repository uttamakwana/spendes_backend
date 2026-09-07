import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import type { AiStatusResponse } from './ai-response';
import type { InsightsQuery, ParseExpenseInput } from './ai.validation';
import { expenseParserService } from './expense-parser.service';
import { insightsService } from './insights.service';
import { llmService } from './llm.service';

/**
 * POST /ai/expenses/parse — turn a phrase into a confirmable expense draft.
 *
 * Returns a draft, never a saved row: the client shows it, the user confirms it, and
 * it is created through `POST /expenses` like any other expense.
 */
export const parseExpense = asyncHandler(async (req: Request, res: Response) => {
  const { text } = req.body as ParseExpenseInput;
  const result = await expenseParserService.parse(req.user!.id, text);
  sendSuccess(res, req, result, 'Expense parsed successfully');
});

/** GET /ai/insights — the month's spending, summarized. */
export const getInsights = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as InsightsQuery;
  const insights = await insightsService.monthly(req.user!.id, {
    ...(query.month ? { monthKey: query.month } : {}),
    ...(query.refresh !== undefined ? { refresh: query.refresh } : {}),
  });
  sendSuccess(res, req, insights, 'Spending insights retrieved successfully');
});

/**
 * GET /ai/status — whether a real model is behind these routes.
 *
 * The client uses this to set expectations rather than to decide what to show: both
 * features work either way, but a heuristic answer should not be labelled as the
 * model's.
 */
export const getAiStatus = asyncHandler(async (req: Request, res: Response) => {
  const status: AiStatusResponse = {
    modelBacked: llmService.isModelBacked,
    model: llmService.model,
    features: { naturalLanguageEntry: true, spendingInsights: true },
  };
  sendSuccess(res, req, status, 'AI status retrieved successfully');
});
