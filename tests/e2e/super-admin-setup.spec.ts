import { expect, test, type Page } from "playwright/test";
import { Secret, TOTP } from "otpauth";

import { deactivateInstanceSetup } from "@/lib/admin/setup/recovery";
import { initializePendingInstanceSetup } from "@/lib/admin/setup/startup";
import { getDatabasePool } from "@/lib/runtime/database";

const account = {
  email: `owner-${process.pid}@example.com`,
  name: "E2E Owner",
  password: `Initial-${process.pid}-Password!`,
};

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

  return { secret, usedCode };
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
  usedCode: string;
}

async function waitForFreshTotp(enrollment: SetupMfaEnrollment) {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    const current = generateTotp(enrollment.secret);
    if (current !== enrollment.usedCode) return current;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("fresh_totp_unavailable");
}
