# design_product.md — Koperasi SAMIT (koperasi-eks)

Dokumen ini adalah **basis warna & desain** untuk seluruh client app. Setiap perubahan UI
harus mengikuti dokumen ini. Dilarang memperkenalkan warna di luar palet di bawah.

## Register

Product UI (dashboard internal koperasi). Desain melayani tugas, bukan pamer.
Familiar > unik. Data & kejelasan nomor adalah prioritas.

## Brand anchor

Primary / brand: **#04214A** (navy tua). Menggantikan seluruh pink/rose lama.
Aksen sekunder: **gold #B8942F** — hanya untuk highlight kecil (badge, indikator, logo mark).

## Palet

### primary (navy — pengganti pink/rose)

| Token | Hex | Pemakaian |
|---|---|---|
| primary-50  | #F5F8FB | hover bg, selected-row tint |
| primary-100 | #E8EFF7 | chip bg, badge bg, hover kuat |
| primary-200 | #CCDBEC | border aktif, divider tinted |
| primary-300 | #9DB6D4 | ikon muted di panel navy |
| primary-400 | #5F87B3 | ikon, link sekunder |
| primary-500 | #35619B | link, fokus ring, ikon aktif |
| primary-600 | #234A80 | teks aksen di bg terang (AA) |
| primary-700 | #1A3A67 | heading aksen, hover tombol |
| primary-800 | #142D52 | panel gelap |
| primary-900 | #04214A | **brand anchor** — sidebar gelap, tombol primer, panel login |
| primary-950 | #02142C | latar paling dalam |

### gold (aksen terbatas <=5% permukaan)

#FBF7EA #F5EDD3 #EADCA7 #DCC675 #CDAE4A **#B8942F** #96771F #745A16 #4A3A12

### semantic

| Makna | Token | Hex |
|---|---|---|
| Sukses / kredit | success-600 | #15803D |
| Bahaya / debit | danger-600 | #B91C1C |
| Peringatan | warning-600 | #B45309 |
| Info | info-600 | #234A80 |

### netral (slate — hue 215, satu keluarga dengan navy)

#F8FAFC #F1F5F9 #E2E8F0 #CBD5E1 #94A3B8 #64748B #475569 #334155 #1E293B #0F172A

## Implementasi warna (penting)

Pink/rose lama **diremap di client/tailwind.config.js**: theme.extend.colors.pink dan
colors.rose sekarang berisi nilai navy di atas. Artinya kelas lama seperti bg-pink-50,
text-pink-600, from-pink-500 to-rose-500 otomatis tampil navy.
Kode baru wajib pakai primary-*, bukan pink-*.

## Komposisi permukaan

- Body: #F7F9FC — bukan abu polos.
- Sidebar: **navy #04214A** (surface drenched sekali, jadi identitas). Item aktif:
  bg rgba(255,255,255,.08) + penanda pill gold 3px x 16px di kiri, teks putih.
- Konten: kartu putih, border #E2E8F0, shadow lembut.
- Tombol primer: solid #04214A, hover #1A3A67. **Tanpa gradient.**
- Gradient hanya boleh di panel login (navy -> navy lebih dalam). Dilarang gradient teks.

## Tipografi

- Satu keluarga: system-ui stack.
- Skala tetap (rem), bukan clamp: 12 / 13 / 14 / 16 / 18 / 20 / 24.
- Angka & nominal: **font-variant-numeric: tabular-nums** (class .tnum di index.css).
- Heading pakai text-wrap balance. Body minimum slate-600 di bg terang (kontras >= 4.5:1).
- Nomor panjang (Rp 1.199.809.895) tidak boleh overflow: kartu pakai min-w-0,
  nilai pakai break-words, dan ukuran turun bertahap di breakpoint kecil.

## Ikonografi

- **Dilarang emoji sebagai ikon UI.** Ganti dengan inline SVG stroke 1.5-2px (gaya Lucide),
  currentColor, ukuran 16/18/20px.
- Logo: /logo-samit.png (public). Ganti file itu = ganti logo & favicon di semua tempat.

## Responsive (wajib lolos 360px -> 1440px)

- Sidebar desktop fixed w-60; <=1024px jadi drawer + overlay (dipertahankan).
- Grid statistik: grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 — jangan paksa 4 kolom di 1280px.
- Semua kartu: min-w-0 di parent flex, teks panjang break-words.
- Padding halaman: p-3 sm:p-4 xl:p-6.
- Tabel: container overflow-x-auto, kolom nominal rata kanan .tnum.
- Tidak ada fixed width > 100vw di mobile; tidak ada teks yang butuh scroll horizontal.

## Kedalaman (3D halus, tanpa glassmorphism)

- Kartu: border 1px + box-shadow 0 1px 2px rgba(4,33,74,.06), 0 2px 6px rgba(4,33,74,.06).
- Hover kartu interaktif: translateY(-1px) + shadow bertambah — 150-200ms ease-out.
- Panel login: navy dengan radial highlight sangat halus.
- Dilarang: neumorphism, glass blur, shadow warna-warni, gradient tombol.

## Motion

- 150-200ms, ease-out. Hanya untuk state: hover, focus, buka-tutup submenu.
- prefers-reduced-motion: semua transisi off (sudah di index.css).

## Bans (hasil audit)

1. Emoji sebagai ikon dashboard/sidebar/login.
2. Gradient teks / gradient tombol.
3. Pink & rose dalam bentuk apa pun (sudah diremap, jangan pakai lagi).
4. Teks abu muda di atas tinted bg (kontras gagal).
5. Nomor overflow di layar kecil.
6. Copyright tahun hardcoded — selalu new Date().getFullYear().
