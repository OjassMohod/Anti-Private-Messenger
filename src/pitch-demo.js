import {
  demoAssets,
  pitchTurns,
  encodePrepared,
  decodePrepared,
  encodeInbox,
  futureText,
  inboxFor,
  broadcastFor,
} from "./pitch-data.js";
import { readImages, saveImage } from "./pitch-assets.js";
import "./pitch-demo.css";

const arrow =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
const escape = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const initialState = () => ({
  started: false,
  intro: true,
  turn: 0,
  delivered: 0,
  view: "compose",
  revealed: false,
  complete: false,
  ciphertext: "",
  inboxViewer: "Ojass",
  broadcastViewer: "Observer",
});
let state = initialState();
const history = [];
const images = new Map(
  demoAssets.filter((asset) => asset.src).map((asset) => [asset.id, asset.src]),
);

document.querySelector("#pitch-demo").innerHTML = `
  <header class="pitch-header"><a class="brand" href="/message"><span>a${arrow}</span> anti-private</a><div class="pitch-badges"><span class="demo-badge">SCRIPTED PITCH REPLAY</span><button id="prepare-images" type="button">Images <span id="ready-count">0/8</span></button><a href="/message">Open live messenger ${arrow}</a></div></header>
  <section class="pitch-intro"><p class="eyebrow">END-TO-END MISCOMMUNICATION / THE DEMONSTRATION</p><h1>Four messages.<br>A spectacular misunderstanding<span>.</span></h1><p>Your prepared story, one cue at a time. One browser is all you need.</p></section>
  <details id="asset-setup" class="asset-setup"><summary>Prepare demo images <span id="asset-count">0 / 8 ready</span></summary><p>Add the eight memes once on this device. They are kept in this browser across reloads. Resetting the replay keeps the images. These file pickers do not upload anything to the server.</p><div id="asset-grid" class="asset-grid"></div><p id="asset-status" role="status" aria-live="polite"></p></details>
  <section id="presenter-bar" class="presenter-bar" hidden><div><p class="eyebrow" id="cue-scene"></p><strong id="cue-direction"></strong></div><div class="cue-actions"><button id="previous-cue" type="button">Previous cue</button><button id="next-cue" class="primary" type="button">Next cue ${arrow}</button><button id="reset-demo" type="button">Reset replay</button></div></section>
  <nav id="perspectives" class="perspectives" aria-label="Demo perspectives" hidden><button data-view="compose" type="button">Sender</button><button data-view="recipient" type="button">Recipient</button><button data-view="broadcast" type="button">Broadcast</button><span id="demo-identity"></span></nav>
  <p id="demo-status" role="status" aria-live="polite"></p>
  <section id="demo-stage" class="demo-stage"></section>
  <details class="demo-notes"><summary>Presenter notes and how this replay works</summary><p>This page replays the supplied dialogue and media selections. The sign-in and perspective switches are scripted demo roles, not real account sessions. Messages and AI outputs are prewritten; sending here does not call Groq, Supabase, or the live message API. The live messenger remains available separately for a real transmission and backend-permission demonstration.</p><p>All prepared outgoing messages use Caesar +3. Received fun versions are shown in ROT13 first; the presenter reveal makes the prepared punchline readable. Public broadcast uses an Observer perspective by default. Select Afaan or Ojass there to illustrate recipient exclusion. Perspective filtering here is presentation logic; real backend access control is tested in the live app.</p><p>Use Next cue or the right arrow key to load ciphertext, transmit, reveal the recipient's meaning, show the public headline, and move to the next message. Left arrow goes back. Keyboard shortcuts pause while typing or selecting values. Keep this window on screen share; no separate browser accounts are needed for this replay.</p></details>
  <footer><span>ANTI-PRIVATE / ALL WRONGS RESERVED.</span><span>Prepared dialogue. Predictable chaos.</span></footer>`;

const $ = (id) => document.getElementById(id);
function status(message = "", error = false) {
  $("demo-status").textContent = message;
  $("demo-status").classList.toggle("error", error);
}
function imageMarkup(id) {
  const asset = demoAssets.find((entry) => entry.id === id);
  const source = images.get(id);
  return source
    ? `<figure class="meme"><img src="${escape(source)}" alt="${escape(asset.description)}"><figcaption>PREPARED DEMO REACTION</figcaption></figure>`
    : `<div class="image-placeholder"><span>MEME IMAGE NOT LOADED</span><strong>${escape(asset.description)}</strong><p>Use Images above to add this image once.</p></div>`;
}
function renderAssets() {
  $("ready-count").textContent = `${images.size}/${demoAssets.length}`;
  $("asset-count").textContent = `${images.size} / ${demoAssets.length} ready`;
  $("asset-grid").innerHTML = demoAssets
    .map(
      (asset) =>
        `<label class="asset-slot"><strong>${asset.label}</strong><span class="asset-preview">${images.has(asset.id) ? `<img src="${escape(images.get(asset.id))}" alt="${escape(asset.description)}">` : "<span>＋</span>"}</span><span>${asset.description}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-asset="${asset.id}" aria-label="Add image: ${escape(asset.description)}"></label>`,
    )
    .join("");
  for (const input of $("asset-grid").querySelectorAll("input"))
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.disabled = true;
      $("asset-status").textContent = "Saving image in this browser…";
      try {
        const source = await saveImage(input.dataset.asset, file);
        const previous = images.get(input.dataset.asset);
        if (previous?.startsWith("blob:")) URL.revokeObjectURL(previous);
        images.set(input.dataset.asset, source);
        $("asset-status").textContent =
          "Image ready. It will remain available after reloading this browser.";
        renderAssets();
        render();
      } catch (error) {
        $("asset-status").textContent = error.message;
        input.disabled = false;
      }
    });
}
function remember() {
  history.push({ ...state });
}
function start() {
  remember();
  state.started = true;
  $("asset-setup").open = false;
  status(
    "Show the ghost-font concept first, then continue with ordinary readable text for the pitch.",
  );
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}
function fill() {
  state.ciphertext = encodePrepared(pitchTurns[state.turn].original);
  status("Prepared ciphertext loaded. Transmit it to continue the scene.");
  render();
}
function send() {
  const turn = pitchTurns[state.turn];
  if (decodePrepared(state.ciphertext) !== turn.original) {
    status(
      "This scripted scene expects the prepared message. Use Load prepared ciphertext to follow the supplied story.",
      true,
    );
    return false;
  }
  state.delivered = Math.max(state.delivered, state.turn + 1);
  state.view = "recipient";
  state.inboxViewer = turn.recipient;
  state.revealed = false;
  status(
    `Demo transmission delivered. ${turn.recipient} receives an encoded fun version.`,
  );
  return true;
}
function next() {
  $("asset-setup").open = false;
  if (!state.started) return start();
  if (state.complete) return reset();
  remember();
  if (state.intro) {
    state.intro = false;
    status(
      "For visibility, this scripted conversation uses normal text. Start with the prepared ciphertext.",
    );
  } else if (state.delivered <= state.turn || state.view === "compose") {
    state.view = "compose";
    if (!state.ciphertext) return fill();
    if (!send()) {
      history.pop();
      return;
    }
  } else if (state.view === "recipient" && !state.revealed) {
    state.revealed = true;
    status(
      "Presenter reveal: this is what the recipient's ROT13 message means.",
    );
  } else if (state.view === "recipient") {
    state.view = "broadcast";
    state.broadcastViewer = "Observer";
    status("Observer perspective: the public headline and its assigned meme.");
  } else if (state.turn < pitchTurns.length - 1) {
    state.turn++;
    state.view = "compose";
    state.ciphertext = "";
    state.revealed = false;
    state.inboxViewer = pitchTurns[state.turn].recipient;
    status(`The sender switches to ${pitchTurns[state.turn].sender}.`);
  } else {
    state.complete = true;
    status("Replay complete. Four messages, zero mutual understanding.");
  }
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}
function previous() {
  if (!history.length) return;
  state = history.pop();
  status("Returned to the previous cue.");
  render();
}
function reset() {
  state = initialState();
  history.length = 0;
  status("Replay reset. Your prepared images are still saved in this browser.");
  render();
  window.scrollTo({ top: 0, behavior: "auto" });
}
function nextLabel() {
  if (state.intro) return "Continue with readable text";
  if (state.complete) return "Replay from start";
  if (state.delivered <= state.turn || state.view === "compose")
    return state.ciphertext ? "Transmit poorly" : "Load prepared ciphertext";
  if (state.view === "recipient")
    return state.revealed
      ? "Show broadcast headline"
      : "Reveal the fun version";
  return state.turn < pitchTurns.length - 1 ? "Next message" : "Finish replay";
}
function render() {
  $("ghost-font-preview")?.pause();
  document.body.classList.toggle("presenting", state.started);
  const turn = pitchTurns[state.turn];
  $("presenter-bar").hidden = !state.started;
  $("perspectives").hidden = !state.started || state.complete || state.intro;
  $("cue-scene").textContent = state.intro
    ? "BEFORE THE STORY / VISUAL CONCEPT"
    : `SCENE ${state.turn + 1} / ${pitchTurns.length} · ${turn.theme}`;
  $("cue-direction").textContent = state.intro
    ? "Ghost font → readable pitch demo"
    : `${turn.sender} → ${turn.recipient}`;
  $("previous-cue").disabled = history.length === 0;
  $("next-cue").innerHTML = `${nextLabel()} ${arrow}`;
  for (const button of $("perspectives").querySelectorAll("button"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.view === state.view),
    );
  $("demo-identity").textContent =
    state.view === "compose"
      ? `Showing ${turn.sender}`
      : state.view === "recipient"
        ? `Showing ${state.inboxViewer}'s inbox`
        : `Showing ${state.broadcastViewer}'s broadcast`;
  if (!state.started) {
    $("demo-stage").innerHTML =
      `<div class="demo-login"><span class="eyebrow">DEMO SIGN-IN / PREPARED ROLE</span><h2>Enter as Afaan<span>.</span></h2><p>Afaan, Ojass, and the Observer are all available in this one-window replay. Switch perspectives as the story unfolds.</p><label for="demo-name">DEMO USERNAME</label><input id="demo-name" value="Afaan" readonly><button id="start-demo" class="primary" type="button">Start scripted demo ${arrow}</button><small>This is a presenter role, not a live Supabase sign-in.</small></div>`;
    $("start-demo").addEventListener("click", start);
    return;
  }
  if (state.intro) {
    $("demo-stage").innerHTML =
      `<div class="stage-heading"><span class="eyebrow">PROPOSED VISUAL TREATMENT</span><h2>Encrypted text, in motion<span>.</span></h2><p>This clip shows the intended ghost-font experience. For this pitch, we'll use normal text so everyone can follow the conversation.</p></div><figure class="ghost-preview"><video id="ghost-font-preview" aria-label="Ghost-font concept preview" aria-describedby="ghost-preview-caption" controls muted loop playsinline preload="metadata"><source src="/pitch-media/ghost-font.webm" type="video/webm">Your browser cannot play this clip. <a href="/pitch-media/ghost-font.webm">Open the video file</a>.</video><figcaption id="ghost-preview-caption">Watch the moving dots reveal text. This is a concept video; the conversation that follows uses ordinary text.</figcaption></figure>`;
    const video = $("ghost-font-preview");
    video.muted = true;
    video.addEventListener("error", () => {
      if ($("ghost-font-preview") === video)
        status(
          "The concept video could not load. You can continue with the readable demo.",
          true,
        );
    });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      video.play().catch(() => {
        if ($("ghost-font-preview") === video)
          status(
            "Press Play on the clip, then continue with readable text whenever you're ready.",
          );
      });
    return;
  }
  if (state.complete) {
    $("demo-stage").innerHTML =
      `<div class="replay-complete"><span class="eyebrow">DEMONSTRATION COMPLETE</span><h2>Four messages.<br>Zero understanding<span>.</span></h2><p>The greeting became a wallet emergency. The exam became a national investigation. Communication has successfully failed.</p><button id="restart" class="primary" type="button">Reset for the next rehearsal</button><a href="/message">Open the live messenger ${arrow}</a></div>`;
    $("restart").addEventListener("click", reset);
    return;
  }
  if (state.view === "compose") {
    $("demo-stage").innerHTML =
      `<div class="stage-heading"><span class="eyebrow">SENDER PERSPECTIVE</span><h2>${turn.sender} sends<span>.</span></h2><p>To ${turn.recipient}. A harmless message is about to become everyone's problem.</p></div><div class="compose-grid"><div class="intent"><span class="eyebrow">PRESENTER'S INTENDED MESSAGE</span><p>${escape(turn.original)}</p><div class="future"><span class="eyebrow">CHAT FUTURE / ENCODED DISPATCH</span><p>${futureText}</p></div></div><form id="demo-send"><label for="demo-ciphertext">MANUALLY ENCODED OUTGOING MESSAGE</label><textarea id="demo-ciphertext" rows="5" spellcheck="false"></textarea><button id="fill-ciphertext" type="button">Load prepared ciphertext</button><button class="primary" type="submit">Transmit poorly ${arrow}</button><p class="field-note">The replay checks the prepared ciphertext and advances to the supplied recipient response.</p></form></div>`;
    $("demo-ciphertext").value = state.ciphertext;
    $("demo-ciphertext").addEventListener("input", () => {
      state.ciphertext = $("demo-ciphertext").value;
      $("next-cue").innerHTML = `${nextLabel()} ${arrow}`;
    });
    $("fill-ciphertext").addEventListener("click", () => {
      remember();
      fill();
    });
    $("demo-send").addEventListener("submit", (event) => {
      event.preventDefault();
      remember();
      if (send()) render();
      else history.pop();
    });
    return;
  }
  if (state.view === "recipient") {
    const rows = inboxFor(state.delivered, state.inboxViewer);
    const row = rows.at(-1);
    $("demo-stage").innerHTML =
      `<div class="stage-heading"><span class="eyebrow">RECIPIENT PERSPECTIVE / PRIVATE INBOX</span><h2>${escape(state.inboxViewer)} receives<span>.</span></h2><label class="viewer-switch">Show inbox as <select id="inbox-viewer"><option>Afaan</option><option>Ojass</option></select></label></div>${row ? `<article class="reaction"><div class="reaction-text"><span class="message-meta">${row.sender} → ${row.recipient} <span>${state.revealed ? "PRESENTER REVEAL" : "ROT13 DELIVERY"}</span></span><p class="script-text ${state.revealed ? "" : "ciphertext"}">${escape(state.revealed ? row.interpretation : encodeInbox(row.interpretation))}</p><button id="reveal-inbox" type="button">${state.revealed ? "Show encoded delivery" : "Reveal the fun version"}</button></div>${imageMarkup(row.recipientAsset)}</article>` : '<div class="empty-state">No prepared inbox messages have been delivered to this role yet.</div>'}`;
    $("inbox-viewer").value = state.inboxViewer;
    $("inbox-viewer").addEventListener("change", () => {
      state.inboxViewer = $("inbox-viewer").value;
      state.revealed = false;
      render();
    });
    $("reveal-inbox")?.addEventListener("click", () => {
      remember();
      state.revealed = !state.revealed;
      render();
    });
    return;
  }
  const rows = broadcastFor(state.delivered, state.broadcastViewer);
  const latest = rows.at(-1);
  $("demo-stage").innerHTML =
    `<div class="stage-heading"><span class="eyebrow">PUBLIC BROADCAST / ${state.broadcastViewer === "Observer" ? "OBSERVER PERSPECTIVE" : "RECIPIENT EXCLUSION"}</span><h2>Breaking nonsense<span>.</span></h2><label class="viewer-switch">Show broadcast as <select id="broadcast-viewer"><option>Observer</option><option>Afaan</option><option>Ojass</option></select></label></div>${latest ? `<article class="reaction public-reaction"><div class="reaction-text"><span class="message-meta">${latest.sender} → everyone except ${latest.recipient}</span><p class="script-text headline">${escape(latest.headline)}</p><span class="satire-label">PREPARED TABLOID HEADLINE</span></div>${imageMarkup(latest.broadcastAsset)}</article>` : `<div class="empty-state">This headline is excluded from ${escape(state.broadcastViewer)}'s perspective.</div>`}<details class="broadcast-history"><summary>Earlier public headlines (${Math.max(0, rows.length - 1)})</summary>${rows
      .slice(0, -1)
      .map((entry) => `<p>${escape(entry.headline)}</p>`)
      .join("")}</details>`;
  $("broadcast-viewer").value = state.broadcastViewer;
  $("broadcast-viewer").addEventListener("change", () => {
    state.broadcastViewer = $("broadcast-viewer").value;
    render();
  });
}

$("prepare-images").addEventListener("click", () => {
  $("asset-setup").open = true;
  $("asset-setup").scrollIntoView({ block: "start", behavior: "auto" });
});
$("next-cue").addEventListener("click", next);
$("previous-cue").addEventListener("click", previous);
$("reset-demo").addEventListener("click", reset);
for (const button of $("perspectives").querySelectorAll("button"))
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    render();
  });
document.addEventListener("keydown", (event) => {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    /INPUT|TEXTAREA|SELECT|VIDEO/.test(event.target.tagName) ||
    event.target.isContentEditable
  )
    return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    next();
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    previous();
  }
});
renderAssets();
render();
try {
  for (const [id, file] of await readImages())
    if (demoAssets.some((asset) => asset.id === id))
      images.set(id, URL.createObjectURL(file));
  renderAssets();
  render();
} catch {
  $("asset-status").textContent =
    "Saved images are unavailable in this browser. Use a regular browser profile with local storage enabled.";
}
