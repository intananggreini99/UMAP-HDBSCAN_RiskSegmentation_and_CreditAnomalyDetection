/* risk.js — Top 3 Risk Segment by ROI: combo bar + line (default rate). */
window.renderRisk = function (sel, data, H) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();

  const rows = (data.top3_risk || []).slice().sort((a, b) => b.roi - a.roi).slice(0, 3);
  if (!rows.length) return;

  const W = el.node().clientWidth || 560, Ht = 360;
  const m = { t: 16, r: 56, b: 50, l: 52 };
  const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${Ht}`).attr("width", "100%");

  const x = d3.scaleBand().domain(rows.map(d => d.label)).range([m.l, W - m.r]).padding(0.42);
  const yL = d3.scaleLinear().domain([0, (d3.max(rows, d => d.roi) || 1) * 1.2]).nice().range([Ht - m.b, m.t]);
  const yR = d3.scaleLinear().domain([0, (d3.max(rows, d => d.default_rate) || 1) * 1.35]).nice().range([Ht - m.b, m.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(yL).ticks(5).tickSize(-(W - m.l - m.r)).tickFormat(""));

  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(yL).ticks(5).tickFormat(d => d + "%"));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${W - m.r},0)`)
    .call(d3.axisRight(yR).ticks(5).tickFormat(d => d + "%"));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${Ht - m.b})`)
    .call(d3.axisBottom(x));

  const grad = svg.append("defs").append("linearGradient")
    .attr("id", "roiGrad").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", 1);
  grad.append("stop").attr("offset", "0%").attr("stop-color", H.getCss("--brand"));
  grad.append("stop").attr("offset", "100%").attr("stop-color", H.getCss("--brand-2"));

  svg.append("g").selectAll("rect").data(rows).join("rect")
    .attr("x", d => x(d.label))
    .attr("y", d => yL(d.roi))
    .attr("width", x.bandwidth())
    .attr("height", d => Ht - m.b - yL(d.roi))
    .attr("rx", 7)
    .attr("fill", "url(#roiGrad)")
    .on("mousemove", (e, d) => H.tt.show(e, tip(d, H)))
    .on("mouseout", H.tt.hide);

  svg.append("g").selectAll("text").data(rows).join("text")
    .attr("x", d => x(d.label) + x.bandwidth() / 2)
    .attr("y", d => yL(d.roi) - 8)
    .attr("text-anchor", "middle")
    .attr("class", "val-label")
    .text(d => H.fmtPct(d.roi, 1));

  const line = d3.line()
    .x(d => x(d.label) + x.bandwidth() / 2)
    .y(d => yR(d.default_rate))
    .curve(d3.curveMonotoneX);

  svg.append("path").datum(rows)
    .attr("fill", "none")
    .attr("stroke", H.getCss("--warning"))
    .attr("stroke-width", 2.4)
    .attr("d", line);

  svg.append("g").selectAll("circle").data(rows).join("circle")
    .attr("cx", d => x(d.label) + x.bandwidth() / 2)
    .attr("cy", d => yR(d.default_rate))
    .attr("r", 4.5)
    .attr("fill", H.getCss("--warning"))
    .attr("stroke", H.getCss("--bg"))
    .attr("stroke-width", 1.5)
    .on("mousemove", (e, d) => H.tt.show(e, tip(d, H)))
    .on("mouseout", H.tt.hide);

  const legend = d3.select("#risk-legend");
  legend.selectAll("*").remove();
  legend.html(
    `<div class="legend-item"><span class="legend-swatch" style="background:${H.getCss("--brand")}"></span>ROI (sumbu kiri)</div>` +
    `<div class="legend-item"><span class="legend-swatch" style="background:${H.getCss("--warning")}"></span>Default rate (sumbu kanan)</div>`
  );

  function tip(d, H) {
    return H.tt.title(d.label) +
      H.tt.row("ROI", H.fmtPct(d.roi, 2)) +
      H.tt.row("default rate", H.fmtPct(d.default_rate, 2)) +
      H.tt.row("avg expected loss", H.fmtIDR(d.expected_loss)) +
      H.tt.row("total profit", H.fmtIDR(d.profit));
  }
};
