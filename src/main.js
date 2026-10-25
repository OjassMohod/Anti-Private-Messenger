import { createClient } from "@supabase/supabase-js";
import { createMeter } from "./meter.js";
import "./style.css";

const meterPage =
  location.pathname.replace(/\/$/, "") === "/miscommunication-meter";
if (meterPage) document.title = "Miscommunication Meter — Anti-Private";

let client;
try {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) client = createClient(url, key);
} catch {
  /* Show setup instructions if configuration is missing or invalid. */
}
const state = {
  session: null,
  profiles: [],
  broadcasts: [],
  inbox: [],
  recipient: null,
  challenge: null,
  pending: null,
  sending: false,
  refreshing: false,
  channel: null,
};
const escape = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const arrow =
  '<svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';

document.querySelector("#app").innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="Anti-Private home"><span class="brand-mark">a${arrow}</span><span>anti-private<span class="brand-sub">MESSENGER / BETA</span></span></a>
    <p class="workspace-label">YOUR WORKSPACE <span>01</span></p>
    <nav aria-label="Workspace">
      <a class="nav-item ${meterPage ? "" : "active"}" href="/#composer"><span>${arrow}</span> Miscommunications ${meterPage ? "" : '<span class="nav-dot"></span>'}</a>
      <a class="nav-item" href="/#broadcast-panel"><span>◎</span> Public broadcast <span id="broadcast-count" class="nav-count">0</span></a>
      <a class="nav-item" href="/#inbox-panel"><span>▤</span> Your inbox <span id="inbox-count" class="nav-count">0</span></a>
      <a class="nav-item ${meterPage ? "active" : ""}" href="/miscommunication-meter"><span>◉</span> Miscommunication Meter ${meterPage ? '<span class="nav-dot"></span>' : ""}</a>
    </nav>
    <div class="sidebar-note"><span class="tiny-label">OUR COMMITMENT</span><p>Your message.<br>Everyone else's business.</p><span class="note-arrow">${arrow}</span></div>
    <div class="account"><span class="avatar" id="account-avatar">?</span><div><strong id="account-name">Unidentified person</strong><span id="account-detail">Awaiting a bad decision</span></div><button id="logout" class="icon-button" title="Sign out" aria-label="Sign out" hidden>↪</button></div>
  </aside>
  <div class="workspace">
    <header class="topbar"><span>Workspace <span class="breadcrumb">/</span> <strong>${meterPage ? "Miscommunication Meter" : "Miscommunications"}</strong></span><a class="view-switch" href="${meterPage ? "/" : "/miscommunication-meter"}">${meterPage ? "Back to messenger" : "Open the meter"}</a><span class="connection" id="connection"><i></i> Connection pending</span></header>
    <main>
      <div class="page-heading" ${meterPage ? "hidden" : ""}><div><p class="eyebrow">COMMUNICATION, RECONSIDERED.</p><h1>Get the wrong<br>message across<span class="accent">.</span></h1><p class="page-description">A little effort. A lot of misunderstanding. Absolutely no privacy.</p></div><div class="protocol-stamp"><span>${arrow}${arrow}</span><small>END-TO-END<br>MISCOMMUNICATION</small></div></div>
      <div class="notice" ${meterPage ? "hidden" : ""}><span class="notice-symbol">!</span><p><strong>A public service disannouncement.</strong> Your message becomes a sensational headline for everyone except its recipient. They receive an encoded misinterpretation instead. Use fictional names and dummy messages.</p><span class="notice-tag">BY DESIGN</span></div>
      <section id="setup" class="setup-card" ${client ? "hidden" : ""}>
        <span class="tiny-label">ONE-TIME CONNECTION SETUP</span><h2>The infrastructure is ready for its credentials.</h2><p>Connect a Supabase Free project to begin. No messages are being sent yet.</p><ol><li>Enable anonymous sign-in and run <code>supabase/migrations/001_initial.sql</code>.</li><li>Set the two public <code>VITE_SUPABASE_…</code> variables and the two server-only Supabase variables.</li><li>Restart locally, or redeploy on Vercel. See <code>README.md</code> for the exact steps.</li></ol><p class="muted">Groq is optional. The deterministic misinterpreter works without an API key.</p>
      </section>
      <section id="login-panel" class="login-panel" ${client ? "" : "hidden"}>
        <div><span class="tiny-label">NO PASSWORD. NO GOOD REASON.</span><h2>Introduce yourself. Loosely.</h2><p>Pick a fictional username. This browser remembers your anonymous account.</p></div>
        <form id="login-form"><label for="username">Your username</label><div class="input-row"><input id="username" name="username" placeholder="e.g. Alice" minlength="2" maxlength="24" required autocomplete="nickname"><button class="button primary" id="login-button">Enter workspace <span>${arrow}</span></button></div></form>
      </section>
      <p id="status" class="status" role="status" aria-live="polite"></p>
      <section id="meter-page" ${meterPage ? "" : "hidden"}></section>
      <div class="content-grid" ${meterPage ? "hidden" : ""}>
        <section id="composer" class="panel composer"><div class="panel-heading"><div><span class="section-number">01</span><h2>Compose a misunderstanding</h2></div><span class="pill">OUTGOING</span></div>
          <form id="send-form">
            <label for="recipient">WHO SHOULD MISS THE POINT?</label><div class="select-wrap"><select id="recipient" disabled><option value="">Sign in to choose a recipient</option></select><span>⌄</span></div>
            <div class="future-card"><div class="future-header"><span class="future-icon">✳</span><span>Chat Future</span><span class="tiny-label">INCOMING FROM TOMORROW</span></div><p id="puzzle">Select a recipient. The future has an unnecessarily cryptic instruction for your next message.</p><div class="future-footer"><span id="challenge-label">NO FUTURE ASSIGNED</span><button id="new-challenge" type="button" disabled>Request another ↻</button></div></div>
            <div class="field-heading"><label for="ciphertext">YOUR MANUALLY ENCODED MESSAGE</label><span id="char-count">0 / 280</span></div><textarea id="ciphertext" placeholder="Do the work yourself. Enter your ciphertext here…" maxlength="280" rows="5" required disabled></textarea>
            <p class="field-note">We decode it. Everyone else gets the headline. Your recipient gets a different misunderstanding.</p>
            <div class="send-footer"><span>⌁ &nbsp; Insecurity is the protocol.</span><button class="button primary" id="send-button" disabled>Transmit poorly <span>${arrow}</span></button></div>
          </form>
        </section>
        <div class="right-column"><section class="panel broadcast" id="broadcast-panel"><div class="panel-heading"><div><span class="section-number">02</span><h2>Public broadcast</h2></div><span class="pill green">EXCEPT YOU, RECIPIENT</span></div><p class="panel-description">Spicy headlines. Dubious journalism. Your message is the scandal.</p><div id="broadcast-list" class="message-list"></div></section>
        <section class="panel inbox" id="inbox-panel"><div class="panel-heading"><div><span class="section-number">03</span><h2>Your private-ish inbox</h2></div><span class="pill purple">ROT13</span></div><p class="panel-description">Someone didn't say this to you. Decode it anyway.</p><div class="inbox-hint">↔ &nbsp; A meets N. B meets O. Half an alphabet away.</div><div id="inbox-list" class="message-list"></div></section></div>
      </div>
      <footer><span>ANTI-PRIVATE © ${new Date().getFullYear()} <span class="footer-divider">/</span> All wrongs reserved.</span><span>Built to miss the point. <span class="footer-star">✳</span></span></footer>
    </main>
  </div>`;

const $ = (id) => document.getElementById(id);
const meter = createMeter($("meter-page"), api);
function status(message = "", error = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
}
function connection(text, live = false) {
  $("connection").innerHTML =
    `<i class="${live ? "live" : ""}"></i>${escape(text)}`;
}
function name(id) {
  return state.profiles.find((p) => p.id === id)?.username || "Unknown person";
}
function time(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function renderMessages() {
  $("broadcast-count").textContent = state.broadcasts.length;
  $("inbox-count").textContent = state.inbox.length;
  const render = (rows, kind) =>
    rows
      .map(
        (row) =>
          `<article class="message ${kind}"><div class="message-meta"><span class="message-avatar">${escape(name(row.sender_id).slice(0, 1).toUpperCase())}</span><strong>${escape(name(row.sender_id))}</strong><span class="message-direction">${kind === "broadcast" ? `→ not ${escape(name(row.recipient_id))}` : "→ you"}</span><time datetime="${escape(row.created_at)}">${time(row.created_at)}</time></div><p class="message-body">${escape(kind === "broadcast" ? row.original : row.ciphertext)}</p><span class="message-label">${kind === "broadcast" ? "SATIRICAL PUBLIC DISPATCH" : "MISINTERPRETED · ROT13"}</span></article>`,
      )
      .join("");
  $("broadcast-list").innerHTML = state.broadcasts.length
    ? render(state.broadcasts, "broadcast")
    : '<div class="empty-state"><span>◎</span><strong>No scandals to report. Yet.</strong><p>Sensational headlines appear here, unless the message was meant for you.</p></div>';
  $("inbox-list").innerHTML = state.inbox.length
    ? render(state.inbox, "inbox")
    : '<div class="empty-state"><span>▤</span><strong>No misunderstandings. Yet.</strong><p>Your encoded misinterpretations will arrive here.</p></div>';
}
function renderRecipients() {
  const others = state.profiles.filter((p) => p.id !== state.session?.user.id);
  $("recipient").innerHTML =
    `<option value="">${others.length ? "Choose an unfortunate recipient" : "Waiting for another user to sign in…"}</option>` +
    others
      .map(
        (p) =>
          `<option value="${escape(p.id)}">${escape(p.username)} · ${escape(p.id.slice(0, 4))}</option>`,
      )
      .join("");
  $("recipient").value = state.recipient || "";
  $("recipient").disabled = !state.session || state.sending;
}
function updateComposer() {
  $("ciphertext").disabled = !state.challenge || state.sending;
  $("new-challenge").disabled = !state.recipient || state.sending;
  $("send-button").disabled =
    !state.challenge || state.sending || !$("ciphertext").value.trim();
  $("recipient").disabled = !state.session || state.sending;
  $("send-button").innerHTML = state.sending
    ? "Misinterpreting…"
    : `Transmit poorly <span>${arrow}</span>`;
}
renderMessages();

async function api(path, body) {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error("Your session expired. Sign in again.");
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The backend is unavailable. Check deployment settings.");
  }
  if (!response.ok) {
    const error = new Error(result.error || "Transmission failed.");
    error.status = response.status;
    throw error;
  }
  return result;
}
async function refresh() {
  if (!state.session || state.refreshing) return;
  state.refreshing = true;
  const userId = state.session.user.id;
  try {
    const [profiles, broadcasts, inbox] = await Promise.all([
      client
        .from("profiles")
        .select("id,username")
        .order("created_at", { ascending: true })
        .limit(100),
      meterPage
        ? Promise.resolve({ data: [], error: null })
        : client
            .from("broadcasts")
            .select("id,sender_id,recipient_id,original,created_at")
            .order("created_at", { ascending: false })
            .limit(50),
      meterPage
        ? Promise.resolve({ data: [], error: null })
        : client
            .from("inbox_messages")
            .select("id,sender_id,recipient_id,ciphertext,created_at")
            .order("created_at", { ascending: false })
            .limit(50),
    ]);
    if (state.session?.user.id !== userId) return;
    if (profiles.error || broadcasts.error || inbox.error)
      throw new Error(
        "Could not load workspace. Confirm the SQL migration is installed and your session is valid.",
      );
    state.profiles = profiles.data;
    state.broadcasts = broadcasts.data;
    state.inbox = inbox.data;
    renderRecipients();
    renderMessages();
    if (meterPage) {
      meter.updateUsers(state.profiles, userId);
      await meter.refresh();
    }
    if (!state.profiles.some((p) => p.id === userId))
      $("login-panel").hidden = false;
  } catch (error) {
    status(error.message, true);
    connection("Sync interrupted");
  } finally {
    state.refreshing = false;
  }
}
async function startSession(session) {
  state.session = session;
  await refresh();
  const me = state.profiles.find((p) => p.id === session.user.id);
  if (!me) {
    $("login-panel").hidden = false;
    connection("Choose a username");
    return;
  }
  $("login-panel").hidden = true;
  $("account-name").textContent = me.username;
  $("account-avatar").textContent = me.username.slice(0, 1).toUpperCase();
  $("account-detail").textContent =
    `Anonymous · ${session.user.id.slice(0, 6)}`;
  $("logout").hidden = false;
  if (meterPage) {
    connection("Auto refresh · 10s", true);
    return;
  }
  if (state.channel) await client.removeChannel(state.channel);
  state.channel = client
    .channel(`workspace-${session.user.id}`, {
      config: { postgres_changes_options: { wait: true } },
    })
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "broadcasts" },
      () => refresh(),
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "inbox_messages",
        filter: `recipient_id=eq.${session.user.id}`,
      },
      () => refresh(),
    )
    .subscribe((event) => {
      if (!state.session) return;
      if (event === "SUBSCRIBED") {
        connection("Live updates", true);
        refresh();
      } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(event))
        connection("Automatic sync · every 5s");
    });
  connection("Automatic sync · every 5s");
}
$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = $("username").value.trim();
  if (username.length < 2)
    return status("Use a username with 2–24 characters.", true);
  $("login-button").disabled = true;
  status("Establishing a questionable identity…");
  try {
    let {
      data: { session },
    } = await client.auth.getSession();
    if (!session) {
      const result = await client.auth.signInAnonymously();
      if (result.error)
        throw new Error(
          "Anonymous sign-in failed. Enable Anonymous Sign-Ins in Supabase Auth; check rate-limit or CAPTCHA settings.",
        );
      session = result.data.session;
    }
    const existing = await client
      .from("profiles")
      .select("id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (existing.error)
      throw new Error(
        "Could not read your profile. Check that the database migration has been run.",
      );
    const { error } = existing.data
      ? await client
          .from("profiles")
          .update({ username })
          .eq("id", session.user.id)
      : await client.from("profiles").insert({ id: session.user.id, username });
    if (error)
      throw new Error(
        "Could not save your username. Check that the database migration has been run.",
      );
    await startSession(session);
    status(
      meterPage
        ? "Identity established. Select any two people to inspect their scorecard."
        : "Identity established. Pick someone to misunderstand.",
    );
  } catch (error) {
    status(error.message, true);
  } finally {
    $("login-button").disabled = false;
  }
});
let challengeRequest = 0;
async function requestChallenge() {
  const current = ++challengeRequest;
  state.challenge = null;
  state.pending = null;
  $("puzzle").classList.remove("encoded-puzzle");
  updateComposer();
  if (!state.recipient) {
    $("puzzle").textContent = "Select a recipient. The future is waiting.";
    return;
  }
  $("new-challenge").disabled = true;
  $("puzzle").textContent = "Consulting tomorrow…";
  status();
  try {
    const result = await api("challenge", { recipient_id: state.recipient });
    if (current !== challengeRequest) return;
    state.challenge = result;
    $("puzzle").textContent = result.text;
    $("puzzle").classList.add("encoded-puzzle");
    $("challenge-label").textContent =
      `${result.label} · EXPIRES ${time(result.expires_at)}`;
  } catch (error) {
    if (current !== challengeRequest) return;
    $("puzzle").textContent =
      "The future is temporarily unavailable. Request another in a moment.";
    status(error.message, true);
  } finally {
    if (current === challengeRequest) updateComposer();
  }
}
$("recipient").addEventListener("change", () => {
  state.recipient = $("recipient").value || null;
  requestChallenge();
});
$("new-challenge").addEventListener("click", requestChallenge);
$("ciphertext").addEventListener("input", () => {
  $("char-count").textContent = `${$("ciphertext").value.length} / 280`;
  updateComposer();
});
$("send-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.challenge || state.sending) return;
  const ciphertext = $("ciphertext").value;
  if (!ciphertext.trim() || !/^[\x20-\x7e\r\n\t]+$/.test(ciphertext))
    return status(
      "Use English letters, numbers, spaces, and punctuation.",
      true,
    );
  if (state.pending && state.pending.ciphertext !== ciphertext)
    return status(
      "Retry the unchanged message, or request a new future before editing it. This prevents accidental double delivery.",
      true,
    );
  state.pending ??= {
    ciphertext,
    challenge_id: state.challenge.id,
    submission_id: crypto.randomUUID(),
  };
  state.sending = true;
  updateComposer();
  status("Decoding. Manufacturing headlines. Misinterpreting.");
  try {
    const result = await api("send", state.pending);
    state.challenge = null;
    state.pending = null;
    $("ciphertext").value = "";
    $("char-count").textContent = "0 / 280";
    $("puzzle").textContent =
      "A misunderstanding has been delivered. Request a new future for your next message.";
    $("puzzle").classList.remove("encoded-puzzle");
    $("challenge-label").textContent = "FUTURE SUCCESSFULLY WASTED";
    status(
      `Delivered poorly.${result.engine === "fallback" ? " The deterministic misinterpreter handled this transmission." : ""}`,
    );
    await refresh();
  } catch (error) {
    status(
      `${error.message}${!error.status || error.status >= 500 ? " Retry the same message to safely check delivery." : ""}`,
      true,
    );
    if (error.status === 409) {
      state.challenge = null;
      state.pending = null;
    }
  } finally {
    state.sending = false;
    updateComposer();
  }
});
$("logout").addEventListener("click", async () => {
  if (state.sending)
    return status("Wait for the current transmission to finish.", true);
  await client.auth.signOut({ scope: "local" });
  location.reload();
});
if (client) {
  const {
    data: { session },
  } = await client.auth.getSession();
  if (session) await startSession(session);
  else connection("Sign in to connect");
  client.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED") {
      state.session = session;
      client.realtime.setAuth(session.access_token);
    }
    if (event === "SIGNED_OUT") {
      meter.reset();
      state.session = null;
      state.profiles = [];
      state.broadcasts = [];
      state.inbox = [];
      state.challenge = null;
      state.pending = null;
      state.recipient = null;
      challengeRequest++;
      if (state.channel) client.removeChannel(state.channel);
      renderMessages();
      renderRecipients();
      updateComposer();
      $("login-panel").hidden = false;
      $("logout").hidden = true;
      $("account-name").textContent = "Unidentified person";
      $("account-avatar").textContent = "?";
      $("account-detail").textContent = "Signed out";
      connection("Signed out");
    }
  });
  setInterval(refresh, 5000);
  window.addEventListener("online", refresh);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
}
