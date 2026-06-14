-- ============================================================================
-- 00_create_database.sql
-- Project : Bank Credit Lending — Eksplorasi Data & Data Mining Analysis
-- Engine  : PostgreSQL 15+
-- Tujuan  : Membuat database Data Warehouse (dw_bankcredit) + skema kerja.
-- ----------------------------------------------------------------------------
-- Jalankan blok ini SATU KALI sebagai superuser (mis. user "postgres"),
-- dari koneksi ke database lain (mis. "postgres"), karena CREATE DATABASE
-- tidak boleh dijalankan di dalam transaksi terhadap database itu sendiri.
-- ============================================================================

-- 1) Buat database Data Warehouse (sesuai instruksi: dw_bankcredit)
--    Catatan: header DDL asli menyebut "star_bank_credit"; pada proyek ini
--    seluruh objek ditempatkan di database dw_bankcredit sesuai permintaan.
DROP DATABASE IF EXISTS dw_bankcredit;
CREATE DATABASE dw_bankcredit
    WITH ENCODING = 'UTF8'
         LC_COLLATE = 'en_US.UTF-8'
         LC_CTYPE   = 'en_US.UTF-8'
         TEMPLATE   = template0;

COMMENT ON DATABASE dw_bankcredit IS
    'Data Warehouse Bank Credit Lending (Star Schema) + skema analisis data mining';

-- ----------------------------------------------------------------------------
-- SELANJUTNYA: hubungkan koneksi Anda ke database dw_bankcredit, lalu jalankan
-- skrip 01..05 secara berurutan. Di psql:   \c dw_bankcredit
-- ----------------------------------------------------------------------------

-- 2) Skema kerja (dijalankan SETELAH \c dw_bankcredit)
--    - public   : tabel Star Schema hasil ETL (8 dimensi + 2 fakta)
--    - analysis : hasil data mining (clustering) + materialized view bisnis
\c dw_bankcredit

CREATE SCHEMA IF NOT EXISTS analysis AUTHORIZATION CURRENT_USER;
COMMENT ON SCHEMA analysis IS
    'Hasil clustering UMAP+HDBSCAN dan materialized view analitik (Top Produk/Risk/Customer)';

-- Ekstensi opsional (mempercepat agregasi & statistik); abaikan bila tak tersedia.
-- CREATE EXTENSION IF NOT EXISTS tablefunc;
