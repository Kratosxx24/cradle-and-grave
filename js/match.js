// Name matching: decides whether a typed guess names a figure, and finds a
// "did you mean" suggestion when a guess is close to a name but not close enough.
(function (CG) {
  // Words people tack on that shouldn't decide a match ("Queen Elizabeth", "Captain Cook").
  const TITLES = new Set([
    "the", "king", "queen", "saint", "st", "sir", "lord", "lady", "president", "emperor", "empress",
    "tsar", "czar", "pope", "prince", "princess", "dr", "captain", "general", "chairman", "mr", "mrs", "mother",
  ]);

  // Lowercase, strip accents and punctuation, single spaces.
  function norm(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[ʻ'’`.,]/g, "").replace(/[-_/]/g, " ").replace(/\s+/g, " ").trim();
  }

  function stripTitles(s) {
    const kept = s.split(" ").filter(w => !TITLES.has(w));
    return kept.length ? kept.join(" ") : s;
  }

  // A rough sound-alike key, so transliteration variants collapse together:
  // Dostoyevsky / Dostoevsky, Tchaikovsky / Chaikovsky, Ghandi / Gandhi.
  function skeleton(s) {
    return s.replace(/ /g, "")
      .replace(/ph/g, "f").replace(/ck/g, "k").replace(/tch/g, "ch").replace(/dh/g, "d").replace(/gh/g, "g")
      .replace(/ks/g, "x").replace(/[yj]/g, "i").replace(/w/g, "v").replace(/z/g, "s")
      .replace(/(.)\1+/g, "$1");
  }

  // Edit distance where swapping two adjacent letters counts as one typo.
  function dist(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  }

  // How many typos a name of this length can absorb and still count.
  const slack = len => len >= 9 ? 2 : len >= 5 ? 1 : 0;

  // Every normalized spelling that names this figure.
  function forms(fig) {
    const full = norm(fig[0]);
    const extra = CG.ALIASES[fig[0]];
    let list;
    if (extra) list = [full, ...extra.map(norm)];
    else {
      const last = full.split(" ").pop();
      list = last.length > 3 ? [full, last] : [full];
    }
    return [...new Set(list)];
  }

  const sortTokens = s => s.split(" ").sort().join(" ");

  // Smallest typo count between a guess and one accepted spelling, trying the
  // guess as typed, without titles, with words reordered, and by sound.
  function closeness(g, form) {
    const gt = stripTitles(g), ft = stripTitles(form);
    if (g === form || gt === ft || sortTokens(gt) === sortTokens(ft)) return 0;
    if (skeleton(gt) === skeleton(ft)) return 0;
    return Math.min(dist(g, form), dist(gt, ft), dist(skeleton(gt), skeleton(ft)));
  }

  function accepts(guess, fig) {
    const g = norm(guess);
    if (!g) return false;
    return forms(fig).some(f => {
      const d = closeness(g, f);
      return d === 0 || d <= slack(stripTitles(f).length);
    });
  }

  // The figure whose name is nearest a near-miss guess, or null if nothing is
  // plausibly what the player meant. Searches the whole pool, so a suggestion
  // never singles out the current answer.
  function suggest(guess, pool) {
    const g = norm(guess);
    if (g.length < 4) return null;
    // Already a recognizable name for someone: the player meant it, no correction needed.
    if (pool.some(fig => accepts(guess, fig))) return null;
    let best = null;
    for (const fig of pool) {
      for (const f of forms(fig)) {
        const d = closeness(g, f);
        const len = Math.max(stripTitles(g).length, stripTitles(f).length);
        if (d > 4 || d / len > 0.4) continue;
        if (!best || d < best.d || (d === best.d && f === norm(fig[0]))) best = { fig, d };
      }
    }
    return best && best.fig;
  }

  Object.assign(CG, { norm, dist, skeleton, forms, accepts, suggest });
})(typeof window !== "undefined" ? (window.CG = window.CG || {}) : (module.exports = require("./figures.js")));
