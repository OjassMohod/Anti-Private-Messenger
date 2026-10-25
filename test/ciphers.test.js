import test from "node:test";
import assert from "node:assert/strict";
import { decode, rot13 } from "../server/ciphers.js";

test("Caesar wraps the alphabet, preserves case, punctuation and newlines", () => {
  assert.equal(
    decode("KHOOR, Zruog! DEF abc\n123", "caesar"),
    "HELLO, World! ABC xyz\n123",
  );
});
test("Atbash preserves spaces and is its own inverse", () => {
  assert.equal(decode("SVOOL, Dliow!", "atbash"), "HELLO, World!");
  assert.equal(
    decode(decode("Abc XYZ 123!", "atbash"), "atbash"),
    "Abc XYZ 123!",
  );
});
test("ROT13 round trips and does not alter punctuation or non-English characters", () => {
  assert.equal(rot13("HELLO"), "URYYB");
  assert.equal(
    rot13(rot13("Hello, world! 123 — café")),
    "Hello, world! 123 — café",
  );
});
test("unknown outgoing cipher is rejected", () =>
  assert.throws(() => decode("x", "invalid")));
