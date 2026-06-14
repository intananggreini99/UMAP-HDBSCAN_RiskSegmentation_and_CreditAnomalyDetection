-- ============================================================================
-- 01_ddl_star_schema.sql
-- Star Schema Bank Credit Lending  (jalankan di database: dw_bankcredit, schema public)
-- 8 Dimensi + 2 Fact Table — selaras dengan ddl_star_bankCredit.sql & ETL-PDI.
-- Penambahan: indeks foreign-key untuk mempercepat JOIN pada materialized view.
-- ============================================================================
\c dw_bankcredit
SET search_path TO public;

DROP TABLE IF EXISTS fact_loan_payment      CASCADE;
DROP TABLE IF EXISTS fact_loan_lending      CASCADE;
DROP TABLE IF EXISTS dim_customer           CASCADE;
DROP TABLE IF EXISTS dim_product            CASCADE;
DROP TABLE IF EXISTS dim_branch             CASCADE;
DROP TABLE IF EXISTS dim_employee           CASCADE;
DROP TABLE IF EXISTS dim_collateral_type    CASCADE;
DROP TABLE IF EXISTS dim_date               CASCADE;
DROP TABLE IF EXISTS dim_payment_status     CASCADE;
DROP TABLE IF EXISTS dim_application_status CASCADE;

-- ============================ DIMENSI =======================================

CREATE TABLE dim_customer (
    sk_customer    SERIAL PRIMARY KEY,
    customer_id    INTEGER NOT NULL,
    national_id    VARCHAR(20),
    full_name      VARCHAR(100),
    date_of_birth  DATE,
    occupation     VARCHAR(50),
    monthly_income NUMERIC(15,2),
    risk_segment   SMALLINT,
    email          VARCHAR(100),
    phone          VARCHAR(20),
    credit_grade   VARCHAR(3),
    bureau_source  VARCHAR(30)
);

CREATE TABLE dim_product (
    sk_product       SERIAL PRIMARY KEY,
    product_id       INTEGER NOT NULL,
    product_code     VARCHAR(15),
    product_name     VARCHAR(80),
    product_type     VARCHAR(30),
    interest_rate    NUMERIC(5,2),
    min_amount       NUMERIC(15,2),
    max_amount       NUMERIC(15,2),
    max_tenor_months INTEGER
);

CREATE TABLE dim_branch (
    sk_branch   SERIAL PRIMARY KEY,
    branch_id   INTEGER NOT NULL,
    branch_code VARCHAR(10),
    branch_name VARCHAR(100),
    city        VARCHAR(50),
    region      VARCHAR(50),
    opened_date DATE
);

CREATE TABLE dim_employee (
    sk_employee SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    full_name   VARCHAR(100),
    role        VARCHAR(40)
);

CREATE TABLE dim_collateral_type (
    sk_collateral_type SERIAL PRIMARY KEY,
    collateral_type_id INTEGER NOT NULL,
    type_name          VARCHAR(60),
    ltv_ratio          NUMERIC(5,2),
    description        VARCHAR(150)
);

CREATE TABLE dim_date (
    sk_date    SERIAL PRIMARY KEY,
    full_date  DATE NOT NULL,
    day        INTEGER,
    day_name   VARCHAR(15),
    week       INTEGER,
    month      INTEGER,
    month_name VARCHAR(15),
    quarter    INTEGER,
    year       INTEGER,
    is_weekend BOOLEAN
);

CREATE TABLE dim_payment_status (
    sk_payment_status SERIAL PRIMARY KEY,
    status_code       VARCHAR(15) NOT NULL,
    status_desc       VARCHAR(50)
);

CREATE TABLE dim_application_status (
    sk_app_status   SERIAL PRIMARY KEY,
    app_status_code VARCHAR(20) NOT NULL,
    app_status_desc VARCHAR(50)
);

-- ============================== FAKTA =======================================

CREATE TABLE fact_loan_lending (
    sk_loan_fact         SERIAL PRIMARY KEY,
    sk_customer          INTEGER REFERENCES dim_customer(sk_customer),
    sk_product           INTEGER REFERENCES dim_product(sk_product),
    sk_branch            INTEGER REFERENCES dim_branch(sk_branch),
    sk_employee          INTEGER REFERENCES dim_employee(sk_employee),
    sk_collateral_type   INTEGER REFERENCES dim_collateral_type(sk_collateral_type),
    sk_date_application  INTEGER,
    sk_date_approval     INTEGER,
    sk_date_disbursement INTEGER,
    application_id       INTEGER,
    approval_id          INTEGER,
    disbursement_id      INTEGER,
    assessment_id        INTEGER,
    pledge_id            INTEGER,
    app_status           VARCHAR(20),
    requested_amount     NUMERIC(15,2),
    approved_amount      NUMERIC(15,2),
    disbursed_amount     NUMERIC(15,2),
    tenor_months         INTEGER,
    final_rate           NUMERIC(5,2),
    dti_ratio            NUMERIC(5,2),
    pd_score             NUMERIC(5,4),
    credit_score         INTEGER,
    appraised_value      NUMERIC(15,2)
);

CREATE TABLE fact_loan_payment (
    sk_payment_fact   SERIAL PRIMARY KEY,
    sk_loan_fact      INTEGER REFERENCES fact_loan_lending(sk_loan_fact),
    sk_customer       INTEGER REFERENCES dim_customer(sk_customer),
    sk_payment_status INTEGER REFERENCES dim_payment_status(sk_payment_status),
    sk_date_paid      INTEGER,
    sk_date_due       INTEGER,
    principal         NUMERIC(15,2),
    interest          NUMERIC(15,2),
    total_paid        NUMERIC(15,2),
    days_late         INTEGER
);

-- ============================ INDEKS ========================================
CREATE INDEX idx_fll_product    ON fact_loan_lending(sk_product);
CREATE INDEX idx_fll_customer   ON fact_loan_lending(sk_customer);
CREATE INDEX idx_fll_branch     ON fact_loan_lending(sk_branch);
CREATE INDEX idx_fll_appstatus  ON fact_loan_lending(app_status);
CREATE INDEX idx_flp_loanfact   ON fact_loan_payment(sk_loan_fact);
CREATE INDEX idx_flp_paystatus  ON fact_loan_payment(sk_payment_status);
