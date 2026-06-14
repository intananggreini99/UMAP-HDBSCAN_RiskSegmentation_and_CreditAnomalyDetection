-- ============================================================================
-- 04_analysis_schema.sql
-- Tabel penyimpanan hasil DATA MINING di schema `analysis` (dw_bankcredit).
-- (instruksi poin c)
-- ----------------------------------------------------------------------------
--   analysis.loan_cluster_assignment : label cluster per-pinjaman + koordinat 2D
--   analysis.algo_comparison         : metrik perbandingan 8 algoritma clustering
-- Keduanya DI-SEED di sini agar dashboard & materialized view langsung berfungsi
-- tanpa harus menjalankan notebook lebih dulu. Saat clustering_mining.ipynb
-- dijalankan, kedua tabel ini DITIMPA (TRUNCATE+INSERT) dengan hasil
-- UMAP+HDBSCAN yang sesungguhnya, lalu materialized view di-REFRESH.
-- ============================================================================
\c dw_bankcredit
SET search_path TO analysis, public;

DROP TABLE IF EXISTS analysis.loan_cluster_assignment CASCADE;
DROP TABLE IF EXISTS analysis.algo_comparison          CASCADE;

-- ---------------------------------------------- hasil clustering per-pinjaman
CREATE TABLE analysis.loan_cluster_assignment (
    sk_loan_fact   INTEGER PRIMARY KEY REFERENCES public.fact_loan_lending(sk_loan_fact),
    cluster_label  INTEGER,                 -- -1 = noise/anomali (konvensi HDBSCAN)
    cluster_name   VARCHAR(40),
    is_noise       BOOLEAN DEFAULT FALSE,
    probability    NUMERIC(6,4),            -- HDBSCAN membership strength (0..1)
    umap_x         DOUBLE PRECISION,        -- koordinat embedding 2D (diisi notebook)
    umap_y         DOUBLE PRECISION,
    risk_band      VARCHAR(20),             -- ringkasan tindak lanjut (lihat di bawah)
    created_at     TIMESTAMP DEFAULT now()
);
COMMENT ON TABLE analysis.loan_cluster_assignment IS
  'Label cluster UMAP+HDBSCAN per aplikasi pinjaman (fact_loan_lending).';

-- ---------------------------------------------- metrik perbandingan algoritma
CREATE TABLE analysis.algo_comparison (
    algorithm            VARCHAR(40) PRIMARY KEY,
    business_separation  NUMERIC(8,4),  -- Risk Lift antar cluster (makin tinggi makin baik)
    cluster_stability    NUMERIC(6,4),  -- rata-rata stabilitas bootstrap/ARI (0..1)
    silhouette_score     NUMERIC(6,4),  -- (-1..1) makin tinggi makin baik
    davies_bouldin       NUMERIC(8,4),  -- makin RENDAH makin baik
    calinski_harabasz    NUMERIC(10,2), -- makin tinggi makin baik
    noise_rate           NUMERIC(6,2),  -- % titik noise (konteks)
    bic                  NUMERIC(12,2), -- khusus GMM
    aic                  NUMERIC(12,2), -- khusus GMM
    composite_rank       INTEGER        -- peringkat akhir berbobot prioritas
);
COMMENT ON TABLE analysis.algo_comparison IS
  'Perbandingan UMAP+HDBSCAN vs 7 algoritma lain pada urutan prioritas metrik.';

-- ============================================================================
-- SEED 1 — loan_cluster_assignment via PURE SQL (mirror logika notebook):
--   risk_index = z(pd) + z(dti) - z(credit) + z(final_rate) - z(1/ltv)
--   cluster    = NTILE(5) atas risk_index ; ekor 2%/98% -> -1 (anomali)
-- ============================================================================
INSERT INTO analysis.loan_cluster_assignment
    (sk_loan_fact, cluster_label, cluster_name, is_noise, probability, risk_band)
WITH stat AS (
    SELECT AVG(pd_score) ap, STDDEV_POP(pd_score) sp,
           AVG(dti_ratio) ad, STDDEV_POP(dti_ratio) sd,
           AVG(credit_score) ac, STDDEV_POP(credit_score) sc,
           AVG(final_rate) af, STDDEV_POP(final_rate) sf,
           AVG(approved_amount/NULLIF(appraised_value,0)) al,
           STDDEV_POP(approved_amount/NULLIF(appraised_value,0)) sl
    FROM public.fact_loan_lending
),
idx AS (
    SELECT f.sk_loan_fact,
           ( (f.pd_score   - s.ap)/NULLIF(s.sp,0)
           + (f.dti_ratio  - s.ad)/NULLIF(s.sd,0)
           - (f.credit_score - s.ac)/NULLIF(s.sc,0)
           + (f.final_rate - s.af)/NULLIF(s.sf,0)
           - ((f.approved_amount/NULLIF(f.appraised_value,0)) - s.al)/NULLIF(s.sl,0)
           ) AS risk_index
    FROM public.fact_loan_lending f CROSS JOIN stat s
),
rk AS (
    SELECT sk_loan_fact, risk_index,
           NTILE(5)   OVER (ORDER BY risk_index) AS q5,
           NTILE(100) OVER (ORDER BY risk_index) AS q100
    FROM idx
)
SELECT sk_loan_fact,
       CASE WHEN q100 <= 2 OR q100 >= 99 THEN -1 ELSE q5-1 END                AS cluster_label,
       CASE WHEN q100 <= 2 OR q100 >= 99 THEN 'Anomali / Noise'
            WHEN q5=1 THEN 'Hidden Prime'  WHEN q5=2 THEN 'Prime Stabil'
            WHEN q5=3 THEN 'Standar'       WHEN q5=4 THEN 'Berkembang'
            ELSE 'Berisiko Tinggi' END                                        AS cluster_name,
       (q100 <= 2 OR q100 >= 99)                                              AS is_noise,
       round((0.99 - (abs(50.5-q100)/55.0))::numeric,4)                       AS probability,
       CASE WHEN q100 <= 2 OR q100 >= 99 THEN 'Manual Review'
            WHEN q5 <= 2 THEN 'Auto-Approve'
            WHEN q5 = 3 THEN 'Standard'
            ELSE 'Enhanced Review' END                                        AS risk_band
FROM rk;

-- ============================================================================
-- SEED 2 — algo_comparison (ditimpa notebook dgn nilai terukur sesungguhnya)
-- ============================================================================
INSERT INTO analysis.algo_comparison
 (algorithm,business_separation,cluster_stability,silhouette_score,davies_bouldin,
  calinski_harabasz,noise_rate,bic,aic) VALUES
  ('UMAP + HDBSCAN',3.42,0.91,0.781,0.34,4120,4.0,NULL,NULL),
  ('UMAP + K-Means',2.60,0.78,0.690,0.55,3650,0.0,NULL,NULL),
  ('Gaussian Mixture (GMM)',2.10,0.74,0.602,0.78,2980,0.0,19720,19310),
  ('Deep Embedded Clustering (DEC)',2.35,0.72,0.640,0.61,3320,0.0,NULL,NULL),
  ('K-Means',1.95,0.69,0.586,0.83,3110,0.0,NULL,NULL),
  ('Agglomerative (Ward)',1.88,0.66,0.564,0.86,2870,0.0,NULL,NULL),
  ('DBSCAN',1.40,0.58,0.470,1.12,1980,22.0,NULL,NULL),
  ('OPTICS',1.32,0.55,0.441,1.21,1840,18.0,NULL,NULL);

-- composite_rank berbobot prioritas (Business Sep > Stability > Silhouette > DB > CH > Noise)
-- Dihitung tanpa UDF: normalisasi min-max manual per metrik.
WITH b AS (
  SELECT min(business_separation) lo, max(business_separation) hi FROM analysis.algo_comparison),
 st AS (SELECT min(cluster_stability) lo, max(cluster_stability) hi FROM analysis.algo_comparison),
 si AS (SELECT min(silhouette_score) lo, max(silhouette_score) hi FROM analysis.algo_comparison),
 db AS (SELECT min(davies_bouldin)   lo, max(davies_bouldin)   hi FROM analysis.algo_comparison),
 ch AS (SELECT min(calinski_harabasz) lo, max(calinski_harabasz) hi FROM analysis.algo_comparison),
 nr AS (SELECT min(noise_rate) lo, max(noise_rate) hi FROM analysis.algo_comparison),
 sc AS (
  SELECT a.algorithm,
    0.35*((a.business_separation-b.lo)/NULLIF(b.hi-b.lo,0)) +
    0.22*((a.cluster_stability-st.lo)/NULLIF(st.hi-st.lo,0)) +
    0.18*((a.silhouette_score-si.lo)/NULLIF(si.hi-si.lo,0)) +
    0.12*(1-(a.davies_bouldin-db.lo)/NULLIF(db.hi-db.lo,0)) +
    0.08*((a.calinski_harabasz-ch.lo)/NULLIF(ch.hi-ch.lo,0)) +
    0.05*(1-(a.noise_rate-nr.lo)/NULLIF(nr.hi-nr.lo,0)) AS score
  FROM analysis.algo_comparison a, b, st, si, db, ch, nr
 ),
 rnk AS (SELECT algorithm, RANK() OVER (ORDER BY score DESC) rk FROM sc)
UPDATE analysis.algo_comparison a SET composite_rank = rnk.rk
FROM rnk WHERE a.algorithm = rnk.algorithm;

DO $$
BEGIN
  RAISE NOTICE 'assignment rows=% | noise=% | top algo=%',
    (SELECT count(*) FROM analysis.loan_cluster_assignment),
    (SELECT count(*) FROM analysis.loan_cluster_assignment WHERE is_noise),
    (SELECT algorithm FROM analysis.algo_comparison ORDER BY composite_rank LIMIT 1);
END $$;
