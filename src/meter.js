export function createMeter(element, api) {
  element.innerHTML = `
    <div class="page-heading meter-heading"><div><p class="eyebrow">THE DEPARTMENT OF UNNECESSARY ANALYTICS</p><h1>Miscommunication<br>Meter<span class="accent">.</span></h1><p class="page-description">Scientifically unverified. Socially devastating.</p></div><div class="protocol-stamp"><span>−%</span><small>CERTIFIED<br>MISUNDERSTANDING</small></div></div>
    <div class="meter-disclaimer"><span class="pill green">PUBLIC SCORECARDS</span><p>Any signed-in user can inspect any pair. All scores are fictional satire. New messages make matters worse.</p></div>
    <section class="panel meter-controls" aria-label="Choose a conversation">
      <div class="meter-person"><label for="meter-user-a">FIRST PERSON</label><select id="meter-user-a" disabled><option value="">Sign in to select people</option></select></div>
      <button type="button" id="meter-swap" class="meter-swap" disabled>Swap people</button>
      <div class="meter-person"><label for="meter-user-b">SECOND PERSON</label><select id="meter-user-b" disabled><option value="">Sign in to select people</option></select></div>
      <button type="button" id="meter-refresh" class="button primary" disabled>Recalculate the damage</button>
    </section>
    <p id="meter-status" class="status" role="status" aria-live="polite">Sign in above to inspect a conversation.</p>
    <section id="meter-scorecard" aria-label="Fictional conversation scorecard" aria-busy="false">
      <div class="meter-summary"><h2 id="meter-pair">No conversation selected</h2><span id="meter-count">No transmissions counted</span></div>
      <div id="meter-empty" class="empty-state meter-empty" hidden><strong>No misunderstandings on record.</strong><p>These two have not exchanged a message yet. The damage is still hypothetical.</p></div>
      <div class="meter-grid">
        <article class="meter-card understanding"><span class="tiny-label">01 / UNDERSTANDING</span><p id="meter-understanding" class="meter-value">—</p><h3>Understanding %</h3><p>Mutual comprehension is heading in the wrong direction.</p><div class="meter-footnote">LESS THAN NOTHING, BY DESIGN</div></article>
        <article class="meter-card tone"><span class="tiny-label">02 / TONE OF SPEECH</span><p id="meter-tone" class="meter-value meter-tone-value">—</p><h3>The conversational forecast</h3><p id="meter-tone-description">A dramatic forecast requires an actual conversation.</p><div class="meter-footnote">EMOTIONALLY UNQUALIFIED</div></article>
        <article class="meter-card damage"><span class="tiny-label">03 / FRIENDSHIP DAMAGE</span><p id="meter-damage" class="meter-value">—</p><h3>Friendship damage meter</h3><div class="meter-track" role="progressbar" aria-label="Fictional friendship damage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="meter-damage-fill"></span></div><p id="meter-damage-description">Diplomatic relations are awaiting assessment.</p></article>
        <article class="meter-card financial"><span class="tiny-label">04 / FINANCIAL RISK</span><p id="meter-financial" class="meter-value meter-money-value">—</p><h3>Imaginary credits at risk</h3><p>Emotionally bankrupt. Financially fictional.</p><div class="meter-footnote">ABSOLUTELY NO ACTUAL VALUATION</div></article>
      </div>
    </section>
    <div class="meter-bottom-note"><span>Scores stay consistent until new messages arrive.</span><span>Automatic refresh · every 10 seconds</span></div>`;

  const $ = (id) => element.querySelector(`#${id}`);
  const selectA = $("meter-user-a"),
    selectB = $("meter-user-b");
  let profiles = [],
    signature = "",
    lastFetch = 0,
    requestId = 0,
    lastPair = "",
    busy = false,
    active = false;
  const pairKey = () => [selectA.value, selectB.value].sort().join(":");
  const valid = () =>
    active && selectA.value && selectB.value && selectA.value !== selectB.value;
  const setStatus = (text, error = false) => {
    $("meter-status").textContent = text;
    $("meter-status").classList.toggle("error", error);
  };
  function buttons() {
    $("meter-refresh").disabled = !valid() || busy;
    $("meter-swap").disabled = !active || !selectA.value || !selectB.value;
    $("meter-scorecard").setAttribute("aria-busy", String(busy));
  }
  function clear() {
    for (const id of [
      "meter-understanding",
      "meter-tone",
      "meter-damage",
      "meter-financial",
    ])
      $(id).textContent = "—";
    $("meter-count").textContent = "No transmissions counted";
    $("meter-pair").textContent = "No conversation selected";
    $("meter-empty").hidden = true;
    $("meter-tone-description").textContent =
      "A dramatic forecast requires an actual conversation.";
    $("meter-damage-description").textContent =
      "Diplomatic relations are awaiting assessment.";
    $("meter-damage-fill").style.width = "0%";
    $("meter-damage-fill").parentElement.setAttribute("aria-valuenow", "0");
  }
  function render(result) {
    $("meter-pair").textContent = result.pair
      .map((person) => person.username)
      .join(" × ");
    $("meter-count").textContent =
      `${result.message_count.toLocaleString()} transmitted misunderstanding${result.message_count === 1 ? "" : "s"}`;
    $("meter-empty").hidden = result.message_count !== 0;
    if (!result.metrics) return;
    const scores = result.metrics;
    $("meter-understanding").textContent =
      `${scores.understanding_percent.toLocaleString()}%`;
    $("meter-tone").textContent = scores.tone.label;
    $("meter-tone-description").textContent = scores.tone.description;
    $("meter-damage").textContent = `${scores.friendship_damage_percent}/100`;
    $("meter-financial").textContent =
      scores.financial_risk_credits.toLocaleString();
    $("meter-damage-fill").style.width =
      `${Math.max(0, Math.min(100, scores.friendship_damage_percent))}%`;
    $("meter-damage-fill").parentElement.setAttribute(
      "aria-valuenow",
      String(scores.friendship_damage_percent),
    );
    $("meter-damage-description").textContent =
      scores.friendship_damage_percent >= 80
        ? "Diplomatic relations suspended indefinitely."
        : scores.friendship_damage_percent >= 45
          ? "Mutual friends have begun choosing sides."
          : "A small but unnecessary diplomatic incident.";
  }
  async function refresh(force = false) {
    if (!valid()) {
      ++requestId;
      busy = false;
      clear();
      buttons();
      if (active && selectA.value && selectA.value === selectB.value)
        setStatus(
          "Choose two different people. Internal monologues are beyond our jurisdiction.",
          true,
        );
      return;
    }
    const key = pairKey();
    if (
      !force &&
      (busy || (key === lastPair && Date.now() - lastFetch < 10000))
    )
      return;
    const current = ++requestId;
    if (key !== lastPair) clear();
    lastPair = key;
    lastFetch = Date.now();
    busy = true;
    buttons();
    setStatus("Consulting our entirely unqualified analysts…");
    try {
      const result = await api("meter", {
        user_a: selectA.value,
        user_b: selectB.value,
      });
      if (current !== requestId || !active) return;
      clear();
      render(result);
      setStatus(
        result.message_count
          ? "Scorecard updated. The situation remains statistically ridiculous."
          : "No messages yet. Select another pair or create a misunderstanding.",
      );
    } catch (error) {
      if (current !== requestId || !active) return;
      clear();
      setStatus(error.message || "The meter is temporarily unavailable.", true);
    } finally {
      if (current === requestId) {
        busy = false;
        buttons();
      }
    }
  }
  const changed = () => refresh(true);
  selectA.addEventListener("change", changed);
  selectB.addEventListener("change", changed);
  $("meter-refresh").addEventListener("click", () => refresh(true));
  $("meter-swap").addEventListener("click", () => {
    const previous = selectA.value;
    selectA.value = selectB.value;
    selectB.value = previous;
    refresh(true);
  });
  setInterval(() => {
    if (active && !busy) refresh(true);
  }, 10000);
  return {
    updateUsers(nextProfiles, viewerId) {
      active = true;
      profiles = nextProfiles;
      const nextSignature = JSON.stringify(profiles);
      if (nextSignature !== signature) {
        signature = nextSignature;
        const previousA = selectA.value,
          previousB = selectB.value;
        for (const select of [selectA, selectB]) {
          select.replaceChildren(
            new Option("Choose a person", ""),
            ...profiles.map(
              (person) =>
                new Option(
                  `${person.username} · ${person.id.slice(0, 4)}`,
                  person.id,
                ),
            ),
          );
          select.disabled = false;
        }
        selectA.value = profiles.some((p) => p.id === previousA)
          ? previousA
          : profiles.find((p) => p.id === viewerId)?.id ||
            profiles[0]?.id ||
            "";
        selectB.value = profiles.some((p) => p.id === previousB)
          ? previousB
          : profiles.find((p) => p.id !== selectA.value)?.id || "";
      }
      if (profiles.length < 2)
        setStatus(
          "Waiting for a second registered person. Even imaginary damage needs two participants.",
        );
      buttons();
    },
    refresh,
    reset() {
      active = false;
      ++requestId;
      busy = false;
      signature = "";
      lastPair = "";
      lastFetch = 0;
      selectA.replaceChildren(new Option("Sign in to select people", ""));
      selectB.replaceChildren(new Option("Sign in to select people", ""));
      selectA.disabled = true;
      selectB.disabled = true;
      clear();
      buttons();
      setStatus("Sign in above to inspect a conversation.");
    },
  };
}
