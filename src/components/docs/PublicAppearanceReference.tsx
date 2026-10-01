"use client";

import { PUBLIC_RESUME_APPEARANCE_FIELDS } from "@/domain/resume/public-appearance";
import { useI18n } from "@/i18n/I18nProvider";

import { usePublicAppearanceReferenceStyles } from "./PublicAppearanceReference.style";

type ReferenceField = (typeof PUBLIC_RESUME_APPEARANCE_FIELDS)[number];
type EnumReferenceField = Extract<ReferenceField, { kind: "enum" }>;
type EnumProperty = EnumReferenceField["property"];
type EnumFieldFor<TProperty extends EnumProperty> = Extract<
  EnumReferenceField,
  { property: TProperty }
>;
type EnumDescriptions = {
  [TProperty in EnumProperty]: Record<
    EnumFieldFor<TProperty>["values"][number],
    string
  >;
};

type DescribedValue = Readonly<{ description: string; value: string }>;

function describeEnumValues(
  field: EnumReferenceField,
  descriptions: EnumDescriptions,
): readonly DescribedValue[] {
  switch (field.property) {
    case "theme":
      return field.values.map((value) => ({
        description: descriptions.theme[value],
        value,
      }));
    case "surface":
      return field.values.map((value) => ({
        description: descriptions.surface[value],
        value,
      }));
    case "header":
      return field.values.map((value) => ({
        description: descriptions.header[value],
        value,
      }));
    case "labels":
      return field.values.map((value) => ({
        description: descriptions.labels[value],
        value,
      }));
    case "frame":
      return field.values.map((value) => ({
        description: descriptions.frame[value],
        value,
      }));
    case "align":
      return field.values.map((value) => ({
        description: descriptions.align[value],
        value,
      }));
  }
}

export function PublicAppearanceReference() {
  const { styles } = usePublicAppearanceReferenceStyles();
  const { t } = useI18n();
  const purposes = {
    accent: t("docs.reference.purpose.accent"),
    align: t("docs.reference.purpose.align"),
    background: t("docs.reference.purpose.background"),
    frame: t("docs.reference.purpose.frame"),
    gap: t("docs.reference.purpose.gap"),
    header: t("docs.reference.purpose.header"),
    labels: t("docs.reference.purpose.labels"),
    padding: t("docs.reference.purpose.padding"),
    surface: t("docs.reference.purpose.surface"),
    theme: t("docs.reference.purpose.theme"),
    width: t("docs.reference.purpose.width"),
  } satisfies Record<ReferenceField["property"], string>;
  const enumDescriptions = {
    align: {
      center: t("docs.reference.value.align.center"),
      left: t("docs.reference.value.align.left"),
    },
    frame: {
      border: t("docs.reference.value.frame.border"),
      none: t("docs.reference.value.frame.none"),
      shadow: t("docs.reference.value.frame.shadow"),
    },
    header: {
      full: t("docs.reference.value.header.full"),
      none: t("docs.reference.value.header.none"),
      title: t("docs.reference.value.header.title"),
    },
    labels: {
      hide: t("docs.reference.value.labels.hide"),
      show: t("docs.reference.value.labels.show"),
    },
    surface: {
      plain: t("docs.reference.value.surface.plain"),
      soft: t("docs.reference.value.surface.soft"),
    },
    theme: {
      auto: t("docs.reference.value.theme.auto"),
      dark: t("docs.reference.value.theme.dark"),
      light: t("docs.reference.value.theme.light"),
    },
  } satisfies EnumDescriptions;

  return (
    <section className={styles.root}>
      <details className={styles.details}>
        <summary className={styles.summary}>
          <span>{t("docs.reference.title")}</span>
        </summary>
        <div className={styles.body}>
          <div className={styles.tableViewport}>
            <table className={styles.table}>
              <colgroup>
                <col className={styles.parameterColumn} />
                <col className={styles.detailsColumn} />
                <col className={styles.defaultColumn} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">{t("docs.reference.parameter")}</th>
                  <th scope="col">{t("docs.reference.purposeAndValues")}</th>
                  <th scope="col">{t("docs.reference.default")}</th>
                </tr>
              </thead>
              <tbody>
                {PUBLIC_RESUME_APPEARANCE_FIELDS.map((field) => {
                  const enumValues =
                    field.kind === "enum"
                      ? describeEnumValues(field, enumDescriptions)
                      : [];

                  return (
                    <tr key={field.key}>
                      <td>
                        <code>{field.key}</code>
                      </td>
                      <td>
                        <p className={styles.purpose}>
                          {purposes[field.property]}
                        </p>
                        {field.kind === "enum" ? (
                          <ul className={styles.valueList}>
                            {enumValues.map((item) => (
                              <li key={item.value}>
                                <code>{item.value}</code>
                                <span> — {item.description}</span>
                              </li>
                            ))}
                          </ul>
                        ) : field.kind === "color" ? (
                          <span className={styles.valueText}>
                            {t("docs.reference.colorValue")}
                          </span>
                        ) : (
                          <span className={styles.valueText}>
                            {`${field.min}–${field.max} ${t("docs.reference.pixels")}`}
                          </span>
                        )}
                      </td>
                      <td>
                        {field.kind === "enum" ? (
                          <code>{field.defaultValue}</code>
                        ) : field.kind === "color" ? (
                          t("docs.reference.none")
                        ) : (
                          `${field.defaultValue} ${t("docs.reference.pixels")}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
