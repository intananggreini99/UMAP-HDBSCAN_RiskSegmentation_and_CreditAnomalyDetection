/* =====================================================================
   bubble.js — Bubble chart UKURAN / FREKUENSI cluster (hasil UMAP+HDBSCAN)

   Aturan visual (diperbaiki):
   - Warna bubble dan label diurutkan berdasarkan Risk Gradient 
     (Hijau Pekat -> Kuning -> Merah Pekat).
   - Skala luasan dijaga tetap proporsional (area ~ n).
   - Tata letak bottom-aligned.
   ===================================================================== */
window.renderBubble = function (sel, data, H) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();

  // Fungsi pemetaan warna gradiasi risiko berdasarkan nama cluster
  const getRiskColor = (name, clusterId) => {
    if (clusterId === -1 || name.toLowerCase().includes("anomali")) return "#9e9e9e"; // Abu-abu
    
    const palette = {
      "Prime Stabil": "#1b5e20",         // Hijau Pekat (Paling Aman)
      "Hidden Prime": "#4caf50",         // Hijau
      "Berkembang": "#9ccc65",           // Hijau Muda
      "Standar": "#ffca28",              // Kuning/Amber (Menengah)
      "Berisiko Tinggi": "#ff9800",      // Oranye
      "Risiko Sangat Tinggi": "#e53935", // Merah
      "Ekstrem": "#b71c1c"               // Merah Pekat (Sangat Berisiko)
    };
    return palette[name] || H.clusterColor(clusterId);
  };

  let clusters = (data.clusters || [])
    .filter(c => (c.size || 0) > 0)
    .map(c => ({
      cluster: c.cluster,
      name: c.name || ("Cluster " + c.cluster),
      size: +c.size || 0,
      share: +c.share || 0,
      default_rate: +c.default_rate || 0,
      avg_roi: +c.avg_roi || 0
    }));
  if (!clusters.length) return;

  // URUT dari n terbesar -> terkecil supaya ukuran gampang dibandingkan
  clusters.sort((a, b) => b.size - a.size);

  const W  = el.node().clientWidth || 480;

  const N        = clusters.length;
  const maxSize  = d3.max(clusters, d => d.size) || 1;
  const gap      = 12;          
  const marginX  = 12;
  const topPad   = 16;          
  const labelPad = 40;          

  const sqrtFracSum = d3.sum(clusters, d => Math.sqrt(d.size / maxSize));
  const RmaxByWidth = (W - 2 * marginX - gap * (N - 1)) / (2 * sqrtFracSum || 1);
  const Rmax = Math.max(8, Math.min(RmaxByWidth, W * 0.30));

  const baseline = topPad + 2 * Rmax;   
  const Ht = Math.ceil(baseline + labelPad); 

  const svg = el.append("svg")
    .attr("viewBox", `0 0 ${W} ${Ht}`)
    .attr("width", "100%")
    .attr("role", "img");
  const g = svg.append("g");

  const rScale = d3.scaleSqrt().domain([0, maxSize]).range([0, Rmax]);

  let cursor = marginX;
  clusters.forEach(c => {
    c._r = Math.max(2, rScale(c.size));
    c._cx = cursor + c._r;
    c._cy = baseline - c._r;
    cursor += 2 * c._r + gap;
  });
  const used  = cursor - gap;
  const shift = Math.max(0, (W - used) / 2);
  clusters.forEach(c => { c._cx += shift; });

  g.append("line")
    .attr("x1", marginX).attr("x2", W - marginX)
    .attr("y1", baseline + 0.5).attr("y2", baseline + 0.5)
    .attr("stroke", "rgba(145,160,182,.28)")
    .attr("stroke-width", 1);

  const node = g.selectAll("g.bub").data(clusters).join("g")
    .attr("class", "bub")
    .attr("transform", d => `translate(${d._cx},${d._cy})`)
    .style("cursor", "default")
    .on("mousemove", (e, d) => H.tt.show(e,
      H.tt.title(d.name, getRiskColor(d.name, d.cluster)) +
      H.tt.row("jumlah pinjaman", H.fmtInt(d.size)) +
      H.tt.row("porsi portofolio", H.fmtPct(d.share, 1)) +
      H.tt.row("default rate", H.fmtPct(d.default_rate, 1)) +
      H.tt.row("avg ROI", H.fmtPct(d.avg_roi, 1))))
    .on("mouseout", H.tt.hide);

  // Pewarnaan Bubble menggunakan gradiasi risiko
  node.append("circle")
    .attr("r", d => d._r)
    .attr("fill", d => getRiskColor(d.name, d.cluster))
    .attr("fill-opacity", d => d.cluster === -1 ? 0.22 : 0.9)
    .attr("stroke", d => getRiskColor(d.name, d.cluster))
    .attr("stroke-width", d => d.cluster === -1 ? 1.4 : 1)
    .attr("stroke-dasharray", d => d.cluster === -1 ? "3,2" : null);

  // Pewarnaan Nama Cluster DI DALAM gelembung (putih atau hitam menyesuaikan kontras background)
  node.filter(d => d._r >= 24).append("text")
    .attr("text-anchor", "middle")
    .attr("y", d => -d._r * 0.06)
    .style("pointer-events", "none")
    .style("font-family", "var(--font-ui)")
    .style("font-weight", 700)
    .style("font-size", d => Math.max(10, Math.min(14, d._r / 3.6)) + "px")
    .style("fill", d => d.cluster === -1 ? H.getCss("--ink-soft") : H.inkOn(getRiskColor(d.name, d.cluster)))
    .text(d => d.name);

  node.append("text")
    .attr("text-anchor", "middle")
    .attr("y", d => d._r + 15)
    .style("pointer-events", "none")
    .style("font-family", "var(--font-mono)")
    .style("font-weight", 700)
    .style("font-size", "12px")
    .style("fill", H.getCss("--ink"))
    .text(d => H.fmtInt(d.size));

  node.append("text")
    .attr("text-anchor", "middle")
    .attr("y", d => d._r + 28)
    .style("pointer-events", "none")
    .style("font-family", "var(--font-ui)")
    .style("font-size", "10px")
    .style("fill", H.getCss("--ink-dim"))
    .text(d => H.fmtPct(d.share, d.share < 10 ? 1 : 0));

  // Legenda disesuaikan dengan warna risiko
  const legend = d3.select("#bubble-legend");
  if (!legend.empty()) {
    legend.selectAll("*").remove();
    legend.selectAll("div").data(clusters).join("div").attr("class", "legend-item")
      .html(d => d.cluster === -1
        ? `<span class="legend-swatch ring" style="border-color:#9e9e9e"></span>${d.name}`
        : `<span class="legend-swatch" style="background:${getRiskColor(d.name, d.cluster)}"></span>${d.name}`);
  }
};