// UI behavior only: network fixtures are NOT evidence of database authorization.
// Actual RLS checks live in test/database.sql and scripts/test-security.mjs.
import { test, expect } from "@playwright/test";
import { rot13 } from "../../server/ciphers.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const charlie = "33333333-3333-4333-8333-333333333333";
const challenge = "44444444-4444-4444-8444-444444444444";
const profiles = [
  { id: alice, username: "Alice" },
  { id: bob, username: "Bob" },
  { id: charlie, username: "Charlie" },
];
const jwt = (id) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test-signature`;

async function fixture(context, id, shared, { failFirstSend = false } = {}) {
  let sends = 0;
  const submissions = [];
  await context.route("https://test-project.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const reply = (data, code = 200) =>
      route.fulfill({
        status: code,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (request.method() === "OPTIONS") return reply({});
    if (url.pathname === "/auth/v1/signup")
      return reply({
        access_token: jwt(id),
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh",
        user: {
          id,
          aud: "authenticated",
          role: "authenticated",
          is_anonymous: true,
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    if (url.pathname === "/auth/v1/user")
      return reply({ id, aud: "authenticated", role: "authenticated" });
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204 });
    if (url.pathname === "/rest/v1/profiles") {
      if (request.method() !== "GET") return route.fulfill({ status: 201 });
      if (url.searchParams.has("id"))
        return reply(profiles.find((p) => p.id === id));
      return reply(profiles);
    }
    if (url.pathname === "/rest/v1/broadcasts")
      return reply(shared.broadcasts.filter((m) => m.recipient_id !== id));
    if (url.pathname === "/rest/v1/inbox_messages")
      return reply(shared.inbox.filter((m) => m.recipient_id === id));
    return reply({ message: "Unhandled fixture request" }, 500);
  });
  await context.route("**/api/challenge", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: challenge,
        text: "A became D. Three places ahead.",
        label: "Dispatch from tomorrow / 03",
        expires_at: new Date(Date.now() + 600000).toISOString(),
      }),
    }),
  );
  await context.route("**/api/send", async (route) => {
    sends++;
    const body = route.request().postDataJSON();
    submissions.push(body);
    if (!shared.broadcasts.some((m) => m.id === body.submission_id)) {
      const common = {
        id: body.submission_id,
        sender_id: id,
        recipient_id: bob,
        created_at: new Date().toISOString(),
      };
      shared.broadcasts.unshift({ ...common, original: "HELLO" });
      shared.inbox.unshift({
        ...common,
        ciphertext: rot13("The moon is our manager."),
      });
    }
    if (failFirstSend && sends === 1)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Response lost after delivery." }),
      });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        delivered: true,
        engine: "fallback",
        duplicate: sends > 1,
      }),
    });
  });
  return submissions;
}

async function login(page, username) {
  await page.goto("/");
  await page.getByLabel("Your username").fill(username);
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(page.locator("#login-panel")).toBeHidden();
}

test("three isolated browser sessions compose and automatically synchronize", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [alice, bob, charlie].map(() =>
      browser.newContext({ viewport: { width: 1440, height: 1050 } }),
    ),
  );
  try {
    const shared = { broadcasts: [], inbox: [] };
    await Promise.all(
      contexts.map((context, i) =>
        fixture(context, [alice, bob, charlie][i], shared),
      ),
    );
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const errors = [];
    pages.forEach((p) => p.on("pageerror", (e) => errors.push(e.message)));
    await Promise.all(
      pages.map((p, i) => login(p, ["Alice", "Bob", "Charlie"][i])),
    );
    await pages[0].locator("#recipient").selectOption(bob);
    await expect(pages[0].locator("#puzzle")).toContainText("Three places");
    await pages[0].locator("#ciphertext").fill("KHOOR");
    await pages[0].getByRole("button", { name: "Transmit poorly" }).click();
    await expect(pages[0].getByRole("status")).toContainText(
      "Delivered poorly",
    );
    await expect(pages[2].locator("#broadcast-list .message-body")).toHaveText(
      "HELLO",
      { timeout: 10000 },
    );
    await expect(pages[1].locator("#inbox-list .message-body")).toHaveText(
      rot13("The moon is our manager."),
      { timeout: 10000 },
    );
    await expect(pages[1].locator("#broadcast-list")).not.toContainText(
      "HELLO",
    );
    await expect(pages[0].locator("#inbox-list .message")).toHaveCount(0);
    await pages[0].screenshot({
      path: "test-results/alice-desktop.png",
      fullPage: true,
    });
    await pages[1].setViewportSize({ width: 390, height: 844 });
    expect(
      await pages[1].evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await pages[1].screenshot({
      path: "test-results/bob-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test("lost response retries with the same submission ID and no duplicate messages", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const shared = { broadcasts: [], inbox: [] };
    const submissions = await fixture(context, alice, shared, {
      failFirstSend: true,
    });
    const page = await context.newPage();
    await login(page, "Alice");
    await page.locator("#recipient").selectOption(bob);
    await expect(page.locator("#ciphertext")).toBeEnabled();
    await page.locator("#ciphertext").fill("KHOOR");
    await page.getByRole("button", { name: "Transmit poorly" }).click();
    await expect(page.getByRole("status")).toContainText("Response lost");
    await page.getByRole("button", { name: "Transmit poorly" }).click();
    await expect(page.getByRole("status")).toContainText("Delivered poorly");
    expect(submissions).toHaveLength(2);
    expect(submissions[0]).toEqual(submissions[1]);
    expect(shared.broadcasts).toHaveLength(1);
    expect(shared.inbox).toHaveLength(1);
  } finally {
    await context.close();
  }
});

test("untrusted usernames and messages render as text", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await fixture(context, alice, {
      broadcasts: [
        {
          id: challenge,
          sender_id: bob,
          recipient_id: charlie,
          original: '<img src=x onerror="window.pwned=true">',
          created_at: new Date().toISOString(),
        },
      ],
      inbox: [],
    });
    const page = await context.newPage();
    await login(page, "Alice");
    await expect(page.locator("#broadcast-list .message-body")).toContainText(
      "<img src=x",
    );
    await expect(page.locator("#broadcast-list img")).toHaveCount(0);
    expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  } finally {
    await context.close();
  }
});
