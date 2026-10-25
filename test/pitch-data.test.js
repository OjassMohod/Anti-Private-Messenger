import test from "node:test";
import assert from "node:assert/strict";
import {
  demoAssets,
  pitchTurns,
  encodePrepared,
  decodePrepared,
  encodeInbox,
  inboxFor,
  broadcastFor,
} from "../src/pitch-data.js";

test("prepared conversation alternates the supplied actors and retains the exact messages", () => {
  assert.deepEqual(
    pitchTurns.map((turn) => [turn.sender, turn.recipient]),
    [
      ["Afaan", "Ojass"],
      ["Ojass", "Afaan"],
      ["Afaan", "Ojass"],
      ["Ojass", "Afaan"],
    ],
  );
  assert.deepEqual(
    pitchTurns.map((turn) => turn.original),
    [
      "hey",
      "I can't lend a penny to you!! You already owe me fifty.",
      "fine bro…let it be how was ur mid semester??",
      "It was so bad that….professor will doubt his teaching!!.",
    ],
  );
  assert.equal(
    pitchTurns[1].interpretation,
    "Bella Ciao, ₹50\nYou owe me ₹50 and want another loan? Bro thinks I'm the Bank of Spain. First return the money, then sing Bella Ciao.",
  );
  assert.equal(
    pitchTurns[3].interpretation,
    "THE ANSWER WAS SO WRONG, THE PROFESSOR APOLOGISED TO HIS DEGREE.",
  );
});
test("all eight image slots are used exactly once, with the drinking cat and professor meme in their specified places", () => {
  const used = pitchTurns.flatMap((turn) => [
    turn.recipientAsset,
    turn.broadcastAsset,
  ]);
  assert.equal(new Set(used).size, 8);
  assert.deepEqual(
    [...used].sort(),
    demoAssets.map((asset) => asset.id).sort(),
  );
  assert.equal(pitchTurns[3].recipientAsset, "drinking-cat");
  assert.equal(pitchTurns[3].broadcastAsset, "weird-pose");
});
test("prepared ciphertext round-trips punctuation, ellipses and rupee signs", () => {
  assert.equal(encodePrepared("hey"), "khb");
  for (const turn of pitchTurns) {
    assert.equal(decodePrepared(encodePrepared(turn.original)), turn.original);
    assert.equal(
      encodeInbox(encodeInbox(turn.interpretation)),
      turn.interpretation,
    );
  }
});
test("scripted perspective filters show only the selected recipient's inbox and exclude their public headline", () => {
  assert.deepEqual(inboxFor(4, "Ojass"), [pitchTurns[0], pitchTurns[2]]);
  assert.deepEqual(inboxFor(4, "Afaan"), [pitchTurns[1], pitchTurns[3]]);
  assert.deepEqual(broadcastFor(4, "Observer"), pitchTurns);
  assert.deepEqual(broadcastFor(4, "Ojass"), [pitchTurns[1], pitchTurns[3]]);
  assert.deepEqual(broadcastFor(4, "Afaan"), [pitchTurns[0], pitchTurns[2]]);
  assert.deepEqual(inboxFor(0, "Ojass"), []);
});
