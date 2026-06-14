/* =====================================================================
   main.js — Orchestrator dashboard
   Memuat data dari api/data.php, merender KPI dan seluruh visual utama.

   Catatan versi ini:
   - Logic data, fetch, dan rendering TIDAK berubah.
   - Hanya inline-style pada kartu pesan error yang disesuaikan:
       grid-column:1 / -1   ->   flex:1 1 100%
     karena layout .kpi-row sekarang memakai CSS FLEXBOX
     (sebelumnya CSS Grid). Tanpa penyesuaian ini, kartu error
     tidak akan melebar penuh pada layout flex.
   ===================================================================== */
(function () {
  "use strict";

  function getCss(v){
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
  }

  const idID = (n, dp = 0) =>
    Number(n ?? 0).toLocaleString("id-ID", { minimumFractionDigits: dp, maximumFractionDigits: dp });

  function fmtIDR(n) {
    const a = Math.abs(Number(n) || 0), s = Number(n) < 0 ? "-" : "";
    if (a >= 1e12) return `${s}Rp ${idID(a / 1e12, 2)} T`;
    if (a >= 1e9)  return `${s}Rp ${idID(a / 1e9, 2)} M`;
    if (a >= 1e6)  return `${s}Rp ${idID(a / 1e6, 2)} Jt`;
    return `${s}Rp ${idID(a)}`;
  }
  const fmtPct = (n, dp = 1) => `${idID(Number(n) || 0, dp)}%`;
  const fmtInt = (n) => idID(Math.round(Number(n) || 0));
  const fmtNum = (n, dp = 2) => idID(Number(n) || 0, dp);

  const TT = document.getElementById("tooltip");
  function ttShow(event, html) {
    TT.innerHTML = html;
    TT.classList.add("show");
    ttMove(event);
  }
  function ttMove(event) {
    const pad = 16, w = TT.offsetWidth, h = TT.offsetHeight;
    let x = event.clientX + pad, y = event.clientY + pad;
    if (x + w > window.innerWidth - 8)  x = event.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = event.clientY - h - pad;
    TT.style.left = x + "px";
    TT.style.top = y + "px";
  }
  function ttHide(){ TT.classList.remove("show"); }

  const ttRow = (k, v) => `<div class="tt-row"><span>${k}</span><span>${v}</span></div>`;
  const ttTitle = (name, color) =>
    `<div class="tt-title">${color ? `<span class="tt-dot" style="background:${color}"></span>` : ""}${name}</div>`;

  // pilih warna teks kontras (gelap/terang) di atas warna latar apa pun
  function inkOn(color) {
    let r = 120, g = 140, b = 170;
    const c = String(color).trim();
    const m = c.match(/rgba?\(([^)]+)\)/i);
    if (m) {
      const p = m[1].split(",").map(s => parseFloat(s));
      r = p[0]; g = p[1]; b = p[2];
    } else if (c[0] === "#") {
      let h = c.slice(1);
      if (h.length === 3) h = h.split("").map(x => x + x).join("");
      if (h.length >= 6) { r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16); }
    }
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.58 ? "#08111d" : "rgba(255,255,255,.95)";
  }

  // legenda gradiasi warna untuk tabel ter-grade (products & customer)
  function gradLegend(sel, o) {
    sel.selectAll("*").remove();
    const wrap = sel.append("div").attr("class", "grad-legend");
    wrap.append("span").attr("class", "grad-legend-cap").text(o.capLo);
    wrap.append("span").attr("class", "grad-legend-val").text(o.fmt(o.lo));
    wrap.append("span").attr("class", "grad-legend-bar")
      .style("background", `linear-gradient(90deg, ${o.c0}, ${o.c1})`);
    wrap.append("span").attr("class", "grad-legend-val").text(o.fmt(o.hi));
    wrap.append("span").attr("class", "grad-legend-cap").text(o.capHi);
  }

  const H = {
    d3: window.d3,
    fmtIDR, fmtPct, fmtInt, fmtNum, idID, getCss, inkOn, gradLegend,
    tt: { show: ttShow, move: ttMove, hide: ttHide, row: ttRow, title: ttTitle },
    riskGradient: (t) => d3.interpolateRgb(getCss("--risk-lo"), getCss("--risk-hi"))(t),
    clusterColor: (c) => {
      const map = {
        "-1": getCss("--cn"), 0: getCss("--c0"), 1: getCss("--c1"),
        2: getCss("--c2"), 3: getCss("--c3"), 4: getCss("--c4"),
      };
      if (map[String(c)]) return map[String(c)];
      // hasil clustering nyata bisa menghasilkan > 5 cluster (label >= 5).
      // Beri warna stabil & berbeda agar tiap cluster tetap dapat dibedakan.
      const extra = ["#a78bfa", "#f472b6", "#5eead4", "#fbbf24", "#38bdf8", "#fb923c", "#c084fc"];
      const n = Number(c);
      if (Number.isFinite(n) && n >= 5) return extra[(n - 5) % extra.length];
      return getCss("--brand");
    }
  };

  function renderKPI(kpi) {
    const cards = [
      { label: "Total Default Rate", value: fmtPct(kpi.total_default_rate), accent: "--danger",
        sub: `risiko gagal bayar dari <strong>${fmtInt(kpi.total_loans)}</strong> pinjaman` },
      { label: "Average ROI", value: fmtPct(kpi.avg_roi), accent: "--success",
        sub: `profitabilitas rata-rata portofolio` },
      { label: "Total Profit", value: fmtIDR(kpi.total_profit), accent: "--brand-2",
        sub: `nilai laba bersih portofolio` },
    ];
    const row = document.getElementById("kpi-row");
    if (!row) return;
    row.innerHTML = cards.map(c => `
      <div class="kpi" style="--accent:${getCss(c.accent)}">
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-sub">${c.sub}</div>
      </div>`).join("");
  }

  function buildSeg(containerId, options, initial, onChange) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = options.map(o =>
      `<button class="seg-btn ${o.value === initial ? "active" : ""}" data-v="${o.value}">${o.label}</button>`
    ).join("");
    el.addEventListener("click", e => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      el.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      onChange(btn.dataset.v);
    });
  }

  function renderBadge(meta) {
    const b = document.getElementById("source-badge");
    if (!b) return;
    if (meta && meta.live) {
      b.className = "badge badge-live";
      const db = meta.db || "dw_bankcredit";
      if (meta.mode === "python-json") {
        b.textContent = "Data Loaded";
        const when = meta.generated || meta.json_mtime;
        b.title = when
          ? ("Data hasil getdata_dw_bankcredit.py (" + when + ")")
          : "Data hasil getdata_dw_bankcredit.py";
      } else {
        b.textContent = "Live · PostgreSQL " + db;
        b.title = "";
      }
    } else if (meta && meta.error) {
      b.className = "badge badge-sample";
      b.textContent = "Data tidak tersedia";
      b.title = String(meta.error || "");
    } else {
      b.className = "badge badge-muted";
      b.textContent = "memuat data…";
      b.title = "";
    }
  }

  // Tidak ada data fallback: bila DB gagal, tampilkan pesan error yang jelas.
  function showDataError(msg) {
    const safe = msg ? String(msg).replace(/</g, "&lt;") : "";
    const row = document.getElementById("kpi-row");
    if (row) {
      // FLEXBOX: kartu error dipaksa melebar penuh dgn flex:1 1 100%
      // (sebelumnya memakai grid-column:1 / -1 saat layout berbasis CSS Grid).
      row.innerHTML = `<div class="kpi" style="--accent:var(--danger); flex:1 1 100%">
        <div class="kpi-label">Data tidak tersedia</div>
        <div class="kpi-value" style="font-size:19px; line-height:1.25">Data belum tersedia</div>
        <div class="kpi-sub">${safe} — jalankan <span class="mono">python getdata_dw_bankcredit.py</span> untuk mengambil data dari PostgreSQL, lalu letakkan <span class="mono">getdata_dw_bankcredit.json</span> di folder <span class="mono">dashboard/data/</span>. Dashboard ini <strong>hanya</strong> membaca data hasil pengambilan dari database (tanpa fallback).</div>
      </div>`;
    }
    ["#chart-cluster-stacked", "#chart-bubble", "#chart-products", "#chart-risk", "#chart-customer"]
      .forEach(s => { const n = document.querySelector(s); if (n) n.innerHTML = ""; });
    ["#bubble-legend", "#cluster-stacked-legend", "#products-legend", "#risk-legend", "#customer-legend"]
      .forEach(s => { const n = document.querySelector(s); if (n) n.innerHTML = ""; });
  }

  let DATA = null;

  function renderAll() {
    if (!DATA) return;
    window.renderClusterStacked?.("#chart-cluster-stacked", DATA, H);
    window.renderBubble?.("#chart-bubble", DATA, H);
    window.renderProducts?.("#chart-products", DATA, H);
    window.renderRisk?.("#chart-risk", DATA, H);
    window.renderCustomer?.("#chart-customer", DATA, H);
  }

  function init(data) {
    DATA = data || {};
    renderBadge(DATA.meta);

    const silEl = document.getElementById("sil-value");
    if (silEl) silEl.textContent = fmtNum(DATA?.kpi?.silhouette_umap_hdbscan ?? 0, 3);

    renderKPI(DATA.kpi || {});

    renderAll();

    let t;
    const target = document.querySelector(".wrap");
    if (target && "ResizeObserver" in window) {
      new ResizeObserver(() => { clearTimeout(t); t = setTimeout(renderAll, 160); }).observe(target);
    }
  }

  // ============================================================
  // Data HANYA diambil dari PostgreSQL melalui api/data.php.
  // TIDAK ADA fallback ke sample_data.json: bila DB gagal -> error jelas.
  // ============================================================
  fetch("api/data.php", { headers: { "Accept": "application/json" }, cache: "no-store" })
    .then(async r => {
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg = (body && (body.error || (body.meta && body.meta.error))) || ("HTTP " + r.status);
        throw new Error(msg);
      }
      if (!body || body.meta && body.meta.live === false) {
        throw new Error((body && body.meta && body.meta.error) || "sumber data bukan PostgreSQL");
      }
      return body;
    })
    .then(init)
    .catch(err => {
      console.error("Gagal memuat data dari PostgreSQL (api/data.php):", err);
      renderBadge({ live: false, error: String(err && err.message || err) });
      showDataError(String(err && err.message || err));
    });
})();
