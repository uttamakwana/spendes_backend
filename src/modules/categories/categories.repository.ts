import type { FilterQuery } from 'mongoose';
import { BaseRepository } from '../../database/base.repository';
import { CategoryModel, type CategoryDocument } from './categories.model';

/**
 * Data access for categories. Inherits generic CRUD from {@link BaseRepository} and
 * adds the canonical sorted listing (categories are bounded reference data, so they
 * are returned as a full sorted list rather than paginated).
 */
export class CategoriesRepository extends BaseRepository<CategoryDocument> {
  constructor() {
    super(CategoryModel);
  }

  /** Returns every category matching `filter`, ordered for display (sortOrder, then name). */
  findAllSorted(filter: FilterQuery<CategoryDocument>): Promise<CategoryDocument[]> {
    return this.find(filter, undefined, { sort: { sortOrder: 1, name: 1 } });
  }
}

/** Shared singleton instance used across the app. */
export const categoriesRepository = new CategoriesRepository();
