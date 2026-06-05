import {
  type FilterQuery,
  type Model,
  type PipelineStage,
  type ProjectionType,
  type QueryOptions,
  type SortOrder,
  Types,
  type UpdateQuery,
} from 'mongoose';
import { NotFoundException } from '../common/errors/http-exception';

/** Fields every persisted document carries. Concrete document types extend this. */
export interface BaseDocument {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaginateParams<TDocument> {
  filter?: FilterQuery<TDocument>;
  page?: number;
  limit?: number;
  sort?: Record<string, SortOrder>;
  projection?: ProjectionType<TDocument>;
}

export interface PaginatedResult<TDocument> {
  items: TDocument[];
  page: number;
  limit: number;
  totalItems: number;
}

/**
 * Generic data-access layer shared by every feature repository. Wraps a Mongoose
 * model with a small, consistent, strongly-typed CRUD + pagination API so feature
 * repositories only add domain-specific queries. Read methods return lean (plain)
 * objects for performance. Replaces NestJS's `AbstractRepository`.
 */
export abstract class BaseRepository<TDocument extends BaseDocument> {
  constructor(protected readonly model: Model<TDocument>) {}

  async create(document: Partial<Omit<TDocument, '_id'>>): Promise<TDocument> {
    const created = await this.model.create(document);
    return created.toObject() as TDocument;
  }

  async findOne(
    filter: FilterQuery<TDocument>,
    projection?: ProjectionType<TDocument>,
  ): Promise<TDocument | null> {
    return this.model.findOne(filter, projection).lean<TDocument>(true).exec();
  }

  async findOneOrThrow(
    filter: FilterQuery<TDocument>,
    projection?: ProjectionType<TDocument>,
  ): Promise<TDocument> {
    const document = await this.findOne(filter, projection);
    if (!document) {
      throw new NotFoundException(`${this.model.modelName} not found`);
    }
    return document;
  }

  async findById(
    id: string | Types.ObjectId,
    projection?: ProjectionType<TDocument>,
  ): Promise<TDocument | null> {
    return this.findOne({ _id: id } as FilterQuery<TDocument>, projection);
  }

  async findByIdOrThrow(
    id: string | Types.ObjectId,
    projection?: ProjectionType<TDocument>,
  ): Promise<TDocument> {
    return this.findOneOrThrow({ _id: id } as FilterQuery<TDocument>, projection);
  }

  async find(
    filter: FilterQuery<TDocument> = {},
    projection?: ProjectionType<TDocument>,
    options?: QueryOptions<TDocument>,
  ): Promise<TDocument[]> {
    return this.model.find(filter, projection, options).lean<TDocument[]>(true).exec();
  }

  async paginate(params: PaginateParams<TDocument>): Promise<PaginatedResult<TDocument>> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, params.limit ?? 20);
    const filter = params.filter ?? {};

    const [items, totalItems] = await Promise.all([
      this.model
        .find(filter, params.projection)
        .sort(params.sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean<TDocument[]>(true)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);

    return { items, page, limit, totalItems };
  }

  async findOneAndUpdate(
    filter: FilterQuery<TDocument>,
    update: UpdateQuery<TDocument>,
  ): Promise<TDocument> {
    const document = await this.model
      .findOneAndUpdate(filter, update, { new: true, runValidators: true })
      .lean<TDocument>(true)
      .exec();

    if (!document) {
      throw new NotFoundException(`${this.model.modelName} not found`);
    }
    return document;
  }

  async updateById(
    id: string | Types.ObjectId,
    update: UpdateQuery<TDocument>,
  ): Promise<TDocument> {
    return this.findOneAndUpdate({ _id: id } as FilterQuery<TDocument>, update);
  }

  async deleteOne(filter: FilterQuery<TDocument>): Promise<TDocument> {
    const document = await this.model.findOneAndDelete(filter).lean<TDocument>(true).exec();
    if (!document) {
      throw new NotFoundException(`${this.model.modelName} not found`);
    }
    return document;
  }

  async deleteById(id: string | Types.ObjectId): Promise<TDocument> {
    return this.deleteOne({ _id: id } as FilterQuery<TDocument>);
  }

  async exists(filter: FilterQuery<TDocument>): Promise<boolean> {
    const result = await this.model.exists(filter).exec();
    return result !== null;
  }

  async count(filter: FilterQuery<TDocument> = {}): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async aggregate<TResult = unknown>(pipeline: PipelineStage[]): Promise<TResult[]> {
    return this.model.aggregate<TResult>(pipeline).exec();
  }
}
