import type { Request, Response } from 'express';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { emisService } from './emis.service';
import type { CreateEmiInput, ListEmisQuery, UpdateEmiInput } from './emis.validation';

/** POST /emis — track a new recurring obligation. */
export const createEmi = asyncHandler(async (req: Request, res: Response) => {
  const emi = await emisService.create(req.user!.id, req.body as CreateEmiInput);
  sendSuccess(res, req, emi, 'EMI created successfully', 201);
});

/** GET /emis — list the user's obligations with their live schedule (paginated). */
export const listEmis = asyncHandler(async (req: Request, res: Response) => {
  const page = await emisService.findAll(req.user!.id, req.query as unknown as ListEmisQuery);
  sendSuccess(res, req, page, 'EMIs retrieved successfully');
});

/** GET /emis/summary — total monthly commitment, due-this-month, and per-type breakdown. */
export const getEmiSummary = asyncHandler(async (req: Request, res: Response) => {
  const summary = await emisService.summary(req.user!.id);
  sendSuccess(res, req, summary, 'EMI summary retrieved successfully');
});

/** GET /emis/:id — fetch one obligation with its live schedule. */
export const getEmi = asyncHandler(async (req: Request, res: Response) => {
  const emi = await emisService.findById(req.user!.id, req.params.id as string);
  sendSuccess(res, req, emi, 'EMI retrieved successfully');
});

/** PATCH /emis/:id — update an obligation. */
export const updateEmi = asyncHandler(async (req: Request, res: Response) => {
  const emi = await emisService.update(
    req.user!.id,
    req.params.id as string,
    req.body as UpdateEmiInput,
  );
  sendSuccess(res, req, emi, 'EMI updated successfully');
});

/** DELETE /emis/:id — delete an obligation. */
export const deleteEmi = asyncHandler(async (req: Request, res: Response) => {
  await emisService.remove(req.user!.id, req.params.id as string);
  res.status(204).send();
});
