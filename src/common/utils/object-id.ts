import { z } from 'zod';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** Zod schema for a single well-formed Mongo ObjectId string. */
export const objectId = z.string().regex(OBJECT_ID_PATTERN, 'must be a valid identifier');

/**
 * Schema for a route param named `id` that must be a valid ObjectId. Rejects
 * malformed identifiers with a 400 before they reach a service or the database.
 *
 * @example
 * router.get('/:id', validate({ params: idParamSchema }), getOne);
 */
export const idParamSchema = z.object({ id: objectId });

export type IdParam = z.infer<typeof idParamSchema>;
