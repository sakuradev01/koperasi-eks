# Member Registration Rejection and Document Integrity Design

**Tanggal:** 2026-09-01  
**Status:** Disetujui untuk implementasi oleh pemilik workspace  
**Scope:** `koperasi-eks`, `student-dashboard`, dan `rn-student-dashboard`

## Tujuan

Admin koperasi dapat menolak pendaftaran anggota baru dengan alasan yang wajib diisi, melihat tabel riwayat penolakan, dan memverifikasi hanya pengajuan yang dokumennya lengkap. Siswa yang ditolak melihat alasan tersebut dan dapat memperbaiki lalu mengirim ulang memakai UUID yang sama. Pengajuan yang hanya berisi KTP tidak boleh lagi dibuat atau diverifikasi.

## Temuan yang menjadi dasar

- `koperasi-eks` saat ini hanya memiliki `isVerified` untuk status pendaftaran baru; route reject registrasi belum ada.
- Tombol Tolak yang sudah ada hanya menangani perubahan alamat dan verifikasi identitas anggota lama.
- API `POST /api/public/register-koperasi` hanya mewajibkan UUID, nama, dan gender sehingga body parsial dapat memperoleh HTTP 201.
- RN `KoperasiRegistration` dapat berpindah langsung ke pill Review; validasi Review tidak memeriksa langkah sebelumnya.
- Jalur web berurutan dan jalur verifikasi identitas anggota lama sudah melakukan sebagian validasi, tetapi validasi server tetap menjadi sumber kebenaran.
- Record production `JPSB25088945` saat audit read-only berstatus `pending_verification`; endpoint publik tidak mengembalikan gambar dan endpoint admin memerlukan token, sehingga isi gambar record itu harus dicek dari halaman admin setelah perubahan tersedia.

## Keputusan desain

### Status pendaftaran

Tambahkan `registrationStatus` pada `Member` dengan nilai `pending`, `approved`, atau `rejected`. Field ini melengkapi `isVerified` untuk kompatibilitas dengan modul lama:

- record student baru: `pending` dan `isVerified: false`;
- verifikasi admin: `approved` dan `isVerified: true`;
- penolakan: `rejected` dan `isVerified: false`;
- record lama tanpa `registrationStatus`: status efektif dihitung dari `isVerified` (`true` → `approved`, selain itu → `pending`) sampai tersentuh oleh aksi baru.

Simpan juga status rejection terakhir pada member (`registrationRejectionReason`, `registrationRejectedAt`, `registrationRejectedBy`) agar Student Dashboard dapat menampilkan pesan tanpa mengambil seluruh history.

### Riwayat immutable

Buat model/collection MongoDB `MemberRegistrationRejection` dengan satu dokumen untuk setiap aksi penolakan:

- `memberId`, `memberUuid`, `memberName` sebagai referensi dan snapshot;
- `reason` yang sudah di-trim, wajib 5–1000 karakter;
- `rejectedBy` dan snapshot username/nama admin;
- `rejectedAt` timestamp;
- `attempt` nomor pengajuan saat ditolak;
- `documentSummary` berisi boolean kelengkapan KTP, selfie, liveness kiri/kanan, tanda tangan, rekening, dan produk; tidak menyimpan salinan gambar.

History tidak dihapus ketika siswa resubmit. Collection memiliki index `{ memberUuid: 1, rejectedAt: -1 }` dan `{ rejectedAt: -1 }`.

### Reject dan resubmit

Admin memanggil `PATCH /api/admin/members/:uuid/reject` dengan `{ rejectionReason }`. Endpoint hanya menerima member student-dashboard yang status efektifnya `pending`; alasan kosong atau terlalu panjang ditolak. Dalam satu transaksi logis (Mongo session bila tersedia, fallback berurutan dengan error handling), endpoint membuat history dan mengubah status member menjadi `rejected` tanpa menghapus dokumen lama.

Student Dashboard menerima `rejected` dari `check-member`. Web dan RN menampilkan alasan dan membuka form yang sama dalam mode resubmit. Resubmit memakai `PUT /api/public/register-koperasi/:uuid`, memvalidasi payload lengkap, memperbarui record yang sama, mengembalikan status ke `pending`, mengosongkan field rejection terakhir, dan menaikkan nomor attempt. Endpoint POST awal tetap menolak UUID yang sudah ada agar tidak ada duplikat.

### Validasi dokumen dan verifikasi

Buat validator server bersama untuk registrasi dan resubmit. Field minimum:

- UUID, nama, gender, NIK 16 digit;
- bank, nomor rekening, nama pemilik rekening;
- product aktif;
- signature;
- KTP, selfie dengan KTP, liveness kiri, liveness kanan;
- persetujuan RIPL dan versinya.

Setiap dokumen harus berupa data URL gambar atau path upload yang dikenal, tidak kosong, dan melewati batas ukuran/panjang minimum. Validator tidak mengompres atau mengubah bukti. `verifyMember` memanggil validator yang sama dan menolak HTTP 400 jika dokumen/field bisnis belum lengkap. Deteksi wajah tetap menjadi pemeriksaan manual; perubahan ini tidak mengklaim face-match biometrik otomatis.

### API history admin

Tambahkan route terlindungi token:

- `GET /api/admin/member-registration-rejections?page=1&limit=20&search=` mengembalikan `{ success, data, pagination }`, diurutkan terbaru;
- `GET /api/admin/members/:uuid/registration-rejections` untuk riwayat satu siswa.

Response hanya metadata audit (UUID, nama, alasan, admin, waktu, attempt, ringkasan kelengkapan), bukan base64 gambar.

### Admin UI

Pada halaman `Members`:

- tampilkan badge `Menunggu`, `Ditolak`, atau `Terverifikasi` berdasarkan status efektif;
- modal preview pengajuan pending memiliki tombol `Tolak Pengajuan`, textarea alasan, dan konfirmasi;
- tombol `Riwayat Penolakan` membuka halaman/tabel khusus dengan pagination, pencarian UUID/nama, alasan, admin, tanggal, attempt, dan tombol ke detail member;
- filter `Ditolak` memisahkan history dari pending;
- tombol verifikasi dinonaktifkan/ditolak server bila dokumen tidak lengkap.

Tambahkan route UI `/master/anggota/riwayat-penolakan` tanpa mengubah akses menu modul lain. Tabel menampilkan status history immutable; tidak ada aksi edit/hapus.

### Student UI

- status `rejected` menampilkan alasan, tanggal, dan CTA `Perbaiki & Kirim Ulang`;
- resubmit mengisi data profil yang masih ada, meminta ulang semua dokumen wajib, dan mengembalikan status ke pending setelah berhasil;
- status `pending` tetap menampilkan pesan menunggu admin;
- RN tidak boleh melompat ke step Review. Pill langkah hanya indikator atau hanya dapat membuka langkah yang sudah dilewati; submit selalu memvalidasi seluruh payload.

## Alur data

```text
Student web/RN
  ├─ POST /public/register-koperasi (first submit)
  └─ PUT  /public/register-koperasi/:uuid (resubmit)
             ↓ validateRegistrationPayload
        Member pending
             ↓ admin preview
        PATCH /admin/members/:uuid/reject
          ├─ Member rejected + alasan terakhir
          └─ MemberRegistrationRejection (immutable)
             ↓ student sees reason
        PUT resubmit → Member pending
             ↓ admin verify + validator
        Member approved / isVerified true
```

## Error handling and safety

- Reject tanpa alasan: HTTP 400, tidak ada perubahan.
- Reject member tidak ditemukan: HTTP 404.
- Reject member already approved/rejected: HTTP 409 dengan status saat ini.
- Resubmit UUID tidak ditemukan: HTTP 404.
- Payload parsial/malformed: HTTP 422 dengan daftar field yang kurang; tidak membuat atau mengubah member.
- History gagal dibuat: member tidak boleh berubah menjadi rejected.
- Semua endpoint admin tetap memakai `verifyToken`; tidak ada token atau kredensial yang ditulis ke source/log.
- List history mengecualikan base64 dan membatasi `limit` maksimal 100.

## Testing and acceptance criteria

1. Unit test validator: body lengkap lulus; masing-masing dokumen hilang gagal; NIK/rekening/product/RIPL tidak valid gagal.
2. Unit test status efektif untuk record lama, pending, rejected, dan approved.
3. Controller/API test: reject membuat satu history, menyimpan reason/admin/time/attempt, dan tidak menghapus gambar; reject tanpa reason tidak mengubah data.
4. Resubmit test: UUID sama kembali pending dan history lama tetap ada; POST duplicate tetap ditolak.
5. Verify test: member dengan KTP saja atau dokumen parsial menerima 400 dan tidak menjadi verified.
6. RN static/unit test memastikan navigasi langsung ke Review tidak dapat melewati prerequisite; submit parsial ditolak sebelum request.
7. `node --check` untuk server, `npm test`/focused node tests, `npm run build` admin, PHP lint untuk file CI4, dan lint frontend dengan hasil baseline dicatat jika ada error lama.
8. Production verification setelah deploy dilakukan read-only: status `JPSB25088945`, list/reject history, dan detail dokumen menggunakan akun admin milik pemilik sistem.

## Batasan/non-goals

- Tidak menghapus record/member atau history secara otomatis.
- Tidak mengubah alur pembayaran, akuntansi, invoice, atau autentikasi admin.
- Tidak menyimpan duplikat gambar pada history.
- Tidak menganggap keberadaan wajah di selfie sebagai face-match KTP; pemeriksaan biometrik otomatis adalah pekerjaan terpisah.
- Push dilakukan setelah test/lint; deploy production dilakukan terpisah oleh pemilik sistem/CI-CD.
