import { PageMetaDto, PaginatedResponseDto } from './pagination-response.dto';

describe('PageMetaDto', () => {
  it('computes total pages and navigation flags for a middle page', () => {
    const meta = new PageMetaDto({ page: 2, limit: 20, totalItems: 137 });
    expect(meta.totalPages).toBe(7);
    expect(meta.hasPreviousPage).toBe(true);
    expect(meta.hasNextPage).toBe(true);
  });

  it('handles the first and only page', () => {
    const meta = new PageMetaDto({ page: 1, limit: 20, totalItems: 5 });
    expect(meta.totalPages).toBe(1);
    expect(meta.hasPreviousPage).toBe(false);
    expect(meta.hasNextPage).toBe(false);
  });

  it('handles an empty result set', () => {
    const meta = new PageMetaDto({ page: 1, limit: 20, totalItems: 0 });
    expect(meta.totalPages).toBe(1);
    expect(meta.hasNextPage).toBe(false);
  });
});

describe('PaginatedResponseDto', () => {
  it('wraps items with computed metadata', () => {
    const result = PaginatedResponseDto.of(['a', 'b'], { page: 1, limit: 10, totalItems: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.meta.totalItems).toBe(2);
    expect(result.meta.totalPages).toBe(1);
  });
});
