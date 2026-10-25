// One identical dot per cell: text affects velocity, never color, size, or density.
// Uniform initial offsets stay uniform under modular translation within each cell.
const modulo = (value, size) => ((value % size) + size) % size;

export function createMotionField({
  width,
  height,
  spacing = 7,
  seed = 1,
  inside,
}) {
  if (!(width > 0 && height > 0 && spacing > 0))
    throw new TypeError("Invalid field dimensions");
  let randomState = seed >>> 0;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const safeSpacing = Math.max(spacing, Math.sqrt((width * height) / 10000));
  const columns = Math.max(1, Math.floor(width / safeSpacing));
  const rows = Math.max(1, Math.floor(height / safeSpacing));
  const cellWidth = width / columns,
    cellHeight = height / rows;
  const particles = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const angle = random() * Math.PI * 2;
      const foreground = Boolean(
        inside((column + 0.5) * cellWidth, (row + 0.5) * cellHeight),
      );
      particles.push({
        originX: column * cellWidth,
        originY: row * cellHeight,
        cellWidth,
        cellHeight,
        offsetX: random() * cellWidth,
        offsetY: random() * cellHeight,
        dx: foreground ? 1 : Math.cos(angle),
        dy: foreground ? 0 : Math.sin(angle),
        foreground,
      });
    }
  }
  return {
    particles,
    columns,
    rows,
    width,
    height,
    radius: Math.min(cellWidth, cellHeight) * 0.16,
  };
}

export function particlePosition(particle, seconds, speed, result = {}) {
  result.x =
    particle.originX +
    modulo(
      particle.offsetX + particle.dx * seconds * speed,
      particle.cellWidth,
    );
  result.y =
    particle.originY +
    modulo(
      particle.offsetY + particle.dy * seconds * speed,
      particle.cellHeight,
    );
  return result;
}
