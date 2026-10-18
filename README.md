# Cradle & Grave

A guess-who game on a map. The map shows where a famous historical figure was born and where they died, with the year of each. You type in who it is.

**Play online:** https://kratosxx24.github.io/cradle-and-grave/

**Play:** open `index.html` in a browser. No build step and no server needed.

## Files

- `index.html` — the game: layout, styles, the pool of 105 figures, accepted name spellings, and scoring
- `atlas.js` — world country outlines (Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas))

D3 and topojson-client load from CDNs.

## Adding figures

Figures live in the `POOL` array in `index.html`:

```js
["Name", "Known for", birthYear, deathYear, [lat, lon, "Birthplace"], [lat, lon, "Deathplace"]]
```

Use negative years for BC. Add a trailing `1` to mark a disputed location, which shows a note on the reveal.

Accepted answers: the full name always works, plus the surname by default. For names where the surname alone isn't right (Alexander the Great, Ho Chi Minh) or where people use a nickname (MLK, FDR, the Buddha), list the accepted spellings in `ALIASES`. Small typos are forgiven.

## Scoring

Each figure is worth 1,000 points. Each hint (place names, what they were known for, initials) costs 250, and each wrong guess costs 100, down to a minimum of 100 if you get it. Giving up scores 0. A 5-figure game is out of 5,000.
