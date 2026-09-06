import { expect, test } from "@playwright/test";

/**
 * One end-to-end path through the parts a unit test cannot reach: that a
 * logged entry actually reaches the database, shows up in the day list, shades
 * the right muscle, and can be deleted and restored.
 */
test.describe("logging a snack", () => {
  test("add, verify, delete, undo, delete again", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("Nothing logged yet")).toBeVisible();

    // --- add a pull-up manually -------------------------------------------
    await page.getByRole("button", { name: "Log a snack" }).click();
    await page.getByRole("tab", { name: "Manual" }).click();

    await page.getByLabel("Exercise", { exact: true }).fill("Pull-up");
    await page.getByRole("button", { name: "Pull-up", exact: true }).click();
    await page.getByLabel("Sets", { exact: true }).fill("3");
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page.getByRole("button", { name: "Log it" }).click();

    // --- it appears in the day's list -------------------------------------
    const entry = page.getByRole("listitem").filter({ hasText: "Pull-up" });
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("3 x 8");
    await expect(page.getByText("1 entry · 3 sets")).toBeVisible();

    // --- and shades the muscles it trains ---------------------------------
    // Pull-ups are a lats movement; the drawn upper-back area carries it.
    const upperBack = page.getByRole("button", { name: /Lats \/ Mid back/ });
    await expect(upperBack).toHaveAttribute("aria-label", /3 effective sets/);
    // A muscle it does not train stays at zero.
    await expect(page.getByRole("button", { name: /^Quads/ }).first()).toHaveAttribute(
      "aria-label",
      /0 effective sets/,
    );

    // --- delete it, then undo ---------------------------------------------
    await entry.getByRole("button", { name: "Edit Pull-up" }).click();
    await page.getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByText("Deleted Pull-up")).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    const restored = page.getByRole("listitem").filter({ hasText: "Pull-up" });
    await expect(restored).toBeVisible();
    // Undo restores the original entry, not a fresh one logged at "now".
    await expect(restored).toContainText("3 x 8");

    // --- delete for good ---------------------------------------------------
    await restored.getByRole("button", { name: "Edit Pull-up" }).click();
    await page.getByRole("button", { name: "Delete entry" }).click();
    await expect(page.getByText("Nothing logged yet")).toBeVisible();
  });
});

test.describe("navigation", () => {
  test("moves between days and back to today", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    // Forward is disabled on today — there is nothing to log in the future.
    await expect(page.getByRole("button", { name: "Next day" })).toBeDisabled();

    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Next day" })).toBeEnabled();

    await page.getByRole("button", { name: "Previous day" }).click();
    await page.getByRole("button", { name: "Jump to today" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("reaches the calendar and stats tabs", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Calendar" }).click();
    await expect(page.getByRole("heading", { name: "This month" })).toBeVisible();

    await page.getByRole("link", { name: "Stats" }).click();
    await expect(page.getByRole("heading", { name: "Coverage" })).toBeVisible();
    // Every window must be offered, and switching must not blank the page.
    await page.getByRole("tab", { name: "90d" }).click();
    await expect(page.getByText("Compare with the previous 90 days")).toBeVisible();
  });
});
