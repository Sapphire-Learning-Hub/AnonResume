import { randomUUID } from "node:crypto";

import { hashPassword } from "@better-auth/utils/password";
import { expect, test, type Locator, type Page } from "playwright/test";
import { Secret, TOTP } from "otpauth";

import { deactivateInstanceSetup } from "@/lib/admin/setup/recovery";
import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { getDatabasePool } from "@/lib/runtime/database";

const account = {
  email: `owner-${process.pid}@example.com`,
  name: "E2E Owner",
  password: `Initial-${process.pid}-Password!`,
};
const editorAccount = {
  email: `editor-${process.pid}@example.com`,
  name: "E2E Editor",
  password: `Editor-${process.pid}-Password!`,
};
const shortcutModifier = process.platform === "darwin" ? "Meta" : "Control";

test.describe.serial("super-admin browser setup", () => {
  let mfaEnrollment: SetupMfaEnrollment;

  test.afterAll(async () => {
    const pool = getDatabasePool();
    const schema = process.env.ANONRESUME_DB_SCHEMA;
    if (schema && /^[a-z_][a-z0-9_]*$/i.test(schema)) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
    await pool.end();
  });

  test("initializes the owner and enters management with MFA", async ({ page }) => {
    await page.goto("/setup");
    const setupCode = await issueSetupCode("initial");
    mfaEnrollment = await completeSetup(page, {
      code: setupCode,
      deviceName: "Initial authenticator",
      password: account.password,
    });

    await signInAndEnterManagement(page, account.password, mfaEnrollment);
    await expect(page).toHaveURL(/\/app\/manage$/);
    await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
  });

  test("keeps rich text editing stable while pagination updates", async ({ page }) => {
    await createRegularAccount();
    await page.goto("/sign-in");
    await page.getByTestId("auth-email-input").fill(editorAccount.email);
    await page.getByTestId("auth-password-input").fill(editorAccount.password);
    await page.getByTestId("auth-submit").click();
    await page.waitForURL(/\/app$/);

    await page.goto("/app");
    await page.evaluate(() => {
      const form = document.createElement("form");
      form.action = "/app/create-resume";
      form.method = "post";
      const template = document.createElement("input");
      template.name = "templateId";
      template.value = "blank";
      form.append(template);
      document.body.append(form);
      form.submit();
    });
    await page.waitForURL(/\/app\/resumes\/[^/]+$/);
    const editorUrl = page.url();
    await expect(page.getByTestId("resume-editor-shell")).toBeVisible();

    await page.getByRole("button", { name: "姓名 · 求职方向", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "文本编辑器" });
    await expect(editor).toBeVisible();
    await editor.focus();
    await editor.press("End");
    await editor.evaluate((element) => {
      (window as typeof window & { __resumeE2eEditor?: Element }).__resumeE2eEditor =
        element;
    });

    await editor.dispatchEvent("compositionstart", { data: "" });
    await page.keyboard.insertText("中文输入");
    await editor.dispatchEvent("compositionupdate", { data: "中文输入" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(editor).toContainText("中文输入");
    await expect.poll(() => editor.evaluate((element) =>
      (window as typeof window & { __resumeE2eEditor?: Element }).__resumeE2eEditor ===
      element,
    )).toBe(true);
    await editor.dispatchEvent("compositionend", { data: "中文输入" });

    const pastedText = Array.from(
      { length: 180 },
      (_, index) =>
        `第 ${index + 1} 段：负责跨团队项目交付、流程优化与结果复盘，并持续产出可量化成果。`,
    ).join("\n");
    await editor.evaluate((element, text) => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", text);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: transfer,
        }),
      );
    }, pastedText);

    const editPages = page.locator('[data-resume-editing-page="true"]');
    await expect.poll(() => editPages.count(), { timeout: 20_000 }).toBeGreaterThan(1);
    await expect.poll(() => editor.evaluate((element) => document.activeElement === element)).toBe(true);
    await expect.poll(() => editor.evaluate((element) =>
      (window as typeof window & { __resumeE2eEditor?: Element }).__resumeE2eEditor ===
      element,
    )).toBe(true);

    await editor.press(`${shortcutModifier}+z`);
    await expect(editor).not.toContainText("第 180 段");
    await editor.press(`${shortcutModifier}+Shift+z`);
    await expect(editor).toContainText("第 180 段");
    await expect.poll(() => editPages.count(), { timeout: 20_000 }).toBeGreaterThan(1);

    await selectAcrossFirstPageBreak(editor);
    await editor.press(`${shortcutModifier}+b`);
    await expect(editor.locator("strong").first()).toBeVisible();

    await selectAcrossFirstPageBreak(editor);
    await editor.press(`${shortcutModifier}+k`);
    const linkDialog = page.getByRole("dialog", { name: "插入超链接" });
    await expect(linkDialog).toBeVisible();
    await linkDialog.getByLabel("地址").fill("https://example.com/resume");
    await linkDialog.getByRole("button", { name: /确\s*定/ }).click();
    const linkedFragments = editor.locator(
      'a[href="https://example.com/resume"]',
    );
    await expect(linkedFragments).toHaveCount(2);
    await expect(linkedFragments.first()).toBeVisible();

    await expect(page.getByTestId("resume-save-status")).toHaveText("已保存", {
      timeout: 20_000,
    });
    const editorPageCount = await editPages.count();

    await page.goto(`${editorUrl}/preview`);
    const previewRoot = page.locator('[data-resume-mode="view"]');
    await expect(previewRoot).toHaveAttribute("data-resume-pagination-ready", "true", {
      timeout: 20_000,
    });
    await expect(page.locator('[data-resume-page="true"]')).toHaveCount(
      editorPageCount,
    );

    await page.goto(`${editorUrl}/print`);
    await expect(page.locator("html")).toHaveAttribute("data-print-ready", "true", {
      timeout: 20_000,
    });
    await expect(
      page.locator('[data-resume-print-content="true"] [data-resume-page="true"]'),
    ).toHaveCount(editorPageCount);
  });

  test("keeps product access available while management recovery is pending", async ({ page }) => {
    await deactivateInstanceSetup({
      deploymentId: "e2e-setup",
      reason: "Exercise the authorized browser recovery journey.",
    });
    const recoveryPassword = `Recovered-${process.pid}-Password!`;

    await page.goto("/");
    await expect(page.getByRole("link", { name: "开始制作" }).first()).toBeVisible();
    await expect(page.getByText("恢复超级管理员访问")).toHaveCount(0);

    await page.goto("/app/manage");
    await expect(
      page.getByRole("heading", { name: "恢复超级管理员访问" }),
    ).toBeVisible();

    const recoveryCode = await issueSetupCode("recovery");
    const recoveredEnrollment = await completeSetup(page, {
      code: recoveryCode,
      deviceName: "Replacement authenticator",
      password: recoveryPassword,
    });
    await signInAndEnterManagement(
      page,
      recoveryPassword,
      recoveredEnrollment,
    );
    await expect(page).toHaveURL(/\/app\/manage$/);
    await expect(page.getByRole("heading", { name: "概览" })).toBeVisible();
  });
});

async function issueSetupCode(stage: string) {
  const issued = await initializePendingInstanceSetup({
    identity: { stableId: `e2e-setup/web/${stage}-${process.pid}` },
  });
  if (!issued.generated) throw new Error("expected_pending_setup_state");
  return issued.rawCode;
}

async function createRegularAccount() {
  const pool = getDatabasePool();
  const userId = randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(editorAccount.password);

  await pool.query(
    `INSERT INTO "user"
      (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
     VALUES ($1, $2, $3, true, NULL, $4, $4)`,
    [userId, editorAccount.name, editorAccount.email, now],
  );
  await pool.query(
    `INSERT INTO "account"
      (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt", issuer)
     VALUES ($1, $2, 'credential', $2, $3, $4, $4, 'local:credential')`,
    [randomUUID(), userId, passwordHash, now],
  );
}

async function completeSetup(
  page: Page,
  input: { code: string; deviceName: string; password: string },
) {
  await page.getByLabel("初始化码").fill(input.code);
  await page.getByRole("button", { name: /继\s*续/ }).click();

  await page.getByLabel("用户名").fill(account.name);
  await page.getByLabel("邮箱").fill(account.email);
  await page.getByLabel("密码", { exact: true }).fill(input.password);
  await page.getByLabel("确认密码").fill(input.password);
  await page.getByLabel("MFA 设备名称").fill(input.deviceName);

  const accountResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/setup/account") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "配置 MFA" }).click();
  const accountResponse = await accountResponsePromise;
  expect(accountResponse.ok()).toBe(true);
  const enrollment = (await accountResponse.json()) as { secret?: unknown };
  expect(typeof enrollment.secret).toBe("string");
  const secret = enrollment.secret as string;

  const usedCode = generateTotp(secret);
  await fillOtp(page, usedCode);
  await page.getByRole("button", { name: "完成初始化" }).click();
  await expect(page.getByRole("heading", { name: "保存恢复码" })).toBeVisible();
  await expect(page.locator(".admin-recovery-list li")).toHaveCount(10);
  await page.getByRole("button", { name: "前往登录" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  return { secret, usedCodes: new Set([usedCode]) };
}

async function signInAndEnterManagement(
  page: Page,
  password: string,
  enrollment: SetupMfaEnrollment,
) {
  await page.getByTestId("auth-email-input").fill(account.email);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(
    page.getByRole("heading", { name: "验证管理身份" }),
  ).toBeVisible();
  await fillOtp(page, await waitForFreshTotp(enrollment));
  await page.getByRole("button", { name: "进入管理中台" }).click();
}

async function fillOtp(page: Page, code: string) {
  const inputs = page.locator("input.admin-otp__input");
  await expect(inputs).toHaveCount(6);
  for (let index = 0; index < code.length; index += 1) {
    await inputs.nth(index).fill(code[index]!);
  }
}

function generateTotp(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate();
}

interface SetupMfaEnrollment {
  secret: string;
  usedCodes: Set<string>;
}

async function waitForFreshTotp(enrollment: SetupMfaEnrollment) {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    const current = generateTotp(enrollment.secret);
    if (!enrollment.usedCodes.has(current)) {
      enrollment.usedCodes.add(current);
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("fresh_totp_unavailable");
}

async function selectAcrossFirstPageBreak(editor: Locator) {
  const selected = await editor.evaluate((element) => {
    const pageBreak = element.querySelector<HTMLElement>(
      "[data-resume-page-break-id]",
    );
    if (!pageBreak) return false;

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.textContent?.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    const before: Text[] = [];
    const after: Text[] = [];
    let node = walker.nextNode();

    while (node) {
      const textNode = node as Text;
      if (pageBreak.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_PRECEDING) {
        before.push(textNode);
      } else if (
        pageBreak.compareDocumentPosition(textNode) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        after.push(textNode);
      }
      node = walker.nextNode();
    }

    const start = before.at(-1);
    const end = after[0];
    if (!start?.data.length || !end?.data.length) return false;

    const range = document.createRange();
    range.setStart(start, Math.max(0, start.data.length - 4));
    range.setEnd(end, Math.min(4, end.data.length));
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    (element as HTMLElement).focus();
    document.dispatchEvent(new Event("selectionchange"));
    return !selection?.isCollapsed;
  });

  expect(selected).toBe(true);
}
