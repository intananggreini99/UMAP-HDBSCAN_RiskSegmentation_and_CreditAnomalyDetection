<?php
/**
 * db.php — Koneksi PDO ke PostgreSQL (data warehouse bank credit).
 *
 * Sumber data dashboard HANYA dari database ini. Tidak ada fallback JSON.
 *
 * ----------------------------------------------------------------------------
 *  KONFIGURASI KONEKSI  (ubah di sini bila perlu, atau lewat environment var)
 * ----------------------------------------------------------------------------
 *  Skenario: PostgreSQL berjalan di dalam container Docker.
 *   - Jika PHP (mis. XAMPP) berjalan di HOST  -> host '127.0.0.1' + port publish.
 *   - Jika PHP berjalan di dalam Docker juga  -> host = nama service/container
 *                                                 (mis. 'postgresdb') + port 5432.
 *
 *  CATATAN NAMA DATABASE:
 *   Seluruh skrip SQL (01_ddl_star_schema.sql, 04_analysis_schema.sql,
 *   05_materialized_views.sql), notebook, dan nama berkas ekspor
 *   (getdata_dw_bankcredit.json) memakai database **dw_bankcredit** —
 *   di situlah schema `analysis` + materialized view sebenarnya berada.
 *   Default di bawah karena itu 'dw_bankcredit'. Bila container Anda benar-benar
 *   bernama 'dw_credit', cukup ubah satu baris DB_NAME di bawah (atau set env
 *   PGDATABASE=dw_credit).
 */

const DB_HOST = '127.0.0.1';     // host PostgreSQL (atau nama container Docker)
const DB_PORT = '9999';          // port (9999 = port publish pada setup ini; di dalam Docker biasanya 5432)
const DB_NAME = 'dw_bankcredit'; // <-- ganti ke 'dw_credit' bila itu nama database Anda
const DB_USER = 'postgres';
const DB_PASS = 'intan999';

function dbConfig(): array {
    return [
        'host' => getenv('PGHOST')     ?: DB_HOST,
        'port' => getenv('PGPORT')     ?: DB_PORT,
        'db'   => getenv('PGDATABASE') ?: DB_NAME,
        'user' => getenv('PGUSER')     ?: DB_USER,
        'pass' => getenv('PGPASSWORD') ?: DB_PASS,
    ];
}

/**
 * getPDO(): mengembalikan koneksi PDO PostgreSQL, atau melempar Exception
 * (TIDAK mengembalikan null secara diam-diam) agar kegagalan koneksi terlihat
 * jelas di front-end — sesuai kebijakan "data hanya dari database".
 *
 * @return PDO
 * @throws RuntimeException|PDOException
 */
function getPDO(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;

    if (!extension_loaded('pdo_pgsql')) {
        throw new RuntimeException(
            'Ekstensi PHP pdo_pgsql belum aktif. Aktifkan di php.ini ' .
            '(hapus tanda ; pada extension=pdo_pgsql) lalu restart server.'
        );
    }

    $c = dbConfig();
    $dsn = sprintf(
        "pgsql:host=%s;port=%s;dbname=%s;options='-c search_path=analysis,public'",
        $c['host'], $c['port'], $c['db']
    );

    $pdo = new PDO($dsn, $c['user'], $c['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT            => 5,
    ]);
    return $pdo;
}
