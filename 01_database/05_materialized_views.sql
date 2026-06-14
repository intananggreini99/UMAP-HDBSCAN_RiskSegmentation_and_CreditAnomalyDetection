-- ============================================================================
-- 05_materialized_views.sql   (schema: analysis, db: dw_bankcredit)  — poin a & c
-- ----------------------------------------------------------------------------
-- 4 Materialized View:
--   1) mv_cluster_profile        : profil rata-rata per cluster UMAP+HDBSCAN
--   2) mv_top5_product_default   : Top 5 Produk dengan Default Rate tertinggi
--   3) mv_top3_risk_roi          : Top 3 Risk Segment dengan ROI terbaik
--   4) mv_top3_customer_profit   : Top 3 Customer Segment paling profitable
--
-- KONVENSI EKONOMI (didokumentasikan agar bisa diaudit):
--   default        : pinjaman memiliki >=1 pembayaran Overdue (sk_payment_status=1)
--                    ATAU days_late > 90  (NPL proxy)
--   gross_interest : disbursed_amount * final_rate/100 * tenor_months/12  (bunga seumur tenor)
--   LGD            : 0.45  (Loss Given Default; asumsi standar ritel beragunan sebagian)
--   expected_loss  : pd_score * LGD * disbursed_amount
--   net_profit     : gross_interest - expected_loss
--   roi            : net_profit / disbursed_amount
-- ============================================================================
\c dw_bankcredit
SET search_path TO analysis, public;

-- ---------- VIEW dasar: 1 baris = 1 pinjaman + flag default + ekonomi -------
CREATE OR REPLACE VIEW analysis.v_loan_econ AS
WITH dflt AS (
    SELECT sk_loan_fact,
           bool_or(sk_payment_status = 1 OR COALESCE(days_late,0) > 90) AS is_default
    FROM public.fact_loan_payment
    GROUP BY sk_loan_fact
)
SELECT  f.sk_loan_fact, f.sk_customer, f.sk_product, f.sk_branch, f.app_status,
        f.disbursed_amount, f.approved_amount, f.appraised_value,
        f.final_rate, f.tenor_months, f.pd_score, f.dti_ratio, f.credit_score,
        COALESCE(d.is_default,false)                                        AS is_default,
        f.disbursed_amount * f.final_rate/100.0 * f.tenor_months/12.0       AS gross_interest,
        f.pd_score * 0.45 * f.disbursed_amount                              AS expected_loss,
        (f.disbursed_amount * f.final_rate/100.0 * f.tenor_months/12.0)
            - (f.pd_score * 0.45 * f.disbursed_amount)                      AS net_profit,
        CASE WHEN f.disbursed_amount > 0 THEN
            ((f.disbursed_amount * f.final_rate/100.0 * f.tenor_months/12.0)
              - (f.pd_score * 0.45 * f.disbursed_amount)) / f.disbursed_amount
        END                                                                 AS roi,
        -- segmentasi nasabah berbasis credit_score (untuk profitabilitas)
        CASE WHEN f.credit_score < 500 THEN 'Sub-Prime'
             WHEN f.credit_score < 600 THEN 'Near-Prime'
             WHEN f.credit_score < 700 THEN 'Prime'
             WHEN f.credit_score < 750 THEN 'Super-Prime'
             ELSE 'Elite' END                                               AS customer_segment
FROM public.fact_loan_lending f
LEFT JOIN dflt d ON d.sk_loan_fact = f.sk_loan_fact;

-- ============================================================================
-- 1) MV_CLUSTER_PROFILE  (instruksi poin a + sumber heatmap/radar dashboard)
--    Profil 7 variabel kunci per cluster + ukuran + default rate + ROI.
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS analysis.mv_cluster_profile CASCADE;
CREATE MATERIALIZED VIEW analysis.mv_cluster_profile AS
SELECT  a.cluster_label,
        max(a.cluster_name)                                  AS cluster_name,
        count(*)                                             AS cluster_size,
        round(100.0*count(*)/sum(count(*)) OVER (),2)        AS share_pct,
        round(100.0*avg(e.is_default::int),2)                AS default_rate,
        round(100.0*avg(e.roi),2)                            AS avg_roi,
        round(avg(e.credit_score),2)                         AS avg_credit_score,
        round(avg(e.dti_ratio),2)                            AS avg_dti_ratio,
        round(avg(e.pd_score),4)                             AS avg_pd_score,
        round(avg(e.approved_amount),2)                      AS avg_approved_amount,
        round(avg(e.final_rate),2)                           AS avg_final_rate,
        round(avg(e.appraised_value),2)                      AS avg_appraised_value,
        round(avg(e.tenor_months),2)                         AS avg_tenor_months,
        bool_or(a.is_noise)                                  AS is_noise
FROM analysis.loan_cluster_assignment a
JOIN analysis.v_loan_econ e USING (sk_loan_fact)
GROUP BY a.cluster_label
ORDER BY a.cluster_label;

-- ============================================================================
-- 2) MV_TOP5_PRODUCT_DEFAULT  (instruksi poin 2)
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS analysis.mv_top5_product_default CASCADE;
CREATE MATERIALIZED VIEW analysis.mv_top5_product_default AS
SELECT  p.sk_product,
        p.product_name,
        p.product_type,
        count(*)                                   AS total_loans,
        sum(e.is_default::int)                     AS total_defaults,
        round(100.0*avg(e.is_default::int),2)      AS default_rate,
        round(sum(e.disbursed_amount),2)           AS total_disbursed,
        round(sum(e.expected_loss),2)              AS total_expected_loss
FROM analysis.v_loan_econ e
JOIN public.dim_product p ON p.sk_product = e.sk_product
GROUP BY p.sk_product, p.product_name, p.product_type
HAVING count(*) >= 3                               -- buang produk volume sangat kecil
ORDER BY default_rate DESC, total_loans DESC
LIMIT 5;

-- ============================================================================
-- 3) MV_TOP3_RISK_ROI  (instruksi poin 4)
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS analysis.mv_top3_risk_roi CASCADE;
CREATE MATERIALIZED VIEW analysis.mv_top3_risk_roi AS
SELECT  c.risk_segment,
        'Risk Segment ' || c.risk_segment          AS segment_label,
        count(*)                                    AS total_loans,
        round(100.0*avg(e.roi),2)                   AS avg_roi,
        round(100.0*avg(e.is_default::int),2)       AS default_rate,
        round(avg(e.expected_loss),2)               AS avg_expected_loss,
        round(sum(e.net_profit),2)                  AS total_profit
FROM analysis.v_loan_econ e
JOIN public.dim_customer c ON c.sk_customer = e.sk_customer
WHERE c.risk_segment IS NOT NULL
GROUP BY c.risk_segment
ORDER BY avg_roi DESC
LIMIT 3;

-- ============================================================================
-- 4) MV_TOP3_CUSTOMER_PROFIT  (instruksi poin 5)
-- ============================================================================
DROP MATERIALIZED VIEW IF EXISTS analysis.mv_top3_customer_profit CASCADE;
CREATE MATERIALIZED VIEW analysis.mv_top3_customer_profit AS
SELECT  e.customer_segment,
        count(*)                                    AS total_loans,
        round(sum(e.net_profit),2)                  AS total_profit,
        round(100.0*avg(e.roi),2)                   AS avg_roi,
        round(sum(e.disbursed_amount),2)            AS total_disbursed,
        round(100.0*avg(e.is_default::int),2)       AS default_rate
FROM analysis.v_loan_econ e
GROUP BY e.customer_segment
ORDER BY total_profit DESC
LIMIT 3;

-- ---------------------------------------------------------------- indeks unik
-- (memungkinkan REFRESH MATERIALIZED VIEW CONCURRENTLY bila diperlukan)
CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_cluster_profile      ON analysis.mv_cluster_profile(cluster_label);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_top5_product_default ON analysis.mv_top5_product_default(sk_product);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_top3_risk_roi        ON analysis.mv_top3_risk_roi(risk_segment);
CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_top3_customer_profit ON analysis.mv_top3_customer_profit(customer_segment);

-- ------------------------------------------------------------------- refresh
REFRESH MATERIALIZED VIEW analysis.mv_cluster_profile;
REFRESH MATERIALIZED VIEW analysis.mv_top5_product_default;
REFRESH MATERIALIZED VIEW analysis.mv_top3_risk_roi;
REFRESH MATERIALIZED VIEW analysis.mv_top3_customer_profit;

-- ------------------------------------------------------ KPI ringkas (view)
CREATE OR REPLACE VIEW analysis.v_kpi_summary AS
SELECT  count(*)                                    AS total_loans,
        round(100.0*avg(is_default::int),2)         AS total_default_rate,
        round(100.0*avg(roi),2)                     AS avg_roi,
        round(sum(net_profit),2)                    AS total_profit,
        round(sum(disbursed_amount),2)              AS total_disbursed,
        round(avg(credit_score),0)                  AS avg_credit_score
FROM analysis.v_loan_econ;

-- Pratinjau hasil
SELECT 'cluster_profile'  AS mv, count(*) FROM analysis.mv_cluster_profile
UNION ALL SELECT 'top5_product', count(*) FROM analysis.mv_top5_product_default
UNION ALL SELECT 'top3_risk',    count(*) FROM analysis.mv_top3_risk_roi
UNION ALL SELECT 'top3_customer',count(*) FROM analysis.mv_top3_customer_profit;
