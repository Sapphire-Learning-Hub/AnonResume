"use client";

import {
  BgColorsOutlined,
  CheckOutlined,
  DesktopOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MoonOutlined,
  SettingOutlined,
  SunOutlined,
} from "@ant-design/icons";
import {
  Button,
  Modal,
  Radio,
  Segmented,
  Tooltip,
  Typography,
} from "antd";
import { createStyles } from "antd-style";
import { useState } from "react";

import { useAppTheme } from "@/theme/AppThemeProvider";
import type { AppAccentTheme, AppThemeMode } from "@/theme/app-theme";
import { AnonResumeLogo } from "@/components/brand/AnonResumeLogo";

import { useI18n } from "./I18nProvider";
import { supportedLocales, type AppLocale, type MessageKey } from "./messages";

const useStyles = createStyles(({ token, css }) => ({
  settingsModal: css`
    &&& .ant-modal-container {
      overflow: hidden;
      padding: 0;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 18px;
    }

    .ant-modal-header {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .ant-modal-close {
      top: 14px;
      inset-inline-end: 14px;
      z-index: 2;
    }
  `,
  layout: css`
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    min-height: 560px;

    @media (max-width: 680px) {
      grid-template-columns: 1fr;
      min-height: 0;
    }
  `,
  navigation: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 24px 14px;
    border-inline-end: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgLayout};

    @media (max-width: 680px) {
      flex-direction: row;
      padding: 16px 56px 12px 14px;
      border-inline-end: 0;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    }
  `,
  navigationTitle: css`
    margin: 0 10px 12px;
    color: ${token.colorText};
    font-size: 16px;
    font-weight: 700;

    @media (max-width: 680px) {
      display: none;
    }
  `,
  navigationButton: css`
    && {
      justify-content: flex-start;
      height: 38px;
      padding-inline: 12px;
      border-radius: 10px;
      color: ${token.colorTextSecondary};

      &:hover {
        color: ${token.colorText};
        background: ${token.colorFillTertiary};
      }

      &[aria-pressed="true"] {
        color: ${token.colorPrimary};
        background: ${token.colorPrimaryBg};
        font-weight: 600;
      }
    }
  `,
  content: css`
    min-width: 0;
    padding: 30px 32px 34px;

    @media (max-width: 680px) {
      padding: 22px 18px 26px;
    }
  `,
  contentHeader: css`
    padding-inline-end: 36px;
    padding-bottom: 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  contentTitle: css`
    margin: 0;
    color: ${token.colorText};
    font-size: 20px;
    line-height: 1.35;
  `,
  settingList: css`
    display: grid;
  `,
  settingRow: css`
    display: grid;
    grid-template-columns: minmax(120px, 140px) minmax(260px, 1fr);
    align-items: center;
    gap: 20px;
    min-height: 84px;
    padding: 16px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    &:last-child {
      border-bottom: 0;
    }

    @media (max-width: 580px) {
      grid-template-columns: 1fr;
      gap: 12px;
    }
  `,
  languageSettingRow: css`
    grid-template-columns: minmax(0, 1fr) auto;

    @media (max-width: 580px) {
      grid-template-columns: 1fr;
    }
  `,
  settingCopy: css`
    display: grid;
    gap: 4px;
  `,
  settingLabel: css`
    && {
      color: ${token.colorText};
      font-weight: 600;
    }
  `,
  settingDescription: css`
    color: ${token.colorTextSecondary};
    font-size: 12px;
    line-height: 1.45;
  `,
  accentOptions: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  `,
  accentButton: css`
    && {
      justify-content: flex-start;
      min-width: 0;
      height: 42px;
      padding-inline: 12px;
      border-color: ${token.colorBorder};

      &[aria-pressed="true"] {
        border-color: ${token.colorPrimary};
        color: ${token.colorPrimary};
        box-shadow: 0 0 0 2px ${token.colorPrimaryBg};
      }
    }
  `,
  accentSwatch: css`
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 50%;
  `,
  accentCheck: css`
    margin-inline-start: auto;
  `,
  aboutIntro: css`
    margin: 0;
    padding: 0 0 18px;
    color: ${token.colorTextSecondary};
    font-size: 14px;
    line-height: 1.6;
    text-align: center;
  `,
  aboutLogo: css`
    display: block;
    width: min(220px, 100%);
    height: auto;
    margin: 22px auto 18px;
  `,
  aboutLinks: css`
    display: grid;
    gap: 10px;
  `,
  aboutLink: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 64px;
    padding: 12px 0;
    border-bottom: 1px solid ${token.colorBorderSecondary};

    &:last-child {
      border-bottom: 0;
    }
  `,
  disabledAboutLink: css`
    color: ${token.colorTextQuaternary};
    cursor: not-allowed;
    text-decoration: none;
  `,
}));

type SettingsSection = "general" | "appearance" | "about";

export function LocaleSwitcher() {
  const { styles, cx } = useStyles();
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SettingsSection>("general");
  const { locale, setLocale, t } = useI18n();
  const { mode, accent, setMode, setAccent } = useAppTheme();
  const sourceCodeUrl = process.env.NEXT_PUBLIC_SOURCE_CODE_URL?.trim();

  const sectionTitle =
    section === "general"
      ? t("common.settings.general")
      : section === "appearance"
        ? t("common.settings.appearance")
        : t("common.settings.aboutTitle");
  const accentOptions: Array<{
    value: AppAccentTheme;
    label: string;
    color: string;
  }> = [
    {
      value: "anon",
      label: t("common.settings.accent.anon"),
      color: "#ff8899",
    },
    {
      value: "classic",
      label: t("common.settings.accent.classic"),
      color: "#0f62fe",
    },
  ];

  return (
    <div
      data-interface-settings-trigger="inline"
      data-print-chrome="screen"
    >
      <Tooltip title={t("common.interfaceSettings")}>
        <Button
          aria-label={t("common.openInterfaceSettings")}
          icon={<SettingOutlined />}
          type="text"
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      <Modal
        centered
        className={styles.settingsModal}
        destroyOnHidden
        footer={null}
        open={open}
        title={t("common.interfaceSettings")}
        width={800}
        onCancel={() => setOpen(false)}
      >
        <div className={styles.layout}>
          <nav
            aria-label={t("common.settings.navigation")}
            className={styles.navigation}
          >
            <p className={styles.navigationTitle}>
              {t("common.interfaceSettings")}
            </p>
            <Button
              aria-label={t("common.settings.general")}
              aria-pressed={section === "general"}
              className={styles.navigationButton}
              icon={<GlobalOutlined />}
              type="text"
              onClick={() => setSection("general")}
            >
              {t("common.settings.general")}
            </Button>
            <Button
              aria-label={t("common.settings.appearance")}
              aria-pressed={section === "appearance"}
              className={styles.navigationButton}
              icon={<BgColorsOutlined />}
              type="text"
              onClick={() => setSection("appearance")}
            >
              {t("common.settings.appearance")}
            </Button>
            <Button
              aria-label={t("common.settings.about")}
              aria-pressed={section === "about"}
              className={styles.navigationButton}
              icon={<InfoCircleOutlined />}
              type="text"
              onClick={() => setSection("about")}
            >
              {t("common.settings.about")}
            </Button>
          </nav>

          <section className={styles.content}>
            <header className={styles.contentHeader}>
              <h2 className={styles.contentTitle}>{sectionTitle}</h2>
            </header>

            {section === "general" ? (
              <div className={styles.settingList}>
                <div
                  className={cx(
                    styles.settingRow,
                    styles.languageSettingRow,
                  )}
                >
                  <div className={styles.settingCopy}>
                    <Typography.Text className={styles.settingLabel}>
                      {t("common.language")}
                    </Typography.Text>
                    <span className={styles.settingDescription}>
                      {t("common.settings.languageDescription")}
                    </span>
                  </div>
                  <Radio.Group
                    aria-label={t("common.language")}
                    optionType="button"
                    value={locale}
                    onChange={(event) =>
                      setLocale(event.target.value as AppLocale)
                    }
                  >
                    {supportedLocales.map((option) => (
                      <Radio.Button key={option} value={option}>
                        {t(`common.languageOption.${option}` as MessageKey)}
                      </Radio.Button>
                    ))}
                  </Radio.Group>
                </div>
              </div>
            ) : section === "appearance" ? (
              <div className={styles.settingList}>
                <div className={styles.settingRow}>
                  <div className={styles.settingCopy}>
                    <Typography.Text className={styles.settingLabel}>
                      {t("common.settings.themeMode")}
                    </Typography.Text>
                    <span className={styles.settingDescription}>
                      {t("common.settings.themeModeDescription")}
                    </span>
                  </div>
                  <Segmented<AppThemeMode>
                    aria-label={t("common.settings.themeMode")}
                    block
                    options={[
                      {
                        value: "system",
                        label: t("common.settings.theme.system"),
                        icon: <DesktopOutlined />,
                      },
                      {
                        value: "light",
                        label: t("common.settings.theme.light"),
                        icon: <SunOutlined />,
                      },
                      {
                        value: "dark",
                        label: t("common.settings.theme.dark"),
                        icon: <MoonOutlined />,
                      },
                    ]}
                    value={mode}
                    onChange={setMode}
                  />
                </div>

                <div className={styles.settingRow}>
                  <div className={styles.settingCopy}>
                    <Typography.Text className={styles.settingLabel}>
                      {t("common.settings.accent")}
                    </Typography.Text>
                    <span className={styles.settingDescription}>
                      {t("common.settings.accentDescription")}
                    </span>
                  </div>
                  <div className={styles.accentOptions}>
                    {accentOptions.map((option) => {
                      const selected = option.value === accent;

                      return (
                        <Button
                          aria-pressed={selected}
                          className={styles.accentButton}
                          key={option.value}
                          onClick={() => setAccent(option.value)}
                        >
                          <span
                            aria-hidden="true"
                            className={styles.accentSwatch}
                            style={{ background: option.color }}
                          />
                          <span>{option.label}</span>
                          {selected ? (
                            <CheckOutlined className={styles.accentCheck} />
                          ) : null}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.settingList}>
                <AnonResumeLogo
                  alt="AnonResume"
                  className={styles.aboutLogo}
                  variant="lockup"
                />
                <p className={styles.aboutIntro}>
                  {t("common.settings.aboutDescriptionLong")}
                </p>
                <div className={styles.aboutLinks}>
                  <div className={styles.aboutLink}>
                    <div className={styles.settingCopy}>
                      <Typography.Text className={styles.settingLabel}>
                        {t("common.settings.sourceCode")}
                      </Typography.Text>
                      <span className={styles.settingDescription}>
                        {t("common.settings.sourceCodeDescription")}
                      </span>
                    </div>
                    {sourceCodeUrl ? (
                      <a href={sourceCodeUrl} rel="noreferrer" target="_blank">
                        <LinkOutlined aria-hidden="true" />
                      </a>
                    ) : (
                      <Tooltip title={t("common.settings.sourceCodeUnavailable")}>
                        <span
                          aria-disabled="true"
                          className={styles.disabledAboutLink}
                        >
                          {t("common.settings.sourceCode")}
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <div className={styles.aboutLink}>
                    <div className={styles.settingCopy}>
                      <Typography.Text className={styles.settingLabel}>
                        {t("common.settings.license")}
                      </Typography.Text>
                      <span className={styles.settingDescription}>
                        {t("common.settings.licenseDescription")}
                      </span>
                    </div>
                    <a href="/license">{t("common.settings.license")}</a>
                  </div>
                  <div className={styles.aboutLink}>
                    <div className={styles.settingCopy}>
                      <Typography.Text className={styles.settingLabel}>
                        {t("common.settings.thirdPartyNotices")}
                      </Typography.Text>
                      <span className={styles.settingDescription}>
                        {t("common.settings.thirdPartyNoticesDescription")}
                      </span>
                    </div>
                    <a href="/third-party-notices">
                      {t("common.settings.thirdPartyNotices")}
                    </a>
                  </div>
                  <div className={styles.aboutLink}>
                    <div className={styles.settingCopy}>
                      <Typography.Text className={styles.settingLabel}>
                        {t("common.settings.brandNotice")}
                      </Typography.Text>
                      <span className={styles.settingDescription}>
                        {t("common.settings.brandNoticeDescription")}
                      </span>
                    </div>
                    <a href="/brand-notice">
                      {t("common.settings.brandNotice")}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </Modal>
    </div>
  );
}
