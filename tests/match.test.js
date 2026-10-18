// Run with: npm test
const test = require("node:test");
const assert = require("node:assert");
const CG = require("../js/match.js");

const fig = name => {
  const f = CG.POOL.find(p => p[0] === name);
  if (!f) throw new Error(`No figure named ${name}`);
  return f;
};

test("accepts full names, surnames, aliases and small typos", () => {
  const ok = [
    ["Albert Einstein", "Albert Einstein"], ["einstein", "Albert Einstein"], ["einstien", "Albert Einstein"],
    ["napoleon", "Napoleon Bonaparte"], ["MLK", "Martin Luther King Jr."], ["martin luther king", "Martin Luther King Jr."],
    ["buddha", "Siddhartha Gautama"], ["pele", "Pelé"], ["ataturk", "Mustafa Kemal Atatürk"],
    ["Lincon", "Abraham Lincoln"], ["bolivar", "Simón Bolívar"], ["davinci", "Leonardo da Vinci"],
    ["ho chi min", "Ho Chi Minh"], ["hawkings", "Stephen Hawking"], ["Queen Elizabeth", "Elizabeth I"],
    ["captain cook", "James Cook"], ["Ghandi", "Mahatma Gandhi"], ["dostoyevsky", "Fyodor Dostoevsky"],
    ["Chaikovsky", "Pyotr Ilyich Tchaikovsky"], ["Gandhi Mahatma", "Mahatma Gandhi"], ["shakespear", "William Shakespeare"],
    ["Micheal Jackson", "Michael Jackson"], ["Ceasar", "Julius Caesar"], ["King Henry", "Henry VIII"],
    ["jengis khan", "Genghis Khan"], ["freud", "Sigmund Freud"],
  ];
  for (const [g, n] of ok) assert.ok(CG.accepts(g, fig(n)), `"${g}" should name ${n}`);
});

test("rejects other people and vague words", () => {
  const no = [
    ["washington", "Abraham Lincoln"], ["great", "Peter the Great"], ["lee", "Bruce Lee"],
    ["pierre curie", "Marie Curie"], ["the", "Alexander the Great"], ["", "Albert Einstein"],
    ["Franklin", "Franklin D. Roosevelt"], ["Peter", "Catherine the Great"], ["queen", "Queen Victoria"],
  ];
  for (const [g, n] of no) assert.ok(!CG.accepts(g, fig(n)), `"${g}" should not name ${n}`);
});

test("bigger misspellings are accepted or get the right suggestion", () => {
  const cases = [
    ["Napolian Bonapart", "Napoleon Bonaparte"], ["Leanardo Davincci", "Leonardo da Vinci"],
    ["Mozzzart", "Wolfgang Amadeus Mozart"], ["Shakspear", "William Shakespeare"], ["Charles Darwen", "Charles Darwin"], ["Abrahm Lincolin", "Abraham Lincoln"], ["Bethoveen", "Ludwig van Beethoven"],
  ];
  for (const [g, n] of cases) {
    if (CG.accepts(g, fig(n))) continue; // forgiving enough to count outright
    const s = CG.suggest(g, CG.POOL);
    assert.ok(s, `expected a suggestion for "${g}"`);
    assert.strictEqual(s[0], n, `"${g}" suggested ${s && s[0]}`);
  }
});

test("does not suggest for unrelated text", () => {
  for (const g of ["asdf", "xyzzy qwerty", "hi", "banana bread"]) assert.strictEqual(CG.suggest(g, CG.POOL), null, g);
});

test("every figure accepts its own full name and has valid data", () => {
  for (const f of CG.POOL) {
    assert.ok(CG.accepts(f[0], f), f[0]);
    assert.ok(f[2] < f[3], `${f[0]} dies after birth`);
    for (const p of [f[4], f[5]]) {
      assert.ok(Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && typeof p[2] === "string", `${f[0]} coordinates`);
    }
  }
  for (const name of Object.keys(CG.ALIASES)) assert.ok(CG.POOL.some(f => f[0] === name), `alias key "${name}" matches a figure`);
});

test("no figure's surname rule accidentally accepts a different figure's full name", () => {
  for (const a of CG.POOL) for (const b of CG.POOL) {
    if (a === b) continue;
    if (CG.accepts(b[0], a)) assert.fail(`"${b[0]}" is accepted as ${a[0]}`);
  }
});

test("no suggestion when the guess already names someone in the pool", () => {
  for (const g of ["Columbus", "einstein", "Napoleon"]) assert.strictEqual(CG.suggest(g, CG.POOL), null, g);
});
