import { Logger, NotFoundException } from '@nestjs/common';
import {
  FilterQuery,
  Model,
  PipelineStage,
  ProjectionType,
  QueryOptions,
  SortOrder,
  Types,
  UpdateQuery,
} from 'mongoose';
import { AbstractDocument } from './abstract.schema';

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
 * Generic data-access layer shared by every feature repository. Encapsulates the
 * Mongoose model and exposes a small, consistent, strongly-typed CRUD + pagination
 * API so feature repositories only add domain-specific queries. Read methods
 * return lean (plain) objects for performance.
 */
export abstract class AbstractRepository<TDocument extends AbstractDocument> {
  protected abstract readonly logger: Logger;

  constructor(protected readonly model: Model<TDocument>) {}

  async create(document: Partial<Omit<TDocument, '_id'>>): Promise<TDocument> {
    const created = new this.model({
      ...document,
      _id: new Types.ObjectId(),
    });
    const saved = await created.save();
    return saved.toObject();
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
    return this.findOne({ _id: id }, projection);
  }

  async findByIdOrThrow(
    id: string | Types.ObjectId,
    projection?: ProjectionType<TDocument>,
  ): Promise<TDocument> {
    return this.findOneOrThrow({ _id: id }, projection);
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
    return this.findOneAndUpdate({ _id: id }, update);
  }

  async deleteOne(filter: FilterQuery<TDocument>): Promise<TDocument> {
    const document = await this.model.findOneAndDelete(filter).lean<TDocument>(true).exec();
    if (!document) {
      throw new NotFoundException(`${this.model.modelName} not found`);
    }
    return document;
  }

  async deleteById(id: string | Types.ObjectId): Promise<TDocument> {
    return this.deleteOne({ _id: id });
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
