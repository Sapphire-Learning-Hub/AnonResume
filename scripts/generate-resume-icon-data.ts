type IconifyIcon = {
  body: string;
  height?: number;
  width?: number;
};

type IconifyCollection = {
  height?: number;
  width?: number;
  icons: Record<string, IconifyIcon>;
};

type IconSeed = {
  name: string;
  category:
    | "common"
    | "contact"
    | "social"
    | "work"
    | "education"
    | "development"
    | "other";
  labelZh: string;
  aliases?: string[];
};

const lucideGroups: Record<IconSeed["category"], string[]> = {
  common: [
    "accessibility", "activity", "alarm-clock", "archive", "award",
    "badge-check", "bell", "bookmark", "calendar", "camera", "check",
    "circle-check", "circle-question-mark", "clock", "download", "external-link",
    "eye", "eye-off", "file-text", "flag", "globe", "heart", "house",
    "image", "info", "key", "languages", "link", "lock", "menu",
    "paperclip", "printer", "qr-code", "scan-line", "search", "settings",
    "share-2", "shield-check", "sparkles", "star", "tag", "target",
    "lock-open", "upload", "user", "users", "x", "zap",
  ],
  contact: [
    "at-sign", "bluetooth", "building", "contact", "earth", "house",
    "locate-fixed", "mail", "mail-open", "mailbox", "map", "map-pin",
    "message-circle", "message-square", "messages-square", "navigation",
    "phone", "phone-call", "radio", "route", "rss", "satellite", "send",
    "signpost", "smartphone", "video", "webcam", "wifi",
  ],
  social: [
    "badge-plus", "circle-user-round", "contact-round", "heart-handshake",
    "message-circle-heart", "message-circle-more", "message-square-heart",
    "messages-square", "podcast", "share", "share-2", "thumbs-up", "user-round-plus",
    "users-round",
  ],
  work: [
    "badge-dollar-sign", "banknote", "briefcase-business", "building-2",
    "calendar-check", "calendar-days", "chart-area", "chart-bar",
    "chart-line", "chart-no-axes-combined", "chart-pie", "circle-check-big",
    "circle-dollar-sign", "clipboard", "clipboard-check", "clipboard-list",
    "factory", "goal", "handshake", "id-card", "landmark", "laptop",
    "lightbulb", "megaphone", "monitor", "notebook-tabs", "package",
    "panels-top-left", "presentation", "receipt", "scale", "sheet",
    "shopping-bag", "store", "table", "timer", "trending-up", "trophy",
    "wallet", "workflow", "wrench", "badge", "badge-cent", "badge-euro",
    "badge-pound-sterling", "badge-russian-ruble", "badge-swiss-franc",
    "badge-japanese-yen", "chart-column", "chart-gantt", "chart-scatter",
    "circle-percent", "file-chart-column", "folder-kanban", "kanban",
    "list-checks", "milestone", "notebook-pen", "piggy-bank", "signature",
  ],
  education: [
    "atom", "audio-lines", "binary", "book", "book-open", "book-open-check",
    "book-text", "bookmark-check", "brain", "calculator", "chart-spline",
    "dna", "flask-conical", "flask-round", "graduation-cap", "headphones",
    "lectern", "library", "lightbulb", "medal", "microscope", "music",
    "notebook", "notebook-pen", "paintbrush", "palette", "pen-line",
    "pencil", "puzzle", "quote", "ruler", "school", "scroll-text", "shapes",
    "sigma", "speech", "spell-check", "test-tube", "theater", "telescope",
    "university", "whole-word", "file-question-mark", "languages", "music-2",
    "notebook-text", "paintbrush-vertical", "pen-tool", "square-function",
  ],
  development: [
    "binary", "blocks", "bot", "braces", "brackets", "brain-circuit", "bug",
    "bug-off", "cable", "chart-candlestick", "chart-network", "circuit-board",
    "cloud", "cloud-cog", "cloud-download", "cloud-upload", "code", "code-xml",
    "codesandbox", "command", "container", "cpu", "database", "database-backup",
    "ethernet-port", "file-code", "file-json", "file-lock", "file-terminal",
    "folder-code", "git-branch", "git-commit-horizontal", "git-compare",
    "git-fork", "git-merge", "git-pull-request", "github", "hard-drive",
    "keyboard", "laptop", "memory-stick", "monitor-cog", "network", "package-open",
    "panels-top-left", "plug", "regex", "router", "server", "server-cog", "shell",
    "square-code", "square-terminal", "terminal", "test-tube-diagonal", "variable",
    "webhook", "workflow", "app-window", "app-window-mac", "between-horizontal-end",
    "cloudy", "file-cog", "file-key", "folder-cog", "folder-git", "folder-git-2",
    "git-branch-plus", "git-commit-vertical", "git-graph", "git-pull-request-arrow",
    "git-pull-request-closed", "git-pull-request-create", "git-pull-request-draft",
    "hard-drive-download", "hard-drive-upload", "laptop-minimal", "mouse-pointer-2",
    "package-check", "package-search", "server-crash", "server-off", "square-dashed-bottom-code",
  ],
  other: [
    "plane", "bike", "bus", "car", "clapperboard", "coffee", "cooking-pot",
    "dumbbell", "film", "gamepad-2", "gift", "guitar", "leaf", "luggage",
    "mountain", "music", "palette", "plane", "rocket", "ship", "tent-tree",
    "train-front", "tree-pine", "utensils", "volleyball", "waves", "sun",
    "moon", "cloud-sun", "flower-2", "footprints", "gem", "ice-cream-bowl",
    "map-pinned", "mic-vocal", "party-popper", "paw-print", "sailboat", "sprout",
  ],
};

const simpleIconGroups: Record<IconSeed["category"], string[]> = {
  common: ["google", "apple", "microsoft", "amazon", "meta"],
  contact: ["gmail", "maildotru", "microsoftoutlook", "protonmail", "telegram"],
  social: [
    "bilibili", "devdotto", "discord", "douban", "facebook", "github",
    "gitlab", "gitee", "hashnode", "instagram", "juejin", "leetcode",
    "linkedin", "medium", "qq", "sinaweibo", "stackoverflow", "threads",
    "tiktok", "wechat", "x", "xiaohongshu", "youtube", "zhihu",
  ],
  work: [
    "asana", "atlassian", "clickup", "confluence", "figma",
    "jira", "linear", "notion", "slack", "trello", "zoom", "airtable",
    "googledocs", "googledrive", "googlesheets", "microsoftteams", "miro",
  ],
  education: [
    "coursera", "duolingo", "edx", "googlescholar", "khanacademy", "mdnwebdocs",
    "openai", "readthedocs", "wikipedia", "zotero",
  ],
  development: [
    "alibabacloud", "amazonwebservices", "android", "angular", "antdesign",
    "apache", "apollographql", "archlinux", "babel", "bun", "c", "cplusplus",
    "circleci", "cloudflare", "codeberg", "codepen", "codesandbox", "cypress",
    "debian", "deno", "docker", "dotnet", "elasticsearch", "eslint", "esbuild",
    "fedora", "firebase", "git", "githubactions", "go", "googlecloud", "graphql",
    "intellijidea", "javascript", "jenkins", "jest", "kotlin", "kubernetes",
    "linux", "mongodb", "mysql", "netlify", "nextdotjs", "nodedotjs", "npm",
    "nuxt", "php", "playwright", "pnpm", "postgresql", "prettier", "prisma",
    "python", "railway", "react", "redis", "render", "rollupdotjs", "ruby",
    "rust", "selenium", "solid", "sqlite", "svelte", "swift", "tailwindcss",
    "terraform", "typescript", "ubuntu", "vercel", "vite", "vitest", "vuedotjs",
    "webpack", "webstorm", "windows", "yarn",
  ],
  other: ["adobe", "adobeacrobatreader", "canva", "dribbble", "dropbox", "etsy", "pinterest", "spotify"],
};

const labelZhOverrides: Record<string, string> = {
  "lucide:mail": "邮箱",
  "lucide:phone": "电话",
  "lucide:map-pin": "地点",
  "lucide:graduation-cap": "学历",
  "lucide:briefcase-business": "工作",
  "lucide:code-xml": "代码",
  "simple-icons:github": "GitHub",
};

const aliasesById: Record<string, string[]> = {
  "lucide:mail": ["邮件", "email"],
  "lucide:phone": ["手机", "mobile"],
  "lucide:map-pin": ["地址", "位置", "location"],
  "lucide:graduation-cap": ["教育", "学校", "education"],
  "lucide:briefcase-business": ["职业", "公司", "job"],
  "simple-icons:github": ["代码仓库", "开源"],
};

function createSeeds(
  prefix: "lucide" | "simple-icons",
  groups: Record<IconSeed["category"], string[]>,
) {
  const seen = new Set<string>();

  return Object.entries(groups).flatMap(([category, names]) =>
    names.flatMap<IconSeed>((name) => {
      if (seen.has(name)) {
        return [];
      }

      seen.add(name);
      const id = `${prefix}:${name}`;

      return [
        {
          name,
          category: category as IconSeed["category"],
          labelZh: labelZhOverrides[id] ?? toLabel(name),
          aliases: aliasesById[id],
        },
      ];
    }),
  );
}

const iconSeeds: Record<"lucide" | "simple-icons", IconSeed[]> = {
  lucide: createSeeds("lucide", lucideGroups),
  "simple-icons": createSeeds("simple-icons", simpleIconGroups),
};

function toLabel(name: string) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function readCollection(prefix: "lucide" | "simple-icons") {
  const path = new URL(
    `../node_modules/@iconify-json/${prefix}/icons.json`,
    import.meta.url,
  );

  return JSON.parse(
    await readFile(fileURLToPath(path), "utf8"),
  ) as IconifyCollection;
}

const generated = [];
const missingIcons: string[] = [];

for (const prefix of ["lucide", "simple-icons"] as const) {
  const collection = await readCollection(prefix);

  for (const seed of iconSeeds[prefix]) {
    const icon = collection.icons[seed.name];

    if (!icon) {
      missingIcons.push(`${prefix}:${seed.name}`);
      continue;
    }

    generated.push({
      id: `${prefix}:${seed.name}`,
      name: seed.name,
      labelZh: seed.labelZh,
      labelEn: toLabel(seed.name),
      aliases: seed.aliases ?? [],
      category: seed.category,
      source: prefix,
      svg: {
        body: icon.body,
        width: icon.width ?? collection.width ?? 24,
        height: icon.height ?? collection.height ?? 24,
      },
    });
  }
}

if (missingIcons.length) {
  throw new Error(`Missing icons in local Iconify data:\n${missingIcons.join("\n")}`);
}

const ids = generated.map((icon) => icon.id);

if (new Set(ids).size !== ids.length) {
  throw new Error("Duplicate resume icon ids in generated catalog");
}

const output = `// Generated by scripts/generate-resume-icon-data.ts. Do not edit manually.\n\nexport const generatedResumeIconData = ${JSON.stringify(generated, null, 2)} as const;\n`;
const outputPath = new URL(
  "../src/domain/resume/generated-icon-data.ts",
  import.meta.url,
);

await writeFile(fileURLToPath(outputPath), output, "utf8");

console.log(`Generated ${generated.length} resume icons.`);
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
