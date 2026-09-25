import { expect, test } from "@playwright/test";

/**
 * The core loop, end to end: the card proposes a snack for where you are,
 * Start opens the player, and what you actually did lands in the day.
 */
test.describe("a snack from the card", () => {
  test("start it, do a set, log it", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("region", { name: "Snack now" });
    await expect(card).toBeVisible();

    // Somewhere with no floor and no sweat, and strength: the plan is sets and
    // holds rather than intervals, which keeps the path through it short.
    await card.getByRole("radio", { name: "Office" }).click();
    await card.getByRole("radio", { name: "Strength" }).click();
    const first = card.getByRole("button", { name: /^Log .+ by hand — / }).first();
    await expect(first).toBeVisible();
    const name = (await first.getAttribute("aria-label"))!.replace(/^Log (.+) by hand — .*$/, "$1");

    await card.getByRole("button", { name: "Start" }).click();
    const player = page.getByRole("dialog", { name: /^Snack: / });
    await expect(player).toBeVisible();

    // One set of the first movement: reps, or a hold.
    const done = player.getByRole("button", { name: "Done", exact: true });
    if (await done.isVisible()) {
      await done.click();
    } else {
      await player.getByRole("button", { name: "Start the clock" }).click();
      await page.waitForTimeout(1500);
      await player.getByRole("button", { name: "Stop here and count it" }).click();
    }

    // Stop early and keep what was done.
    await player.getByRole("button", { name: "Stop the snack" }).click();
    await page.getByRole("button", { name: "Log what I did" }).click();
    await player.getByRole("button", { name: "Log it" }).click();

    await expect(page.getByText(/^Snack logged — 1 set$/)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: name }).first()).toBeVisible();
  });

  test("the card says when the next one is planned", async ({ page }) => {
    await page.goto("/");
    const card = page.getByRole("region", { name: "Snack now" });
    await expect(card.getByText(/Next snack planned around \d\d:\d\d|A snack is due now|snacks done today|Nothing more fits/)).toBeVisible();
  });
});
