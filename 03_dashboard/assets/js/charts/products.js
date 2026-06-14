/* =====================================================================
   products.js — Top 5 Produk · Disbursed Tertinggi
   Divisualisasikan sebagai TABEL GRADIASI WARNA (color-graded table):
   sel "Disbursed" diwarnai mengikuti gradien 
   sehingga prioritas nominal terbaca seketika. Dilengkapi legenda gradien.
   ===================================================================== */
window.renderProducts = function (sel, data, H) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();

  // Mengurutkan berdasarkan disbursed tertinggi ke terendah
  const rows = (data.top5_products || []).slice()
    .sort((a, b) => b.disbursed - a.disbursed).slice(0, 5);
  if (!rows.length) return;

  // Menyesuaikan batas bawah (lo) dan batas atas (hi) menggunakan nilai disbursed
  const lo = d3.min(rows, d => d.disbursed);
  const hi = d3.max(rows, d => d.disbursed);
  const t = v => (hi - lo > 0 ? (v - lo) / (hi - lo) : 0.5);
  const cellColor = v => H.riskGradient(t(v));

  const tbl = el.append("table").attr("class", "grad-table");
  const head = tbl.append("thead").append("tr");
  
  // Header kolom diperbarui (menghilangkan Default Rate dan Default / Pinjaman)
  ["#", "Produk", "Disbursed"].forEach((h, i) => {
    head.append("th").attr("class", i >= 2 ? "num" : null).text(h);
  });

  const tb = tbl.append("tbody");
  rows.forEach((d, i) => {
    // Menghitung warna berdasarkan nilai disbursed
    const col = cellColor(d.disbursed);
    const tr = tb.append("tr")
      .on("mousemove", e => H.tt.show(e,
        H.tt.title(d.product, col) +
        H.tt.row("default rate", H.fmtPct(d.default_rate, 2)) +
        H.tt.row("jumlah pinjaman", H.fmtInt(d.loans)) +
        H.tt.row("jumlah default", H.fmtInt(d.defaults)) +
        H.tt.row("disbursed", H.fmtIDR(d.disbursed))))
      .on("mouseout", H.tt.hide);

    tr.append("td").attr("class", "rank").text(i + 1);
    tr.append("td").attr("class", "name").text(d.product);
    
    // Menerapkan warna gradiasi pada sel Disbursed
    tr.append("td").attr("class", "num grad-cell")
      .style("background", col)
      .style("color", H.inkOn(col))
      .text(H.fmtIDR(d.disbursed));
  });

  const lg = d3.select("#products-legend");
  // Update legenda agar menampilkan format uang (IDR) dan teks yang relevan
  if (!lg.empty()) H.gradLegend(lg, {
    lo, hi,
    c0: H.getCss("--risk-lo"), c1: H.getCss("--risk-hi"),
    fmt: v => H.fmtIDR(v),
    capLo: "disbursed rendah", capHi: "disbursed tinggi"
  });
};