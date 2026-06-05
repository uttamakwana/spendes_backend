import { Router } from 'express';
import { Role } from '../../common/enums/role';
import { authorize } from '../../common/middleware/authorize';
import { validate } from '../../common/middleware/validate';
import { idParamSchema } from '../../common/utils/object-id';
import { authenticate } from '../auth/auth.middleware';
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from './categories.controller';
import {
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './categories.validation';

export const categoriesRouter: Router = Router();

// Every categories route requires authentication.
categoriesRouter.use(authenticate);

// Reads are open to any authenticated user.
categoriesRouter.get('/', validate({ query: listCategoriesQuerySchema }), listCategories);
categoriesRouter.get('/:id', validate({ params: idParamSchema }), getCategory);

// Writes are admin-only.
categoriesRouter.post(
  '/',
  authorize(Role.Admin),
  validate({ body: createCategorySchema }),
  createCategory,
);
categoriesRouter.patch(
  '/:id',
  authorize(Role.Admin),
  validate({ params: idParamSchema, body: updateCategorySchema }),
  updateCategory,
);
categoriesRouter.delete(
  '/:id',
  authorize(Role.Admin),
  validate({ params: idParamSchema }),
  deleteCategory,
);
