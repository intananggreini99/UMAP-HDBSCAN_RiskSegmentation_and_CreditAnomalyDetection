-- ============================================================================
-- 02_load_dimensions.sql
-- Mengisi 8 tabel dimensi.  (jalankan di dw_bankcredit, schema public)
-- ----------------------------------------------------------------------------
-- CATATAN PENTING
-- Dataset yang Anda miliki hanya berisi 2 FAKTA (fact_loan_lending,
-- fact_loan_payment) yang SUDAH memuat surrogate key. Tabel ODS sumber tidak
-- disertakan, sehingga skrip ini me-GENERATE baris dimensi yang KONSISTEN
-- dengan rentang surrogate key pada fakta (customer 1..100, product 1..100,
-- branch 1..20, employee 1..100, collateral 1..100, date 1..300) agar seluruh
-- foreign key & JOIN materialized view valid. Pada lingkungan produksi, ganti
-- bagian ini dengan hasil ETL Pentaho (Transformasi 1..8).
-- ============================================================================
\c dw_bankcredit
SET search_path TO public;

TRUNCATE dim_customer, dim_product, dim_branch, dim_employee,
         dim_collateral_type, dim_date, dim_payment_status,
         dim_application_status RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- dim_product
INSERT INTO dim_product (product_id, product_code, product_name, product_type,
                         interest_rate, min_amount, max_amount, max_tenor_months)
SELECT g,
       'P' || lpad(g::text,3,'0'),
       (ARRAY['Home Loan','Auto Loan','Multipurpose','Personal Loan',
              'Working Capital','Investment Loan','Micro Loan','Credit Card'])
              [((g-1)%8)+1] || ' ' || (((g-1)/8)+1),
       (ARRAY['KPR','KKB','Multiguna','KTA','Modal Kerja',
              'Investasi','Mikro','Kartu Kredit'])[((g-1)%8)+1],
       round((6 + (g%12) + (g%7)*0.13)::numeric, 2),
       50000000, 500000000, (ARRAY[12,24,36,60,120])[((g-1)%5)+1]
FROM generate_series(1,100) g;

-- --------------------------------------------------------------- dim_customer
-- risk_segment di-backfill pada 03_load_facts.sql berdasarkan kuintil pd_score.
INSERT INTO dim_customer (customer_id, national_id, full_name, date_of_birth,
                          occupation, monthly_income, risk_segment, email, phone,
                          credit_grade, bureau_source)
SELECT g,
       '32' || lpad(g::text,16,'0'),
       'Customer ' || lpad(g::text,3,'0'),
       DATE '1970-01-01' + (g*97 % 9000),
       (ARRAY['Karyawan Swasta','PNS','Wiraswasta','Profesional',
              'BUMN','Petani','Pedagang'])[(g%7)+1],
       round((5000000 + (g*431123 % 45000000))::numeric, -5),
       NULL,                                   -- risk_segment -> diisi nanti
       'cust' || g || '@bankcredit.id',
       '0812' || lpad((g*7777 % 100000000)::text,8,'0'),
       NULL,                                   -- credit_grade -> diisi nanti
       (ARRAY['Pefindo','SLIK-OJK','TransUnion'])[(g%3)+1]
FROM generate_series(1,100) g;

-- ----------------------------------------------------------------- dim_branch
INSERT INTO dim_branch (branch_id, branch_code, branch_name, city, region, opened_date)
SELECT g,
       'B' || lpad(g::text,2,'0'),
       'Cabang ' || (ARRAY['Surabaya','Bandung','Jakarta','Denpasar',
                           'Medan','Makassar'])[((g-1)%6)+1] || ' ' || (((g-1)/6)+1),
       (ARRAY['Surabaya','Bandung','Jakarta','Denpasar','Medan','Makassar'])[((g-1)%6)+1],
       (ARRAY['Jawa Timur','Jawa Barat','DKI Jakarta','Bali',
              'Sumatera Utara','Sulawesi Selatan'])[((g-1)%6)+1],
       DATE '2005-01-01' + (g*53 % 6000)
FROM generate_series(1,20) g;

-- --------------------------------------------------------------- dim_employee
INSERT INTO dim_employee (employee_id, full_name, role)
SELECT g, 'Employee ' || lpad(g::text,3,'0'),
       (ARRAY['Credit Analyst','Underwriter','Branch Manager',
              'Relationship Officer','Risk Officer'])[(g%5)+1]
FROM generate_series(1,100) g;

-- -------------------------------------------------------- dim_collateral_type
INSERT INTO dim_collateral_type (collateral_type_id, type_name, ltv_ratio, description)
SELECT g,
       (ARRAY['Tanah & Bangunan','Kendaraan Bermotor','Deposito',
              'Emas/Logam Mulia','Mesin Pabrik','Tanpa Agunan'])[((g-1)%6)+1]
              || ' #' || (((g-1)/6)+1),
       round((60 + (g%30))::numeric, 2),
       'Agunan tipe ' || g
FROM generate_series(1,100) g;

-- ------------------------------------------------------------------- dim_date
-- sk_date 1..300; sumbu tanggal sintetis berurutan (cukup untuk integritas FK).
INSERT INTO dim_date (full_date, day, day_name, week, month, month_name,
                      quarter, year, is_weekend)
SELECT d::date,
       EXTRACT(DOY  FROM d)::int,
       trim(to_char(d,'Day')),
       EXTRACT(WEEK FROM d)::int,
       EXTRACT(MONTH FROM d)::int,
       trim(to_char(d,'Month')),
       EXTRACT(QUARTER FROM d)::int,
       EXTRACT(YEAR FROM d)::int,
       EXTRACT(ISODOW FROM d) IN (6,7)
FROM generate_series(DATE '2024-01-01', DATE '2024-01-01' + 299, INTERVAL '1 day') d;

-- --------------------------------------------------------- dim_payment_status
-- Urutan sk MENGIKUTI sort ascending status_code pada ETL (Transformasi 7):
--   Overdue=1, Paid=2, Partial=3, Pending=4  (sesuai nilai sk_payment_status di fakta).
INSERT INTO dim_payment_status (status_code, status_desc) VALUES
  ('Overdue','Tertunggak'),
  ('Paid','Lunas'),
  ('Partial','Bayar Sebagian'),
  ('Pending','Belum Bayar');

-- ----------------------------------------------------- dim_application_status
-- Data fakta memuat 5 status (termasuk 'Submitted').
INSERT INTO dim_application_status (app_status_code, app_status_desc) VALUES
  ('Approved','Disetujui'),
  ('Disbursed','Dicairkan'),
  ('Rejected','Ditolak'),
  ('Submitted','Diajukan'),
  ('Under Review','Sedang Ditinjau');

-- Verifikasi cepat jumlah baris dimensi
DO $$
BEGIN
  RAISE NOTICE 'dim_product=%, dim_customer=%, dim_branch=%, dim_employee=%, dim_collateral=%, dim_date=%',
   (SELECT count(*) FROM dim_product),(SELECT count(*) FROM dim_customer),
   (SELECT count(*) FROM dim_branch),(SELECT count(*) FROM dim_employee),
   (SELECT count(*) FROM dim_collateral_type),(SELECT count(*) FROM dim_date);
END $$;
