import { createMotionField, particlePosition } from "./motion-field.js";
import "./motion-lab.css";

// Deliberately independent of Supabase, Groq, messaging state, and application CSS.
const rot13 = (text) =>
  text.replace(/[a-z]/gi, (letter) => {
    const base = letter <= "Z" ? 65 : 97;
    return String.fromCharCode(
      base + ((letter.charCodeAt(0) - base + 13) % 26),
    );
  });
const examples = [
  rot13("THREE STEPS FORWARD"),
  rot13("THE ALPHABET IS A MIRROR"),
];
const arrow =
  '<svg class="lab-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
document.querySelector("#motion-lab").innerHTML = `
  <header class="lab-topbar"><a class="lab-brand" href="/message"><span>a${arrow}</span> anti-private</a><a class="back-link" href="/message">Back to messenger ${arrow}</a></header>
  <section class="lab-intro"><p class="eyebrow">MOTION LAB / ISOLATED EXPERIMENT</p><h1>Read between<br>the dots<span>.</span></h1><p>Watch for a few seconds. The letters move together.<br>Freeze the frame, and see what remains.</p><span class="experiment-badge">EXPERIMENTAL · CHAT FUTURE IS UNCHANGED</span></section>
  <section class="stage" aria-label="Motion-defined text experiment">
    <div class="stage-top"><span><i id="motion-indicator"></i><strong id="motion-label">Motion field</strong></span><span id="dot-count"></span></div>
    <canvas id="motion-canvas" role="img" aria-label="An encoded demo dispatch revealed by moving dots. A readable alternative is available below."></canvas>
    <div class="stage-bottom"><span>ONE FIELD. TWO KINDS OF MOTION.</span><span>Observe, then freeze.</span></div>
  </section>
  <div class="playback-controls"><button id="toggle-motion" class="primary" type="button">Pause motion</button><button id="freeze-frame" type="button">Freeze frame</button><button id="save-frame" type="button">Save still frame</button><button id="reveal-text" type="button" aria-expanded="false" aria-controls="readable-text">Readable mode</button></div>
  <p id="lab-status" role="status" aria-live="polite"></p>
  <div id="readable-text" class="readable-text" hidden><span class="eyebrow">ACCESSIBLE TEST PREVIEW / ENCODED DISPATCH</span><p id="readable-message"></p><small>This mode intentionally reveals selectable text. It is a testing and accessibility bypass.</small></div>
  <div class="lab-notes"><article><span>01 / WATCH</span><h2>Find the shared movement.</h2><p>Letters are made of dots moving horizontally. Everything around them moves in scattered directions.</p></article><article><span>02 / FREEZE</span><h2>Test the screenshot.</h2><p>Pause or save a still frame. Dot size, brightness, and density are the same inside and outside the letters.</p></article><article><span>03 / DECIDE</span><h2>Judge the friction.</h2><p>Try it on a phone. Is it readable in motion, and unhelpful when frozen? This page is only the experiment.</p></article></div>
  <details class="lab-settings"><summary>Adjust lab controls</summary><div class="settings-grid"><label>Test dispatch<select id="dispatch"><option value="0">Dispatch 01</option><option value="1">Dispatch 02</option><option value="custom">Custom text</option></select></label><label>Dot speed <span id="speed-value">24 px/s</span><input id="speed" type="range" min="8" max="42" value="24"></label><label>Dot spacing <span id="spacing-value">7 px</span><input id="spacing" type="range" min="5" max="12" value="7"></label><label class="custom-control" hidden>Custom text, up to 80 characters<textarea id="custom-text" maxlength="80" rows="2" placeholder="Enter the exact text to render"></textarea></label></div><p>These are test controls. The normal animation and saved image do not display the source text.</p></details>
  <details class="lab-limits"><summary>What this prototype does and does not establish</summary><p>This is a visual-friction experiment, not copy protection. The demo text and motion data exist in this browser and can be inspected. Recordings or multiple frames can reveal the message. A single frame is designed to have uniform dot density, but visual readability and screenshot resistance still need human assessment.</p><p>No message is sent, no account is needed, and no Supabase or Groq request is made here. Nothing typed in the lab is saved to the server. Reduced-motion preferences start the field paused; Readable mode provides an accessible alternative. Chat Future remains unchanged until you choose to integrate an effect.</p></details>
  <footer>ANTI-PRIVATE / EXPERIMENTAL DEPARTMENT <span>All wrongs reserved.</span></footer>`;

const $ = (id) => document.getElementById(id);
const canvas = $("motion-canvas");
const ctx = canvas.getContext("2d");
const preference = matchMedia("(prefers-reduced-motion: reduce)");
let running = false,
  elapsed = 0,
  lastTime = 0,
  frameId = 0,
  field;
let text = examples[0];
const seed = crypto.getRandomValues(new Uint32Array(1))[0];
const point = {};
const status = (message) => {
  $("lab-status").textContent = message;
};

function linesFor(context, value, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of value.split(/\s+/).filter(Boolean)) {
    if (context.measureText(word).width > maxWidth) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const character of word) {
        if (line && context.measureText(line + character).width > maxWidth) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    } else if (
      line &&
      context.measureText(`${line} ${word}`).width > maxWidth
    ) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function rebuild() {
  if (!ctx) return;
  const width = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
  const height = Math.max(1, Math.round(canvas.getBoundingClientRect().height));
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskContext = mask.getContext("2d", { willReadFrequently: true });
  let fontSize = Math.min(100, Math.max(40, width / 6.2)),
    lines;
  do {
    maskContext.font = `900 ${fontSize}px Arial, sans-serif`;
    lines = linesFor(maskContext, text.toUpperCase(), Math.max(20, width - 48));
    if (lines.length * fontSize * 1.2 <= height - 40 || fontSize <= 22) break;
    fontSize *= 0.9;
  } while (true);
  maskContext.fillStyle = "white";
  maskContext.textAlign = "center";
  maskContext.textBaseline = "middle";
  const lineHeight = fontSize * 1.2;
  lines.forEach((line, i) =>
    maskContext.fillText(
      line,
      width / 2,
      height / 2 + (i - (lines.length - 1) / 2) * lineHeight,
    ),
  );
  const maskData = maskContext.getImageData(0, 0, width, height).data;
  field = createMotionField({
    width,
    height,
    spacing: Number($("spacing").value),
    seed,
    inside: (x, y) =>
      maskData[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 128,
  });
  elapsed = 0;
  $("dot-count").textContent =
    `${field.particles.length.toLocaleString()} dots · same brightness`;
  $("readable-message").textContent = text;
  draw();
}

function draw() {
  if (!ctx || !field) return;
  ctx.fillStyle = "#13261f";
  ctx.fillRect(0, 0, field.width, field.height);
  ctx.fillStyle = "#d0dfbc";
  ctx.beginPath();
  const speed = Number($("speed").value);
  for (const particle of field.particles) {
    particlePosition(particle, elapsed, speed, point);
    ctx.moveTo(point.x + field.radius, point.y);
    ctx.arc(point.x, point.y, field.radius, 0, Math.PI * 2);
  }
  ctx.fill();
}
function tick(now) {
  if (!running) return;
  elapsed += Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  draw();
  frameId = requestAnimationFrame(tick);
}
function setRunning(value) {
  running = Boolean(value && ctx);
  cancelAnimationFrame(frameId);
  $("toggle-motion").textContent = running ? "Pause motion" : "Play motion";
  $("motion-label").textContent = running
    ? "Motion field · playing"
    : "Still frame · paused";
  $("motion-indicator").classList.toggle("playing", running);
  if (running) {
    lastTime = performance.now();
    frameId = requestAnimationFrame(tick);
  }
}
$("toggle-motion").addEventListener("click", () => {
  setRunning(!running);
  status(
    running
      ? "Watch for the letters moving together. Adjust speed or spacing if needed."
      : "This is a single still frame. Look for any static outline that gives the text away.",
  );
});
$("freeze-frame").addEventListener("click", () => {
  setRunning(false);
  status("Frozen. The canvas now contains a single frame, like a screenshot.");
});
$("save-frame").addEventListener("click", () => {
  canvas.toBlob((blob) => {
    if (!blob) return status("The still frame could not be saved.");
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "anti-private-motion-still.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("Saved the canvas frame only. Compare it with the moving version.");
  }, "image/png");
});
$("reveal-text").addEventListener("click", () => {
  const reveal = $("readable-text").hidden;
  $("readable-text").hidden = !reveal;
  $("reveal-text").setAttribute("aria-expanded", String(reveal));
  $("reveal-text").textContent = reveal
    ? "Hide readable text"
    : "Readable mode";
  if (reveal) {
    setRunning(false);
    status(
      "Readable mode reveals the encoded demo text. This is an intentional testing bypass.",
    );
  }
});
$("dispatch").addEventListener("change", () => {
  const custom = $("dispatch").value === "custom";
  $("custom-text").closest("label").hidden = !custom;
  text = custom
    ? $("custom-text").value
    : examples[Number($("dispatch").value)];
  rebuild();
});
$("custom-text").addEventListener("input", () => {
  text = $("custom-text").value;
  rebuild();
});
$("speed").addEventListener("input", () => {
  $("speed-value").textContent = `${$("speed").value} px/s`;
  draw();
});
$("spacing").addEventListener("input", () => {
  $("spacing-value").textContent = `${$("spacing").value} px`;
  rebuild();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && running) {
    setRunning(false);
    status("Paused while this tab was hidden. Press Play to resume.");
  }
});
preference.addEventListener("change", () => {
  if (preference.matches) {
    setRunning(false);
    status(
      "Reduced motion is enabled. Use Readable mode or choose Play motion.",
    );
  }
});
new ResizeObserver(rebuild).observe(canvas);
rebuild();
if (ctx) {
  setRunning(!preference.matches);
  status(
    preference.matches
      ? "Reduced motion is enabled. The animation starts paused; Readable mode is available."
      : "Watch for a few seconds, then freeze the frame to compare.",
  );
} else {
  $("readable-message").textContent = text;
  for (const id of ["toggle-motion", "freeze-frame", "save-frame"])
    $(id).disabled = true;
  status(
    "Canvas is unavailable in this browser. Use Readable mode to inspect the demo text.",
  );
}
