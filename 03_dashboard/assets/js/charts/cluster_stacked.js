/* =====================================================================
   cluster_stacked.js — Profil Cluster UMAP + HDBSCAN sebagai SATU visualisasi:
   grafik batang bertumpuk (stacked bar) horizontal.

   Tiap baris = satu cluster. Panjang tiap segmen = nilai ternormalisasi
   (0–1) dari salah satu dari 7 variabel kunci, sehingga seluruh "sidik
   jari" profil cluster terbaca dalam satu batang. Menggantikan heatmap
   + radar yang sebelumnya terpisah.

   *Update: Warna label sumbu Y disesuaikan dengan Risk Gradient 
   (Hijau -> Kuning -> Merah) agar selaras dengan visual Bubble Chart.*
   ===================================================================== */
window.renderClusterStacked = function (sel, data, H) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();

  const vars = data.vars || [];
  // urutkan cluster: 0..n lalu noise (-1) paling bawah
  const clusters = (data.clusters || []).slice()
    .sort((a, b) => [a.cluster === -1, a.cluster] < [b.cluster === -1, b.cluster] ? -1 : 1);
  if (!vars.length || !clusters.length) return;

  // Fungsi pemetaan warna gradiasi risiko berdasarkan nama cluster
  const getRiskColor = (name, clusterId) => {
    if (clusterId === -1 || (name && name.toLowerCase().includes("anomali"))) return "#9e9e9e"; // Abu-abu
    
    const palette = {
      "Prime Stabil": "#1b5e20",         // Hijau Pekat (Paling Aman)
      "Hidden Prime": "#4caf50",         // Hijau
      "Berkembang": "#9ccc65",           // Hijau Muda
      "Standar": "#ffca28",              // Kuning/Amber (Menengah)
      "Berisiko Tinggi": "#ff9800",      // Oranye
      "Risiko Sangat Tinggi": "#e53935", // Merah
      "Ekstrem": "#b71c1c"               // Merah Pekat (Sangat Berisiko)
    };
    return palette[name] || H.getCss("--ink"); // Fallback
  };

  const labels = {
    credit_score: "Credit Score",
    dti_ratio: "DTI Ratio",
    pd_score: "PD Score",
    approved_amount: "Approved Amount",
    final_rate: "Final Rate",
    appraised_value: "Appraised Value",
    tenor_months: "Tenor Months"
  };

  // palet 7 variabel — konsisten dengan tema korporat dashboard
  const palette = {
    credit_score:    H.getCss("--success"),
    dti_ratio:       H.getCss("--warning"),
    pd_score:        H.getCss("--danger"),
    approved_amount: H.getCss("--brand"),
    final_rate:      H.getCss("--brand-2"),
    appraised_value: "#8b9fb6",
    tenor_months:    "#c6d0e0"
  };
  const colorFor = v => palette[v] || H.getCss("--brand");

  const norm = (v, c) =>
    (data.profile_norm?.[v] && data.profile_norm[v][c] != null) ? data.profile_norm[v][c] : 0;

  // total tumpukan per cluster (untuk skala-x); maksimum teoretis = jumlah variabel
  const stackTotal = c => vars.reduce((s, v) => s + norm(v, c), 0);
  const maxTotal = d3.max(clusters, c => stackTotal(c.cluster)) || vars.length;

  const W = el.node().clientWidth || 1080;
  const rowH = 46;
  const m = { t: 30, r: 18, b: 28, l: 156 };
  const Ht = m.t + m.b + clusters.length * rowH;
  const svg = el.append("svg").attr("viewBox", `0 0 ${W} ${Ht}`).attr("width", "100%");

  const x = d3.scaleLinear().domain([0, maxTotal * 1.02]).range([m.l, W - m.r]);
  const y = d3.scaleBand().domain(clusters.map(c => c.cluster)).range([m.t, Ht - m.b]).padding(0.34);

  // header keterangan sumbu-x
  svg.append("text")
    .attr("x", m.l).attr("y", m.t - 12)
    .attr("class", "axis-title")
    .style("fill", H.getCss("--ink-faint"));

  // gridline vertikal
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${Ht - m.b})`)
    .call(d3.axisBottom(x).ticks(7).tickSize(-(Ht - m.t - m.b)).tickFormat(""));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${Ht - m.b})`)
    .call(d3.axisBottom(x).ticks(7).tickFormat(d3.format(".0f")));

  // satu grup per cluster
  const rows = svg.append("g").selectAll("g").data(clusters).join("g");

  // label cluster (kiri) — diberi warna sesuai Risk Gradient (Hijau -> Merah)
  rows.append("text")
    .attr("x", m.l - 12)
    .attr("y", c => y(c.cluster) + y.bandwidth() / 2 - 2)
    .attr("text-anchor", "end")
    .style("font-size", "12.5px")
    .style("font-weight", 700)
    .style("fill", c => getRiskColor(c.name, c.cluster))
    .text(c => c.name);

  // sub-label: ukuran cluster
  rows.append("text")
    .attr("x", m.l - 12)
    .attr("y", c => y(c.cluster) + y.bandwidth() / 2 + 13)
    .attr("text-anchor", "end")
    .style("font-family", "var(--font-mono)")
    .style("font-size", "10px")
    .style("fill", H.getCss("--ink-faint"))
    .text(c => `n=${H.fmtInt(c.size)} · ${H.fmtPct(c.share, 1)}`);

  // segmen bertumpuk
  rows.each(function (c) {
    const g = d3.select(this);
    let acc = 0;
    vars.forEach(v => {
      const val = norm(v, c.cluster);
      const x0 = acc, x1 = acc + val;
      acc = x1;
      const raw = c.profile?.[v] ?? 0;
      const segW = Math.max(0, x(x1) - x(x0));
      if (segW <= 0) return;

      g.append("rect")
        .attr("x", x(x0))
        .attr("y", y(c.cluster))
        .attr("width", segW)
        .attr("height", y.bandwidth())
        .attr("fill", colorFor(v))
        .attr("stroke", H.getCss("--bg"))
        .attr("stroke-width", 1)
        .on("mousemove", e => H.tt.show(e,
          // Judul tooltip juga menggunakan warna Risk Gradient agar seragam
          H.tt.title(c.name, getRiskColor(c.name, c.cluster)) +
          H.tt.row(labels[v] || v, fmtRaw(v, raw, H)) +
          H.tt.row("skor (0–1)", H.fmtNum(val, 2)) +
          H.tt.row("default rate", H.fmtPct(c.default_rate, 1)) +
          H.tt.row("avg ROI", H.fmtPct(c.avg_roi, 1))))
        .on("mouseout", H.tt.hide);

      // tampilkan label variabel pada segmen yang cukup lebar
      if (segW > 34) {
        g.append("text")
          .attr("x", x(x0) + segW / 2)
          .attr("y", y(c.cluster) + y.bandwidth() / 2 + 3.5)
          .attr("text-anchor", "middle")
          .style("pointer-events", "none")
          .style("font-family", "var(--font-mono)")
          .style("font-size", "10px")
          .style("font-weight", 700)
          .style("fill", H.inkOn(colorFor(v)))
          .text(shortRaw(v, raw));
      }
    });
  });

  // legenda 7 variabel
  const legend = d3.select("#cluster-stacked-legend");
  if (!legend.empty()) {
    legend.selectAll("*").remove();
    legend.selectAll("div").data(vars).join("div").attr("class", "legend-item")
      .html(v => `<span class="legend-swatch" style="background:${colorFor(v)}"></span>${labels[v] || v}`);
  }
};

/* nilai ringkas pada segmen */
function shortRaw(v, x) {
  if (v === "approved_amount" || v === "appraised_value") return (Number(x) / 1e6).toFixed(0) + "jt";
  if (v === "tenor_months") return Math.round(Number(x));
  if (v === "pd_score" || v === "dti_ratio" || v === "final_rate") return Number(x).toFixed(1);
  return Math.round(Number(x));
}
/* nilai lengkap untuk tooltip */
function fmtRaw(v, x, H) {
  if (v === "approved_amount" || v === "appraised_value") return H.fmtIDR(x);
  if (v === "final_rate") return H.fmtPct(x, 2);
  if (v === "pd_score" || v === "dti_ratio") return H.fmtNum(x, 3);
  return H.fmtInt(x);
}