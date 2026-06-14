/* =====================================================================
   customer.js — Top 3 Customer Segment · Profitabilitas Tertinggi
   Divisualisasikan sebagai TABEL GRADIASI WARNA (color-graded table):
   sel "Total Profit" diwarnai mengikuti gradien profit (hijau muda → hijau tua)
   berdasarkan PERINGKAT agar urutan nilai segmen terbaca seketika.
   Dilengkapi legenda gradien.
   ===================================================================== */
window.renderCustomer = function (sel, data, H) {
  const d3 = H.d3, el = d3.select(sel);
  el.selectAll("*").remove();

  const rows = (data.top3_customer || []).slice()
    .sort((a, b) => b.profit - a.profit).slice(0, 3);
  if (!rows.length) return;

  const lo = d3.min(rows, d => d.profit);
  const hi = d3.max(rows, d => d.profit);
  
  // PERUBAHAN UTAMA: Menghitung t berdasarkan urutan peringkat (i)
  // i=0 (Peringkat 1) -> 1 (Warna c1 / Paling Pekat)
  // i=1 (Peringkat 2) -> 0.5 (Warna Campuran / Medium)
  // i=2 (Peringkat 3) -> 0 (Warna c0 / Paling Terang)
  const t = i => (rows.length > 1 ? 1 - (i / (rows.length - 1)) : 1);
  
  // Menggunakan kode Hex baru yang lebih kontras
  const c0 = "#bbf7d0"; // Hijau terang (untuk Prime)
  const c1 = "#15803d"; // Hijau tua pekat (untuk Sub-Prime)
  const grad = d3.interpolateRgb(c0, c1);
  
  // cellColor sekarang menerima nilai indeks (i) alih-alih nilai profit
  const cellColor = i => grad(t(i));

  const tbl = el.append("table").attr("class", "grad-table");
  const head = tbl.append("thead").append("tr");
  
  // Header disesuaikan
  ["#", "Customer Segment", "Total Profit"].forEach((h, i) => {
    head.append("th").attr("class", i >= 2 ? "num" : null).text(h);
  });

  const tb = tbl.append("tbody");
  rows.forEach((d, i) => {
    // Memasukkan indeks 'i' ke dalam cellColor
    const col = cellColor(i); 
    const tr = tb.append("tr")
      .on("mousemove", e => H.tt.show(e,
        H.tt.title(d.segment, col) +
        H.tt.row("total profit", H.fmtIDR(d.profit)) +
        H.tt.row("avg ROI", H.fmtPct(d.roi, 2)) +
        H.tt.row("jumlah pinjaman", H.fmtInt(d.loans)) +
        H.tt.row("disbursed", H.fmtIDR(d.disbursed))))
      .on("mouseout", H.tt.hide);

    tr.append("td").attr("class", "rank").text(i + 1);
    tr.append("td").attr("class", "name").text(d.segment);
    tr.append("td").attr("class", "num grad-cell")
      .style("background", col)
      .style("color", H.inkOn(col)) // H.inkOn otomatis menjaga teks kontras
      .text(H.fmtIDR(d.profit));
  });

  const lg = d3.select("#customer-legend");
  if (!lg.empty()) H.gradLegend(lg, {
    lo, hi,
    // Sinkronisasi otomatis legenda dengan variabel warna tabel
    c0: c0, c1: c1, 
    fmt: v => H.fmtIDR(v),
    capLo: "profit lebih kecil", capHi: "profit lebih besar"
  });
};