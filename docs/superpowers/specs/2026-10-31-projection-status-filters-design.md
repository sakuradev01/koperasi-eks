# Desain Filter Multi-Status Projection Simpanan dan Invoice

## Tujuan

Menambahkan filter status multi-pilihan pada keempat route Projection (Simpanan/Invoice, Per Bulan/Per Tahun), sambil menjaga hasil awal keempat halaman tetap sama sampai pengguna menerapkan filter.

## Batas Perubahan

- Perubahan UI simpanan memakai komponen `PaymentProjectionReport` untuk mode bulanan dan tahunan.
- Perubahan UI invoice memakai `InvoiceProjectionReport` untuk mode bulanan dan tahunan.
- Backend invoice projection boleh berubah sebatas penyediaan dan penyaringan invoice berdasarkan status keseluruhan.
- Tidak ada perubahan schema/database, auth, API pembayaran, atau status transaksi simpanan.
- Perubahan lokal lain yang tidak terkait tetap dibiarkan.

## Perilaku Filter

1. Filter berupa beberapa checkbox status; beberapa status dapat dipilih sekaligus dan hasil memakai logika OR.
2. Tidak ada status yang dipilih berarti pertahankan persis data, jumlah, dan perlakuan filter yang berlaku sekarang pada route tersebut.
3. Projection Simpanan menyediakan `Aktif`, `Nonaktif`, dan `Draft`. Saat status Nonaktif/Draft dipilih, anggota tampil untuk pemeriksaan tetapi tidak menghasilkan nominal proyeksi dan tidak menambah total. Hanya anggota aktif yang tetap memenuhi aturan perhitungan proyeksi sekarang.
4. Projection Invoice menyediakan filter berdasarkan status invoice keseluruhan: `Draft`, `Sent`, `Partial`, `Paid`, dan `Overdue`. Draft hanya masuk laporan ketika pengguna memilih Draft. Status ini dibedakan dari status setiap cicilan/proyeksi.
5. Filter status cicilan yang sudah ada pada Projection Invoice bulanan tetap dipertahankan sebagai filter terpisah; menambah filter invoice tidak mengubah makna atau hasilnya secara default.
6. Filter yang diterapkan mempengaruhi baris, ringkasan/total, pagination, Excel, dan PDF sesuai data hasil filter. Batas mata uang pada invoice tetap dipertahankan.

## Antarmuka dan Persistensi

- Tampilkan kontrol checkbox multi-pilihan dengan label yang jelas, responsif, dan dapat digunakan dengan keyboard.
- Filter diterapkan lewat tombol Terapkan yang sudah ada; filter pencarian/pagination tetap bekerja.
- Nilai filter tersimpan di query URL agar pilihan dapat dibagikan atau dipulihkan saat reload.
- Aksi mengosongkan pilihan status kembali ke default lama, bukan memilih semua status baru secara implisit.
- Filter tersedia di empat route: `/laporan/per-bulan`, `/laporan/per-tahun`, `/reports/invoice-projections/per-bulan`, dan `/reports/invoice-projections/per-tahun`.

## Data dan Hitungan

- Simpanan: setiap baris membawa status keanggotaan untuk tampilan/filter. Baris Draft/Nonaktif diberi penanda tidak masuk proyeksi; hanya baris aktif yang berkontribusi terhadap nilai per periode dan total.
- Invoice: status invoice keseluruhan menjadi field tersendiri agar tidak tertukar dengan status cicilan bulanan. Status efektif mengikuti aturan status invoice yang sudah ada, termasuk overdue. API mengembalikan invoice Draft hanya saat status Draft dipilih; tanpa pilihan, endpoint mempertahankan pengecualian Draft saat ini.
- Nilai proyeksi, realisasi, carry-over, dan alokasi tetap menggunakan logika existing; filter hanya memilih baris yang masuk cakupan laporan.

## Pengujian dan Kriteria Selesai

- Default tanpa filter menghasilkan baris, total, dan ekspor yang sama seperti sebelumnya.
- Simpanan: filter multi-status menampilkan anggota yang sesuai; Draft/Nonaktif tidak pernah menambah total; kombinasi Active + Draft hanya menjumlahkan Active.
- Invoice: status keseluruhan memfilter kedua mode; Draft tidak muncul secara default dan muncul saat dipilih; kombinasi status memakai OR.
- Filter cicilan invoice bulanan tetap berfungsi terpisah.
- Ringkasan, pagination, Excel, dan PDF mengikuti hasil filter; mata uang invoice tetap dihitung terpisah.
- Jalankan tes terkait, ESLint file tersentuh, build client, tes backend invoice projection, dan `git diff --check`.
- Commit implementasi hanya file yang termasuk scope dan push ke `main`; push memicu workflow CI/CD repo.
