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

/**
 * The cardio path end to end: that a run reaches the database, is described by
 * where it went rather than by how many sets of it there were, and — the point
 * of the whole design — does not turn up as leg volume on the body map.
 */
test.describe("cardio and steps", () => {
  test("a run is logged by distance and stays out of the muscle totals", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Log a snack" }).click();
    await page.getByRole("tab", { name: "Manual" }).click();

    await page.getByLabel("Exercise", { exact: true }).fill("Run");
    await page.getByRole("button", { name: "Run", exact: true }).click();

    // Distance and heart rate appear only for a movement that has a pace.
    await page.getByLabel("Distance (km)", { exact: true }).fill("5");
    await page.getByLabel("Duration (min)", { exact: true }).fill("27.5");
    await page.getByRole("button", { name: "Log it" }).click();

    const entry = page.getByRole("listitem").filter({ hasText: "Run" });
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("5 km");
    await expect(entry).toContainText("5:30/km");

    // The run trains quads in real life, and contributes no hypertrophy volume
    // here — which is exactly what keeps the radar and "needs attention" honest.
    await expect(page.getByRole("button", { name: /^Quads/ }).first()).toHaveAttribute(
      "aria-label",
      /0 effective sets/,
    );
    // But it is not invisible: the same region carries a cardio reading.
    await expect(page.getByRole("button", { name: /^Quads/ }).first()).toHaveAttribute(
      "aria-label",
      /cardio MET-minutes/,
    );
  });

  test("steps are recorded against the day", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /Add today.s steps/ }).click();
    await page.getByLabel("Steps", { exact: true }).fill("11000");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("button", { name: /11,000 steps/ })).toBeVisible();
  });

  test("the radar carries both a strength and a cardio line", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByRole("heading", { name: "Coverage" })).toBeVisible();

    // Identity is never carried by colour alone: both series are named.
    await expect(page.getByText("Strength", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Cardio", { exact: true }).first()).toBeVisible();
  });

  test("the calendar names both qualities, never colour alone", async ({ page }) => {
    // Seeded through the API rather than the UI: this test is about how the
    // calendar reports a day, not about the logging flow, which is covered
    // above.
    await page.goto("/");
    const today = new URL(page.url()).pathname.split("/").pop()!;

    const { exercises } = await (await page.request.get("/api/exercises")).json();
    const id = (name: string) =>
      exercises.find((e: { name: string }) => e.name === name)?.id as string;

    await page.request.post("/api/entries", {
      data: { exerciseId: id("Run"), performedTime: "07:00", localDate: today, sets: 1, distanceM: 5000, durationSec: 1650 },
    });
    // Deliberately not a movement another test filters the day list on: these
    // entries outlive this test, and two matching rows would break the strict
    // locator in the retiming test below.
    await page.request.post("/api/entries", {
      data: { exerciseId: id("Bench press"), performedTime: "17:00", localDate: today, sets: 4, reps: 10 },
    });

    await page.goto("/calendar");
    // A day that carried both is washed in the strength colour and ringed in
    // the cardio one; the label has to say so for anyone who cannot see that.
    await expect(
      page.getByRole("link", { name: new RegExp(`^${today}: .*effective sets.*cardio MET-minutes`) }),
    ).toBeVisible();
  });

  test("the balance marker appears on stats", async ({ page }) => {
    await page.goto("/stats");

    await expect(page.getByRole("heading", { name: "Coverage" })).toBeVisible();
    // The marker is a labelled image so the position is never carried by
    // colour alone.
    await expect(page.getByRole("img", { name: /Training balance/ })).toBeVisible();
  });
});

/**
 * The retiming path. A run done at 06:30 and only logged in the evening has to
 * be movable to the morning, or every timing measure in the app is really a
 * measure of when the user reached for their phone.
 */
test.describe("when it happened", () => {
  test("an entry can be filed at the time it was actually done", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Log a snack" }).click();
    await page.getByRole("tab", { name: "Manual" }).click();
    await page.getByLabel("Exercise", { exact: true }).fill("Goblet");
    await page.getByRole("button", { name: "Goblet squat", exact: true }).click();
    await page.getByLabel("Time", { exact: true }).fill("06:30");
    await page.getByRole("button", { name: "Log it" }).click();

    const entry = page.getByRole("listitem").filter({ hasText: "Goblet squat" });
    await expect(entry).toBeVisible();
    await expect(entry.getByRole("time")).toHaveText("06:30");

    // And it can be corrected afterwards, which is the case that matters: the
    // run you forgot to log until the evening.
    await entry.getByRole("button", { name: "Edit Goblet squat" }).click();
    await page.getByLabel("Time", { exact: true }).fill("18:45");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("listitem").filter({ hasText: "Goblet squat" }).getByRole("time"))
      .toHaveText("18:45");

    // The day now has something logged, so it is scored for how it was spread.
    await expect(page.getByText("Spread through the day")).toBeVisible();

    await page.getByRole("listitem").filter({ hasText: "Goblet squat" })
      .getByRole("button", { name: "Edit Goblet squat" }).click();
    await page.getByRole("button", { name: "Delete entry" }).click();
  });

  test("the day opens with a suggestion of what to train next", async ({ page }) => {
    await page.goto("/");
    // Named, reasoned and tappable — never a bare colour or an unexplained pick.
    await expect(page.getByRole("button", { name: /^Log .+ — / })).toBeVisible();
  });
});
