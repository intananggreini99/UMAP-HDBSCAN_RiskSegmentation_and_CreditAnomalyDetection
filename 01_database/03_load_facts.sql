-- ============================================================================
-- 03_load_facts.sql
-- Memuat 2 file CSV fakta ke dw_bankcredit dan backfill atribut turunan.
-- ----------------------------------------------------------------------------
-- PRASYARAT: jalankan psql dari folder yang berisi kedua CSV, mis:
--   cd 01_database
--   psql -U postgres -d dw_bankcredit -f 03_load_facts.sql
-- \copy berjalan di sisi CLIENT, sehingga path relatif mengikuti folder Anda.
-- Sesuaikan nama file bila berbeda.
-- ============================================================================
\c dw_bankcredit
SET search_path TO public;

TRUNCATE fact_loan_payment, fact_loan_lending RESTART IDENTITY;

-- ----------------------------------------------------- fact_loan_lending (CSV)
\copy fact_loan_lending (sk_loan_fact, sk_customer, sk_product, sk_branch, sk_employee, sk_collateral_type, sk_date_application, sk_date_approval, sk_date_disbursement, application_id, approval_id, disbursement_id, assessment_id, pledge_id, app_status, requested_amount, approved_amount, disbursed_amount, tenor_months, final_rate, dti_ratio, pd_score, credit_score, appraised_value) FROM 'fact_loan_lending_202605212237.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- ----------------------------------------------------- fact_loan_payment (CSV)
\copy fact_loan_payment (sk_payment_fact, sk_loan_fact, sk_customer, sk_payment_status, sk_date_paid, sk_date_due, principal, interest, total_paid, days_late) FROM 'fact_loan_payment_202605212238.csv' WITH (FORMAT csv, HEADER true, NULL '');

-- Sinkronkan sequence PK agar INSERT manual berikutnya tidak bentrok
SELECT setval(pg_get_serial_sequence('fact_loan_lending','sk_loan_fact'),
              (SELECT max(sk_loan_fact) FROM fact_loan_lending));
SELECT setval(pg_get_serial_sequence('fact_loan_payment','sk_payment_fact'),
              (SELECT max(sk_payment_fact) FROM fact_loan_payment));

-- ----------------------------------------------------------------------------
-- BACKFILL risk_segment & credit_grade pada dim_customer
-- Definisi: segmen risiko 1..5 = kuintil rata-rata pd_score per nasabah
-- (1 = paling aman / pd terendah, 5 = paling berisiko / pd tertinggi).
-- ----------------------------------------------------------------------------
WITH cust_pd AS (
    SELECT sk_customer, AVG(pd_score) AS pd_avg
    FROM fact_loan_lending
    GROUP BY sk_customer
),
seg AS (
    SELECT sk_customer,
           ntile(5) OVER (ORDER BY pd_avg) AS rs
    FROM cust_pd
)
UPDATE dim_customer c
SET risk_segment = seg.rs,
    credit_grade = (ARRAY['AAA','AA','A','BBB','BB'])[seg.rs]
FROM seg
WHERE c.sk_customer = seg.sk_customer;

-- Nasabah tanpa transaksi: beri segmen tengah agar tidak NULL
UPDATE dim_customer SET risk_segment = 3, credit_grade = 'A'
WHERE risk_segment IS NULL;

DO $$
BEGIN
  RAISE NOTICE 'fact_loan_lending=%, fact_loan_payment=%, default(Overdue) rows=%',
   (SELECT count(*) FROM fact_loan_lending),
   (SELECT count(*) FROM fact_loan_payment),
   (SELECT count(*) FROM fact_loan_payment WHERE sk_payment_status = 1);
END $$;
