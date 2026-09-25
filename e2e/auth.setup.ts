import { expect, test as setup } from "@playwright/test";
import { ADMIN, STATE } from "./fixtures";

/**
 * Every other spec runs signed in as the instance's first admin, created here
 * the way a person creates it: a fresh instance sends its first visitor to
 * /setup. The session is saved and reused, so the specs start on Today.
 */

setup("the first visitor sets the instance up", async ({ page }) => {
  await page.goto("/");

  // A retry runs against the same database, which is set up by then.
  if (new URL(page.url()).pathname.startsWith("/login")) {
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
  } else {
    await expect(page).toHaveURL(/\/setup/);
    await page.getByLabel("Your name").fill(ADMIN.name);
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
    await page.getByRole("button", { name: "Create account" }).click();
  }

  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.context().storageState({ path: STATE });
});
