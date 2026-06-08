import type { CategoryType } from '../../common/enums/category-type';
import type { CategoryDocument } from './categories.model';

/**
 * The public-facing representation of a category. The internal `createdBy` audit
 * field is deliberately not exposed; `isSystem` is, so clients can badge defaults
 * and hide the delete action for them.
 */
export interface CategoryResponse {
  id: string;
  name: string;
  slug: string;
  type: CategoryType;
  icon?: string;
  color?: string;
  iconUrl?: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Maps a raw category document to its public response shape. */
export function toCategoryResponse(category: CategoryDocument): CategoryResponse {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    type: category.type,
    icon: category.icon,
    color: category.color,
    iconUrl: category.iconUrl,
    description: category.description,
    isSystem: category.isSystem,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}
