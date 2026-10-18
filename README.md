# Cradle & Grave

A map guessing game. You get a famous historical figure, pin where you think they were born and where they died, and score up to 5,000 points per pin by distance (50,000 per 5-figure game).

**Play:** open `index.html` in a browser. No build step and no server needed.

## Files

- `index.html` — the game: layout, styles, the pool of 105 figures, and the scoring logic
- `atlas.js` — world country outlines (Natural Earth 1:50m via [world-atlas](https://github.com/topojson/world-atlas))

D3 and topojson-client load from CDNs.

## Adding figures

Figures live in the `POOL` array in `index.html`:

```js
["Name", "Known for", birthYear, deathYear, [lat, lon, "Birthplace"], [lat, lon, "Deathplace"]]
```

Use negative years for BC. Add a trailing `1` to mark a disputed location, which shows a note on the reveal.

## Scoring

`5000 × e^(−km / 1500)` per pin, with a full 5,000 inside 25 km.
