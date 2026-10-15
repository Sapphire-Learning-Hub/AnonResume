import type {
  ResumeFontCategory,
  ResumeFontPreset,
  ResumeFontScript,
  ResumeFontUseCase,
} from "@/domain/resume/font-presets";

export type FontMarketSort = "recent" | "newest" | "name";

export type FontMarketFilters = {
  categories: ResumeFontCategory[];
  scripts: ResumeFontScript[];
  useCases: ResumeFontUseCase[];
  sort: FontMarketSort;
};

export type FontMarketQuery = FontMarketFilters & { query: string };

const CATEGORIES = new Set<ResumeFontCategory>([
  "sans",
  "serif",
  "mono",
  "handwriting",
]);
const SCRIPTS = new Set<ResumeFontScript>(["latin", "zh-CN"]);
const USE_CASES = new Set<ResumeFontUseCase>([
  "business",
  "compact",
  "body",
  "editorial",
  "display",
  "technical",
  "creative",
]);
const SORTS = new Set<FontMarketSort>([
  "recent",
  "newest",
  "name",
]);

function allowedValues<T extends string>(values: string[], allowed: Set<T>) {
  return [...new Set(values.filter((value): value is T => allowed.has(value as T)))];
}

function intersects<T>(left: readonly T[], right: readonly T[]) {
  return right.length === 0 || right.some((value) => left.includes(value));
}

export function parseFontMarketQuery(params: URLSearchParams): FontMarketQuery {
  const sortValue = params.get("sort");

  return {
    query: params.get("q")?.trim() ?? "",
    categories: allowedValues(params.getAll("category"), CATEGORIES),
    scripts: allowedValues(params.getAll("script"), SCRIPTS),
    useCases: allowedValues(params.getAll("use"), USE_CASES),
    sort:
      sortValue && SORTS.has(sortValue as FontMarketSort)
        ? (sortValue as FontMarketSort)
        : "newest",
  };
}

export function serializeFontMarketQuery(input: FontMarketQuery) {
  const params = new URLSearchParams();
  if (input.query.trim()) params.set("q", input.query.trim());
  input.categories.forEach((value) => params.append("category", value));
  input.scripts.forEach((value) => params.append("script", value));
  input.useCases.forEach((value) => params.append("use", value));
  if (input.sort !== "newest") params.set("sort", input.sort);
  return params;
}

export function filterAndSortResumeFontPresets(input: {
  presets: readonly ResumeFontPreset[];
  filters: FontMarketFilters;
  query?: string;
  recentUsage?: Readonly<Record<string, number>>;
  getSearchMetadata?: (preset: ResumeFontPreset) => readonly string[];
}) {
  const normalizedQuery = input.query?.trim().toLocaleLowerCase() ?? "";
  const filtered = input.presets.filter((preset) => {
    if (
      !intersects([preset.category], input.filters.categories) ||
      !intersects(preset.scripts, input.filters.scripts) ||
      !intersects(preset.useCases, input.filters.useCases)
    ) {
      return false;
    }

    if (!normalizedQuery) return true;
    return [
      preset.id,
      preset.name,
      preset.category,
      ...preset.scripts,
      ...preset.useCases,
      ...(input.getSearchMetadata?.(preset) ?? []),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });

  return filtered.toSorted((left, right) => {
    if (input.filters.sort === "recent") {
      const difference =
        (input.recentUsage?.[right.id] ?? 0) -
        (input.recentUsage?.[left.id] ?? 0);
      if (difference !== 0) return difference;
    } else if (input.filters.sort === "newest") {
      const difference = right.addedAt.localeCompare(left.addedAt);
      if (difference !== 0) return difference;
    }

    return left.name.localeCompare(right.name, "en");
  });
}

export function usesFallbackForText(
  preset: ResumeFontPreset,
  text: string,
) {
  return /[\u3400-\u9fff\uf900-\ufaff]/u.test(text) &&
    !preset.scripts.includes("zh-CN");
}
