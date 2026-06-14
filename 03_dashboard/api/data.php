<?php
/**
 * data.php — Endpoint JSON untuk dashboard.
 *
 * MODE: PHP DI SINI TIDAK MENYENTUH DATABASE.
 * Pengambilan data dari PostgreSQL dilakukan oleh getdata_dw_bankcredit.py
 * (Python). Skrip itu menulis berkas getdata_dw_bankcredit.json, dan data.php
 * hanya membaca + menyajikan berkas tersebut. Jadi server PHP TIDAK butuh
 * ekstensi pdo_pgsql.
 *
 *   PostgreSQL (Docker, dw_bankcredit)
 *        |  getdata_dw_bankcredit.py  (psycopg2)
 *        v
 *   getdata_dw_bankcredit.json
 *        |  data.php  (relay berkas ini)
 *        v
 *   dashboard (main.js -> fetch api/data.php)
 *
 * TIDAK ADA fallback sample_data.json. Bila berkas JSON belum dibuat atau tidak
 * valid -> HTTP 503 + pesan error JSON (dashboard menampilkan kartu error).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

const DB_LABEL  = 'dw_bankcredit';                 // hanya untuk label/pesan
const JSON_NAME = 'getdata_dw_bankcredit.json';

function errorOut(string $message, int $status = 503): void {
    http_response_code($status);
    echo json_encode([
        'error' => $message,
        'meta'  => ['source' => 'postgresql', 'db' => DB_LABEL, 'live' => false, 'error' => $message],
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Cari berkas getdata_dw_bankcredit.json di beberapa lokasi yang masuk akal.
 * Urutan: env GETDATA_JSON (path absolut) -> dashboard/data/ -> dashboard/ ->
 * induk dashboard/ (root proyek) -> direktori kerja.
 */
function locateJson(): ?string {
    $candidates = [];
    $env = getenv('GETDATA_JSON');
    if ($env) $candidates[] = $env;                     // override absolut
    $candidates[] = __DIR__ . '/../data/' . JSON_NAME;  // dashboard/data/  (disarankan)
    $candidates[] = __DIR__ . '/../' . JSON_NAME;       // dashboard/
    $candidates[] = __DIR__ . '/../../' . JSON_NAME;    // root proyek (induk folder dashboard/)
    $cwd = getcwd();
    if ($cwd) $candidates[] = $cwd . '/' . JSON_NAME;   // direktori kerja
    foreach ($candidates as $p) {
        if ($p && is_file($p) && is_readable($p)) return $p;
    }
    return null;
}

$path = locateJson();
if ($path === null) {
    errorOut(
        'Berkas ' . JSON_NAME . ' belum ada. Jalankan dulu: '
        . 'python getdata_dw_bankcredit.py (mengambil data dari PostgreSQL '
        . 'dan menulis ' . JSON_NAME . '). Letakkan berkas itu di folder '
        . 'dashboard/data/ (atau set environment GETDATA_JSON ke path-nya).',
        503
    );
}

$raw = @file_get_contents($path);
if ($raw === false) {
    errorOut('Gagal membaca berkas ' . basename($path) . ' (' . $path . ').', 503);
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    errorOut('Isi ' . basename($path) . ' bukan JSON yang valid. '
           . 'Buat ulang dengan: python getdata_dw_bankcredit.py.', 503);
}

// Validasi minimal: pastikan ini benar-benar hasil export, bukan berkas lain.
foreach (['kpi', 'clusters', 'algo_comparison'] as $k) {
    if (!array_key_exists($k, $data)) {
        errorOut('Berkas ' . basename($path) . ' tidak memuat kunci "' . $k
               . '" — sepertinya bukan keluaran getdata_dw_bankcredit.py. '
               . 'Jalankan ulang skrip Python tersebut.', 503);
    }
}

// Lengkapi meta: beri tahu dashboard asal data + seberapa baru berkasnya.
$meta  = (isset($data['meta']) && is_array($data['meta'])) ? $data['meta'] : [];
$mtime = @filemtime($path) ?: null;
$meta['source']    = $meta['source'] ?? 'postgresql';
$meta['db']        = $meta['db'] ?? DB_LABEL;
$meta['live']      = true;                       // data berasal dari DB (via Python) -> dashboard merender
$meta['mode']      = 'python-json';              // dibaca dari snapshot Python, bukan query PHP
$meta['served_by'] = 'php (membaca ' . JSON_NAME . ')';
$meta['json_file'] = $path;
if ($mtime !== null) {
    $meta['json_mtime']       = date('c', $mtime);
    $meta['json_age_seconds'] = max(0, time() - $mtime);
}
$data['meta'] = $meta;

http_response_code(200);
echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
