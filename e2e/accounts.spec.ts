import { expect, test } from "@playwright/test";
import { ADMIN } from "./fixtures";

/**
 * A second person on the same instance: invited by the admin, signed up
 * through their link, and starting from an empty log however busy the admin's
 * has been.
 */
test.describe("a second account", () => {
  test("joins by invitation and sees none of anyone else's log", async ({ page, browser }) => {
    // Something in the admin's day, so there is something not to see.
    await page.goto("/");
    const today = new URL(page.url()).pathname.split("/").pop()!;
    const { exercises } = await (await page.request.get("/api/exercises")).json();
    const plank = exercises.find((e: { name: string }) => e.name === "Plank").id;
    const logged = await page.request.post("/api/entries", {
      data: { exerciseId: plank, performedTime: "07:15", localDate: today, sets: 1, durationSec: 45 },
    });
    expect(logged.ok()).toBe(true);
    const entryId = (await logged.json()).entries[0].id;

    const email = `second-${Date.now()}@example.com`;
    const invite = await page.request.post("/api/admin/invites", { data: { email } });
    expect(invite.ok()).toBe(true);
    const { url } = await invite.json();

    // A different person, a different browser: no cookies from the admin.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const second = await context.newPage();
      await second.goto(new URL(url).pathname);
      await second.getByLabel("Your name").fill("Second");
      // An addressed invitation fills in, and locks, the address it is for.
      await expect(second.getByLabel("Email")).toHaveValue(email);
      await expect(second.getByLabel("Email")).toBeDisabled();
      await second.getByLabel("Password", { exact: true }).fill("a second long passphrase");
      await second.getByRole("button", { name: "Create account" }).click();

      await expect(second.getByRole("heading", { name: "Today" })).toBeVisible();
      await expect(second.getByText("Nothing logged yet.")).toBeVisible();
      await expect(second.getByRole("listitem").filter({ hasText: "Plank" })).toHaveCount(0);

      // And the console is not theirs to find.
      const admin = await second.goto("/admin");
      expect(admin?.status()).toBe(404);
    } finally {
      await context.close();
      await page.request.delete(`/api/entries/${entryId}`);
    }
  });

  test("signing in and out", async ({ browser }) => {
    // Its own session, through the sign-in page: signing out of the one the
    // other specs share would sign all of them out too.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await page.goto("/settings");
      await expect(page).toHaveURL(/\/login\?next=%2Fsettings/);
      await page.getByLabel("Email").fill(ADMIN.email);
      await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      // Back where they were headed.
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

      await page.locator("#account").getByRole("button", { name: "Sign out", exact: true }).last().click();
      await expect(page).toHaveURL(/\/login/);
      await page.goto("/");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await context.close();
    }
  });
});
