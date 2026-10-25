import test from "node:test";
import assert from "node:assert/strict";
import { scoreConversation } from "../server/meter.js";
import { createMeterHandler } from "../api/meter.js";

const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const charlie = "33333333-3333-4333-8333-333333333333";
const people = [
  { id: alice, username: "Alice" },
  { id: bob, username: "Bob" },
];

test("fictional scores are stable for the same unordered pair and message count", () => {
  assert.deepEqual(
    scoreConversation([alice, bob], 5),
    scoreConversation([bob, alice], 5),
  );
  assert.deepEqual(
    scoreConversation([alice, bob], 5),
    scoreConversation([alice, bob], 5),
  );
});
test("new messages lower understanding and increase imaginary risk", () => {
  const before = scoreConversation([alice, bob], 1),
    after = scoreConversation([alice, bob], 2);
  assert.ok(before.understanding_percent < 0);
  assert.ok(after.understanding_percent < before.understanding_percent);
  assert.ok(after.financial_risk_credits > before.financial_risk_credits);
  assert.ok(after.friendship_damage_percent > before.friendship_damage_percent);
});
test("damage stays bounded and the tone always belongs to the fictional categories", () => {
  for (const count of [1, 3, 20, 1000, 100000]) {
    const result = scoreConversation([alice, bob], count);
    assert.ok(
      result.friendship_damage_percent >= 0 &&
        result.friendship_damage_percent <= 100,
    );
    assert.ok(
      ["Goofy mood", "Existential crisis", "Cartoon villain"].includes(
        result.tone.label,
      ),
    );
    assert.ok(Number.isFinite(result.financial_risk_credits));
  }
});
test("a pair without messages has no invented score, and invalid counts are rejected", () => {
  assert.equal(scoreConversation([alice, bob], 0), null);
  for (const value of [-1, 1.5, NaN, null, Infinity])
    assert.throws(() => scoreConversation([alice, bob], value));
});

function database({ count = 4, profiles = people, failure = null } = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      getUser: async (token) => ({
        data: { user: token === "valid" ? { id: charlie } : null },
        error: null,
      }),
    },
    from(table) {
      calls.push({ table });
      return {
        select(columns, options) {
          calls.push({ table, columns, options });
          if (table === "profiles") {
            assert.equal(columns, "id,username");
            return {
              in: async (column, ids) => {
                calls.push({ column, ids });
                return { data: profiles, error: failure };
              },
            };
          }
          assert.equal(table, "broadcasts");
          assert.equal(
            columns,
            "id",
            "No message or inbox contents may be queried",
          );
          assert.deepEqual(options, { count: "exact", head: true });
          return {
            or: async (filter) => {
              calls.push({ filter });
              return { count, data: null, error: failure };
            },
          };
        },
      };
    },
  };
}
async function request(
  db,
  body = { user_a: alice, user_b: bob },
  token = "valid",
) {
  const req = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  };
  const res = {
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(value) {
      this.body = JSON.parse(value);
    },
  };
  await createMeterHandler({ db })(req, res);
  return res;
}
test("an unrelated signed-in viewer can read only public pair labels, count, and scores", async () => {
  const db = database();
  const result = await request(db);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.deepEqual(Object.keys(result.body).sort(), [
    "fictional",
    "message_count",
    "metrics",
    "pair",
  ]);
  assert.equal(result.body.fictional, true);
  assert.equal(result.body.message_count, 4);
  assert.deepEqual(result.body.pair, people);
  assert.ok(result.body.metrics.understanding_percent < 0);
  assert.ok(
    db.calls.some(
      (call) =>
        call.filter ===
        `and(sender_id.eq.${alice},recipient_id.eq.${bob}),and(sender_id.eq.${bob},recipient_id.eq.${alice})`,
    ),
  );
  assert.ok(
    !db.calls.some(
      (call) => call.table === "inbox_messages" || call.table === "challenges",
    ),
  );
});
test("reversing the selected users returns the same public scorecard", async () => {
  const first = await request(database());
  const reversed = await request(database(), { user_a: bob, user_b: alice });
  assert.deepEqual(first.body, reversed.body);
});
test("meter requires a verified session before accessing any aggregate", async () => {
  for (const token of [null, "forged"]) {
    const db = database();
    assert.equal((await request(db, undefined, token)).statusCode, 401);
    assert.equal(db.calls.length, 0);
  }
});
test("invalid IDs, identical people, and query injection are rejected before database queries", async () => {
  for (const body of [
    { user_a: alice, user_b: alice },
    { user_a: "invalid", user_b: bob },
    { user_a: alice, user_b: `${bob}),id.neq.null` },
    {},
  ]) {
    const db = database();
    assert.equal((await request(db, body)).statusCode, 400);
    assert.equal(db.calls.length, 0);
  }
});
test("missing users produce 404, and no messages return a genuine empty state", async () => {
  assert.equal(
    (await request(database({ profiles: [people[0]] }))).statusCode,
    404,
  );
  const empty = await request(database({ count: 0 }));
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.body.message_count, 0);
  assert.equal(empty.body.metrics, null);
});
test("database and count errors produce an error rather than fictional successful results", async () => {
  for (const config of [
    { failure: { message: "not available" } },
    { count: null },
    { count: -1 },
  ]) {
    const result = await request(database(config));
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.metrics, undefined);
  }
});
