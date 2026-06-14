<?php
/**
 * index.php — Executive dashboard untuk Bank Credit Lending.
 *
 * Catatan perubahan versi ini:
 *  1) Seluruh CSS sekarang DI-EMBED di file ini (tag <style> di <head>),
 *     tidak lagi me-load file eksternal assets/css/custom.css.
 *  2) Sistem tata letak diubah dari CSS GRID -> CSS FLEXBOX
 *     (.kpi-row, .grid-12 dengan kelas .col-12/.col-7/.col-6/.col-5,
 *      serta .cluster-grid). Tujuannya: kartu/elemen mudah dihapus atau
 *      ditata ulang tanpa menyentuh JS / logic data.
 *
 *  Tidak ada perubahan pada API (api/data.php, api/db.php),
 *  loader data (assets/js/main.js — kecuali satu inline-style grid yang
 *  diselaraskan ke flex), atau seluruh chart di assets/js/charts/.
 */
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bank Credit Risk Dashboard</title>

<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">

<style>
/* =====================================================================
   Bank Credit Risk Dashboard — embedded styles
   (Sebelumnya: assets/css/custom.css. Sekarang di-embed di index.php.)
   Layout: CSS FLEXBOX (sebelumnya CSS Grid).
   ===================================================================== */

:root{
  --bg:#07111f;
  --bg-soft:#0b1729;
  --panel:rgba(13,22,38,.78);
  --panel-2:rgba(15,26,44,.92);
  --panel-border:rgba(148,163,184,.12);
  --panel-border-strong:rgba(148,163,184,.20);

  --ink:#eef4fb;
  --ink-soft:#c8d2e3;
  --ink-dim:#91a0b6;
  --ink-faint:#607086;

  --brand:#4f86ff;
  --brand-2:#66d9ff;
  --success:#31c48d;
  --warning:#f3b85b;
  --danger:#ef5f6c;

  --c0:#31c48d;
  --c1:#4f86ff;
  --c2:#82b1ff;
  --c3:#f3b85b;
  --c4:#ef5f6c;
  --cn:#7c8aa3;

  --risk-lo:#f3b85b;
  --risk-hi:#ef5f6c;

  --radius:18px;
  --radius-sm:12px;
  --shadow:0 20px 50px -26px rgba(0,0,0,.86), 0 1px 0 rgba(255,255,255,.03) inset;
  --maxw:1380px;

  --font-display:"Inter",system-ui,-apple-system,sans-serif;
  --font-ui:"Inter",system-ui,-apple-system,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,monospace;

  /* dipakai oleh perhitungan flex agar gap antar kartu konsisten */
  --gap-12:18px;
  --gap-kpi:16px;
}

*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg);
  color:var(--ink);
  font-family:var(--font-ui);
  line-height:1.55;
  -webkit-font-smoothing:antialiased;
  overflow-x:hidden;
}

.bg-mesh{
  position:fixed; inset:0; z-index:-2; pointer-events:none;
  background:
    radial-gradient(55% 45% at 10% 0%, rgba(79,134,255,.14), transparent 55%),
    radial-gradient(50% 40% at 90% 8%, rgba(49,196,141,.10), transparent 58%),
    radial-gradient(65% 60% at 50% 105%, rgba(102,217,255,.06), transparent 58%),
    linear-gradient(180deg,#07111f 0%, #081423 58%, #07111f 100%);
}
.bg-grain{
  position:fixed; inset:0; z-index:-1; pointer-events:none; opacity:.04;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

.wrap{max-width:var(--maxw); margin:0 auto; padding:34px 24px 56px}

.site-header{
  display:flex; justify-content:space-between; align-items:flex-end; gap:28px;
  padding-bottom:24px; margin-bottom:28px;
  border-bottom:1px solid var(--panel-border);
}
.kicker{
  font-size:11.5px; letter-spacing:.24em; text-transform:uppercase;
  color:var(--ink-dim); font-weight:600; margin-bottom:12px;
}
.title{
  font-family:var(--font-display); font-weight:800; font-size:clamp(30px,4.8vw,48px);
  line-height:1; letter-spacing:-.03em; margin:0;
}
.subtitle{
  margin:14px 0 0; color:var(--ink-soft); font-size:15px; max-width:68ch
}
.subtitle .mono{font-family:var(--font-mono); font-size:13.5px; color:var(--brand-2)}

.header-right{display:flex; flex-direction:column; align-items:flex-end; gap:10px; flex-shrink:0}
.badge{
  font-size:12px; font-weight:600; padding:8px 14px; border-radius:999px;
  border:1px solid var(--panel-border-strong); background:var(--panel);
  display:inline-flex; align-items:center; gap:8px; white-space:nowrap;
}
.badge::before{content:""; width:7px; height:7px; border-radius:50%; background:var(--ink-faint)}
.badge-live{color:var(--success); border-color:rgba(49,196,141,.32)}
.badge-live::before{background:var(--success); box-shadow:0 0 0 4px rgba(49,196,141,.12)}
.badge-sample{color:var(--warning); border-color:rgba(243,184,91,.32)}
.badge-sample::before{background:var(--warning); box-shadow:0 0 0 4px rgba(243,184,91,.12)}
.badge-muted{color:var(--ink-dim)}

.sil-chip{
  display:flex; align-items:baseline; gap:9px; padding:10px 16px;
  border-radius:var(--radius-sm); background:var(--panel-2);
  border:1px solid var(--panel-border-strong);
}
.sil-label{font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-dim)}
.sil-num{font-family:var(--font-mono); font-weight:700; font-size:21px; color:var(--brand-2)}

/* =====================================================================
   KPI ROW — sebelumnya CSS GRID (auto-fit minmax 230px) -> FLEXBOX
   - flex-wrap: kartu otomatis turun ke baris berikut bila tidak muat.
   - flex: 1 1 230px -> tiap kartu minimal 230px, sisanya saling berbagi.
   - Bila salah satu kartu dihapus, sisanya melebar mengisi ruang.
   ===================================================================== */
.kpi-row{
  display:flex; flex-wrap:wrap; gap:var(--gap-kpi); margin-bottom:42px;
}
.kpi{
  flex:1 1 230px;
  position:relative; padding:20px 20px 18px; border-radius:var(--radius);
  background:linear-gradient(180deg,var(--panel),var(--panel-2));
  border:1px solid var(--panel-border); box-shadow:var(--shadow);
  overflow:hidden;
}
.kpi::before{
  content:""; position:absolute; left:0; top:0; bottom:0; width:3px;
  background:var(--accent,var(--brand));
}
.kpi-label{
  font-size:12px; letter-spacing:.06em; color:var(--ink-dim);
  margin-bottom:12px; font-weight:600
}
.kpi-value{
  font-family:var(--font-mono); font-weight:700; font-size:30px; line-height:1;
  color:var(--ink); letter-spacing:-.02em
}
.kpi-sub{margin-top:10px; font-size:12.5px; color:var(--ink-faint)}
.kpi-sub strong{color:var(--ink-soft); font-weight:600}

.block{margin-bottom:52px}
.block-head{margin-bottom:22px; max-width:78ch}
.block-kicker{
  font-family:var(--font-mono); font-size:12px; letter-spacing:.1em;
  color:var(--brand-2); text-transform:uppercase;
}
.block-title{
  font-family:var(--font-display); font-weight:800; font-size:clamp(23px,2.7vw,32px);
  margin:9px 0 8px; letter-spacing:-.02em; color:var(--ink);
}
.block-desc{margin:0; color:var(--ink-dim); font-size:14.5px}
.block-desc em{color:var(--brand-2); font-style:normal; font-weight:600}

/* =====================================================================
   GRID-12 — sebelumnya CSS GRID 12 kolom -> FLEXBOX

   Map kolom asli ke flex-basis berbasis persentase:
     col-12  ->  100%
     col-7   ->  7/12  = 58.3333%
     col-6   ->  6/12  = 50%
     col-5   ->  5/12  = 41.6667%

   Karena memakai `gap`, flex-basis dikurangi proporsi gap supaya kartu
   tetap muat satu baris. Properti `flex-grow:1` + `flex-wrap` membuat
   kartu yang tersisa otomatis melebar bila kartu lain dihapus dari HTML
   (tata letak fleksibel, tanpa perlu mengubah JS / logic data).
   ===================================================================== */
.grid-12{display:flex; flex-wrap:wrap; gap:var(--gap-12)}
.col-12{flex:1 1 100%}
.col-7 {flex:1 1 calc(58.3333% - (var(--gap-12) * 5 / 12)); min-width:320px}
.col-6 {flex:1 1 calc(50%      - (var(--gap-12) / 2));      min-width:320px}
.col-5 {flex:1 1 calc(41.6667% - (var(--gap-12) * 7 / 12)); min-width:320px}

.card{
  background:linear-gradient(180deg,var(--panel),var(--panel-2));
  border:1px solid var(--panel-border); border-radius:var(--radius);
  padding:20px 20px 18px; box-shadow:var(--shadow);
  display:flex; flex-direction:column; min-width:0;
}
.card-head{
  display:flex; justify-content:space-between; align-items:flex-start;
  gap:14px; margin-bottom:14px; flex-wrap:wrap;
}
.card-head h3{
  margin:0; font-size:16px; font-weight:700; color:var(--ink); letter-spacing:-.01em;
}
.card-sub{font-size:12px; color:var(--ink-faint); display:block; margin-top:4px}
.card-head > div:first-child, .card-head > h3{min-width:0}
.chart{width:100%; position:relative}
.chart svg{display:block; width:100%; height:auto; overflow:visible}

.seg-control{
  display:inline-flex; gap:4px; padding:4px; border-radius:10px;
  background:rgba(7,12,22,.6); border:1px solid var(--panel-border)
}
.seg-btn{
  font-family:var(--font-ui); font-size:12px; font-weight:600; color:var(--ink-dim);
  background:transparent; border:0; padding:6px 12px; border-radius:7px; cursor:pointer;
  transition:all .16s ease; white-space:nowrap;
}
.seg-btn:hover{color:var(--ink-soft)}
.seg-btn.active{background:var(--panel-border-strong); color:var(--ink)}

.legend{display:flex; flex-wrap:wrap; gap:7px 16px; margin-top:14px; align-items:center}
.legend-item{display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--ink-soft)}
.legend-swatch{width:11px; height:11px; border-radius:3px; flex-shrink:0}
.legend-swatch.ring{border-radius:50%; background:transparent; border:2px dashed var(--cn)}

.axis path,.axis line{stroke:rgba(148,163,184,.18)}
.axis text{fill:var(--ink-dim); font-family:var(--font-mono); font-size:10.5px}
.grid line{stroke:rgba(148,163,184,.09)}
.grid path{stroke:none}
.axis-title{fill:var(--ink-faint); font-size:11px; font-family:var(--font-ui)}
.bar-label{fill:var(--ink-soft); font-family:var(--font-mono); font-size:11px}
.val-label{fill:var(--ink); font-family:var(--font-mono); font-size:11px; font-weight:700}
.cell-text{font-family:var(--font-mono); font-size:10.5px; font-weight:700}

.tooltip{
  position:fixed; z-index:50; pointer-events:none; opacity:0;
  transform:translateY(4px); transition:opacity .12s ease;
  background:rgba(8,14,24,.98); border:1px solid var(--panel-border-strong);
  border-radius:11px; padding:11px 13px; box-shadow:0 14px 36px -14px rgba(0,0,0,.9);
  font-size:12.5px; color:var(--ink-soft); max-width:290px; backdrop-filter:blur(8px);
}
.tooltip.show{opacity:1; transform:translateY(0)}
.tt-title{font-weight:700; color:var(--ink); margin-bottom:6px; font-size:13px; display:flex; align-items:center; gap:7px}
.tt-dot{width:9px; height:9px; border-radius:3px; flex-shrink:0}
.tt-row{display:flex; justify-content:space-between; gap:18px; margin-top:3px}
.tt-row span:first-child{color:var(--ink-dim)}
.tt-row span:last-child{font-family:var(--font-mono); color:var(--ink); font-weight:500}

.site-footer{
  display:flex; justify-content:space-between; align-items:center; gap:16px;
  margin-top:34px; padding-top:22px; border-top:1px solid var(--panel-border);
  font-size:12.5px; color:var(--ink-dim); flex-wrap:wrap;
}
.site-footer .mono{font-family:var(--font-mono); color:var(--brand-2)}
.site-footer .dim{color:var(--ink-faint)}

.foot-note{margin:16px 0 0; font-size:11.5px; color:var(--ink-faint); line-height:1.6}

/* Breakpoint sempit: paksa kartu kol-6/7/5 jadi full-width supaya
   tetap nyaman di layar < 1080px. (min-width pada flex-basis sudah
   menangani sebagian besar kasus; rule ini sebagai jaring pengaman). */
@media(max-width:1080px){
  .col-6, .col-7, .col-5{flex:1 1 100%}
}


/* ---- Tabel gradiasi warna (Top 5 produk & Top 3 customer) ---- */
.table-chart{overflow-x:auto}
.grad-table{
  width:100%; border-collapse:separate; border-spacing:0;
  font-size:13px; color:var(--ink-soft);
}
.grad-table thead th{
  text-align:left; font-size:11px; font-weight:600; letter-spacing:.05em;
  text-transform:uppercase; color:var(--ink-dim);
  padding:0 12px 10px; border-bottom:1px solid var(--panel-border-strong);
  white-space:nowrap;
}
.grad-table thead th.num{text-align:right}
.grad-table tbody td{
  padding:11px 12px; border-bottom:1px solid var(--panel-border);
  vertical-align:middle;
}
.grad-table tbody tr:last-child td{border-bottom:0}
.grad-table tbody tr{transition:background .14s ease}
.grad-table tbody tr:hover{background:rgba(148,163,184,.06)}
.grad-table td.num{text-align:right; white-space:nowrap}
.grad-table td.mono{font-family:var(--font-mono); font-size:12px}
.grad-table td.dim{color:var(--ink-dim)}
.grad-table td.rank{
  font-family:var(--font-mono); font-size:12px; font-weight:700;
  color:var(--ink-faint); width:34px;
}
.grad-table td.name{color:var(--ink); font-weight:600}
.grad-table td.grad-cell{
  text-align:center; font-family:var(--font-mono); font-weight:700;
  font-size:13px; border-radius:8px; letter-spacing:-.01em;
  box-shadow:0 1px 0 rgba(0,0,0,.18) inset;
}

/* ---- Legenda gradiasi warna ---- */
.legend-grad{margin-top:14px}
.grad-legend{display:flex; align-items:center; gap:10px; flex-wrap:wrap}
.grad-legend-bar{
  width:150px; height:11px; border-radius:6px; flex-shrink:0;
  border:1px solid var(--panel-border-strong);
}
.grad-legend-cap{font-size:11.5px; color:var(--ink-faint)}
.grad-legend-val{font-family:var(--font-mono); font-size:11.5px; color:var(--ink-soft); font-weight:600}

/* =====================================================================
   CLUSTER GRID — panel berdampingan (sebelumnya CSS GRID 1.2fr 0.9fr)
   Dikonversi ke flexbox dengan proporsi yang setara.
   Tidak dipakai di markup default index.php saat ini, tapi dipertahankan
   agar bila Anda menambah panel cluster bersisian, tinggal pakai
   class ini tanpa perlu menulis ulang CSS.
   ===================================================================== */
.cluster-grid{display:flex; flex-wrap:wrap; gap:16px}
.cluster-grid > *{flex:1 1 320px}
.cluster-grid > *:first-child{flex-grow:1.2}   /* setara 1.2fr asli */
.cluster-grid > *:nth-child(2){flex-grow:0.9}  /* setara 0.9fr asli */
.cluster-panel{min-height:360px}
</style>
</head>
<body class="antialiased">

<div class="bg-mesh" aria-hidden="true"></div>
<div class="bg-grain" aria-hidden="true"></div>

<div class="wrap">
  <header class="site-header">
    <div class="header-left">
      <h1 class="title justify-center-safe text-yellow-300">Bank Credit <span class="text-red-600">Risk </span>Dashboard</h1>
      <p class="subtitle">Segmentasi profil risiko berlapis &amp; deteksi anomali pada
        <span class="text-yellow-300">data warehouse bank credit</span> dengan algoritma UMAP &amp; HDBSCAN.
      </p>
      <div class="kicker mt-5 mb-5 text-cyan-300">Intan Dwi Anggreini · 3324600006</div>
    </div>
    <div class="header-right">
      <div id="source-badge" class="badge badge-muted">memuat data…</div>
    </div>
  </header>

  <section id="kpi-row" class="kpi-row" aria-label="Ringkasan KPI"></section>

  <section class="block">
    <div class="grid-12">
      <article class="card col-6">
        <div class="card-head">
          <h3>Profil Segmentasi Risiko</h3>
        </div>
        <div id="chart-cluster-stacked" class="chart"></div>
        <div id="cluster-stacked-legend" class="legend"></div>
      </article>
      <article class="card col-6">
        <div class="card-head">
          <h3>Top 5 Produk · Default Rate Tertinggi</h3>
        </div>
        <div id="chart-products" class="chart table-chart"></div>
        <div id="products-legend" class="legend legend-grad"></div>
        <div class="card-head mt-5">
          <h3>Top 3 Customer Segment · Profitabilitas Tertinggi</h3>
        </div>
        <div id="chart-customer" class="chart table-chart"></div>
        <div id="customer-legend" class="legend legend-grad"></div>
      </article>
    </div>
  </section>

  <section class="block">
    <div class="grid-12">
      <article class="card col-12">
        <div class="card-head">
          <h3>Frekuensi Segmentasi</h3>
        </div>
        <div id="chart-bubble" class="chart"></div>
        <div id="bubble-legend" class="legend"></div>
      </article>
    </div>
  </section>

  <footer class="site-footer">
    <span>Dashboard <span class="mono">dw_bankcredit</span></span>
    <span class="dim">Data source: PostgreSQL container <span class="mono">postgresdb</span></span>
  </footer>
</div>

<div id="tooltip" class="tooltip" role="status" aria-live="polite"></div>

<script src="assets/js/charts/cluster_stacked.js"></script>
<script src="assets/js/charts/bubble.js"></script>
<script src="assets/js/charts/products.js"></script>
<script src="assets/js/charts/customer.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>
