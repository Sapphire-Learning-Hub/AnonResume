import { generatedResumeIconData } from "./generated-icon-data";

export type ResumeIconCategory =
  | "common"
  | "contact"
  | "social"
  | "work"
  | "education"
  | "development"
  | "other";

export type ResumeIconSource = "lucide" | "simple-icons";

export interface ResumeIconDefinition {
  id: string;
  name: string;
  labelZh: string;
  labelEn: string;
  aliases: readonly string[];
  category: ResumeIconCategory;
  source: ResumeIconSource;
  svg: {
    body: string;
    height: number;
    width: number;
  };
}

export const resumeIconCatalog: readonly ResumeIconDefinition[] =
  generatedResumeIconData;

const resumeIconById = new Map(
  resumeIconCatalog.map((icon) => [icon.id, icon] as const),
);

export function getResumeIcon(iconId: string) {
  return resumeIconById.get(iconId);
}

function normalizeIconSearchValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function filterResumeIcons(
  query: string,
  category: ResumeIconCategory | "all" = "all",
) {
  const normalizedQuery = normalizeIconSearchValue(query);

  return resumeIconCatalog.filter((icon) => {
    if (category !== "all" && icon.category !== category) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return normalizeIconSearchValue(
      [
        icon.id,
        icon.name,
        icon.labelZh,
        icon.labelEn,
        ...icon.aliases,
      ].join(" "),
    ).includes(normalizedQuery);
  });
}
