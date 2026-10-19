// Game flow: rounds, hints, guesses, scoring and the final tally.
(function (CG) {
  const ROUNDS = 5, BASE = 1000, HINT_COST = 250, MISS_COST = 100, FLOOR = 100;
  const SITE = "lifelines.codexcanon.workers.dev";
  const $ = id => document.getElementById(id);

  const yr = y => y < 0 ? `${-y} BC` : (y < 100 ? `AD ${y}` : `${y}`);
  const fmt = n => Math.round(n).toLocaleString("en-US");
  const age = f => f[3] - f[2] - (f[2] < 0 && f[3] > 0 ? 1 : 0); // there is no year 0
  const initials = name => name.replace(/,.*$/, "").split(/\s+/)
    .filter(w => /^[A-ZÀ-Ž]/.test(w) && !/^((I|V|X)+|Jr)\.?$/.test(w)).map(w => w[0] + ".").join(" ");

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem("cg:" + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem("cg:" + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  // Light/dark: follows the system until you pick one, then remembers your pick.
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const isDark = () => (document.documentElement.dataset.theme || (darkQuery.matches ? "dark" : "light")) === "dark";
  function paintTheme() {
    const dark = isDark();
    $("theme").setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    // The browser chrome colour follows the page, not just the system setting.
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute("content", dark ? "#0b1419" : "#e9eef0"));
  }
  $("theme").onclick = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
    paintTheme();
  };
  darkQuery.addEventListener("change", paintTheme);
  paintTheme();

  const map = CG.createMap($("map"), { yr });
  $("zin").onclick = () => map.zoomBy(2);
  $("zout").onclick = () => map.zoomBy(0.5);
  $("zfit").onclick = () => map.fit();

  // Figures are dealt from a shuffled deck so nobody repeats until the pool runs out.
  let deck = [], cursor = 0, round = 0, picks = [], results = [];
  let hints = new Set(), misses = [], done = false, suggestedFor = null;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const fig = () => CG.POOL[picks[round]];
  const total = () => results.reduce((s, r) => s + r.pts, 0);
  const worth = () => Math.max(FLOOR, BASE - HINT_COST * hints.size - MISS_COST * misses.length);

  function newGame() {
    if (cursor + ROUNDS > deck.length) { deck = shuffle(CG.POOL.map((_, i) => i)); cursor = 0; }
    picks = deck.slice(cursor, cursor + ROUNDS); cursor += ROUNDS;
    round = 0; results = [];
    $("final").hidden = true;
    startRound();
  }

  function startRound() {
    const f = fig();
    hints = new Set(); misses = []; done = false; suggestedFor = null;
    $("roundNo").textContent = `${round + 1} / ${ROUNDS}`;
    $("total").textContent = fmt(total());
    $("who").textContent = "Who is this?";
    $("yB").textContent = yr(f[2]);
    $("yD").textContent = yr(f[3]);
    const km = CG.lifeDistance(f);
    $("span").textContent = `Lived about ${age(f)} years · ` +
      (km < 2 ? "died where they were born" : `born and died ${fmt(km)} km apart`);
    $("play").hidden = false; $("answer").hidden = true;
    $("guess").value = "";
    map.show(f);
    render();
    // Fetch the portrait now so it's ready the moment the answer is revealed.
    const portrait = CG.PORTRAITS[f[0]];
    if (portrait && portrait.img) new Image().src = portrait.img;
    if (window.matchMedia("(min-width: 681px)").matches) setTimeout(() => $("guess").focus({ preventScroll: true }), 50);
  }

  function render() {
    const f = fig(), places = hints.has("places") || done;
    $("pB").textContent = places ? f[4][2] : "";
    $("pD").textContent = places ? f[5][2] : "";
    map.setPlaces(places);

    const extra = $("extra");
    extra.replaceChildren();
    const line = (label, value) => {
      const div = document.createElement("div"), small = document.createElement("small"), b = document.createElement("b");
      small.textContent = label; b.textContent = value; div.append(small, b); extra.append(div);
    };
    if (!done && hints.has("field")) line("Known for", f[1]);
    if (!done && hints.has("initials")) line("Initials", initials(f[0]));
    extra.hidden = !extra.childElementCount;

    for (const b of $("hints").querySelectorAll("button")) b.disabled = hints.has(b.dataset.h);
    $("worth").textContent = `Worth ${fmt(worth())}`;
    const m = $("misses");
    m.replaceChildren(...misses.map(x => { const s = document.createElement("s"); s.textContent = x; return s; }));
  }

  for (const b of $("hints").querySelectorAll("button")) {
    b.onclick = () => { if (!done && !hints.has(b.dataset.h)) { hints.add(b.dataset.h); render(); $("guess").focus({ preventScroll: true }); } };
  }

  function shake() {
    const input = $("guess");
    input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
  }

  function hideSuggestion() { $("suggest").hidden = true; suggestedFor = null; }

  // Settle a guess: right ends the round, wrong costs a miss.
  function judge(text) {
    hideSuggestion();
    if (CG.accepts(text, fig())) return finishRound(true);
    if (!misses.some(m => CG.norm(m) === CG.norm(text))) misses.push(text);
    $("guess").value = "";
    shake();
    render();
  }

  $("ask").onsubmit = e => {
    e.preventDefault();
    if (done) return;
    const text = $("guess").value.trim();
    if (!text) return;
    if (CG.accepts(text, fig())) return finishRound(true);

    // A near miss on some figure's name gets a free "did you mean" before it counts against you.
    // Submitting the same text again means the player meant it as typed.
    const key = CG.norm(text);
    const s = suggestedFor === key ? null : CG.suggest(text, CG.POOL);
    if (s && CG.norm(s[0]) !== key) {
      suggestedFor = key;
      $("suggestName").textContent = s[0];
      $("suggestName").onclick = () => judge(s[0]);
      $("suggest").hidden = false;
      return;
    }
    judge(text);
  };
  $("guess").addEventListener("input", () => { if (suggestedFor && CG.norm($("guess").value) !== suggestedFor) hideSuggestion(); });
  $("giveup").onclick = () => { if (!done) finishRound(false); };

  function finishRound(win) {
    const f = fig(), pts = win ? worth() : 0;
    done = true; hideSuggestion();
    results.push({ name: f[0], win, pts, hints: hints.size, misses: misses.length });
    $("total").textContent = fmt(total());
    $("play").hidden = true; $("answer").hidden = false;
    $("who").textContent = win ? "Identified" : "Revealed";
    $("verdict").textContent = win ? (misses.length || hints.size ? "Got it" : "First try, no hints") : "Better luck next time";
    $("verdict").className = "verdict " + (win ? "win" : "lose");
    $("name").textContent = f[0];
    $("desc").textContent = f[1];
    showPortrait(f);
    $("approx").hidden = !f[6];
    $("pts").textContent = `+${fmt(pts)}`;
    $("nextLabel").textContent = round + 1 < ROUNDS ? "Next figure" : "See final score";
    render();
    $("next").focus({ preventScroll: true });
    // On phones the card sits under the map; bring the answer into view once the keyboard drops.
    if (!window.matchMedia("(min-width: 681px)").matches) {
      setTimeout(() => $("answer").scrollIntoView({ behavior: "smooth", block: "nearest" }), 250);
    }
  }

  function showPortrait(f) {
    const p = CG.PORTRAITS[f[0]] || {}, img = $("portraitImg"), frame = $("portrait");
    frame.hidden = !p.img;
    if (p.img) {
      img.onerror = () => { frame.hidden = true; };
      img.src = p.img;
      img.alt = `Portrait of ${f[0]}`;
    }
    $("wiki").hidden = !p.page;
    if (p.page) $("wiki").href = p.page;
  }

  $("next").onclick = () => { if (round + 1 < ROUNDS) { round++; startRound(); } else finish(); };

  const square = r => r.pts >= BASE ? "🟩" : r.pts >= 600 ? "🟨" : r.pts > 0 ? "🟧" : "⬛";

  function finish() {
    const t = total(), max = ROUNDS * BASE, pct = t / max;
    const best = Math.max(t, store.get("best") || 0);
    store.set("best", best);
    $("finalScore").innerHTML = `${fmt(t)} <small>/ ${fmt(max)}</small>`;
    $("best").textContent = t >= best && t > 0 ? "New personal best" : `Personal best ${fmt(best)}`;
    $("rank").textContent =
      pct > .9 ? "Royal historian. You barely needed the map." :
      pct > .7 ? "Sharp eye. Most of them didn't stand a chance." :
      pct > .5 ? "Well read. A few hints, but you got there." :
      pct > .25 ? "Getting warmer. The hints are there for a reason." :
      "History remains a mystery. Try another five.";
    $("ftable").replaceChildren(...results.map(r => {
      const tr = document.createElement("tr");
      const cells = [
        r.name,
        r.win ? [r.hints && `${r.hints} hint${r.hints > 1 ? "s" : ""}`, r.misses && `${r.misses} miss${r.misses > 1 ? "es" : ""}`].filter(Boolean).join(", ") || "Clean" : "Gave up",
        fmt(r.pts),
      ];
      cells.forEach((c, i) => { const td = document.createElement("td"); td.textContent = c; if (i === 2) td.className = "n"; tr.append(td); });
      const p = CG.PORTRAITS[r.name];
      if (p && p.img) {
        const img = document.createElement("img");
        img.className = "face"; img.src = p.img; img.alt = ""; img.onerror = () => img.remove();
        tr.firstChild.prepend(img);
      }
      return tr;
    }));
    $("shareText").value = `Lifelines ${fmt(t)} / ${fmt(max)}\n${results.map(square).join("")}\n${SITE}`;
    $("shareMsg").textContent = "";
    $("final").hidden = false;
    $("again").focus();
  }

  $("share").onclick = () => {
    const text = $("shareText").value;
    const fallback = () => { $("shareText").hidden = false; $("shareText").select(); $("shareMsg").textContent = "Press Ctrl+C or Cmd+C to copy."; };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(text).then(() => { $("shareMsg").textContent = "Copied to clipboard."; }, fallback);
  };
  $("again").onclick = newGame;

  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" || ["BUTTON", "INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
    if (!$("final").hidden) newGame(); else if (done) $("next").click();
  });

  // Console helper for testing: CG.dev.play("Thomas Jefferson") swaps the current figure.
  CG.dev = {
    play(name) {
      const i = CG.POOL.findIndex(f => f[0] === name);
      if (i < 0) return `No figure named ${name}`;
      $("final").hidden = true; picks[round] = i; startRound();
    },
  };

  newGame();
})(window.CG = window.CG || {});
