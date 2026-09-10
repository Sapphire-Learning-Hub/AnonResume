import type { AppLocale } from "@/i18n/messages";

import { createRichTextFromPlainText } from "./operations";
import type {
  ResumeBlock,
  ResumeDocument,
  ResumeSection,
  TextBlock,
} from "./schema";

const ACCENT_BLUE = "#0f62fe";

function localized(locale: AppLocale, zh: string, en: string) {
  return locale === "zh-CN" ? zh : en;
}

function text(
  id: string,
  value: string,
  style?: TextBlock["style"],
): TextBlock {
  return {
    id,
    type: "text",
    content: createRichTextFromPlainText(value),
    ...(style ? { style } : {}),
  };
}

function group(id: string, children: ResumeBlock[], gap = 8): ResumeBlock {
  return {
    id,
    type: "group",
    direction: "vertical",
    gap,
    children,
  };
}

function row(id: string, children: ResumeBlock[]): ResumeBlock {
  return {
    id,
    type: "row",
    gap: 16,
    align: "start",
    justify: "between",
    children,
  };
}

function list(id: string, items: string[], gap = 5): ResumeBlock {
  return {
    id,
    type: "list",
    ordered: false,
    marker: "disc",
    gap,
    items: items.map((item, index) => ({
      id: `${id}-item-${index}`,
      children: [text(`${id}-text-${index}`, item)],
    })),
  };
}

function section(
  id: string,
  title: string | undefined,
  blocks: ResumeBlock[],
  options: {
    columns?: number;
    gap?: number;
    titleColor?: string;
    titleSize?: number;
  } = {},
): ResumeSection {
  return {
    id,
    ...(title ? { title: createRichTextFromPlainText(title) } : {}),
    ...(title
      ? {
          titleStyle: {
            ...(options.titleColor ? { color: options.titleColor } : {}),
            ...(options.titleSize ? { fontSize: options.titleSize } : {}),
          },
        }
      : {}),
    visible: true,
    layout: {
      direction: "vertical",
      gap: options.gap ?? 10,
      ...(options.columns ? { columns: options.columns } : {}),
    },
    pagination: { keepTogether: false },
    blocks,
  };
}

function document(
  locale: AppLocale,
  title: string,
  settings: ResumeDocument["settings"],
  sections: ResumeSection[],
): ResumeDocument {
  return {
    schemaVersion: 1,
    meta: { title, locale },
    settings,
    sections,
  };
}

export function createCenteredResumeDocument(locale: AppLocale): ResumeDocument {
  const l = (zh: string, en: string) => localized(locale, zh, en);

  return document(
    locale,
    l("居中叙事简历", "Centered narrative resume"),
    {
      page: { size: "A4", margin: { top: 38, right: 42, bottom: 38, left: 42 } },
      typography: {
        fontFamily: '"Noto Serif SC", "Source Han Serif SC", serif',
        baseFontSize: 13,
        lineHeight: 1.55,
      },
      theme: {
        accent: "#9f3f52",
        textColor: "#2d2023",
        mutedColor: "#715f63",
      },
    },
    [
      section("centered-profile", undefined, [
        text("centered-name", l("林知夏", "Avery Lin"), {
          align: "center",
          fontSize: 34,
          fontWeight: 700,
        }),
        text("centered-role", l("品牌策划与内容创意", "Brand strategy and content"), {
          align: "center",
          color: "#9f3f52",
          fontSize: 16,
          fontWeight: 700,
        }),
        text(
          "centered-contact",
          l(
            "上海 · 138 0000 0000 · zhixia@example.com",
            "Shanghai · +86 138 0000 0000 · avery@example.com",
          ),
          { align: "center", color: "#715f63", fontSize: 12 },
        ),
        text(
          "centered-summary",
          l(
            "擅长将复杂信息转化为清晰、有记忆点的表达，拥有品牌项目、内容策划与跨团队协作经验。",
            "I turn complex ideas into clear, memorable stories through brand programs, content strategy, and thoughtful collaboration.",
          ),
          { align: "center", fontSize: 14, lineHeight: 1.7 },
        ),
      ], { gap: 9 }),
      section(
        "centered-experience",
        l("工作经历", "Experience"),
        [
          group("centered-job-one", [
            row("centered-job-one-head", [
              text(
                "centered-job-one-name",
                l("品牌内容负责人 · 山谷工作室", "Brand Content Lead · Valley Studio"),
                { fontSize: 15, fontWeight: 700 },
              ),
              text("centered-job-one-date", l("2023 — 至今", "2023 — Present"), {
                color: "#715f63",
                fontSize: 12,
                align: "right",
              }),
            ]),
            list("centered-job-one-list", [
              l(
                "负责年度品牌主题与内容规划，推动多个项目从概念到落地。",
                "Led annual brand themes and content planning from concept through launch.",
              ),
              l(
                "与设计、市场及合作团队共同完善品牌表达。",
                "Partnered with design, marketing, and external teams to refine the brand voice.",
              ),
            ]),
          ]),
          group("centered-job-two", [
            row("centered-job-two-head", [
              text(
                "centered-job-two-name",
                l("内容策划 · 日光文化", "Content Strategist · Daylight Culture"),
                { fontSize: 15, fontWeight: 700 },
              ),
              text("centered-job-two-date", "2021 — 2023", {
                color: "#715f63",
                fontSize: 12,
                align: "right",
              }),
            ]),
            text(
              "centered-job-two-body",
              l(
                "参与品牌焕新并建立持续使用的内容表达方式。",
                "Helped refresh the brand and established a durable editorial voice.",
              ),
            ),
          ]),
        ],
        { gap: 14, titleColor: "#9f3f52", titleSize: 19 },
      ),
      section(
        "centered-background",
        l("教育与能力", "Education and strengths"),
        [
          group("centered-education", [
            text("centered-education-title", l("传播学学士", "B.A. Communication"), {
              fontSize: 15,
              fontWeight: 700,
            }),
            text(
              "centered-education-body",
              l("城市大学 · 2017—2021", "City University · 2017—2021"),
              { color: "#715f63" },
            ),
          ]),
          group("centered-skills", [
            text("centered-skills-title", l("专业能力", "Strengths"), {
              fontSize: 15,
              fontWeight: 700,
            }),
            text(
              "centered-skills-body",
              l(
                "品牌策划 · 内容写作\n项目沟通 · 用户研究",
                "Brand strategy · Copywriting\nProject communication · User research",
              ),
            ),
          ]),
        ],
        { columns: 2, gap: 24, titleColor: "#9f3f52", titleSize: 19 },
      ),
    ],
  );
}

export function createClassicResumeDocument(locale: AppLocale): ResumeDocument {
  const l = (zh: string, en: string) => localized(locale, zh, en);

  return document(
    locale,
    l("经典留白简历", "Classic whitespace resume"),
    {
      page: { size: "A4", margin: { top: 42, right: 42, bottom: 42, left: 42 } },
      typography: {
        fontFamily: '"Source Serif 4", Georgia, serif',
        baseFontSize: 13,
        lineHeight: 1.55,
      },
      theme: {
        accent: "#18534b",
        textColor: "#24312f",
        mutedColor: "#62716e",
      },
    },
    [
      section("classic-header", undefined, [
        row("classic-header-row", [
          group("classic-header-main", [
            text("classic-name", l("周明远", "Morgan Zhou"), {
              fontSize: 32,
              fontWeight: 600,
            }),
            text("classic-role", l("运营管理 · 团队负责人", "Operations · Team Lead"), {
              color: "#62716e",
              fontSize: 14,
            }),
          ], 5),
          text(
            "classic-contact",
            l(
              "上海\n138 0000 0000\nmingyuan@example.com",
              "Shanghai\n+86 138 0000 0000\nmorgan@example.com",
            ),
            { align: "right", color: "#62716e", fontSize: 11, lineHeight: 1.45 },
          ),
        ]),
      ]),
      section(
        "classic-summary",
        l("个人概述", "Profile"),
        [
          text(
            "classic-summary-body",
            l(
              "十年团队与项目管理经验，擅长目标拆解、流程优化与多部门协作，持续推动业务稳定增长。",
              "Operations leader experienced in goal setting, process improvement, and cross-functional delivery that supports sustainable growth.",
            ),
            { lineHeight: 1.65 },
          ),
        ],
        { titleColor: "#18534b", titleSize: 18 },
      ),
      section(
        "classic-experience",
        l("工作经历", "Experience"),
        [
          group("classic-job-one", [
            row("classic-job-one-head", [
              text(
                "classic-job-one-name",
                l("区域运营负责人 · 远景商业", "Regional Operations Lead · Horizon"),
                { fontSize: 15, fontWeight: 700 },
              ),
              text("classic-job-one-date", l("2021 — 至今", "2021 — Present"), {
                align: "right",
                color: "#62716e",
                fontSize: 11,
              }),
            ]),
            list("classic-job-one-list", [
              l(
                "负责三地运营团队与重点项目，完善管理机制并提升交付效率。",
                "Led regional teams and priority programs while improving delivery practices.",
              ),
              l(
                "建立项目复盘与人才培养机制，提升团队协作稳定性。",
                "Introduced project reviews and coaching routines that strengthened collaboration.",
              ),
            ]),
          ]),
          group("classic-job-two", [
            row("classic-job-two-head", [
              text(
                "classic-job-two-name",
                l("项目经理 · 联合服务", "Project Manager · United Services"),
                { fontSize: 15, fontWeight: 700 },
              ),
              text("classic-job-two-date", "2017 — 2021", {
                align: "right",
                color: "#62716e",
                fontSize: 11,
              }),
            ]),
            text(
              "classic-job-two-body",
              l(
                "协调客户、供应商和内部团队，按期完成多个长期服务项目。",
                "Coordinated clients, vendors, and internal teams across long-running programs.",
              ),
            ),
          ]),
        ],
        { gap: 15, titleColor: "#18534b", titleSize: 18 },
      ),
      section(
        "classic-background",
        l("教育与能力", "Education and strengths"),
        [
          group("classic-education", [
            text(
              "classic-education-title",
              l("工商管理 · 华东大学", "Business Administration · East China University"),
              { fontSize: 14, fontWeight: 700 },
            ),
            text("classic-education-date", "2013 — 2017", { color: "#62716e" }),
          ]),
          text(
            "classic-skills",
            l(
              "团队管理 · 项目推进\n预算规划 · 客户沟通",
              "Team leadership · Project delivery\nBudget planning · Client communication",
            ),
            { align: "right" },
          ),
        ],
        { columns: 2, gap: 24, titleColor: "#18534b", titleSize: 18 },
      ),
    ],
  );
}

export function createModularResumeDocument(locale: AppLocale): ResumeDocument {
  const l = (zh: string, en: string) => localized(locale, zh, en);

  return document(
    locale,
    l("等宽模块简历", "Modular grid resume"),
    {
      page: { size: "A4", margin: { top: 28, right: 30, bottom: 28, left: 30 } },
      typography: {
        fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
        baseFontSize: 13,
        lineHeight: 1.42,
      },
      theme: {
        accent: ACCENT_BLUE,
        textColor: "#102039",
        mutedColor: "#526173",
      },
    },
    [
      section("modular-header", undefined, [
        row("modular-header-row", [
          group("modular-header-main", [
            text("modular-name", l("陈雨婷", "Taylor Chen"), {
              fontSize: 32,
              fontWeight: 800,
            }),
            text("modular-role", l("市场与社区运营", "Community and marketing"), {
              color: ACCENT_BLUE,
              fontSize: 15,
              fontWeight: 700,
            }),
          ], 4),
          text(
            "modular-contact",
            l(
              "广州 · 138 0000 0000\nyuting@example.com",
              "Guangzhou · +86 138 0000 0000\ntaylor@example.com",
            ),
            { align: "right", color: "#526173", fontSize: 11 },
          ),
        ]),
      ]),
      section(
        "modular-profile",
        l("简介与能力", "Profile and strengths"),
        [
          text(
            "modular-summary",
            l(
              "关注真实用户体验，善于通过活动与内容建立持续连接。",
              "I build lasting communities through useful content and considered events.",
            ),
          ),
          {
            id: "modular-badges",
            type: "badges",
            wrap: true,
            gap: 7,
            items: [
              l("活动策划", "Events"),
              l("用户沟通", "Community"),
              l("数据整理", "Insights"),
              l("项目协作", "Collaboration"),
            ].map((value, index) => ({ id: `modular-badge-${index}`, text: value })),
          },
        ],
        { columns: 2, gap: 22, titleColor: ACCENT_BLUE, titleSize: 20 },
      ),
      section(
        "modular-experience",
        l("工作经历", "Experience"),
        [
          group("modular-job-one", [
            text(
              "modular-job-one-name",
              l("社区运营 · 城市生活", "Community Manager · City Life"),
              { fontSize: 15, fontWeight: 700 },
            ),
            text("modular-job-one-date", l("2024 — 至今", "2024 — Present"), {
              color: "#526173",
              fontSize: 11,
            }),
            text(
              "modular-job-one-body",
              l(
                "策划会员活动与内容栏目，提升参与度和长期留存。",
                "Created member events and editorial programs that improved engagement and retention.",
              ),
            ),
          ]),
          group("modular-job-two", [
            text(
              "modular-job-two-name",
              l("市场助理 · 青禾品牌", "Marketing Associate · Greenfield"),
              { fontSize: 15, fontWeight: 700 },
            ),
            text("modular-job-two-date", "2022 — 2024", {
              color: "#526173",
              fontSize: 11,
            }),
            text(
              "modular-job-two-body",
              l(
                "参与线下活动、合作沟通与效果复盘。",
                "Supported live events, partner communication, and post-program reviews.",
              ),
            ),
          ]),
        ],
        { columns: 2, gap: 22, titleColor: ACCENT_BLUE, titleSize: 20 },
      ),
      section(
        "modular-project",
        l("代表项目", "Selected impact"),
        [
          group("modular-metric-one", [
            text("modular-metric-one-value", "20+", {
              color: ACCENT_BLUE,
              fontSize: 26,
              fontWeight: 800,
            }),
            text(
              "modular-metric-one-label",
              l("合作品牌共同参与", "partner brands engaged"),
            ),
          ]),
          group("modular-metric-two", [
            text("modular-metric-two-value", "3,000", {
              color: ACCENT_BLUE,
              fontSize: 26,
              fontWeight: 800,
            }),
            text(
              "modular-metric-two-label",
              l("活动现场参与人次", "event participants"),
            ),
          ]),
        ],
        { columns: 2, gap: 22, titleColor: ACCENT_BLUE, titleSize: 20 },
      ),
      section(
        "modular-background",
        l("教育与语言", "Education and languages"),
        [
          text(
            "modular-education",
            l("公共关系 · 南方学院", "Public Relations · Southern College"),
          ),
          text(
            "modular-language",
            l("中文 · 母语\n英语 · 熟练", "Chinese · Native\nEnglish · Professional"),
          ),
        ],
        { columns: 2, gap: 22, titleColor: ACCENT_BLUE, titleSize: 20 },
      ),
    ],
  );
}

export function createCompactResumeDocument(locale: AppLocale): ResumeDocument {
  const l = (zh: string, en: string) => localized(locale, zh, en);

  return document(
    locale,
    l("紧凑单页简历", "Compact single-page resume"),
    {
      page: { size: "A4", margin: { top: 24, right: 27, bottom: 24, left: 27 } },
      typography: {
        fontFamily: '"Source Han Sans SC", "Noto Sans SC", sans-serif',
        baseFontSize: 12,
        lineHeight: 1.32,
      },
      theme: {
        accent: "#232323",
        textColor: "#171717",
        mutedColor: "#676767",
      },
    },
    [
      section("compact-header", undefined, [
        row("compact-header-row", [
          group("compact-header-main", [
            text("compact-name", l("许言", "Yan Xu"), {
              fontSize: 29,
              fontWeight: 800,
            }),
            text("compact-role", l("产品设计师", "Product Designer"), {
              fontSize: 14,
              fontWeight: 700,
            }),
          ], 3),
          text(
            "compact-contact",
            l(
              "北京 · 138 0000 0000\nyan@example.com · portfolio.example.com",
              "Beijing · +86 138 0000 0000\nyan@example.com · portfolio.example.com",
            ),
            { align: "right", color: "#676767", fontSize: 10 },
          ),
        ]),
      ], { gap: 6 }),
      section(
        "compact-summary",
        l("简介", "Profile"),
        [
          text(
            "compact-summary-body",
            l(
              "专注复杂产品的体验梳理与设计落地，重视清晰、克制和可持续的协作方式。",
              "I simplify complex product experiences through clear decisions and sustainable collaboration.",
            ),
          ),
        ],
        { gap: 5, titleColor: "#232323", titleSize: 15 },
      ),
      section(
        "compact-experience",
        l("工作经历", "Experience"),
        [
          group("compact-job-one", [
            row("compact-job-one-head", [
              text(
                "compact-job-one-name",
                l("产品设计师 · 云间", "Product Designer · Cloudline"),
                { fontSize: 13, fontWeight: 700 },
              ),
              text("compact-job-one-date", l("2023 — 至今", "2023 — Present"), {
                align: "right",
                color: "#676767",
                fontSize: 10,
              }),
            ]),
            list(
              "compact-job-one-list",
              [
                l(
                  "负责核心工作流改版，协同产品与研发完成调研、方案、验证和上线。",
                  "Redesigned a core workflow from discovery through validation and launch.",
                ),
                l(
                  "上线后关键流程完成率提升 18%，相关咨询量下降 24%。",
                  "Improved completion by 18% and reduced related support requests by 24%.",
                ),
              ],
              3,
            ),
          ], 4),
          group("compact-job-two", [
            row("compact-job-two-head", [
              text(
                "compact-job-two-name",
                l("体验设计实习生 · 回声", "Experience Design Intern · Echo"),
                { fontSize: 13, fontWeight: 700 },
              ),
              text("compact-job-two-date", "2022 — 2023", {
                align: "right",
                color: "#676767",
                fontSize: 10,
              }),
            ]),
            text(
              "compact-job-two-body",
              l(
                "参与移动端产品体验优化与设计规范整理。",
                "Improved mobile product flows and helped organize the design system.",
              ),
            ),
          ], 4),
        ],
        { gap: 9, titleColor: "#232323", titleSize: 15 },
      ),
      section(
        "compact-projects",
        l("项目经历", "Projects"),
        [
          group("compact-project-one", [
            text(
              "compact-project-one-name",
              l("服务流程重构", "Service flow redesign"),
              { fontSize: 13, fontWeight: 700 },
            ),
            text(
              "compact-project-one-body",
              l(
                "重新组织信息与操作路径，降低用户理解成本。",
                "Reorganized information and actions to reduce user effort.",
              ),
            ),
          ], 3),
          group("compact-project-two", [
            text(
              "compact-project-two-name",
              l("设计规范整理", "Design system refresh"),
              { fontSize: 13, fontWeight: 700 },
            ),
            text(
              "compact-project-two-body",
              l(
                "统一常用界面与交互规则，提高协作效率。",
                "Unified common patterns to improve product and engineering collaboration.",
              ),
            ),
          ], 3),
        ],
        { columns: 2, gap: 18, titleColor: "#232323", titleSize: 15 },
      ),
      section(
        "compact-background",
        l("教育与能力", "Education and strengths"),
        [
          text(
            "compact-education",
            l(
              "工业设计 · 北方大学\n2019 — 2023",
              "Industrial Design · Northern University\n2019 — 2023",
            ),
          ),
          text(
            "compact-skills",
            l(
              "体验设计 · 用户研究\n信息整理 · 协作推进",
              "Experience design · User research\nInformation design · Facilitation",
            ),
          ),
        ],
        { columns: 2, gap: 18, titleColor: "#232323", titleSize: 15 },
      ),
    ],
  );
}
