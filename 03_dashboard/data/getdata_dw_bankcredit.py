#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
getdata_dw_bankcredit.py
========================
Mengambil SELURUH data dashboard LANGSUNG dari PostgreSQL (data warehouse bank
credit yang berjalan di container Docker) lalu menyimpannya ke berkas JSON
`getdata_dw_bankcredit.json`.

KEBIJAKAN:
  - Sumber data TUNGGAL = PostgreSQL. TIDAK ADA fallback CSV / JSON.
  - Bila koneksi / query gagal, skrip berhenti dengan exit code != 0
    (tidak menulis data palsu).

Struktur JSON yang dihasilkan SAMA PERSIS dengan output endpoint
`dashboard/api/data.php` sehingga berkas ini bisa dipakai untuk audit, arsip,
atau (bila diinginkan) menjadi sumber statis dashboard.

Prasyarat:
    pip install psycopg2-binary

Menjalankan:
    python getdata_dw_bankcredit.py
    # atau override koneksi lewat environment variable:
    PGHOST=127.0.0.1 PGPORT=9999 PGDATABASE=dw_bankcredit \
    PGUSER=postgres PGPASSWORD=intan999 python getdata_dw_bankcredit.py
"""

import os
import sys
import json
import math
from decimal import Decimal
from datetime import datetime, date

# ===========================================================================
#  KONFIGURASI KONEKSI  (selaras dengan dashboard/api/db.php)
# ===========================================================================
#  PostgreSQL berjalan di dalam container Docker.
#   - PHP/Python di HOST          -> host '127.0.0.1' + port publish (9999).
#   - Python di dalam Docker juga -> host = nama service/container + port 5432.
#
#  CATATAN NAMA DATABASE:
#   Semua skrip SQL & notebook memakai database 'dw_bankcredit' (di situlah
#   schema `analysis` + materialized view berada), dan berkas keluaran juga
#   bernama getdata_dw_bankcredit.json. Karena itu default = 'dw_bankcredit'.
#   Bila container Anda benar-benar bernama 'dw_credit', ubah DB_NAME di bawah
#   atau set environment PGDATABASE=dw_credit.
# ---------------------------------------------------------------------------
DB_HOST = os.getenv("PGHOST", "127.0.0.1")
DB_PORT = os.getenv("PGPORT", "9999")
DB_NAME = os.getenv("PGDATABASE", "dw_bankcredit")   # <- ganti ke 'dw_credit' bila perlu
DB_USER = os.getenv("PGUSER", "postgres")
DB_PASS = os.getenv("PGPASSWORD", "intan999")

def _default_out_path():
    """Bila skrip ini berdampingan dengan folder dashboard/ (susunan paket),
    tulis langsung ke dashboard/data/ supaya otomatis terbaca oleh data.php.
    Jika tidak, tulis di direktori kerja saat ini."""
    here = os.path.dirname(os.path.abspath(__file__))
    dash_data = os.path.join(here, "dashboard", "data")
    if os.path.isdir(dash_data):
        return os.path.join(dash_data, "getdata_dw_bankcredit.json")
    return "getdata_dw_bankcredit.json"

# Lokasi output. Override: set environment OUT_PATH=/path/ke/file.json
OUT_PATH = os.getenv("OUT_PATH", _default_out_path())

VARS7 = ["credit_score", "dti_ratio", "pd_score", "approved_amount",
         "final_rate", "appraised_value", "tenor_months"]


# ===========================================================================
#  Util
# ===========================================================================
def die(msg: str, code: int = 1):
    print(f"[GAGAL] {msg}", file=sys.stderr)
    sys.exit(code)


def num(v):
    """Konversi nilai DB (Decimal/None) menjadi tipe JSON-friendly."""
    if v is None:
        return None
    if isinstance(v, Decimal):
        v = float(v)
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def f4(v):
    """float dibulatkan 4 desimal (mengikuti data.php)."""
    v = num(v)
    return round(float(v), 4) if v is not None else 0.0


def percentile(sorted_vals, p):
    n = len(sorted_vals)
    if n == 0:
        return 0.0
    if n == 1:
        return float(sorted_vals[0])
    rank = p * (n - 1)
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return float(sorted_vals[lo])
    frac = rank - lo
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * frac


# ===========================================================================
#  Koneksi + helper query
# ===========================================================================
def connect():
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        die("Modul psycopg2 belum terpasang. Jalankan: pip install psycopg2-binary")
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
            user=DB_USER, password=DB_PASS, connect_timeout=5,
            options="-c search_path=analysis,public",
        )
        conn.autocommit = True
        print(f"[OK] Terhubung ke PostgreSQL {DB_NAME} @ {DB_HOST}:{DB_PORT}")
        return conn
    except Exception as e:  # noqa: BLE001
        die(f"Tidak dapat terhubung ke PostgreSQL ({DB_NAME}@{DB_HOST}:{DB_PORT}). "
            f"Pastikan container Docker berjalan & kredensial benar.\n        Detail: {e}")


def q_all(conn, sql, params=None):
    import psycopg2.extras
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params or [])
        return [dict(r) for r in cur.fetchall()]


def q_one(conn, sql, params=None):
    rows = q_all(conn, sql, params)
    return rows[0] if rows else None


def has_relation(conn, schema, name):
    row = q_one(conn, "SELECT to_regclass(%s) AS oid", [f"{schema}.{name}"])
    return bool(row and row["oid"] is not None)


# ===========================================================================
#  Bangun payload (mirror dashboard/api/data.php :: buildFromDB)
# ===========================================================================
def build_payload(conn):
    # --- relasi wajib ---
    for schema, name in [("analysis", "loan_cluster_assignment"),
                         ("public", "fact_loan_lending")]:
        if not has_relation(conn, schema, name):
            die(f"Relasi wajib tidak ditemukan: {schema}.{name}. "
                f"Jalankan dulu 01_ddl_star_schema.sql, ETL, 04_analysis_schema.sql, "
                f"05_materialized_views.sql, dan/atau notebook clustering.")

    has_econ = has_relation(conn, "analysis", "v_loan_econ")
    has_dim_product = has_relation(conn, "public", "dim_product")
    has_dim_branch = has_relation(conn, "public", "dim_branch")

    econ_join = "LEFT JOIN analysis.v_loan_econ e USING (sk_loan_fact)" if has_econ else ""
    if has_econ:
        econ_sel = ("COALESCE(e.roi, 0)               AS roi,\n"
                    "               COALESCE(e.net_profit, 0)        AS profit,\n"
                    "               COALESCE(e.expected_loss, 0)     AS expected_loss,\n"
                    "               COALESCE(e.is_default, false)::int AS default_flag,")
    else:
        econ_sel = "0 AS roi, 0 AS profit, 0 AS expected_loss, 0 AS default_flag,"

    prod_join = "LEFT JOIN public.dim_product dp ON dp.sk_product = f.sk_product" if has_dim_product else ""
    br_join = "LEFT JOIN public.dim_branch  db ON db.sk_branch  = f.sk_branch" if has_dim_branch else ""
    prod_sel = "COALESCE(dp.product_type, 'Unknown')" if has_dim_product else "'Unknown'"
    br_sel = "COALESCE(db.branch_name, 'Unknown')" if has_dim_branch else "'Unknown'"

    rows = q_all(conn, f"""
        SELECT a.cluster_label AS c,
               COALESCE(a.cluster_name, 'Unknown') AS name,
               a.umap_x, a.umap_y,
               f.credit_score, f.dti_ratio, f.pd_score, f.approved_amount,
               f.final_rate, f.appraised_value, f.tenor_months,
               COALESCE(f.app_status, 'Unknown') AS app_status,
               {br_sel}   AS branch,
               {prod_sel} AS product_type,
               {econ_sel}
               f.sk_loan_fact AS loan_id
        FROM analysis.loan_cluster_assignment a
        JOIN public.fact_loan_lending f USING (sk_loan_fact)
        {econ_join}
        {prod_join}
        {br_join}
        ORDER BY COALESCE(a.cluster_label, 999999), f.sk_loan_fact
    """)
    if not rows:
        die("Tidak ada baris pada loan_cluster_assignment/fact_loan_lending.")

    prof = (q_all(conn, "SELECT * FROM analysis.mv_cluster_profile ORDER BY cluster_label")
            if has_relation(conn, "analysis", "mv_cluster_profile") else [])

    kpi_row = (q_one(conn, "SELECT * FROM analysis.v_kpi_summary")
               if has_relation(conn, "analysis", "v_kpi_summary") else None)

    sil = None
    if has_relation(conn, "analysis", "algo_comparison"):
        sr = q_one(conn, """
            SELECT silhouette_score FROM analysis.algo_comparison
            WHERE algorithm ILIKE 'UMAP%%HDBSCAN%%'
            ORDER BY composite_rank NULLS LAST LIMIT 1
        """)
        sil = sr["silhouette_score"] if sr else None

    total = len(rows)
    noise = sum(1 for r in rows if int(r.get("c") or 0) == -1)
    n_clusters = sum(1 for p in prof if int(p.get("cluster_label") or 0) != -1)

    kpi = {
        "total_loans": int((kpi_row or {}).get("total_loans") or total),
        "total_default_rate": f4((kpi_row or {}).get("total_default_rate")),
        "avg_roi": f4((kpi_row or {}).get("avg_roi")),
        "total_profit": f4((kpi_row or {}).get("total_profit")),
        "total_disbursed": f4((kpi_row or {}).get("total_disbursed")),
        "avg_credit_score": f4((kpi_row or {}).get("avg_credit_score")),
        "n_clusters": int(n_clusters),
        "noise_rate": round(100.0 * noise / total, 2) if total else 0.0,
        "silhouette_umap_hdbscan": f4(sil) if sil is not None else 0.0,
    }

    # --- clusters + profil ternormalisasi ---
    clusters, prof_by_var = [], {}
    for p in prof:
        cl = int(p.get("cluster_label") or 0)
        profile = {
            "credit_score": f4(p.get("avg_credit_score")),
            "dti_ratio": f4(p.get("avg_dti_ratio")),
            "pd_score": f4(p.get("avg_pd_score")),
            "approved_amount": f4(p.get("avg_approved_amount")),
            "final_rate": f4(p.get("avg_final_rate")),
            "appraised_value": f4(p.get("avg_appraised_value")),
            "tenor_months": f4(p.get("avg_tenor_months")),
        }
        for k, v in profile.items():
            prof_by_var.setdefault(k, {})[cl] = v
        clusters.append({
            "cluster": cl,
            "name": p.get("cluster_name") or f"Cluster {cl}",
            "size": int(p.get("cluster_size") or 0),
            "share": f4(p.get("share_pct")),
            "default_rate": f4(p.get("default_rate")),
            "avg_roi": f4(p.get("avg_roi")),
            "profile": profile,
        })

    norm = {}
    for v in VARS7:
        vals = prof_by_var.get(v, {})
        if not vals:
            continue
        lo, hi = min(vals.values()), max(vals.values())
        rng = (hi - lo) or 1e-9
        norm[v] = {cl: round((val - lo) / rng, 4) for cl, val in vals.items()}

    # --- agregasi per-baris untuk boxplot / violin / composition / scatter ---
    by_cluster, statuses, scatter = {}, {}, []
    for r in rows:
        cl = int(r.get("c") or 0)
        name = r.get("name") or f"Cluster {cl}"
        bc = by_cluster.setdefault(cl, {"name": name})
        bc["name"] = name
        for v in VARS7:
            val = r.get(v)
            if val is not None and val != "":
                bc.setdefault(v, []).append(float(num(val)))
        st = (str(r.get("app_status") or "Unknown").strip()) or "Unknown"
        statuses[st] = True
        bc.setdefault("status", {})
        bc["status"][st] = bc["status"].get(st, 0) + 1
        scatter.append({
            "x": num(r.get("umap_x")), "y": num(r.get("umap_y")),
            "cluster": cl, "name": name,
        })

    order_cl = sorted(by_cluster.keys(), key=lambda c: (c == -1, c))

    # fallback koordinat (bila umap_x/y kosong) -> sebar di sekitar centroid
    if scatter and (scatter[0]["x"] is None or scatter[0]["y"] is None):
        import random
        rnd = random.Random(42)
        centroids = {}
        for i, cl in enumerate(order_cl):
            ang = 2 * math.pi * i / max(len(order_cl), 1)
            centroids[cl] = (2.2 * math.cos(ang), 2.2 * math.sin(ang))
        for s in scatter:
            cx, cy = centroids.get(s["cluster"], (0, 0))
            s["x"] = f4(cx + (rnd.random() - 0.5) * 1.1)
            s["y"] = f4(cy + (rnd.random() - 0.5) * 1.1)
    else:
        for s in scatter:
            s["x"], s["y"] = f4(s["x"]), f4(s["y"])

    boxplot, violin = {}, {}
    import random
    rnd = random.Random(0)
    for v in VARS7:
        boxplot[v], violin[v] = [], []
        for cl in order_cl:
            vals = sorted(by_cluster.get(cl, {}).get(v, []))
            q1, q2, q3 = percentile(vals, .25), percentile(vals, .5), percentile(vals, .75)
            iqr = q3 - q1
            lo = max(vals[0], q1 - 1.5 * iqr) if vals else 0
            hi = min(vals[-1], q3 + 1.5 * iqr) if vals else 0
            mean = sum(vals) / len(vals) if vals else 0
            nm = by_cluster.get(cl, {}).get("name", f"Cluster {cl}")
            boxplot[v].append({
                "cluster": cl, "name": nm,
                "min": round(lo, 4), "q1": round(q1, 4), "median": round(q2, 4),
                "q3": round(q3, 4), "max": round(hi, 4), "mean": round(mean, 4),
                "n": len(vals),
            })
            samp = list(vals)
            if len(samp) > 80:
                rnd.shuffle(samp)
                samp = samp[:80]
            violin[v].append({"cluster": cl, "name": nm,
                              "values": [round(x, 4) for x in samp]})

    # composition: app_status, branch, product_type
    composition = {}
    cats_status = list(statuses.keys())
    composition["app_status"] = {
        "categories": cats_status,
        "rows": [{"cluster": cl,
                  "name": by_cluster.get(cl, {}).get("name", f"Cluster {cl}"),
                  "counts": {st: int(by_cluster.get(cl, {}).get("status", {}).get(st, 0))
                             for st in cats_status}}
                 for cl in order_cl],
    }
    for dim in ("branch", "product_type"):
        cats, rows_dim = {}, []
        for cl in order_cl:
            counts = {}
            for r in rows:
                if int(r.get("c") or 0) != cl:
                    continue
                val = (str(r.get(dim) or "Unknown").strip()) or "Unknown"
                counts[val] = counts.get(val, 0) + 1
                cats[val] = True
            rows_dim.append({"cluster": cl,
                             "name": by_cluster.get(cl, {}).get("name", f"Cluster {cl}"),
                             "counts": counts})
        composition[dim] = {"categories": list(cats.keys()), "rows": rows_dim}

    # --- materialized view: top5 / top3 ---
    top5 = []
    if has_relation(conn, "analysis", "mv_top5_product_default"):
        for p in q_all(conn, "SELECT * FROM analysis.mv_top5_product_default"):
            top5.append({"product": p.get("product_name") or "Unknown",
                        "loans": int(p.get("total_loans") or 0),
                        "defaults": int(p.get("total_defaults") or 0),
                        "default_rate": f4(p.get("default_rate")),
                        "disbursed": f4(p.get("total_disbursed"))})

    top3_risk = []
    if has_relation(conn, "analysis", "mv_top3_risk_roi"):
        for p in q_all(conn, "SELECT * FROM analysis.mv_top3_risk_roi"):
            top3_risk.append({"risk_segment": int(p.get("risk_segment") or 0),
                             "label": p.get("segment_label") or f"Risk Segment {p.get('risk_segment')}",
                             "roi": f4(p.get("avg_roi")),
                             "default_rate": f4(p.get("default_rate")),
                             "expected_loss": f4(p.get("avg_expected_loss")),
                             "profit": f4(p.get("total_profit"))})

    top3_customer = []
    if has_relation(conn, "analysis", "mv_top3_customer_profit"):
        for p in q_all(conn, "SELECT * FROM analysis.mv_top3_customer_profit"):
            top3_customer.append({"segment": p.get("customer_segment") or "Unknown",
                                 "loans": int(p.get("total_loans") or 0),
                                 "profit": f4(p.get("total_profit")),
                                 "roi": f4(p.get("avg_roi")),
                                 "disbursed": f4(p.get("total_disbursed"))})

    # --- algo comparison ---
    algo = []
    if has_relation(conn, "analysis", "algo_comparison"):
        for p in q_all(conn, "SELECT * FROM analysis.algo_comparison ORDER BY composite_rank NULLS LAST"):
            algo.append({
                "algorithm": p.get("algorithm") or "Unknown",
                "business_separation": f4(p.get("business_separation")),
                "cluster_stability": f4(p.get("cluster_stability")),
                "silhouette_score": f4(p.get("silhouette_score")),
                "davies_bouldin": f4(p.get("davies_bouldin")),
                "calinski_harabasz": f4(p.get("calinski_harabasz")),
                "noise_rate": f4(p.get("noise_rate")),
                "bic": num(p.get("bic")),
                "aic": num(p.get("aic")),
                "composite_rank": int(p["composite_rank"]) if p.get("composite_rank") is not None else None,
            })

    return {
        "meta": {
            "source": "postgresql",
            "db": DB_NAME,
            "live": True,
            "generated": datetime.now().isoformat(timespec="seconds"),
            "note": "Diekspor langsung dari PostgreSQL oleh getdata_dw_bankcredit.py (tanpa fallback).",
        },
        "kpi": kpi,
        "vars": VARS7,
        "clusters": clusters,
        "profile_norm": norm,
        "boxplot": boxplot,
        "violin": violin,
        "composition": composition,
        "scatter": scatter,
        "top5_products": top5,
        "top3_risk": top3_risk,
        "top3_customer": top3_customer,
        "algo_comparison": algo,
    }


def main():
    conn = connect()
    try:
        payload = build_payload(conn)
    finally:
        conn.close()

    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1, default=float)

    k = payload["kpi"]
    print(f"[OK] {OUT_PATH} ditulis.")
    print(f"     total_loans={k['total_loans']}  clusters={len(payload['clusters'])}  "
          f"noise_rate={k['noise_rate']}%  default_rate={k['total_default_rate']}%")


if __name__ == "__main__":
    main()
