import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { COUNTRIES } from '../../common/reference/countries';
import { resolveCurrency } from '../../common/reference/currencies';

export interface CountryReference {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  currency: string;
  currencySymbol: string;
  phoneLengths: number[];
  defaultHandle: string;
  timezone: string;
}

/**
 * Public reference data: the countries Spendes accepts sign-ups from, with the
 * dial code, phone length and currency for each.
 *
 * Deliberately unauthenticated — the sign-up screen needs it *before* anyone has an
 * account. The app also ships its own copy so the picker works offline and on a
 * cold start; this endpoint is what lets a released build pick up a newly supported
 * country without a store update.
 */
export const referenceRouter: Router = Router();

referenceRouter.get(
  '/countries',
  asyncHandler(async (req: Request, res: Response) => {
    const countries: CountryReference[] = COUNTRIES.map((c) => ({
      code: c.code,
      name: c.name,
      dialCode: c.dialCode,
      flag: c.flag,
      currency: c.currency,
      currencySymbol: resolveCurrency(c.currency).symbol,
      phoneLengths: c.phoneLengths,
      defaultHandle: c.defaultHandle,
      timezone: c.timezone,
    }));
    sendSuccess(res, req, { countries }, 'Countries retrieved successfully');
  }),
);
