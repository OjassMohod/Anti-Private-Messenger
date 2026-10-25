import { test, expect } from "@playwright/test";
import {
  demoAssets,
  pitchTurns,
  encodePrepared,
  encodeInbox,
} from "../../src/pitch-data.js";

async function sampleImage(page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext("2d");
    context.fillStyle = "#547e36";
    context.fillRect(0, 0, 16, 16);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(base64, "base64");
}
async function addImages(page, assets = demoAssets) {
  await page.locator("#asset-setup").evaluate((el) => {
    el.open = true;
  });
  const buffer = await sampleImage(page);
  for (const [index, asset] of assets.entries()) {
    await page.locator(`input[data-asset="${asset.id}"]`).setInputFiles({
      name: `${asset.id}.png`,
      mimeType: "image/png",
      buffer,
    });
    await expect(page.locator("#asset-count")).toHaveText(
      `${index + 1} / 8 ready`,
    );
  }
}
async function startConversation(page) {
  await page.getByRole("button", { name: "Start scripted demo" }).click();
  await expect(page.locator("#ghost-font-preview")).toBeVisible();
  await page
    .getByRole("button", { name: "Continue with readable text" })
    .click();
}

test("the opening concept video plays, seeks and pauses when continuing into the conversation", async ({
  page,
}) => {
  const videoRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/pitch-media/"))
      videoRequests.push(request.url());
  });
  await page.goto("/pitch-demo");
  expect(videoRequests).toEqual([]);
  await page.getByRole("button", { name: "Start scripted demo" }).click();
  const video = page.locator("#ghost-font-preview");
  await expect(video).toBeVisible();
  await expect(page.locator("#demo-stage")).toContainText(
    "For this pitch, we'll use normal text",
  );
  await expect(page.locator("#perspectives")).toBeHidden();
  await expect
    .poll(() => video.evaluate((el) => el.readyState))
    .toBeGreaterThanOrEqual(2);
  const metadata = await video.evaluate((el) => ({
    duration: el.duration,
    width: el.videoWidth,
    height: el.videoHeight,
    muted: el.muted,
    controls: el.controls,
    loop: el.loop,
    inline: el.playsInline,
  }));
  expect(metadata).toMatchObject({
    width: 1280,
    height: 720,
    muted: true,
    controls: true,
    loop: true,
    inline: true,
  });
  expect(metadata.duration).toBeGreaterThan(6);
  expect(metadata.duration).toBeLessThan(7);
  await expect
    .poll(() => video.evaluate((el) => el.currentTime))
    .toBeGreaterThan(0.1);
  await video.evaluate((el) => {
    el.pause();
    el.currentTime = 2;
  });
  await expect.poll(() => video.evaluate((el) => el.seeking)).toBe(false);
  expect(await video.evaluate((el) => el.currentTime)).toBeCloseTo(2, 1);
  await video.evaluate((el) => el.focus());
  await page.keyboard.press("ArrowRight");
  await expect(video).toBeVisible();
  await page.screenshot({
    path: "test-results/pitch-ghost-font.png",
    fullPage: true,
  });
  await video.evaluate((el) => el.play());
  const previousVideo = await video.elementHandle();
  await page
    .getByRole("button", { name: "Continue with readable text" })
    .click();
  expect(await previousVideo.evaluate((el) => el.paused)).toBe(true);
  await expect(video).toHaveCount(0);
  await expect(page.locator("#demo-stage h2")).toHaveText("Afaan sends.");
  await page.locator("#previous-cue").click();
  await expect(video).toBeVisible();
  await page.locator("#reset-demo").click();
  await expect(video).toHaveCount(0);
  await page.getByRole("button", { name: "Start scripted demo" }).click();
  await expect(video).toBeVisible();
  expect(videoRequests.length).toBeGreaterThan(0);
});

test("reduced-motion users can play the concept manually or continue without playback", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/pitch-demo");
  await page.getByRole("button", { name: "Start scripted demo" }).click();
  const video = page.locator("#ghost-font-preview");
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((el) => el.readyState))
    .toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((el) => el.paused)).toBe(true);
  expect(await video.evaluate((el) => el.currentTime)).toBe(0);
  await page
    .getByRole("button", { name: "Continue with readable text" })
    .click();
  await expect(page.locator("#demo-stage h2")).toHaveText("Afaan sends.");
});

test("all four scripted scenes preserve the text, images and presentation perspectives without live service calls", async ({
  page,
}) => {
  const network = [],
    errors = [];
  page.on("request", (request) => {
    if (/\/api\/|supabase|groq/.test(request.url()))
      network.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/pitch-demo");
  await addImages(page);
  await startConversation(page);
  for (const [index, turn] of pitchTurns.entries()) {
    await expect(page.locator("#demo-stage h2")).toHaveText(
      `${turn.sender} sends.`,
    );
    await expect(page.locator(".intent>p")).toHaveText(turn.original);
    await page.locator("#fill-ciphertext").click();
    await expect(page.locator("#demo-ciphertext")).toHaveValue(
      encodePrepared(turn.original),
    );
    await page.locator("#demo-send button[type=submit]").click();
    await expect(page.locator("#demo-stage h2")).toHaveText(
      `${turn.recipient} receives.`,
    );
    await expect(page.locator(".script-text")).toHaveText(
      encodeInbox(turn.interpretation),
    );
    await expect(page.locator(".reaction img")).toHaveAttribute(
      "alt",
      demoAssets.find((asset) => asset.id === turn.recipientAsset).description,
    );
    await page.locator("#next-cue").click();
    await expect(page.locator(".script-text")).toHaveText(turn.interpretation);
    if (index === 3) {
      const reaction = await page.locator(".reaction").boundingBox();
      expect(reaction.y + reaction.height).toBeLessThanOrEqual(
        page.viewportSize().height,
      );
      await page.screenshot({
        path: "test-results/pitch-recipient.png",
        fullPage: true,
      });
    }
    await page.locator("#next-cue").click();
    await expect(page.locator(".script-text")).toHaveText(turn.headline);
    await expect(page.locator(".reaction img")).toHaveAttribute(
      "alt",
      demoAssets.find((asset) => asset.id === turn.broadcastAsset).description,
    );
    await page.locator("#broadcast-viewer").selectOption(turn.recipient);
    await expect(page.locator("#demo-stage")).not.toContainText(turn.headline);
    await page.locator("#broadcast-viewer").selectOption("Observer");
    await expect(page.locator(".script-text")).toHaveText(turn.headline);
    if (index === 3)
      await page.screenshot({
        path: "test-results/pitch-broadcast.png",
        fullPage: true,
      });
    await page.locator("#next-cue").click();
  }
  await expect(
    page.getByRole("heading", { name: "Four messages. Zero understanding." }),
  ).toBeVisible();
  await page.locator("#reset-demo").click();
  await expect(
    page.getByRole("button", { name: "Start scripted demo" }),
  ).toBeVisible();
  await expect(page.locator("#asset-count")).toHaveText("8 / 8 ready");
  expect(network).toEqual([]);
  expect(errors).toEqual([]);
});

test("locally added images survive a reload and replay reset", async ({
  page,
}) => {
  await page.goto("/pitch-demo");
  await addImages(page, [demoAssets[6]]);
  await page.reload();
  await expect(page.locator("#asset-count")).toHaveText("1 / 8 ready");
  await page.locator("#asset-setup").evaluate((el) => {
    el.open = true;
  });
  expect(
    await page
      .locator('.asset-slot img[alt="Cat having a drink poured: Aur daal"]')
      .evaluate((image) => image.complete && image.naturalWidth > 0),
  ).toBe(true);
  await page.getByRole("button", { name: "Start scripted demo" }).click();
  await page.locator("#reset-demo").click();
  await expect(page.locator("#asset-count")).toHaveText("1 / 8 ready");
});

test("keyboard cue control works, typing does not advance the demo, and incorrect ciphertext is rejected", async ({
  page,
}) => {
  await page.goto("/pitch-demo");
  await startConversation(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#demo-ciphertext")).toHaveValue("khb");
  await page.locator("#demo-ciphertext").fill("wrong");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#demo-send")).toBeVisible();
  await page.locator("#demo-send button[type=submit]").click();
  await expect(page.locator("#demo-status")).toContainText(
    "expects the prepared message",
  );
  await page.locator("#fill-ciphertext").click();
  await page.locator("#next-cue").click();
  await expect(page.locator(".script-text")).toHaveText(
    encodeInbox(pitchTurns[0].interpretation),
  );
  await page.locator("#next-cue").click();
  await expect(page.locator(".script-text")).toHaveText(
    pitchTurns[0].interpretation,
  );
  await page.locator("#previous-cue").click();
  await expect(page.locator(".script-text")).toHaveText(
    encodeInbox(pitchTurns[0].interpretation),
  );
});

test("image validation rejects non-images and the demo fits a phone", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/pitch-demo");
    await page.locator("#asset-setup").evaluate((el) => {
      el.open = true;
    });
    await page.locator('input[data-asset="kiss"]').setInputFiles({
      name: "not-an-image.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("not an image"),
    });
    await expect(page.locator("#asset-status")).toContainText("Choose a PNG");
    await expect(page.locator("#asset-count")).toHaveText("0 / 8 ready");
    await startConversation(page);
    await page.locator("#next-cue").click();
    await page.locator("#next-cue").click();
    await page.locator("#next-cue").click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/pitch-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
