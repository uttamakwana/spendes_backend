import { z } from 'zod';
import { CategoryType } from '../../common/enums/category-type';

/** A 3- or 6-digit hex colour like `#4ECDC4`. */
const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'color must be a hex value like #4ECDC4');

/**
 * Payload for `POST /categories` (admin). `slug` is optional — the service derives a
 * kebab-case one from `name` when omitted. `type` defaults to `expense`. `isSystem`
 * is intentionally not settable via the API — only the seeder marks system defaults.
 */
export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case')
    .optional(),
  type: z.nativeEnum(CategoryType).optional(),
  icon: z.string().trim().min(1).max(60).optional(),
  color: hexColor.optional(),
  iconUrl: z.string().url().max(500).optional(),
  description: z.string().trim().max(255).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Payload for `PATCH /categories/:id` (admin). `slug` and `type` are intentionally
 * omitted — they form the category's stable identity and changing them would orphan
 * references, so only the display fields and flags are editable.
 */
export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    icon: z.string().trim().min(1).max(60),
    color: hexColor,
    iconUrl: z.string().url().max(500),
    description: z.string().trim().max(255),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
  })
  .partial();

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * Query for `GET /categories`. `includeInactive` is honoured only for admins (the
 * controller gates it); it arrives as the string `"true"`/`"false"` on the query
 * string and is coerced to a boolean here.
 */
export const listCategoriesQuerySchema = z.object({
  type: z.nativeEnum(CategoryType).optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().trim().min(1).optional(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
