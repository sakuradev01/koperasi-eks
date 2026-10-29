# Desain Pengajuan Penutupan dan Penarikan Tabungan

## Tujuan

Menambahkan alur penutupan tabungan yang dapat diajukan siswa dari Student Dashboard atau dicatat Finance untuk data lama, diproses melalui Expense Koperasi, tercatat satu kali di transaksi, dan menampilkan status serta bukti pencairan kepada siswa.

## Batas Aplikasi

- Koperasi (`koperasi-eks`) adalah sumber kebenaran untuk aturan tabungan, eligibility, pengajuan, Expense, persetujuan Finance, transaksi, dan status pembayaran.
- Student Dashboard menjadi antarmuka siswa melalui API Koperasi yang terautentikasi. Tidak ada logika keuangan/eligibility yang dihitung hanya di browser siswa.
- Aplikasi `finance.samit.co.id`, `uat-fin1`, database, dan runtime Finance tidak termasuk scope.

## Aturan Domain

1. Fitur pengajuan oleh siswa memiliki toggle global di Settings Koperasi, default `false`.
2. Siswa dapat mengajukan bila sekurangnya 12 periode tabungan yang berbeda sudah lunas dan disetujui Finance. Jumlah baris transfer tidak digunakan sebagai hitungan periode.
3. Periode lunas dihitung dari catatan simpanan yang statusnya `Approved`/`Partial` yang di-approve Finance, dijumlahkan per anggota dan periode, lalu dibandingkan dengan target efektif periode setelah carry-over yang berlaku. `Pending`, `Rejected`, dan pembayaran yang belum memenuhi target tidak dihitung lunas.
4. Periode lunas 12 sampai 35 memenuhi syarat penarikan awal dan wajib menyetujui syarat: penalti 6% dari saldo penarikan bruto, biaya antarbank bila tujuan bukan BCA, serta larangan mengikuti program SAMIT selanjutnya.
5. Periode lunas minimal 36 memenuhi syarat selesai kontrak; penalti penarikan awal tidak dikenakan.
6. Nilai pengajuan disimpan sebagai snapshot: produk/jenis simpanan, saldo bruto, periode lunas, penalti, biaya bank bila nominalnya sudah dapat ditentukan, estimasi bersih, rekening tujuan, bulan/tahun pencairan, alasan, dan versi persetujuan kebijakan.
7. Pengajuan berstatus terbuka membatasi pengajuan duplikat dan memblokir setoran baru sejak pengajuan terkirim. Jika pengajuan ditolak, akses setoran dibuka kembali; jika pengajuan dibayar, tabungan ditutup.
8. Status keanggotaan yang sudah ada (`draft`, `active`, `inactive`) tidak dipakai sebagai status pengajuan penarikan. Penutupan efektif dilakukan setelah pembayaran pencairan sukses dan tercatat.
9. Tombol manual Finance untuk anggota lama memakai aturan audit yang sama, tetapi tidak memerlukan toggle siswa atau syarat 12 periode. Tindakan manual harus mencatat actor, waktu, nominal, sumber, dan alasan.

## Desain Arsitektur

- Tambahkan modul/domain `SavingsWithdrawal` yang fokus pada eligibility, kalkulasi, state transition, dan snapshot kebijakan.
- Pisahkan fungsi murni kalkulasi periode lunas/penalti dari adapter MongoDB, HTTP controller, upload file, dan UI agar dapat diuji tanpa database.
- Gunakan satu record pengajuan sebagai sumber kebenaran dengan state eksplisit: `submitted`, `reviewing`, `approved`, `rejected`, `waiting_payment`, `paid`, `cancelled`.
- Pengajuan siswa membuat tepat satu Expense Koperasi berstatus `uncategorized`, ditautkan ke pengajuan. Expense existing tetap menjadi workflow Finance untuk kategorisasi, persetujuan, pembayaran, dan bukti transfer.
- Saat Expense ditandai `paid`, layanan aplikasi menyelesaikan pengajuan dan membuat satu AccountingTransaction melalui mekanisme Expense yang sudah ada. Idempotency/unique link mencegah transaksi atau Expense ganda.
- Nilai outflow ledger mengikuti jumlah transfer bersih yang benar-benar dibayar. Nilai bruto, penalti, dan biaya dicatat terpisah di snapshot agar Finance dapat menelusuri rekonsiliasi.
- Reject dari Finance menyimpan alasan dan mengirim state/status agar dapat dilihat siswa; tidak membuat transaksi.
- Pengajuan manual anggota lama menggunakan layanan aplikasi yang sama, dengan sumber `admin_legacy`, sehingga semua penutupan yang dibukukan tetap menghasilkan tautan Expense dan transaksi konsisten.
- Notifikasi siswa berasal dari status pengajuan yang tersimpan; tidak mengandalkan notifikasi in-memory. UI menampilkan timeline, ringkasan, serta bukti transfer yang diakses dengan ownership check.

## Perubahan Antarmuka

### Student Dashboard

- Tombol `Tutup Tabungan` hanya muncul jika toggle Koperasi aktif, status tabungan masih aktif, syarat periode lunas terpenuhi, dan tidak ada pengajuan terbuka.
- Konfirmasi pertama sebelum formulir.
- Form menampilkan data simpanan, total bruto, dan rekening penerima default; siswa memilih bulan/tahun dan mengisi alasan.
- Untuk 12-35 periode lunas, tampilkan syarat penarikan awal dan konfirmasi eksplisit. Untuk minimal 36 periode lunas, tampilkan pesan penyelesaian tabungan sebelum submit.
- Setelah pengajuan, halaman menampilkan status/timeline, ringkasan bruto/penalti/bersih, dan bukti transfer ketika tersedia.
- Semua endpoint membaca identitas dari token/sesi server; client tidak boleh mengirim member ID sebagai otoritas.

### Koperasi

- Settings memiliki toggle pengajuan siswa yang default mati.
- Daftar anggota memiliki filter status penutupan/penarikan dan indikator status pengajuan.
- Detail anggota menampilkan status dan histori pengajuan serta aksi manual untuk data lama.
- Expense Report menerima Expense baru berstatus `uncategorized`; semua tahap Finance yang ada tetap berlaku.
- Dashboard menampilkan jumlah pengajuan baru dan nominal terkait dengan label status yang jelas.
- Finance mengunggah bukti saat membayar melalui flow Expense existing; bukti ditampilkan ke siswa melalui endpoint ownership-checked.

## Integritas, Keamanan, dan Kegagalan

- Hanya anggota pemilik pengajuan yang dapat membaca status/bukti dari Student Dashboard.
- Eligibility dan nominal dihitung ulang server-side pada saat submit; nilai kiriman browser tidak dipercaya.
- Pengajuan dan Expense harus memiliki link unik/idempotent. Kegagalan pembuatan salah satunya harus dikompensasi atau dibungkus transaksi Mongo bila deployment mendukung replica-set transaction.
- Penyelesaian pengajuan, status keanggotaan, dan ledger tidak boleh menyatakan sukses jika transaksi Expense gagal dibuat.
- Upload bukti mengikuti validasi tipe/ukuran dan direktori upload Expense yang sudah ada; jangan mengekspos path file mentah.
- Simpan jejak actor, timestamp, reason, dan perubahan status untuk setiap keputusan Finance.

## Pengujian dan Kriteria Selesai

- Unit tests: hitungan periode lunas per periode, partial/banyak transfer, pending/rejected tidak dihitung, upgrade/carry-over, ambang 11/12/35/36, penalti 6%, dan pembulatan rupiah.
- Service tests: toggle mati, submit sah/tidak sah, pengajuan duplikat, rejection, approval, payout, dan aksi legacy admin.
- Integration tests: membuat Expense satu kali, mark-paid membuat transaction satu kali, retry tidak menggandakan ledger, serta akses bukti dibatasi ke pemilik.
- UI tests/route checks: tombol tersembunyi ketika toggle mati, state/form sesuai jumlah periode, filter anggota, dan tampilan hasil pembayaran.
- Jalankan test/lint/build relevan di kedua repo; review perubahan dan verifikasi route/API sebelum commit release.
- Jangan mengubah `.env`, konfigurasi sensitif, `app/Config/App.php`, atau deploy production tanpa permintaan eksplisit.

## Ketentuan Implementasi Tambahan

- Biaya antarbank disebut dalam pengajuan, tetapi PDF tidak menetapkan tarif atau sumber tarif. Nominal biaya tidak dikarang; biaya aktual dicatat Finance saat menyiapkan pencairan, dan ringkasan siswa menjelaskan bahwa jumlah bersih final mengikuti biaya transfer bank aktual.
- Klaim tidak dapat mengikuti program SAMIT berikutnya perlu diimplementasikan sebagai flag/policy yang hanya aktif setelah penarikan awal benar-benar dibayar, bukan saat baru mengajukan.
- Penarikan tabungan memiliki dampak kebijakan/kontrak. Aplikasi mencatat persetujuan versi kebijakan dan waktu persetujuan, tetapi perubahan dokumen kontrak/legal tidak termasuk implementasi teknis ini.
