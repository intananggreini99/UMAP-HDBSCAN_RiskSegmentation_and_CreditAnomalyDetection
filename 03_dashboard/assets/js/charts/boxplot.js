/* boxplot.js — Box + violin per cluster for selected variable. */
window.renderBoxplot = function (sel, data, H, variable) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();

  variable = variable || Object.keys(data.boxplot || {})[0];
  const boxes = (data.boxplot && data.boxplot[variable]) || [];
  const violins = (data.violin && data.violin[variable]) || [];
  if (!boxes.length) return;
  const vio = Object.fromEntries(violins.map(v => [v.cluster, v.values]));

  const W = el.node().clientWidth || 680, Ht = 380;
  const m = { t: 16, r: 16, b: 42, l: 54 };
  const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${Ht}`).attr("width", "100%");

  const x = d3.scaleBand().domain(boxes.map(b => b.cluster)).range([m.l, W - m.r]).padding(0.32);
  const allVals = boxes.flatMap(b => [b.min, b.max]).concat(violins.flatMap(v => v.values));
  const y = d3.scaleLinear().domain(d3.extent(allVals)).nice().range([Ht - m.b, m.t]);

  svg.append("g").attr("class", "grid").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-(W - m.l - m.r)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`)
    .call(d3.axisLeft(y).ticks(6));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${Ht - m.b})`)
    .call(d3.axisBottom(x).tickFormat((d, i) => boxes[i].name))
    .selectAll("text")
    .style("font-size", "10.5px")
    .style("fill", d => H.clusterColor(d));

  const kde = (kernel, X) => V => X.map(t => [t, d3.mean(V, v => kernel(t - v))]);
  const epan = b => v => (Math.abs((v /= b)) <= 1 ? (0.75 * (1 - v * v)) / b : 0);
  const yTicks = y.ticks(40);

  boxes.forEach(b => {
    const vals = vio[b.cluster] || [];
    if (vals.length > 4) {
      const span = (d3.max(vals) - d3.min(vals)) || 1;
      const dens = kde(epan(span * 0.18), yTicks)(vals);
      const maxD = d3.max(dens, d => d[1]) || 1;
      const wScale = d3.scaleLinear().domain([0, maxD]).range([0, x.bandwidth() / 2]);
      const area = d3.area().curve(d3.curveCatmullRom)
        .x0(d => -wScale(d[1])).x1(d => wScale(d[1])).y(d => y(d[0]));
      svg.append("g").attr("transform", `translate(${x(b.cluster) + x.bandwidth() / 2},0)`)
        .append("path").datum(dens).attr("d", area)
        .attr("fill", H.clusterColor(b.cluster)).attr("fill-opacity", 0.14)
        .attr("stroke", H.clusterColor(b.cluster)).attr("stroke-opacity", 0.45).attr("stroke-width", 1);
    }
  });

  const bw = Math.min(x.bandwidth(), 46);
  boxes.forEach(b => {
    const cxc = x(b.cluster) + x.bandwidth() / 2, col = H.clusterColor(b.cluster);
    const g = svg.append("g")
      .on("mousemove", e => H.tt.show(e,
        H.tt.title(b.name, col) +
        H.tt.row("median", fmtV(variable, b.median, H)) +
        H.tt.row("Q1 – Q3", `${fmtV(variable, b.q1, H)} – ${fmtV(variable, b.q3, H)}`) +
        H.tt.row("min – max", `${fmtV(variable, b.min, H)} – ${fmtV(variable, b.max, H)}`) +
        H.tt.row(`mean (n=${b.n})`, fmtV(variable, b.mean, H))))
      .on("mouseout", H.tt.hide);

    g.append("line").attr("x1", cxc).attr("x2", cxc).attr("y1", y(b.min)).attr("y2", y(b.max))
      .attr("stroke", col).attr("stroke-width", 1.2).attr("opacity", 0.7);
    g.append("line").attr("x1", cxc - 8).attr("x2", cxc + 8).attr("y1", y(b.min)).attr("y2", y(b.min)).attr("stroke", col);
    g.append("line").attr("x1", cxc - 8).attr("x2", cxc + 8).attr("y1", y(b.max)).attr("y2", y(b.max)).attr("stroke", col);

    g.append("rect").attr("x", cxc - bw / 2).attr("y", y(b.q3)).attr("width", bw)
      .attr("height", Math.max(1, y(b.q1) - y(b.q3))).attr("rx", 4)
      .attr("fill", col).attr("fill-opacity", 0.25).attr("stroke", col).attr("stroke-width", 1.4);

    g.append("line").attr("x1", cxc - bw / 2).attr("x2", cxc + bw / 2).attr("y1", y(b.median)).attr("y2", y(b.median))
      .attr("stroke", col).attr("stroke-width", 2.2);

    g.append("circle").attr("cx", cxc).attr("cy", y(b.mean)).attr("r", 2.6)
      .attr("fill", H.getCss("--ink")).attr("stroke", col);
  });
};

function fmtV(v, x, H) {
  if (v === "approved_amount" || v === "appraised_value") return H.fmtIDR(x);
  if (v === "final_rate") return H.fmtPct(x, 2);
  if (v === "pd_score" || v === "dti_ratio") return H.fmtNum(x, 3);
  if (v === "tenor_months") return H.fmtInt(x);
  return H.fmtInt(x);
}
