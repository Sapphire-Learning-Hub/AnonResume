export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type SearchParamValue = string | string[] | undefined;
export type PaginationSearchParams = Record<string, SearchParamValue>;

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface PageResult<T> extends PageRequest {
  items: T[];
  total: number;
  totalPages: number;
}

function firstValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function readSearchParam(
  input: PaginationSearchParams,
  key: string,
) {
  return firstValue(input[key]);
}

function parsePositiveInteger(value: SearchParamValue, fallback: number) {
  const parsed = Number.parseInt(firstValue(value) ?? "", 10);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePageRequest(
  input: PaginationSearchParams,
  options: {
    pageParam?: string;
    pageSizeParam?: string;
    defaultPageSize?: number;
    maxPageSize?: number;
  } = {},
): PageRequest {
  const pageParam = options.pageParam ?? "page";
  const pageSizeParam = options.pageSizeParam ?? "pageSize";
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE;
  const pageSize = parsePositiveInteger(input[pageSizeParam], defaultPageSize);

  return {
    page: parsePositiveInteger(input[pageParam], 1),
    pageSize: Math.min(pageSize, maxPageSize),
  };
}

export function resolvePage(total: number, request: PageRequest) {
  const normalizedTotal = Math.max(0, Math.trunc(total));
  const totalPages =
    normalizedTotal === 0 ? 0 : Math.ceil(normalizedTotal / request.pageSize);
  const page = totalPages === 0 ? 1 : Math.min(request.page, totalPages);

  return {
    page,
    totalPages,
    offset: (page - 1) * request.pageSize,
  };
}

export function createPageResult<T>(
  items: T[],
  total: number,
  request: PageRequest,
): PageResult<T> {
  const resolved = resolvePage(total, request);

  return {
    items,
    page: resolved.page,
    pageSize: request.pageSize,
    total,
    totalPages: resolved.totalPages,
  };
}
