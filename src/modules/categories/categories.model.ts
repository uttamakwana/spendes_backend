import { model, Schema, type Types } from 'mongoose';
import { CategoryType } from '../../common/enums/category-type';
import type { BaseDocument } from '../../database/base.repository';

/**
 * A spend/income category used to classify transactions. Categories are global
 * reference data managed by admins (not per-user). A seeded default set ships with
 * the app (`isSystem: true`) and admins can add more.
 *
 * Identity is the `(type, slug)` pair — `slug` is a stable kebab-case key derived
 * from `name`, so the same label can exist once per type (e.g. an expense
 * "Investments" and an income "Investments"). Visuals follow an icon-first model for
 * the mobile app: `icon` names a glyph from the shared icon set and `color` tints it;
 * `iconUrl` is an optional hosted image that overrides the named icon when present.
 */
export interface CategoryDocument extends BaseDocument {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  type: CategoryType;
  icon?: string;
  /** Hex accent colour, e.g. `#4ECDC4`. */
  color?: string;
  /** Optional hosted image that overrides {@link icon} when set. */
  iconUrl?: string;
  description?: string;
  /** Seeded default — protected from deletion (deactivate instead). */
  isSystem: boolean;
  isActive: boolean;
  /** Ascending display order within a type. */
  sortOrder: number;
  /** Admin who created a non-system category (audit); unset for seeded defaults. */
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<CategoryDocument>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    type: {
      type: String,
      enum: Object.values(CategoryType),
      default: CategoryType.Expense,
      index: true,
    },
    icon: { type: String, trim: true },
    color: { type: String, trim: true, uppercase: true },
    iconUrl: { type: String, trim: true },
    description: { type: String, trim: true },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, collection: 'categories' },
);

// One category per (type, slug); lets the same label exist across types.
categorySchema.index({ type: 1, slug: 1 }, { unique: true });

// The list/picker access pattern: active categories of a type, in display order.
categorySchema.index({ type: 1, isActive: 1, sortOrder: 1 });

export const CategoryModel = model<CategoryDocument>('Category', categorySchema);
