# Bank Credit Risk Dashboard

Dashboard executive untuk analisis credit lending:

- KPI ringkas di bagian atas
- Profil cluster UMAP + HDBSCAN — grafik batang bertumpuk (skor ternormalisasi per variabel kunci)
- **Bubble chart ukuran cluster** — LUAS gelembung sebanding lurus dengan jumlah pinjaman (n)
  tiap cluster. Gelembung diurutkan dari n terbesar ke terkecil + diberi label angka/persen,
  sehingga ukuran selalu monoton & mudah dibaca (n lebih besar = gelembung lebih besar).
- Top 5 produk dengan default rate tertinggi
- Top 3 risk segment dengan ROI terbaik
- Top 3 customer segment dengan profitabilitas tertinggi

## Sumber data — PostgreSQL via Python (tanpa fallback)

Karena akses database **langsung dari PHP** tidak tersedia di lingkungan ini
(umumnya ekstensi `pdo_pgsql` belum aktif), pengambilan data dilakukan oleh
**Python**, dan PHP hanya menyajikan hasilnya. Alurnya:

```
PostgreSQL (Docker, dw_bankcredit)
     |  getdata_dw_bankcredit.py        (psycopg2 — satu-satunya yang konek DB)
     v
getdata_dw_bankcredit.json              (hasil ekspor)
     |  api/data.php                    (hanya MEMBACA berkas JSON ini)
     v
dashboard  (assets/js/main.js -> fetch api/data.php)
```

- **`api/data.php` tidak menyentuh database** dan tidak butuh `pdo_pgsql`. Ia mencari
  `getdata_dw_bankcredit.json`, memvalidasinya, lalu mengirimkannya sebagai JSON.
- **Tidak ada** fallback `sample_data.json` (berkas itu sudah dihapus dari alur,
  baik di `api/data.php` maupun `assets/js/main.js`).
- Bila berkas JSON belum dibuat / tidak valid, `api/data.php` mengembalikan
  **HTTP 503 + pesan error** dan dashboard menampilkan status error yang jelas —
  bukan data palsu.

### Langkah pakai

```bash
# 1) sekali saja: pasang driver PostgreSQL untuk Python
pip install psycopg2-binary

# 2) ambil data dari database -> tulis getdata_dw_bankcredit.json
python getdata_dw_bankcredit.py
```

Bila skrip dijalankan dari folder yang berdampingan dengan `dashboard/`, berkas JSON
otomatis ditulis ke **`dashboard/data/getdata_dw_bankcredit.json`** (lokasi pertama yang
dicari `data.php`). Jika Anda menjalankannya di tempat lain, salin berkas hasilnya ke
`dashboard/data/`, atau set environment `GETDATA_JSON` ke path absolutnya.

`data.php` mencari berkas pada urutan: `GETDATA_JSON` (env) → `dashboard/data/` →
`dashboard/` → folder induk `dashboard/` → direktori kerja.

### Konfigurasi koneksi database (di `getdata_dw_bankcredit.py`)

```python
DB_HOST = "127.0.0.1"     # atau nama service/container bila Python di dalam Docker
DB_PORT = "9999"          # port publish container; di DALAM Docker biasanya 5432
DB_NAME = "dw_bankcredit" # nama database (sesuai skrip SQL & notebook)
DB_USER = "postgres"
DB_PASS = "intan999"
```

Semua bisa di-override lewat environment variable standar PostgreSQL:

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=dw_bankcredit \
PGUSER=postgres PGPASSWORD=intan999 python getdata_dw_bankcredit.py
```

> Catatan: `api/db.php` (konfigurasi koneksi PHP-PDO lama) masih disertakan untuk referensi,
> namun **tidak lagi dipakai** oleh dashboard karena jalur data sekarang lewat Python.

> Berkas `dashboard/data/getdata_dw_bankcredit.json` yang ikut dalam paket ini adalah
> **pratinjau** yang dibangun dari CSV; jalankan `getdata_dw_bankcredit.py` terhadap
> database asli untuk menimpanya dengan data sebenarnya. (Lihat `meta.note` di dalam berkas.)
