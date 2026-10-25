import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createSendHandler } from "../api/send.js";
import { createChallengeHandler } from "../api/challenge.js";
import { authenticate } from "../server/database.js";
import { rot13, puzzles } from "../server/ciphers.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const challenge = "33333333-3333-4333-8333-333333333333";
const submission = "44444444-4444-4444-8444-444444444444";
const payload = {
  challenge_id: challenge,
  submission_id: submission,
  ciphertext: "KHOOR",
  sender_id: bob,
};
function database(row = {}) {
  const fixture = {
    id: challenge,
    cipher: "caesar",
    recipient_id: bob,
    expires_at: new Date(Date.now() + 60000).toISOString(),
    used_at: null,
    ...row,
  };
  const calls = [];
  const db = {
    calls,
    auth: {
      getUser: async (token) => ({
        data: { user: token === "valid" ? { id: alice } : null },
        error: token === "valid" ? null : new Error(),
      }),
    },
    from: (table) => {
      calls.push(["from", table]);
      const builder = {
        select: () => builder,
        eq: (key, value) => {
          calls.push(["eq", key, value]);
          return builder;
        },
        maybeSingle: async () => ({
          data: row === null ? null : fixture,
          error: null,
        }),
      };
      return builder;
    },
    rpc: async (fn, params) => {
      calls.push([fn, params]);
      return {
        data: {
          duplicate: false,
          id: challenge,
          expires_at: fixture.expires_at,
        },
        error: null,
      };
    },
  };
  return db;
}
async function request(
  handler,
  body,
  { method = "POST", token = "valid", type = "application/json", raw } = {},
) {
  const req = Readable.from(raw === undefined ? [] : [raw]);
  req.method = method;
  req.headers = {
    "content-type": type,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  if (raw === undefined) req.body = body;
  const res = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
  await handler(req, res);
  return res;
}

test("send publishes only a headline, privately delivers the fun interpretation, and verifies the actual sender", async () => {
  const db = database();
  const response = await request(
    createSendHandler({
      db,
      misinterpret: async (text) => {
        assert.equal(text, "HELLO");
        return {
          text: "The moon is our manager.",
          headline: "BREAKING: Greeting Sparks Lunar Management Crisis",
          engine: "fallback",
        };
      },
    }),
    payload,
  );
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(response.body, {
    delivered: true,
    duplicate: false,
    engine: "fallback",
  });
  const call = db.calls.find(([fn]) => fn === "deliver_message")[1];
  assert.equal(call.p_sender_id, alice);
  assert.equal(
    call.p_original,
    "BREAKING: Greeting Sparks Lunar Management Crisis",
  );
  assert.ok(
    !Object.values(call).includes("HELLO"),
    "Decoded original must never be stored in the public broadcast",
  );
  assert.equal(call.p_inbox_ciphertext, rot13("The moon is our manager."));
  assert.ok(
    db.calls.some(
      (x) => x[0] === "eq" && x[1] === "sender_id" && x[2] === alice,
    ),
  );
});
test("exact retry skips AI and succeeds after expiration", async () => {
  const db = database({
    used_at: new Date().toISOString(),
    expires_at: "2000-01-01",
    submission_id: submission,
    submitted_ciphertext: "KHOOR",
  });
  const response = await request(
    createSendHandler({
      db,
      misinterpret: () => assert.fail("AI called on retry"),
    }),
    payload,
  );
  assert.deepEqual(response.body, { delivered: true, duplicate: true });
  assert.ok(!db.calls.some(([fn]) => fn === "deliver_message"));
});
test("changed retry cannot reuse a consumed challenge", async () => {
  const db = database({
    used_at: new Date().toISOString(),
    submission_id: submission,
    submitted_ciphertext: "KHOOR",
  });
  assert.equal(
    (
      await request(createSendHandler({ db }), {
        ...payload,
        ciphertext: "DIFFERENT",
      })
    ).statusCode,
    409,
  );
});
test("unknown challenge, expired challenge, malformed input and missing auth are rejected before AI", async () => {
  for (const [db, body, options, code] of [
    [database(null), payload, {}, 409],
    [database({ expires_at: "2000-01-01" }), payload, {}, 409],
    [database(), { ...payload, ciphertext: "x".repeat(281) }, {}, 400],
    [database(), { ...payload, ciphertext: "   " }, {}, 400],
    [database(), { ...payload, ciphertext: "こんにちは" }, {}, 400],
    [database(), { ...payload, submission_id: "invalid" }, {}, 400],
    [database(), payload, { token: null }, 401],
    [database(), payload, { token: "forged" }, 401],
  ]) {
    const response = await request(
      createSendHandler({
        db,
        misinterpret: () => assert.fail("AI must not run"),
      }),
      body,
      options,
    );
    assert.equal(response.statusCode, code);
  }
});
test("HTTP method, content type, malformed JSON and oversized streams are rejected", async () => {
  const handler = createSendHandler({ db: database() });
  assert.equal(
    (await request(handler, payload, { method: "GET" })).statusCode,
    405,
  );
  assert.equal(
    (await request(handler, payload, { type: "text/plain" })).statusCode,
    415,
  );
  assert.equal((await request(handler, null, { raw: "{" })).statusCode, 400);
  assert.equal(
    (await request(handler, null, { raw: "x".repeat(9000) })).statusCode,
    413,
  );
});
test("challenge fixes sender and cipher server-side and never exposes database row", async () => {
  const db = database();
  const res = await request(createChallengeHandler({ db }), {
    recipient_id: bob,
    sender_id: bob,
    cipher: "invalid",
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.id, challenge);
  assert.ok(res.body.text);
  assert.equal(res.body.cipher, undefined);
  const params = db.calls.find(([fn]) => fn === "issue_challenge")[1];
  assert.equal(params.p_sender_id, alice);
  assert.ok(["caesar", "atbash"].includes(params.p_cipher));
  assert.equal(res.body.encoding, "rot13");
  assert.equal(res.body.hint, undefined);
  assert.equal(rot13(res.body.text), puzzles[params.p_cipher].text);
  assert.notEqual(res.body.text, puzzles[params.p_cipher].text);
  assert.equal(
    (await request(createChallengeHandler({ db }), { recipient_id: alice }))
      .statusCode,
    400,
  );
});
test("auth checks token with Supabase rather than trusting decoded JWT claims", async () => {
  let seen;
  const user = await authenticate(
    { headers: { authorization: "Bearer provided-token" } },
    {
      auth: {
        getUser: async (token) => {
          seen = token;
          return { data: { user: { id: alice } }, error: null };
        },
      },
    },
  );
  assert.equal(seen, "provided-token");
  assert.equal(user, alice);
});
