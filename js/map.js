// The world map: draws countries once, then shows one figure's birth and death pins.
// Countries are projected once into a fixed W x H "world" space; the zoom transform maps
// that onto the svg's real pixel size (w x h). Pins, labels and the scale bar live in an
// unzoomed layer in screen pixels and are re-placed on every zoom so they stay crisp.
(function (CG) {
  const W = 960, H = 500;
  const MIN_SPAN_KM = 2000; // never zoom in tighter than this, so neighbouring countries stay in view
  const MAX_FIT_ZOOM = 14;  // relative to the whole world fitting the screen
  const ll = p => [p[1], p[0]]; // [lat, lon, ...] -> [lon, lat]

  CG.createMap = function (svgEl, { yr }) {
    const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
    const path = d3.geoPath(proj);
    const svg = d3.select(svgEl);
    let w = W, h = H, k0 = 1; // screen size in px, and the zoom at which the whole world fits

    const gMap = svg.append("g");
    gMap.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", path);
    gMap.append("path").datum(d3.geoGraticule10()).attr("class", "grat").attr("d", path);
    const countries = topojson.feature(ATLAS, ATLAS.objects.countries).features;
    gMap.append("g").selectAll("path").data(countries).join("path").attr("class", "land").attr("d", path);
    gMap.append("path").datum(topojson.mesh(ATLAS, ATLAS.objects.countries, (a, b) => a !== b)).attr("class", "border").attr("d", path);
    gMap.append("path").datum(topojson.mesh(ATLAS, ATLAS.objects.countries, (a, b) => a === b)).attr("class", "coast").attr("d", path);
    const gLines = gMap.append("g");
    const gLabels = svg.append("g").attr("class", "countries");
    const gPins = svg.append("g");
    const gScale = svg.append("g").attr("class", "scalebar");

    // Label anchors: each country's largest piece, so France labels in France, not French Guiana.
    const labels = countries.filter(c => c.properties && c.properties.name).map(c => {
      const parts = c.geometry.type === "MultiPolygon"
        ? c.geometry.coordinates.map(coordinates => ({ type: "Polygon", coordinates }))
        : [c.geometry];
      const main = parts.reduce((a, b) => path.area(b) > path.area(a) ? b : a);
      return { name: shortName(c.properties.name), at: path.centroid(main), area: path.area(main), bounds: path.bounds(c), feature: c };
    }).filter(l => isFinite(l.at[0])).sort((a, b) => b.area - a.area);

    let T = d3.zoomIdentity, fig = null, showPlaces = false, pinXY = [], flight = 0, lifeEl = null;
    // Skip choreography when it can't play (hidden tabs run no animation frames) or isn't wanted.
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const instant = () => document.hidden || reduced.matches;
    const zoom = d3.zoom().translateExtent([[0, 0], [W, H]])
      .on("zoom", e => { T = e.transform; gMap.attr("transform", T); drawPins(); drawLabels(); drawScale(); });
    svg.call(zoom);

    function measure() {
      w = svgEl.clientWidth || W; h = svgEl.clientHeight || H;
      k0 = Math.min(w / W, h / H);
      svg.attr("viewBox", `0 0 ${w} ${h}`);
      zoom.extent([[0, 0], [w, h]]).scaleExtent([k0, 80 * k0]);
    }
    measure();
    // Keep the pins framed when the window or phone orientation changes.
    let pending = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        if (svgEl.clientWidth === w && svgEl.clientHeight === h) return;
        measure(); fig ? fit(0) : svg.call(zoom.transform, d3.zoomIdentity.scale(k0));
      });
    }).observe(svgEl);

    function drawPins() {
      if (!fig) { pinXY = []; return; }
      const same = d3.geoDistance(ll(fig[4]), ll(fig[5])) * 6371 < 30;
      const data = [
        { k: "b", c: ll(fig[4]), year: "Born " + yr(fig[2]), place: fig[4][2], dy: same ? -14 : 0 },
        { k: "d", c: ll(fig[5]), year: "Died " + yr(fig[3]), place: fig[5][2], dy: same ? 14 : 0 },
      ];
      const sel = gPins.selectAll("g.live").data(data, d => d.k).join(enter => {
        const g = enter.append("g").attr("class", d => `pin live ${d.k}`);
        g.append("circle").attr("class", "halo").attr("r", 6.5);
        g.append("circle").attr("class", "dot").attr("r", 6.5);
        g.append("text").attr("class", "tag");
        g.append("text").attr("class", "place");
        return g;
      });
      pinXY = data.map(d => { const [x, y] = T.apply(proj(d.c)); return [x, y + d.dy]; });
      // The outgoing figure's pins stay pinned to their places, so they ride away with the map as they fade.
      gPins.selectAll("g.leaving").attr("transform", d => { const [x, y] = T.apply(proj(d.c)); return `translate(${x},${y + d.dy})`; });
      // Labels point away from each other: the upper pin's sits above it, the lower pin's below, year
      // nearest the dot and place name beyond. The life line runs between the pins, so it never
      // crosses a label, and the two labels can't collide however close the pins are.
      const lowerIdx = pinXY[0][1] > pinXY[1][1] ? 0 : 1;
      sel.attr("transform", (d, i) => `translate(${pinXY[i][0]},${pinXY[i][1]})`);
      sel.select(".tag").text(d => d.year);
      sel.select(".place").text(d => showPlaces ? d.place : "");
      sel.each(function (d, i) {
        const s = i === lowerIdx ? 1 : -1, px = pinXY[i][0];
        const g = d3.select(this);
        g.select(".tag").attr("y", s * 20);
        g.select(".place").attr("y", s * 38);
        // Centred on the pin, but slid sideways if that would run off the edge of the map.
        g.selectAll(".tag, .place").attr("text-anchor", "middle").each(function () {
          const half = this.getComputedTextLength() / 2, lo = 6 + half - px, hi = w - 6 - half - px;
          d3.select(this).attr("x", lo > hi ? 0 : Math.max(lo, Math.min(0, hi)));
        });
      });
    }

    // Country names appear as you zoom in: a country is labelled once it's big enough on
    // screen to hold its name, biggest first, skipping any that would collide.
    function drawLabels() {
      const placed = pinXY.map(([x, y]) => [x - 85, y - 50, x + 85, y + 50]); // keep clear of pins and their labels, above or below
      const out = [];
      const size = T.k < 3 * k0 ? 9 : 10.5;
      for (const l of labels) {
        const onScreen = l.area * T.k * T.k;
        const bw = l.name.length * size * 0.68 + 6, bh = size + 4;
        if (onScreen < bw * bh * 1.4) continue;
        const [x, y] = T.apply(l.at);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const box = [x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2];
        if (placed.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
        placed.push(box);
        out.push({ name: l.name, x, y });
        if (out.length > 40) break;
      }
      // Zoomed deep inside a big country, its own label is off-screen. Name whatever
      // country sits under the middle of the view along the top edge instead.
      const midX = (w + cardOffset()) / 2, here = T.invert([midX, h / 2]);
      const inside = T.k > 8 * k0 && labels.find(l => here[0] >= l.bounds[0][0] && here[0] <= l.bounds[1][0] && here[1] >= l.bounds[0][1] &&
        here[1] <= l.bounds[1][1] && d3.geoContains(l.feature, proj.invert(here)));
      if (inside && !out.some(o => o.name === inside.name)) out.push({ name: inside.name, x: midX, y: 30 });
      gLabels.attr("font-size", size).selectAll("text").data(out, d => d.name)
        .join("text").attr("x", d => d.x).attr("y", d => d.y).text(d => d.name);
    }

    // A cartographer's scale bar, bottom right, sized to a round number of km for the current view.
    function drawScale() {
      const [cx, cy] = [w - 120, h - 24];
      const a = proj.invert(T.invert([cx, cy])), b = proj.invert(T.invert([cx + 100, cy]));
      if (!a || !b) return;
      const kmPer100 = d3.geoDistance(a, b) * 6371;
      const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000].filter(n => n <= kmPer100 * 1.2).pop() || 5;
      const len = 100 * nice / kmPer100;
      const x0 = w - 16 - len;
      gScale.selectAll("*").remove();
      gScale.append("rect").attr("class", "bg").attr("x", x0 - 8).attr("y", h - 38).attr("width", len + 16).attr("height", 28).attr("rx", 4);
      gScale.append("path").attr("d", `M${x0},${h - 18}v5h${len}v-5`);
      gScale.append("path").attr("d", `M${x0 + len / 2},${h - 13}v-3`);
      gScale.append("text").attr("x", x0 + len / 2).attr("y", h - 25).text(`${nice.toLocaleString("en-US")} km`);
    }

    // Width in px the floating card covers on the left (0 on phones, where it sits below the map).
    const cardOffset = () => window.innerWidth > 680 ? 420 : 0;

    // How long a flight to `target` should take. d3's smooth-zoom path knows how far the camera really
    // travels (out, across, back in), so long hops get time to breathe and short ones stay brisk.
    function flightMs(target) {
      const view = t => [(w / 2 - t.x) / t.k, (h / 2 - t.y) / t.k, w / t.k];
      return Math.max(700, Math.min(2000, d3.interpolateZoom(view(T), view(target)).duration * 0.9));
    }

    // Frame both pins. Close pairs get a tight regional view; far-apart pairs pull back.
    // With no duration, the flight is timed to its length. `arrive` runs when the camera settles.
    function fit(duration, arrive) {
      if (!fig) return;
      const pts = [proj(ll(fig[4])), proj(ll(fig[5]))];
      let [x0, x1] = d3.extent(pts, p => p[0]), [y0, y1] = d3.extent(pts, p => p[1]);

      // Grow the box to at least MIN_SPAN_KM across, measured where the pins are.
      const mid = proj.invert([(x0 + x1) / 2, (y0 + y1) / 2]);
      const north = proj([mid[0], Math.min(89, mid[1] + MIN_SPAN_KM / 111)]);
      const minSpan = Math.abs(proj(mid)[1] - north[1]);
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const spanX = Math.max(x1 - x0, minSpan), spanY = Math.max(y1 - y0, minSpan * 0.6);

      // Room to work with: the visible map minus the card, with margins for the labels above and below the pins.
      const cardW = cardOffset();
      const availW = w - cardW - Math.min(180, w * 0.25), availH = h - Math.min(180, h * 0.4);
      const k = Math.max(k0, Math.min(MAX_FIT_ZOOM * k0, availW / spanX, availH / spanY));

      // Centre the pins in the space right of the card. A pair too wide for that space (Bruce Lee:
      // San Francisco to Hong Kong) would push one pin off the right edge, so pull both back on.
      const off = pts.map(p => k * (p[0] - cx)), m = 28; // each pin's x relative to the centre
      let tx = cardW + (w - cardW) / 2;
      tx = Math.min(tx, w - m - Math.max(...off));
      tx = Math.max(tx, m - Math.min(...off));
      const ty = h / 2;
      const target = d3.zoomIdentity.translate(tx, ty).scale(k).translate(-cx, -cy);
      if (duration === undefined) duration = flightMs(target);
      // Hidden tabs don't run animation frames, so a transition would never finish; jump instead.
      if (duration === 0 || instant()) { svg.interrupt().call(zoom.transform, target); if (arrive) arrive(); return; }
      // A drag mid-flight interrupts it; land the pins anyway rather than leave them unshown. d3 runs on
      // animation frames, which a page can stop getting while still "visible" (an occluded window), so a
      // plain timer backs it up: the figure always appears, at worst without the flight.
      let arrived = false;
      const go = () => { if (!arrived) { arrived = true; if (arrive) arrive(); } };
      svg.transition().duration(duration).ease(d3.easeCubicInOut).call(zoom.transform, target).on("end interrupt", go);
      setTimeout(go, duration + 500);
    }

    // Once the camera arrives: the birth pin lands, the life line draws itself along the great
    // circle to the deathplace, and the death pin lands as the line reaches it.
    function land(id) {
      if (id !== flight) return;
      gLabels.classed("hush", false);
      const pins = gPins.selectAll("g.live"), a = ll(fig[4]), b = ll(fig[5]);
      const full = { type: "LineString", coordinates: [a, b] };
      if (instant()) { pins.classed("landed", true); lifeEl.attr("d", path(full)); return; }
      pins.filter(d => d.k === "b").classed("landed", true);
      const km = d3.geoDistance(a, b) * 6371;
      const lineMs = km < 30 ? 0 : Math.round(Math.max(450, Math.min(950, 400 + km / 12)));
      const gi = d3.geoInterpolate(a, b);
      lifeEl.transition("draw").delay(200).duration(lineMs).ease(d3.easeCubicInOut)
        .attrTween("d", () => t => path({ type: "LineString", coordinates: [a, gi(t)] }) || "");
      setTimeout(() => { if (id === flight) pins.filter(d => d.k === "d").classed("landed", true); }, 200 + Math.max(120, lineMs - 80));
      // Same frame-starvation guard as the flight: end on the finished line however the draw went.
      setTimeout(() => { if (id === flight) lifeEl.interrupt("draw").attr("d", path(full)); }, 200 + lineMs + 600);
    }

    svg.call(zoom.transform, d3.zoomIdentity.scale(k0));
    return {
      show(next) {
        fig = next; showPlaces = false;
        const id = ++flight, fade = instant() ? 0 : 240;
        // The last figure fades out where it is while the camera pulls away from it.
        const gone = () => { gPins.selectAll("g.leaving").remove(); gLines.selectAll("path.leaving").remove(); };
        gone();
        gPins.selectAll("g.live").classed("live", false).classed("leaving", true)
          .transition().duration(fade).style("opacity", 0).remove();
        gLines.selectAll("path.life").interrupt("draw").classed("leaving", true)
          .transition().duration(fade).style("opacity", 0).remove();
        setTimeout(gone, fade + 150); // in case the fade never gets the frames to finish
        lifeEl = gLines.append("path").attr("class", "life").attr("d", "");
        // Country names would flicker in and out all the way across; let the flight run without them.
        gLabels.classed("hush", !instant());
        drawPins(); drawLabels(); fit(undefined, () => land(id));
      },
      setPlaces(on) { showPlaces = on; drawPins(); drawLabels(); },
      fit: () => fit(700),
      zoomBy: f => svg.transition().duration(250).call(zoom.scaleBy, f),
    };
  };

  // Natural Earth's long-form names don't fit on a map.
  const SHORT = {
    "United States of America": "United States", "Russian Federation": "Russia", "Dem. Rep. Congo": "DR Congo",
    "Central African Rep.": "C. African Rep.", "Bosnia and Herz.": "Bosnia", "Dominican Rep.": "Dominican Rep.",
    "United Kingdom": "U.K.", "Saudi Arabia": "Saudi Arabia", "S. Sudan": "South Sudan", "Eq. Guinea": "Eq. Guinea",
  };
  function shortName(n) { return SHORT[n] || n; }

  // Great-circle distance between a figure's birth and death, in km.
  CG.lifeDistance = f => d3.geoDistance(ll(f[4]), ll(f[5])) * 6371;
})(window.CG = window.CG || {});
