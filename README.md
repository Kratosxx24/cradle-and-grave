# Cradle & Grave

A guess-who game on a map. The map shows where a famous historical figure was born and where they died, with the year of each. You type in who it is.

**Play online:** https://kratosxx24.github.io/cradle-and-grave/

## How it plays

- Each figure is worth 1,000 points. A game is 5 figures, out of 5,000.
- Three hints cost 250 each: the place names, what they were known for, and their initials.
- A wrong guess costs 100. You always get at least 100 if you name them. Giving up scores 0.
- Typos are forgiven. Small slips count outright ("Einstien", "Ghandi", "Dostoyevsky"). Bigger ones get a free "Did you mean…?" before they count against you.

## Run locally

```bash
npm start
```

Then open http://localhost:8765. Opening `index.html` directly also works.

```bash
npm test
```

The tests cover name matching and check the figure data. They need Node 18 or newer and no installs.

To jump straight to one figure while testing, run `CG.dev.play("Thomas Jefferson")` in the browser console.

## Project layout

| Path | What it holds |
|------|---------------|
| `index.html` | Page markup |
| `css/style.css` | All styles, with light and dark themes as color tokens at the top |
| `js/figures.js` | The pool of 150 figures and the extra spellings each one accepts |
| `js/match.js` | Name matching and "did you mean" suggestions |
| `js/map.js` | The D3 world map, pins and zoom |
| `js/game.js` | Rounds, hints, scoring, final screen |
| `data/atlas.js` | Country outlines (Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas)) |
| `tests/` | Node tests for `match.js` and the data |

D3 and topojson-client load from CDNs. There is no build step.

## Adding a figure

Add a row to `CG.POOL` in `js/figures.js`:

```js
["Name", "Known for", birthYear, deathYear, [lat, lon, "Birthplace"], [lat, lon, "Deathplace"]]
```

- Use negative years for BC.
- Add a trailing `1` to mark a disputed location. The reveal then shows a note.
- The full name and the surname are accepted automatically. If the surname alone is wrong ("Alexander the Great") or people use a nickname ("MLK"), list the accepted spellings in `CG.ALIASES`. When an entry exists, it replaces the surname rule.

Run `npm test` afterwards. One test checks that no figure's name is accepted as somebody else.
