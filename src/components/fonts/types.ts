import type { FontMarketQuery } from "@/domain/resume/fonts/market";
import type { UserFontPreference } from "@/lib/resume/fonts/preferences";
import type { ResumeCatalogEntry } from "@/lib/resume/catalog";

export type FontMarketProps = {
  defaultResume?: ResumeCatalogEntry;
  initialPreferences?: UserFontPreference[];
  initialQuery?: FontMarketQuery;
};
