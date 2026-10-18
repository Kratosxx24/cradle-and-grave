// The world map: draws countries once, then shows one figure's birth and death pins.
(function (CG) {
  const W = 960, H = 500;
  const ll = p => [p[1], p[0]]; // [lat, lon, ...] -> [lon, lat]

  CG.createMap = function (svgEl, { yr }) {
    const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
    const path = d3.geoPath(proj);
    const svg = d3.select(svgEl).attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");

    const gMap = svg.append("g");
    gMap.append("path").datum({ type: "Sphere" }).attr("class", "sphere").attr("d", path);
    gMap.append("path").datum(d3.geoGraticule10()).attr("class", "grat").attr("d", path);
    const countries = topojson.feature(ATLAS, ATLAS.objects.countries);
    gMap.append("g").selectAll("path").data(countries.features).join("path").attr("class", "land").attr("d", path);
    gMap.append("path").datum(topojson.mesh(ATLAS, ATLAS.objects.countries, (a, b) => a !== b)).attr("class", "border").attr("d", path);
    gMap.append("path").datum(topojson.mesh(ATLAS, ATLAS.objects.countries, (a, b) => a === b)).attr("class", "coast").attr("d", path);
    const gLines = gMap.append("g");
    const gPins = svg.append("g");

    let T = d3.zoomIdentity, fig = null, showPlaces = false;
    const zoom = d3.zoom().scaleExtent([1, 60]).translateExtent([[0, 0], [W, H]])
      .on("zoom", e => { T = e.transform; gMap.attr("transform", T); drawPins(); });
    svg.call(zoom);

    function drawPins() {
      if (!fig) return;
      const same = d3.geoDistance(ll(fig[4]), ll(fig[5])) * 6371 < 30;
      const data = [
        { k: "b", c: ll(fig[4]), year: "b. " + yr(fig[2]), place: fig[4][2], dy: same ? -14 : 0 },
        { k: "d", c: ll(fig[5]), year: "d. " + yr(fig[3]), place: fig[5][2], dy: same ? 14 : 0 },
      ];
      const sel = gPins.selectAll("g.pin").data(data, d => d.k).join(enter => {
        const g = enter.append("g").attr("class", d => `pin ${d.k}`);
        g.append("circle").attr("r", 9);
        g.append("text").attr("class", "glyph").text(d => d.k === "b" ? "B" : "D");
        g.append("text").attr("class", "tag").attr("x", 15);
        g.append("text").attr("class", "place").attr("x", 15).attr("y", 16);
        return g;
      });
      const xy = data.map(d => { const [x, y] = T.apply(proj(d.c)); return [x, y + d.dy]; });
      // When the pins crowd each other, hang the birth label off the left so the two don't collide.
      const crowded = Math.hypot(xy[0][0] - xy[1][0], xy[0][1] - xy[1][1]) < 120;
      const leftOf = d => crowded && d.k === "b" && xy[0][0] <= xy[1][0];
      sel.attr("transform", (d, i) => `translate(${xy[i][0]},${xy[i][1]})`);
      sel.selectAll(".tag, .place").attr("x", d => leftOf(d) ? -15 : 15).attr("text-anchor", d => leftOf(d) ? "end" : "start");
      sel.select(".tag").text(d => d.year);
      sel.select(".place").text(d => showPlaces ? d.place : "");
    }

    // Zoom so both pins sit comfortably in view, clear of the floating card on wide screens.
    function fit() {
      if (!fig) return;
      const pts = [proj(ll(fig[4])), proj(ll(fig[5]))];
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const box = svgEl.getBoundingClientRect();
      const cardW = window.innerWidth > 680 && box.width ? 420 / box.width * W : 0;
      const pad = 140;
      // Cap the zoom so there's always some geography around the pins to reason from.
      const k = Math.max(1, Math.min(7, 0.9 / Math.max((x1 - x0 + pad) / (W - cardW), (y1 - y0 + pad) / H)));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      svg.transition().duration(900).call(zoom.transform, d3.zoomIdentity.translate((W + cardW) / 2, H / 2).scale(k).translate(-cx, -cy));
    }

    return {
      show(next) {
        fig = next; showPlaces = false;
        gLines.selectAll("*").remove();
        gLines.append("path").datum({ type: "LineString", coordinates: [ll(fig[4]), ll(fig[5])] }).attr("class", "life").attr("d", path);
        drawPins(); fit();
      },
      setPlaces(on) { showPlaces = on; drawPins(); },
      fit,
      zoomBy: f => svg.transition().duration(250).call(zoom.scaleBy, f),
    };
  };

  // Great-circle distance between a figure's birth and death, in km.
  CG.lifeDistance = f => d3.geoDistance(ll(f[4]), ll(f[5])) * 6371;
})(window.CG = window.CG || {});
