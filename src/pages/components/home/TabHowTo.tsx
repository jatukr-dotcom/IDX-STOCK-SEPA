/**
 * Copyright (c) 2026 IDX Screener by @NeaByteLab (https://neabyte.com)
 * SPDX-License-Identifier: MIT
 *
 * Open to remote work & consulting.
 * Fullstack developer with a focus on security and experience in trading systems.
 */

import React from 'react'

export default function TabHowTo() {
  return (
    <div className='idx-home-article'>
      <h2 className='idx-home-h2'>Cara Menggunakan Screener</h2>
      <p className='idx-home-p'>
        Dari <strong>Beranda</strong>, klik menu <strong>Screener</strong>{' '}
        di navigasi atas untuk masuk ke halaman{' '}
        <strong>screener</strong>. Daftar kandidat diurutkan berdasarkan skor gabungan (<strong>
          composite
        </strong>). Berikut bagian utama dan cara menggunakannya.
      </p>
      <h3 className='idx-home-h3'>1. Header (Ringkasan &amp; Data)</h3>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          <strong>Data Kandidat</strong>: Jumlah emiten yang lolos filter dan tampil di daftar.
        </li>
        <li className='idx-home-li'>
          <strong>Tanggal Data</strong>{' '}
          : Tanggal referensi data fundamental dan ringkasan perdagangan (format YYYY-MM-DD).
        </li>
        <li className='idx-home-li'>
          Tombol <strong>Muat Ulang Data</strong>{' '}
          (ikon refresh): Kirim ulang permintaan ke server dan perbarui tabel. Gunakan setelah
          mengubah filter atau untuk memastikan data terbaru.
        </li>
      </ul>
      <h3 className='idx-home-h3'>2. Filter Kandidat</h3>
      <ol className='idx-home-list idx-home-ol'>
        <li className='idx-home-li'>
          Klik panel <strong>Filter Kandidat</strong>{' '}
          untuk membuka/menutup (expand/collapse) blok filter.
        </li>
        <li className='idx-home-li'>
          Atur parameter: sektor (tampilan), valuasi (<strong>PER</strong> Min/Max), fundamental (
          <strong>ROE</strong> Min, <strong>DER</strong> Max), momentum (periode{' '}
          <strong>26w</strong>/<strong>52w</strong>, <strong>Momentum Min</strong>{' '}
          %), likuiditas (Min <strong>Value</strong>, Min{' '}
          <strong>Volume</strong>), dan opsi eksklusi (
          <strong>notation</strong>, <strong>corporate action</strong>, <strong>UMA</strong>).
        </li>
        <li className='idx-home-li'>
          Klik <strong>Terapkan Filter</strong> agar parameter dikirim ke <strong>server</strong>
          {' '}
          dan tabel diperbarui.
        </li>
        <li className='idx-home-li'>
          Klik <strong>Reset Ke Default</strong> untuk mengembalikan semua filter ke setelan awal.
        </li>
      </ol>
      <h3 className='idx-home-h3'>3. Tabel Kandidat</h3>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          <strong>Kotak pencarian</strong>{' '}
          : Ketik kode emiten, nama, atau sektor untuk memfilter baris yang tampil (filter di
          browser, tidak mengubah total dari <strong>API</strong>).
        </li>
        <li className='idx-home-li'>
          Kolom tabel: Kode, Nama Emiten, Sektor, <strong>PER</strong>, <strong>ROE</strong>,{' '}
          <strong>DER</strong>, <strong>26w</strong> (%), <strong>52w</strong> (%),{' '}
          <strong>Comp (%)</strong> (<strong>persentil</strong>{' '}
          <strong>composite</strong>). Baris diurutkan dari skor tertinggi.
        </li>
        <li className='idx-home-li'>
          <strong>Paginasi</strong>{' '}
          : Tombol Sebelumnya/Selanjutnya untuk pindah halaman. Teks &quot;Baris X-Y Dari Z&quot;
          menunjukkan rentang dan total.
        </li>
        <li className='idx-home-li'>
          Klik <strong>satu baris</strong> untuk membuka modal <strong>Detail Saham</strong>.
        </li>
      </ul>
      <h3 className='idx-home-h3'>4. Pilih Sektor</h3>
      <p className='idx-home-p'>
        Dropdown <strong>Pilih Sektor</strong>{' '}
        di panel Filter Kandidat memfilter tampilan tabel per sektor. Pilih &quot;Semua&quot; untuk
        menampilkan seluruh kandidat. Filter ini hanya mengubah tampilan, tidak mengubah total
        kandidat dari <strong>server</strong>.
      </p>
      <h3 className='idx-home-h3'>5. Kekuatan Sektor (Sidebar)</h3>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          Widget di sisi kanan menampilkan rata-rata momentum per sektor (naik/turun/netral).
        </li>
        <li className='idx-home-li'>
          Tab <strong>26w</strong> / <strong>52w</strong> memilih horizon return yang ditampilkan.
        </li>
        <li className='idx-home-li'>
          Berguna untuk konteks makro: sektor mana yang secara agregat sedang positif atau negatif.
        </li>
      </ul>
      <h3 className='idx-home-h3'>6. Detail Saham (Modal)</h3>
      <p className='idx-home-p idx-home-p-mb8'>
        Klik baris saham di tabel untuk membuka modal <strong>Detail Saham</strong>. Berisi:
      </p>
      <ol className='idx-home-list idx-home-ol'>
        <li className='idx-home-li'>
          <strong>Klasifikasi</strong>: Sektor dan industri.
        </li>
        <li className='idx-home-li'>
          <strong>Valuasi, Profitabilitas, Leverage</strong>: <strong>PER</strong>,{' '}
          <strong>PBV</strong>, <strong>ROE</strong>, <strong>ROA</strong>, <strong>DER</strong>.
        </li>
        <li className='idx-home-li'>
          <strong>Likuiditas</strong>: <strong>Value</strong> (nilai transaksi) dan{' '}
          <strong>volume</strong>.
        </li>
        <li className='idx-home-li'>
          <strong>Skor</strong>: <strong>Value</strong>, <strong>Quality</strong>,{' '}
          <strong>Momentum</strong>, <strong>Composite</strong> (0-1).
        </li>
        <li className='idx-home-li'>
          <strong>Momentum</strong>: Return <strong>4w</strong>, <strong>13w</strong>,{' '}
          <strong>26w</strong>, <strong>52w</strong> (%).
        </li>
        <li className='idx-home-li'>
          <strong>Grafik harga (OHLC)</strong>{' '}
          : Close 90 hari terakhir. Tutup modal dengan tombol X atau klik di luar modal.
        </li>
      </ol>
      <p className='idx-home-note'>
        Gunakan informasi di <strong>screener</strong> dan <strong>detail saham</strong>{' '}
        sebagai awal riset, bukan satu-satunya dasar keputusan. Selalu lakukan riset mandiri dan
        pertimbangkan risiko pasar serta kondisi emiten sebelum berinvestasi.
      </p>
      <h3 className='idx-home-h3'>7. Pembaruan Data</h3>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          Data diperbarui secara berkala (cron). Tanggal data tercantum di header{' '}
          <strong>screener</strong>.
        </li>
        <li className='idx-home-li'>
          Jika tidak ada data untuk hari ini, sistem memakai tanggal terakhir yang tersedia untuk
          {' '}
          <strong>likuiditas</strong> dan indikator berbasis summary.
        </li>
      </ul>

      <h3 className='idx-home-h3'>8. Stage Analysis (Volume A/D)</h3>
      <p className='idx-home-p idx-home-p-mb8'>
        Setiap saham berada di salah satu dari <strong>4 stage</strong> siklus pasar:
      </p>
      <ol className='idx-home-list idx-home-ol'>
        <li className='idx-home-li'>
          <strong>Stage 1 — Akumulasi</strong>: Harga bergerak sideways setelah downtrend. MA200
          mulai mendatar. Fase dimana smart money mulai mengumpulkan saham.
        </li>
        <li className='idx-home-li'>
          <strong>Stage 2 — Uptrend (Mark-Up)</strong>: Harga di atas MA50 &gt; MA150 &gt; MA200,
          MA200 naik. Ini adalah <strong>fase ideal untuk membeli</strong>.
        </li>
        <li className='idx-home-li'>
          <strong>Stage 3 — Distribusi</strong>: Harga mulai bergerak sideways di atas MA200 yang
          mendatar. Smart money mulai menjual — <strong>hindari pembelian baru</strong>.
        </li>
        <li className='idx-home-li'>
          <strong>Stage 4 — Downtrend (Mark-Down)</strong>: Harga di bawah MA200 yang menurun. Saham
          dalam fase bearish — <strong>jangan ditahan</strong>.
        </li>
      </ol>
      <p className='idx-home-p'>
        Volume akumulasi/distribusi (A/D) menunjukkan apakah volume mendukung tren harga. Volume
        tinggi pada hari naik = akumulasi (bullish), volume tinggi pada hari turun = distribusi
        (bearish).
      </p>

      <h3 className='idx-home-h3'>9. SEPA &amp; Trend Template</h3>
      <p className='idx-home-p idx-home-p-mb8'>
        Skor <strong>SEPA</strong>{' '}
        (Specific Entry Point Analysis) menilai kesesuaian saham dengan template trend Mark
        Minervini. Delapan kriteria yang diperiksa:
      </p>
      <ol className='idx-home-list idx-home-ol'>
        <li className='idx-home-li'>Harga di atas MA150 dan MA200</li>
        <li className='idx-home-li'>MA150 di atas MA200</li>
        <li className='idx-home-li'>MA200 trending naik (slope positif)</li>
        <li className='idx-home-li'>MA50 di atas MA150 dan MA200</li>
        <li className='idx-home-li'>Harga di atas MA50</li>
        <li className='idx-home-li'>Harga minimal 30% di atas low 52 minggu</li>
        <li className='idx-home-li'>Harga dalam jarak 25% dari high 52 minggu</li>
        <li className='idx-home-li'>RS Rank ≥ 70</li>
      </ol>
      <p className='idx-home-p'>
        Skor SEPA = persentase kriteria yang terpenuhi, dikombinasikan dengan skor RS dan
        pertumbuhan EPS. Semakin tinggi skor, semakin ideal setup teknikal saham tersebut.
      </p>

      <h3 className='idx-home-h3'>10. New High &amp; RS Ranking</h3>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          <strong>RS Rank</strong>: Persentil kekuatan relatif saham dibandingkan seluruh saham
          lain. RS Rank 90 berarti saham tersebut lebih kuat dari 90% saham lainnya. Dihitung dari
          return 3, 6, 9, dan 12 bulan (bobot 40/20/20/20).
        </li>
        <li className='idx-home-li'>
          <strong>RS Line New High</strong>: Terdeteksi saat RS Line (harga saham ÷ IHSG) mencapai
          titik tertinggi baru. Sinyal bahwa saham outperform pasar secara relatif.
        </li>
        <li className='idx-home-li'>
          <strong>Breakout New High</strong>: Saham yang mencetak harga tertinggi baru 52 minggu —
          sering menjadi tanda kelanjutan uptrend kuat.
        </li>
      </ul>

      <h3 className='idx-home-h3'>11. Analisis Teknikal (Detail Saham)</h3>
      <p className='idx-home-p idx-home-p-mb8'>
        Klik saham untuk melihat halaman detail teknikal lengkap. Fitur yang tersedia:
      </p>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          <strong>Chart Candlestick</strong>: Grafik OHLC interaktif dengan MA10, MA20, MA50
          overlay.
        </li>
        <li className='idx-home-li'>
          <strong>Support &amp; Resistance</strong>: Level S/R otomatis berdasarkan cluster swing
          point, dilengkapi kekuatan level (strong/moderate/weak).
        </li>
        <li className='idx-home-li'>
          <strong>Fibonacci Retracement</strong>: Level Fibonacci otomatis dari swing high/low (0%,
          23.6%, 38.2%, 50%, 61.8%, 78.6%, 100%).
        </li>
        <li className='idx-home-li'>
          <strong>MACD</strong>: MACD Line, Signal Line, dan Histogram untuk mengidentifikasi
          momentum dan crossover.
        </li>
        <li className='idx-home-li'>
          <strong>RSI</strong>: Relative Strength Index (14) dengan zona oversold (&lt;30) dan
          overbought (&gt;70).
        </li>
        <li className='idx-home-li'>
          <strong>Stochastic RSI</strong>: %K dan %D untuk sinyal lebih sensitif di area
          oversold/overbought.
        </li>
        <li className='idx-home-li'>
          <strong>CMF, MFI, OBV</strong>: Indikator volume — Chaikin Money Flow, Money Flow Index,
          dan On-Balance Volume untuk konfirmasi tren via aliran dana.
        </li>
      </ul>

      <h3 className='idx-home-h3'>12. Sinyal Divergence</h3>
      <p className='idx-home-p idx-home-p-mb8'>
        Divergence mendeteksi ketidaksinkronan antara harga dan indikator, menandakan potensi
        pembalikan arah:
      </p>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          <strong>Bullish Divergence</strong>: Harga mencetak <em>lower low</em>{' '}
          tapi indikator mencetak{' '}
          <em>higher low</em>. Menandakan tekanan jual melemah — potensi reversal naik. Hanya valid
          jika RSI &lt; 40 (dekat oversold).
        </li>
        <li className='idx-home-li'>
          <strong>Bearish Divergence</strong>: Harga mencetak <em>higher high</em>{' '}
          tapi indikator mencetak{' '}
          <em>lower high</em>. Menandakan momentum beli melemah — potensi reversal turun. Hanya
          valid jika RSI &gt; 60 (dekat overbought).
        </li>
        <li className='idx-home-li'>
          Divergence dideteksi pada RSI dan Stochastic RSI. Menggunakan 5-bar pivot pada 90 bar
          terakhir. Maksimal 5 sinyal terbaru ditampilkan.
        </li>
      </ul>

      <h3 className='idx-home-h3'>13. Rekomendasi AI</h3>
      <p className='idx-home-p idx-home-p-mb8'>
        Fitur AI Recommendation menilai dan meranking saham-saham berpotensi tinggi. Tersedia 3
        mode:
      </p>
      <ol className='idx-home-list idx-home-ol'>
        <li className='idx-home-li'>
          <strong>Teknikal</strong>: Berdasarkan SEPA, Stage, RS Rank, pocket pivot, base pattern,
          dan RS Line.
        </li>
        <li className='idx-home-li'>
          <strong>Fundamental</strong>: Berdasarkan pertumbuhan EPS, ROE, NPM, DER, pertumbuhan
          revenue, dan PER.
        </li>
        <li className='idx-home-li'>
          <strong>Gabungan (Combined)</strong>: Skor = Teknikal × 60% + Fundamental × 40%.
        </li>
      </ol>
      <p className='idx-home-p'>
        Saham dengan skor gorengan tinggi (notasi X, UMA, market cap kecil, float rendah) otomatis
        dieksklusi. Saham di <strong>Stage 3</strong> (distribusi) dan <strong>Stage 4</strong>{' '}
        (markdown) juga dieksklusi karena berada di fase bearish.
      </p>

      <h3 className='idx-home-h3'>14. Ekspor PDF</h3>
      <p className='idx-home-p'>
        Di halaman detail saham, klik tombol <strong>Ekspor PDF</strong>{' '}
        untuk mengunduh laporan lengkap per emiten. Laporan berisi ringkasan fundamental, skor
        teknikal, chart, dan indikator — siap untuk analisis offline atau presentasi.
      </p>

      <h3 className='idx-home-h3'>15. Watchlist</h3>
      <ul className='idx-home-ul'>
        <li className='idx-home-li'>
          Klik ikon <strong>★</strong> (bintang) pada baris saham untuk menambahkan ke watchlist.
        </li>
        <li className='idx-home-li'>
          Klik lagi ikon bintang yang sudah aktif untuk menghapus dari watchlist.
        </li>
        <li className='idx-home-li'>
          Watchlist tersimpan di browser (localStorage) dan akan bertahan antar sesi. Gunakan
          watchlist untuk memantau saham-saham pilihan secara cepat.
        </li>
      </ul>

      <h3 className='idx-home-h3'>16. Narasi di Claude</h3>
      <p className='idx-home-p'>
        Tombol <strong>&quot;Narasi di Claude&quot;</strong>{' '}
        tersedia di halaman AI Recommendation. Saat diklik, sistem mengirim data top 10 saham ke
        Claude AI untuk menghasilkan narasi pasar singkat (3-4 paragraf). Narasi berisi ringkasan
        sektor kuat, kesamaan setup, dan konteks pasar — berguna sebagai rangkuman cepat. Narasi
        di-cache selama 1 jam.
      </p>

      <p className='idx-home-note'>
        Gunakan informasi di <strong>screener</strong> dan <strong>detail saham</strong>{' '}
        sebagai awal riset, bukan satu-satunya dasar keputusan. Selalu lakukan riset mandiri dan
        pertimbangkan risiko pasar serta kondisi emiten sebelum berinvestasi.
      </p>
      <p className='idx-home-p idx-home-p-mb0'>
        Data fundamental dan ringkasan perdagangan bersumber dari data resmi. Skor dan filter
        bersifat informatif.
      </p>
    </div>
  )
}
