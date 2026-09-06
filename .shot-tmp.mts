import { chromium } from "@playwright/test";
const [, , url, out, theme = "dark"] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
  colorScheme: theme as "dark" | "light", isMobile: true, hasTouch: true,
});
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(errors.length ? "ISSUES:\n" + errors.join("\n") : "clean");
