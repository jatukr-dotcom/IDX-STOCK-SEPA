<div align="center">

# IDX-STOCK-SEPA

Screener saham Indonesia dengan metode Minervini SEPA: analisis pakai data, bukan feeling.

[![Deno](https://img.shields.io/badge/deno-2.7.4-000000?logo=deno&logoColor=ffcb00)](https://deno.com) [![price](https://img.shields.io/badge/price-free-22c55e)](https://github.com/jatukr-dotcom/IDX-STOCK-SEPA) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

## Fitur Utama

- **SEPA Candidates** — Filter kandidat saham berdasarkan kriteria Minervini SEPA (Specific Entry Point Analysis): trend template, RS ranking, EPS growth.
- **Trend Template** — Daftar saham yang memenuhi 8 kriteria trend template Minervini (MA50 > MA150 > MA200, harga di atas semua MA, dll).
- **RS Ranking** — Peringkat kekuatan relatif (Relative Strength) saham terhadap seluruh pasar IDX.
- **New Highs 52W** — Daftar saham yang mencetak harga tertinggi 52 minggu.
- **Screener** — Filter saham fundamental dan momentum, eksklusi risiko, pagination.
- **Skor komposit** — Skor gabungan value, quality, momentum; bobot diatur; peringkat sektor.
- **Kekuatan sektor** — Pie chart kekuatan sektor, periode 26 atau 52 minggu.
- **Detail saham** — Modal tab fundamental, teknikal (OHLC, RSI, foreign flow), dan EPS historis.
- **EPS Historis** — Data EPS per kuartal (Q1–Q4) tahun 2022–2025, dihitung dari `profitAttrOwner / shares` untuk akurasi per saham.
- **Watchlist** — Simpan saham favorit pakai bintang, untuk akses data yang lebih cepat.
- **API + SQLite** — Backend Deno, data di SQLite, cron tiap jam fetch data IDX.

## Instalasi

**Prasyarat:** [Git](https://git-scm.com/install/windows) (untuk clone) dan [Deno](https://docs.deno.com/runtime/getting_started/installation/) (sebagai runtime)

**1. Clone repo**

```bash
git clone https://github.com/jatukr-dotcom/IDX-STOCK-SEPA.git
cd IDX-STOCK-SEPA
```

**2. Setup database**

Dari root proyek, jalankan:

```bash
deno task db:generate
deno task db:push
deno task db:init
```

- `db:generate` — buat file migrasi SQL dari schema, saat pertama kali.
- `db:push` — menerapkan skema ke SQLite (membuat/update tabel).
- `db:init` — mengisi data awal (snapshot screener, summary).

**3. Fetch data EPS historis (2022–2025)**

```bash
deno task db:fetch-eps
```

Mengambil data EPS Q1–Q4 untuk semua saham dari IDX API. Cukup dijalankan sekali (data historis tidak berubah). Jalankan ulang setiap kuartal baru tersedia.

## Cara Menjalankan

### Production

```bash
deno task ui:build && deno task api:serve
```

Akses di `http://127.0.0.1:50270` atau `http://localhost:50270`.

> [!IMPORTANT]
> Cronjob akan otomatis mengambil data setiap jam (jadwal: menit 0).

### Development

**Terminal 1 — API:**

```bash
deno task api:dev
```

**Terminal 2 — UI:**

```bash
deno task ui:dev
# Akses di `http://127.0.0.1:50260`
```

## Tasks

| Perintah | Keterangan |
|---|---|
| `deno task api:serve` | Jalankan API server (production) |
| `deno task api:dev` | Jalankan API server dengan watch mode |
| `deno task ui:build` | Build UI untuk production |
| `deno task ui:dev` | Jalankan UI dev server |
| `deno task db:push` | Terapkan skema ke database |
| `deno task db:init` | Isi data awal |
| `deno task db:fetch-eps` | Fetch data EPS historis Q1–Q4 dari IDX |
| `deno task check` | Format, lint, dan typecheck |

## Lisensi

Proyek ini dilisensikan di bawah MIT. Lihat berkas [LICENSE](LICENSE) untuk detail.
