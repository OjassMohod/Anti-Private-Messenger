import test from "node:test";
import assert from "node:assert/strict";
import { createMotionField, particlePosition } from "../src/motion-field.js";

const settings = { width: 280, height: 140, spacing: 7, seed: 123 };
test("initial still frame is identical regardless of which cells contain text", () => {
  const text = createMotionField({ ...settings, inside: () => true });
  const noise = createMotionField({ ...settings, inside: () => false });
  assert.equal(text.radius, noise.radius);
  assert.deepEqual(
    text.particles.map((p) => particlePosition(p, 0, 24)),
    noise.particles.map((p) => particlePosition(p, 0, 24)),
  );
});
test("every cell retains exactly one dot across time, independent of text mask", () => {
  const field = createMotionField({
    ...settings,
    inside: (x, y) => x > 70 && x < 200 && y > 35 && y < 110,
  });
  for (const seconds of [0, 0.1, 1, 12.7, 600]) {
    const counts = new Set();
    for (const particle of field.particles) {
      const point = particlePosition(particle, seconds, 24);
      assert.ok(
        point.x >= particle.originX &&
          point.x < particle.originX + particle.cellWidth,
      );
      assert.ok(
        point.y >= particle.originY &&
          point.y < particle.originY + particle.cellHeight,
      );
      counts.add(
        `${Math.floor(point.x / particle.cellWidth)}:${Math.floor(point.y / particle.cellHeight)}`,
      );
    }
    assert.equal(counts.size, field.columns * field.rows);
  }
});
test("foreground dots share one motion direction while background directions vary", () => {
  const text = createMotionField({ ...settings, inside: () => true });
  const noise = createMotionField({ ...settings, inside: () => false });
  assert.ok(text.particles.every((p) => p.dx === 1 && p.dy === 0));
  assert.ok(new Set(noise.particles.map((p) => p.dx)).size > 100);
  assert.notDeepEqual(
    text.particles.map((p) => particlePosition(p, 0.1, 24)),
    noise.particles.map((p) => particlePosition(p, 0.1, 24)),
  );
});
test("large fields cap particle count and deterministic seeds reproduce the geometry", () => {
  const options = {
    width: 2400,
    height: 1200,
    spacing: 5,
    seed: 29,
    inside: () => false,
  };
  const first = createMotionField(options),
    second = createMotionField(options);
  assert.ok(first.particles.length <= 10000);
  assert.deepEqual(first, second);
});
test("invalid dimensions are rejected", () => {
  for (const change of [{ width: 0 }, { height: -1 }, { spacing: 0 }])
    assert.throws(() =>
      createMotionField({ ...settings, ...change, inside: () => false }),
    );
});
