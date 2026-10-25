// UI behavior only: network fixtures are NOT evidence of database authorization.
// Actual RLS checks live in test/database.sql and scripts/test-security.mjs.
import { test, expect } from "@playwright/test";
import { rot13 } from "../../server/ciphers.js";
import { scoreConversation } from "../../server/meter.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const charlie = "33333333-3333-4333-8333-333333333333";
const challenge = "44444444-4444-4444-8444-444444444444";
const headline = "BREAKING: Friendly Greeting Sparks Diplomatic Emergency";
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
        text: rot13("A became D. Three places ahead."),
        encoding: "rot13",
        hint: "Envelope: ROT13. A ↔ N, B ↔ O. Decode this dispatch to discover your outgoing cipher.",
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
      shared.broadcasts.unshift({ ...common, original: headline });
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
  await context.route("**/api/meter", (route) => {
    const body = route.request().postDataJSON();
    const ids = [body.user_a, body.user_b].sort();
    const count = shared.broadcasts.filter(
      (row) =>
        ids.includes(row.sender_id) &&
        ids.includes(row.recipient_id) &&
        row.sender_id !== row.recipient_id,
    ).length;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        fictional: true,
        pair: ids.map((id) => profiles.find((p) => p.id === id)),
        message_count: count,
        metrics: scoreConversation(ids, count),
      }),
    });
  });
  return submissions;
}

async function login(page, username, path = "/") {
  await page.goto(path);
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
    await expect(pages[0].locator("#puzzle")).toHaveText(
      rot13("A became D. Three places ahead."),
    );
    await expect(pages[0].locator("#puzzle")).not.toContainText("Three places");
    await expect(pages[0].locator("#puzzle-hint")).toContainText("ROT13");
    await pages[0].locator("#ciphertext").fill("KHOOR");
    await pages[0].getByRole("button", { name: "Transmit poorly" }).click();
    await expect(pages[0].getByRole("status")).toContainText(
      "Delivered poorly",
    );
    await expect(pages[2].locator("#broadcast-list .message-body")).toHaveText(
      headline,
      { timeout: 10000 },
    );
    await expect(pages[1].locator("#inbox-list .message-body")).toHaveText(
      rot13("The moon is our manager."),
      { timeout: 10000 },
    );
    await expect(pages[1].locator("#broadcast-list")).not.toContainText(
      headline,
    );
    await expect(
      pages[2].locator("#broadcast-list .message-body"),
    ).not.toHaveText("HELLO");
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

test("an observer can inspect any pair, swap users, and use the meter on mobile without fetching message contents", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  try {
    await fixture(context, charlie, {
      broadcasts: [
        {
          id: "one",
          sender_id: alice,
          recipient_id: bob,
          original: "private headline",
        },
        {
          id: "two",
          sender_id: bob,
          recipient_id: alice,
          original: "another private headline",
        },
        {
          id: "three",
          sender_id: charlie,
          recipient_id: alice,
          original: "unrelated pair",
        },
      ],
      inbox: [],
    });
    const page = await context.newPage();
    const requests = [],
      errors = [];
    page.on("request", (req) => requests.push(req.url()));
    page.on("pageerror", (error) => errors.push(error.message));
    await login(page, "Charlie", "/miscommunication-meter");
    await expect(
      page.getByRole("heading", { name: "Miscommunication Meter." }),
    ).toBeVisible();
    await page.locator("#meter-user-a").selectOption(alice);
    await page.locator("#meter-user-b").selectOption(bob);
    await expect(page.locator("#meter-count")).toHaveText(
      "2 transmitted misunderstandings",
    );
    await expect(page.locator("#meter-understanding")).toHaveText(/^-\d+%$/);
    const understanding = await page
      .locator("#meter-understanding")
      .innerText();
    await page.getByRole("button", { name: "Swap people" }).click();
    await expect(page.locator("#meter-understanding")).toHaveText(
      understanding,
    );
    await expect(page.locator("#meter-pair")).toHaveText("Alice × Bob");
    expect(
      requests.some((url) =>
        /\/rest\/v1\/(broadcasts|inbox_messages)/.test(url),
      ),
    ).toBe(false);
    await expect(page.locator("main")).not.toContainText("private headline");
    await page.screenshot({
      path: "test-results/meter-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "Back to messenger" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/meter-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("meter handles no messages and identical people without displaying made-up successful scores", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    await fixture(context, alice, { broadcasts: [], inbox: [] });
    const page = await context.newPage();
    await login(page, "Alice", "/miscommunication-meter");
    await expect(page.locator("#meter-empty")).toBeVisible();
    await expect(page.locator("#meter-understanding")).toHaveText("—");
    await page.locator("#meter-user-b").selectOption(alice);
    await expect(page.locator("#meter-status")).toContainText(
      "two different people",
    );
    await expect(page.locator("#meter-refresh")).toBeDisabled();
  } finally {
    await context.close();
  }
});

test("meter automatically changes after a new message and stays stable across reloads", async ({
  browser,
}) => {
  const context = await browser.newContext();
  try {
    const shared = {
      broadcasts: [{ id: "one", sender_id: alice, recipient_id: bob }],
      inbox: [],
    };
    await fixture(context, alice, shared);
    const page = await context.newPage();
    await login(page, "Alice", "/miscommunication-meter");
    await expect(page.locator("#meter-count")).toHaveText(
      "1 transmitted misunderstanding",
    );
    const before = await page.locator("#meter-understanding").innerText();
    shared.broadcasts.push({ id: "two", sender_id: bob, recipient_id: alice });
    await expect(page.locator("#meter-count")).toHaveText(
      "2 transmitted misunderstandings",
      { timeout: 16000 },
    );
    const after = await page.locator("#meter-understanding").innerText();
    expect(parseInt(after)).toBeLessThan(parseInt(before));
    await page.reload();
    await expect(page.locator("#meter-understanding")).toHaveText(after);
  } finally {
    await context.close();
  }
});

test("meter errors clear the previous scorecard", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    await fixture(context, alice, {
      broadcasts: [{ id: "one", sender_id: alice, recipient_id: bob }],
      inbox: [],
    });
    const page = await context.newPage();
    await login(page, "Alice", "/miscommunication-meter");
    await expect(page.locator("#meter-count")).toHaveText(
      "1 transmitted misunderstanding",
    );
    await context.route("**/api/meter", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Meter temporarily unavailable" }),
      }),
    );
    await page.getByRole("button", { name: "Recalculate the damage" }).click();
    await expect(page.locator("#meter-status")).toContainText(
      "Meter temporarily unavailable",
    );
    await expect(page.locator("#meter-understanding")).toHaveText("—");
  } finally {
    await context.close();
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
