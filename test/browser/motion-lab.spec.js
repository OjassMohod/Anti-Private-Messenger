import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("standalone lab animates, freezes, resumes, and makes no application-service requests", async ({
  page,
}) => {
  const serviceRequests = [],
    errors = [];
  page.on("request", (request) => {
    if (/\/api\/|supabase|groq/.test(request.url()))
      serviceRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/motion-lab");
  await expect(
    page.getByRole("heading", { name: "Read between the dots." }),
  ).toBeVisible();
  const canvas = page.locator("#motion-canvas");
  await expect(
    page.getByRole("button", { name: "Pause motion" }),
  ).toBeVisible();
  const first = await canvas.evaluate((el) => el.toDataURL());
  await expect
    .poll(() => canvas.evaluate((el) => el.toDataURL()))
    .not.toBe(first);
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await expect(page.getByRole("button", { name: "Play motion" })).toBeVisible();
  const frozen = await canvas.evaluate((el) => el.toDataURL());
  await page.waitForTimeout(350);
  expect(await canvas.evaluate((el) => el.toDataURL())).toBe(frozen);
  await expect(page.locator("#readable-text")).toBeHidden();
  await page.screenshot({
    path: "test-results/motion-lab-frozen.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Play motion" }).click();
  await expect
    .poll(() => canvas.evaluate((el) => el.toDataURL()))
    .not.toBe(frozen);
  expect(serviceRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("lab exports an actual PNG still frame", async ({ page }) => {
  await page.goto("/motion-lab");
  await page.getByRole("button", { name: "Freeze frame" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save still frame" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("anti-private-motion-still.png");
  const bytes = await readFile(await download.path());
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(bytes.length).toBeGreaterThan(1000);
});

test("reduced-motion mode starts paused and offers an explicit readable alternative", async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto("/motion-lab");
    await expect(
      page.getByRole("button", { name: "Play motion" }),
    ).toBeVisible();
    await expect(page.locator("#lab-status")).toContainText("Reduced motion");
    await expect(page.locator("#readable-text")).toBeHidden();
    await page.getByRole("button", { name: "Readable mode" }).click();
    await expect(page.locator("#readable-message")).toHaveText(
      "GUERR FGRCF SBEJNEQ",
    );
    await expect(
      page.getByRole("button", { name: "Hide readable text" }),
    ).toHaveAttribute("aria-expanded", "true");
  } finally {
    await context.close();
  }
});

test("custom text changes only motion, not the initial static geometry, and fits on phones", async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/motion-lab");
    await expect(page.locator("#dot-count")).toContainText("dots");
    const before = await page
      .locator("#motion-canvas")
      .evaluate((el) => el.toDataURL());
    await page.getByText("Adjust lab controls", { exact: true }).click();
    await page.locator("#dispatch").selectOption("custom");
    await page.locator("#custom-text").fill("A DIFFERENT TEST MESSAGE");
    const after = await page
      .locator("#motion-canvas")
      .evaluate((el) => el.toDataURL());
    expect(after).toBe(before);
    await page.getByRole("button", { name: "Readable mode" }).click();
    await expect(page.locator("#readable-message")).toHaveText(
      "A DIFFERENT TEST MESSAGE",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/motion-lab-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
