// Runs against your real Supabase project and app. Creates and deletes ONLY its own test users.
// Never logs credentials or access tokens. Run on a dedicated hackathon project.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { rot13 } from "../server/ciphers.js";

const env = process.env;
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const base = env.TEST_BASE_URL || "http://127.0.0.1:5173";
if (!url || !key || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase configuration. Set the four variables from .env.example securely, start npm run dev, then retry.",
  );
  process.exit(1);
}
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(10000) }),
  },
};
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, options);
const users = [];
const channels = [];
const run = randomUUID().slice(0, 6);
let stage = "creating isolated anonymous test users";
const ok = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const pass = (message) => console.log(`PASS: ${message}`);
const count = async (user, table, id) =>
  ok(await user.client.from(table).select("id").eq("id", id)).length;
async function api(path, user, body, authenticated = true) {
  const res = await fetch(new URL(`/api/${path}`, base), {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${user.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, body: json };
}
async function subscribe(user, table, events) {
  const channel = user.client
    .channel(`security-${run}-${user.id}-${table}`)
    .on(
      "postgres_changes",
      { schema: "public", table, event: "INSERT" },
      (event) => events.push(event.new),
    );
  channels.push({ client: user.client, channel });
  await new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error(`Realtime ${table} subscription timed out`)),
      15000,
    );
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (["TIMED_OUT", "CHANNEL_ERROR"].includes(status)) {
        clearTimeout(timer);
        reject(new Error(`Realtime ${table} subscription failed`));
      }
    });
  });
}
try {
  for (const name of ["Alice", "Bob", "Charlie"]) {
    const client = createClient(url, key, options);
    const auth = ok(await client.auth.signInAnonymously());
    const user = { client, id: auth.user.id, token: auth.session.access_token };
    users.push(user);
    ok(
      await client
        .from("profiles")
        .insert({ id: user.id, username: `${name}-${run}` }),
    );
  }
  const [alice, bob, charlie] = users;
  pass("three real anonymous users and own profiles");
  stage = "checking client write restrictions";
  assert.ok(
    (
      await bob.client
        .from("profiles")
        .update({ username: "forged" })
        .eq("id", alice.id)
        .select()
    ).data?.length === 0,
  );
  assert.ok((await bob.client.from("challenges").select("*")).error);
  assert.ok(
    (
      await alice.client.rpc("issue_challenge", {
        p_sender_id: alice.id,
        p_recipient_id: bob.id,
        p_cipher: "caesar",
      })
    ).error,
  );
  assert.ok(
    (
      await alice.client.rpc("deliver_message", {
        p_sender_id: alice.id,
        p_challenge_id: randomUUID(),
        p_submission_id: randomUUID(),
        p_ciphertext: "x",
        p_original: "x",
        p_inbox_ciphertext: "x",
        p_engine: "fallback",
      })
    ).error,
  );
  assert.ok(
    (
      await alice.client
        .from("broadcasts")
        .insert({
          id: randomUUID(),
          challenge_id: randomUUID(),
          sender_id: alice.id,
          recipient_id: bob.id,
          original: "forged",
        })
    ).error,
  );
  assert.ok(
    (
      await alice.client
        .from("inbox_messages")
        .insert({
          id: randomUUID(),
          challenge_id: randomUUID(),
          sender_id: alice.id,
          recipient_id: bob.id,
          ciphertext: "forged",
          engine: "fallback",
        })
    ).error,
  );
  pass("profile isolation, challenge secrecy, direct writes and RPC denial");

  stage = "subscribing with independent authenticated users";
  const bobBroadcasts = [],
    bobInbox = [],
    charlieBroadcasts = [];
  await Promise.all([
    subscribe(bob, "broadcasts", bobBroadcasts),
    subscribe(bob, "inbox_messages", bobInbox),
    subscribe(charlie, "broadcasts", charlieBroadcasts),
  ]);
  stage = "authenticating and delivering through deployed API";
  assert.equal(
    (await api("challenge", alice, { recipient_id: bob.id }, false)).status,
    401,
  );
  const issued = await api("challenge", alice, {
    recipient_id: bob.id,
    sender_id: charlie.id,
  });
  assert.equal(issued.status, 200, "Challenge endpoint must succeed");
  const payload = {
    challenge_id: issued.body.id,
    submission_id: randomUUID(),
    ciphertext: issued.body.text.includes("A became D") ? "KHOOR" : "SVOOL",
    sender_id: charlie.id,
    recipient_id: charlie.id,
  };
  assert.equal(
    (await api("send", bob, payload)).status,
    409,
    "Bob must not use Alice’s challenge",
  );
  const sent = await api("send", alice, payload);
  assert.equal(sent.status, 200, "Send endpoint must succeed");
  assert.equal(sent.body.delivered, true);
  assert.equal(sent.body.original, undefined);
  assert.equal(sent.body.ciphertext, undefined);
  const retry = await api("send", alice, payload);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  pass(
    "authenticated sender, challenge ownership, secret-free response and idempotent retry",
  );

  stage = "testing recipient exclusion through actual Supabase REST queries";
  assert.equal(await count(alice, "broadcasts", payload.submission_id), 1);
  assert.equal(await count(charlie, "broadcasts", payload.submission_id), 1);
  assert.equal(await count(bob, "broadcasts", payload.submission_id), 0);
  assert.equal(await count(alice, "inbox_messages", payload.submission_id), 0);
  assert.equal(
    await count(charlie, "inbox_messages", payload.submission_id),
    0,
  );
  assert.equal(await count(bob, "inbox_messages", payload.submission_id), 1);
  const broadcast = ok(
    await charlie.client
      .from("broadcasts")
      .select("original,sender_id,recipient_id")
      .eq("id", payload.submission_id)
      .single(),
  );
  assert.equal(broadcast.original, "HELLO");
  assert.equal(broadcast.sender_id, alice.id);
  assert.equal(broadcast.recipient_id, bob.id);
  const inbox = ok(
    await bob.client
      .from("inbox_messages")
      .select("ciphertext")
      .eq("id", payload.submission_id)
      .single(),
  );
  assert.notEqual(rot13(inbox.ciphertext).toUpperCase(), "HELLO");
  const visitor = createClient(url, key, options);
  assert.ok((await visitor.from("broadcasts").select("*")).error);
  pass(
    "Alice/Charlie see original; Bob excluded even by ID; only Bob reads inbox; anonymous visitor denied",
  );

  stage = "verifying actual Realtime delivery and exclusion";
  for (
    let i = 0;
    i < 40 &&
    (!bobInbox.some((m) => m.id === payload.submission_id) ||
      !charlieBroadcasts.some((m) => m.id === payload.submission_id));
    i++
  )
    await setTimeout(250);
  assert.ok(
    charlieBroadcasts.some((m) => m.id === payload.submission_id),
    "Charlie must receive allowed event",
  );
  assert.ok(
    bobInbox.some((m) => m.id === payload.submission_id),
    "Bob must receive inbox event",
  );
  await setTimeout(1500);
  assert.ok(
    !bobBroadcasts.some((m) => m.id === payload.submission_id),
    "Bob must not receive excluded event",
  );
  pass(
    "actual Realtime delivery to observer/inbox, with recipient broadcast exclusion",
  );
} catch (error) {
  console.error(`FAIL during ${stage}: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const { client, channel } of channels)
    await client.removeChannel(channel);
  for (const user of users) {
    const result = await admin.auth.admin.deleteUser(user.id);
    if (result.error) {
      console.error(
        `Cleanup failed for test user ${user.id}. Remove it in Supabase Auth → Users.`,
      );
      process.exitCode = 1;
    }
  }
}
