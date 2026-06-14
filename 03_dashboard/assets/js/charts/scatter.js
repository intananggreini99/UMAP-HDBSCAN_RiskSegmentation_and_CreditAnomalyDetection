/* scatter.js — Proyeksi embedding 2D (UMAP), warna per cluster, noise dibedakan. */
window.renderScatter = function (sel, data, H) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();
  const pts = data.scatter || [];
  if (!pts.length) return;

  const W = el.node().clientWidth || 640, Ht = Math.max(380, Math.round(W * 0.62));
  const m = { t: 14, r: 14, b: 30, l: 34 };
  const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${Ht}`).attr("width", "100%");

  const x = d3.scaleLinear().domain(d3.extent(pts, d => d.x)).nice()
    .range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain(d3.extent(pts, d => d.y)).nice()
    .range([Ht - m.b, m.t]);

  // grid
  svg.append("g").attr("class", "grid")
    .attr("transform", `translate(0,${Ht - m.b})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(-(Ht - m.t - m.b)).tickFormat(""));
  svg.append("g").attr("class", "grid")
    .attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(""));

  // axes
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${Ht - m.b})`)
    .call(d3.axisBottom(x).ticks(6));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6));

  // titik (noise digambar dulu agar di belakang)
  const ordered = pts.slice().sort((a, b) => (a.cluster === -1 ? -1 : 0) - (b.cluster === -1 ? -1 : 0));
  svg.append("g").selectAll("circle").data(ordered).join("circle")
    .attr("cx", d => x(d.x)).attr("cy", d => y(d.y))
    .attr("r", d => d.cluster === -1 ? 2.4 : 3.1)
    .attr("fill", d => d.cluster === -1 ? "none" : H.clusterColor(d.cluster))
    .attr("stroke", d => d.cluster === -1 ? H.clusterColor(-1) : "none")
    .attr("stroke-width", d => d.cluster === -1 ? 1.1 : 0)
    .attr("stroke-dasharray", d => d.cluster === -1 ? "2,1.5" : null)
    .attr("opacity", d => d.cluster === -1 ? 0.85 : 0.78)
    .on("mousemove", (e, d) => H.tt.show(e,
      H.tt.title(d.name, H.clusterColor(d.cluster)) +
      H.tt.row("dim-1", H.fmtNum(d.x, 2)) + H.tt.row("dim-2", H.fmtNum(d.y, 2))))
    .on("mouseout", H.tt.hide);

  // legend
  const legend = d3.select("#scatter-legend"); legend.selectAll("*").remove();
  const seen = []; (data.clusters || []).forEach(c => { if (!seen.find(s => s.cluster === c.cluster)) seen.push(c); });
  legend.selectAll("div").data(seen).join("div").attr("class", "legend-item")
    .html(d => d.cluster === -1
      ? `<span class="legend-swatch ring"></span>${d.name}`
      : `<span class="legend-swatch" style="background:${H.clusterColor(d.cluster)}"></span>${d.name}`);
};
