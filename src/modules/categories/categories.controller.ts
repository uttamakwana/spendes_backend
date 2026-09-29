import type { Request, Response } from 'express';
import { Role } from '../../common/enums/role';
import { asyncHandler } from '../../common/middleware/async-handler';
import { sendSuccess } from '../../common/utils/response';
import { auditService, diff } from '../admin/audit/audit.service';
import { categoriesService } from './categories.service';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './categories.validation';

/** GET /categories — list categories (any authenticated user; admins may include inactive). */
export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const isAdmin = req.user!.roles.includes(Role.Admin);
  const categories = await categoriesService.list(
    req.query as unknown as ListCategoriesQuery,
    isAdmin,
  );
  sendSuccess(res, req, categories, 'Categories retrieved successfully');
});

/** GET /categories/:id — fetch a single category. */
export const getCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoriesService.findById(req.params.id as string);
  sendSuccess(res, req, category, 'Category retrieved successfully');
});

/** POST /categories — create a category (admin only). */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await categoriesService.create(req.body as CreateCategoryInput, req.user!.id);
  await auditService.record(req, {
    action: 'category.create',
    targetType: 'category',
    targetId: category.id,
    summary: `Created ${category.type} category "${category.name}"`,
    after: req.body as Record<string, unknown>,
  });
  sendSuccess(res, req, category, 'Category created successfully', 201);
});

/** PATCH /categories/:id — update a category (admin only). */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const before = await categoriesService.findById(req.params.id as string);
  const category = await categoriesService.update(
    req.params.id as string,
    req.body as UpdateCategoryInput,
  );
  await auditService.record(req, {
    action: 'category.update',
    targetType: 'category',
    targetId: category.id,
    summary: `Updated ${category.type} category "${category.name}"`,
    ...diff(
      before as unknown as Record<string, unknown>,
      category as unknown as Record<string, unknown>,
    ),
  });
  sendSuccess(res, req, category, 'Category updated successfully');
});

/** DELETE /categories/:id — delete a non-system category (admin only). */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const before = await categoriesService.findById(req.params.id as string);
  await categoriesService.remove(req.params.id as string);
  await auditService.record(req, {
    action: 'category.delete',
    targetType: 'category',
    targetId: before.id,
    summary: `Deleted ${before.type} category "${before.name}"`,
  });
  res.status(204).send();
});
