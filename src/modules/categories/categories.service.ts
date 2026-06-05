import { type FilterQuery, Types, type UpdateQuery } from 'mongoose';
import { CategoryType } from '../../common/enums/category-type';
import { BadRequestException, ConflictException } from '../../common/errors/http-exception';
import { slugify } from '../../common/utils/slug';
import { createLogger } from '../../logger';
import { toCategoryResponse, type CategoryResponse } from './category-response';
import type { CategoryDocument } from './categories.model';
import { categoriesRepository, CategoriesRepository } from './categories.repository';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateCategoryInput,
} from './categories.validation';

/**
 * Business logic for categories — global reference data. Reads are open to any
 * authenticated user; writes are admin-only (enforced at the route layer). Identity
 * is the `(type, slug)` pair and is immutable after creation. Seeded `isSystem`
 * categories are protected from deletion.
 */
export class CategoriesService {
  private readonly logger = createLogger('CategoriesService');

  constructor(private readonly repository: CategoriesRepository) {}

  /**
   * Lists categories, optionally filtered by type/search. Inactive categories are
   * only included when the caller is an admin who explicitly asked (`canSeeInactive`).
   */
  async list(query: ListCategoriesQuery, canSeeInactive: boolean): Promise<CategoryResponse[]> {
    const filter: FilterQuery<CategoryDocument> = {};
    if (query.type) {
      filter.type = query.type;
    }
    if (!(canSeeInactive && query.includeInactive)) {
      filter.isActive = true;
    }
    if (query.search) {
      filter.name = new RegExp(query.search, 'i');
    }

    const categories = await this.repository.findAllSorted(filter);
    return categories.map(toCategoryResponse);
  }

  async findById(id: string): Promise<CategoryResponse> {
    const category = await this.repository.findByIdOrThrow(id);
    return toCategoryResponse(category);
  }

  async create(dto: CreateCategoryInput, createdBy: string): Promise<CategoryResponse> {
    const type = dto.type ?? CategoryType.Expense;
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug) {
      throw new BadRequestException(
        'Could not derive a slug from the name — provide a "slug" explicitly',
      );
    }

    await this.assertSlugAvailable(type, slug);

    const category = await this.repository.create({
      name: dto.name,
      slug,
      type,
      icon: dto.icon,
      color: dto.color,
      iconUrl: dto.iconUrl,
      description: dto.description,
      isSystem: false,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
      createdBy: new Types.ObjectId(createdBy),
    });

    this.logger.info(`Category created: ${category._id.toString()} (${type}/${slug})`);
    return toCategoryResponse(category);
  }

  async update(id: string, dto: UpdateCategoryInput): Promise<CategoryResponse> {
    const update: UpdateQuery<CategoryDocument> = { ...dto };
    if (dto.color) {
      update.color = dto.color.toUpperCase();
    }

    const category = await this.repository.updateById(id, update);
    return toCategoryResponse(category);
  }

  async remove(id: string): Promise<void> {
    const category = await this.repository.findByIdOrThrow(id);
    if (category.isSystem) {
      throw new BadRequestException(
        'System categories cannot be deleted — deactivate it instead (isActive: false)',
      );
    }
    await this.repository.deleteById(id);
  }

  private async assertSlugAvailable(type: CategoryType, slug: string): Promise<void> {
    const exists = await this.repository.exists({ type, slug });
    if (exists) {
      throw new ConflictException(`A ${type} category with slug "${slug}" already exists`);
    }
  }
}

/** Shared singleton instance used across the app. */
export const categoriesService = new CategoriesService(categoriesRepository);
