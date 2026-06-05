/**
 * Turns a human label into a URL/key-safe kebab-case slug:
 * strips diacritics, lowercases, and collapses any run of non-alphanumerics to a
 * single hyphen (trimming leading/trailing ones). Returns an empty string when the
 * input has no usable characters (e.g. only emoji) — callers should treat that as
 * "could not derive a slug".
 *
 * @example slugify('Food & Dining') // 'food-dining'
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
