/* composition.js — Stacked composition by cluster for selected dimension. */
window.renderComposition = function (sel, data, H, dim) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();

  dim = dim || Object.keys(data.composition || {})[0];
  const block = (data.composition && data.composition[dim]);
  if (!block) return;

  const cats = block.categories || [];
  const rows = block.rows || [];
  const W = el.node().clientWidth || 900, Ht = 360;
  const m = { t: 16, r: 16, b: 54, l: 54 };
  const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${Ht}`).attr("width", "100%");

  const x = d3.scaleBand().domain(rows.map(r => r.cluster)).range([m.l, W - m.r]).padding(0.34);
  const y = d3.scaleLinear().domain([0, 1]).range([Ht - m.b, m.t]);
  const palette = [H.getCss("--brand"), H.getCss("--success"), H.getCss("--warning"), H.getCss("--danger"),
    H.getCss("--brand-2"), "#8b9fb6", "#c6d0e0", "#f7d37a"];
  const color = d3.scaleOrdinal().domain(cats).range(palette);

  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".0%")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${Ht - m.b})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => rows[i].name))
    .selectAll("text")
    .style("font-size", "10.5px")
    .style("fill", d => H.clusterColor(d))
    .attr("transform", "translate(0,4)");

  const series = rows.map(r => {
    const total = d3.sum(cats, c => r.counts[c] || 0) || 1;
    let acc = 0;
    const segs = cats.map(c => {
      const val = r.counts[c] || 0;
      const p = val / total;
      const y0 = acc;
      acc += p;
      return { cat: c, val, p, y0, y1: acc };
    });
    return { cluster: r.cluster, name: r.name, total, segs };
  });

  svg.append("g").selectAll("g").data(series).join("g")
    .attr("transform", d => `translate(${x(d.cluster)},0)`)
    .each(function (d) {
      d3.select(this).selectAll("rect").data(d.segs).join("rect")
        .attr("x", 0)
        .attr("width", x.bandwidth())
        .attr("y", s => y(s.y1))
        .attr("height", s => Math.max(0, y(s.y0) - y(s.y1)))
        .attr("fill", s => color(s.cat))
        .attr("stroke", H.getCss("--bg"))
        .attr("stroke-width", 0.8)
        .on("mousemove", (e, s) => H.tt.show(e,
          H.tt.title(d.name, H.clusterColor(d.cluster)) +
          H.tt.row(s.cat, `${s.val} (${H.fmtPct(s.p * 100, 1)})`)))
        .on("mouseout", H.tt.hide);
    });

  const legend = d3.select("#composition-legend");
  legend.selectAll("*").remove();
  legend.selectAll("div").data(cats).join("div").attr("class", "legend-item")
    .html(c => `<span class="legend-swatch" style="background:${color(c)}"></span>${c}`);
};
