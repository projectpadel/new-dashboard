## Ringkasan

Membangun **Dashboard Admin** terproteksi (`/admin/*`) bergaya seperti referensi: sidebar hijau gelap di kiri dengan grup **Operasional** dan **Sistem**, area konten dengan KPI cards + tabel data + filter. Akses dibatasi ke user dengan `profiles.role = 'superadmin'` (sudah ada helper `is_superadmin()` di DB).

---

## Pemetaan Menu → Tabel Supabase

| Menu (Sidebar) | Sumber data utama | Isi halaman |
|---|---|---|
| **Keuangan** (default) | `payment_ledger`, `court_bookings`, `programs`, `tournaments` | KPI: total revenue (sum `amount_idr` status=settled), revenue 7/30 hari, breakdown per `kind` (booking/program/tournament/instructor payout). Chart trend harian + tabel transaksi terbaru dengan filter `kind` & `status`. |
| **Pengguna** | `profiles` (+ `auth.users` via server fn untuk email & last_sign_in) | KPI: Total User, Aktif 7 Hari, Aktif 30 Hari, % Onboarding selesai (`onboarded=true`). Tabel: Nama, Email, Rank (badge), Role, Coins, Last Active, Status. Aksi: ubah role, set rank, tambah/kurangi coins, ban (mark inactive). |
| **Instruktur** | `instructors`, join `profiles` | KPI: total instruktur, open_to_book, avg_rating. Tabel instruktur + aksi: edit hourly_rate, toggle open_to_book, lihat program & feedback (`program_session_feedback`). |
| **Reservasi** | `court_bookings` | Filter tanggal/court/booking_type. Tabel booking + grid timeline per court. KPI: utilisasi court, jam terjual, revenue booking. |
| **Program** | `programs`, `program_sessions`, `program_participants`, `program_league_matches` | KPI: program aktif, peserta, slot terisi. Tabel program + drilldown: sesi, peserta (approve/kick), liga matches & skor. |
| **Match** | `matches`, `match_participants`, `match_results`, `match_join_requests`, `match_ratings` | KPI: open/locked/closed, public vs private. Tabel match + drilldown: roster, join requests, hasil, voting. Aksi moderasi (force close, hapus). |
| **Tournament** | `tournaments`, `tournament_teams`, `tournament_team_members`, `tournament_matches`, `tournament_member_invites` | KPI: turnamen draft/live/done, tim pending review. Tabel turnamen + drilldown: review tim (approve/reject logo), bracket, jadwal, skor. |
| **Notifikasi** | `notifications` | Broadcast notifikasi (insert ke banyak `user_id`), filter berdasarkan rank/role/aktivitas. Tabel notifikasi terbaru. |
| **Pengaturan** | `profiles` (admin), config | Manajemen superadmin (assign role), feature flags ringan, info konfigurasi (pricing default, dsb). |

Catatan: `daily_signins`, `user_prizes`, `tournament_user_announcements` muncul sebagai widget sekunder di Pengguna / Notifikasi.

---

## Struktur Halaman & Komponen

```text
src/routes/
  admin.tsx                      # layout: sidebar + Outlet, guard superadmin
  admin.index.tsx                # redirect → /admin/keuangan
  admin.keuangan.tsx
  admin.pengguna.tsx
  admin.pengguna.$userId.tsx     # detail user (drawer/page)
  admin.instruktur.tsx
  admin.reservasi.tsx
  admin.program.tsx
  admin.program.$programId.tsx
  admin.match.tsx
  admin.match.$matchId.tsx
  admin.tournament.tsx
  admin.tournament.$tournamentId.tsx
  admin.notifikasi.tsx
  admin.pengaturan.tsx

src/components/admin/
  AdminSidebar.tsx               # grup Operasional / Sistem, item aktif hijau solid
  KpiCard.tsx                    # kartu KPI putih + ikon kanan, delta hijau
  DataTable.tsx                  # tabel + search + filter dropdowns + pagination
  RankBadge.tsx, RoleBadge.tsx, StatusBadge.tsx
  RevenueChart.tsx               # recharts line/area
  CourtTimeline.tsx              # grid jam × court
  BroadcastDialog.tsx
```

---

## Akses & Keamanan (penting)

- Route `/admin/*` dilindungi: `beforeLoad` panggil server fn `requireSuperadmin` (pakai `requireSupabaseAuth` middleware + cek `is_superadmin(userId)`). Jika false → redirect `/`.
- Semua data admin diambil via **TanStack server functions** (`*.functions.ts`) yang memakai `supabaseAdmin` (service role) supaya bisa lintas RLS untuk view admin, **setelah** verifikasi superadmin di middleware. Tidak ada query admin langsung dari browser.
- Mutasi admin (ubah role, approve tim, broadcast notif, dst) lewat server fn, divalidasi Zod, dan log ke `payment_ledger.metadata` / tabel audit (lihat di bawah, opsional).

---

## Migrasi DB yang dibutuhkan

Minimal & non-destruktif:

1. **Index bantu** untuk performa list admin:
   - `profiles(role)`, `profiles(updated_at desc)`
   - `payment_ledger(created_at desc)`, `payment_ledger(kind,status)`
   - `court_bookings(booking_date, start_time)`
   - `notifications(user_id, created_at desc)`
2. **(Opsional) tabel `admin_audit_log`** (id, actor_id, action, target_table, target_id, payload jsonb, created_at) + RLS hanya superadmin bisa SELECT/INSERT.
3. **(Opsional) izin UPDATE/DELETE terbatas untuk superadmin** pada tabel yang saat ini hanya bisa creator-modify (matches, tournament_teams, dll), via policy `USING (is_superadmin(auth.uid()))`.

Tidak ada perubahan skema yang mengubah data eksisting.

---

## Desain Visual

- **Palet**: sidebar `oklch(~0.22 0.07 155)` (hijau gelap), item aktif `oklch(~0.32 0.10 155)`, accent hijau `oklch(~0.55 0.16 155)`, background `--background` putih bersih, kartu putih dengan border halus & shadow lembut. Semua via token di `src/styles.css` (light + dark).
- **Tipografi**: heading sans-serif tebal (Inter/Plus Jakarta), tabular numerik untuk angka KPI.
- **Layout**: sidebar fixed 240px, konten grid 12 kolom, KPI 4 kartu di atas, panel tabel di bawah persis seperti referensi.
- **Bahasa UI**: Indonesia (sesuai screenshot).

---

## Urutan Implementasi yang Diusulkan

1. Token warna + komponen `AdminSidebar`, layout `admin.tsx` + guard superadmin.
2. Server fn `getAdminOverview`, `listUsers`, `listBookings`, dst.
3. Halaman **Keuangan** (default) dan **Pengguna** (paling mirip referensi).
4. Instruktur, Reservasi, Program.
5. Match, Tournament (paling kompleks, banyak drilldown).
6. Notifikasi (broadcast) + Pengaturan.
7. Migrasi indeks + (opsional) audit log.

---

## Pertanyaan singkat sebelum mulai build

1. Set role admin pertama: pakai email `yanz@gmail.com` yang sudah hardcoded di `is_superadmin`, atau Anda mau saya tambahkan UI untuk assign superadmin?
2. Perlu tabel **audit log** + policy UPDATE/DELETE superadmin pada tabel match/tournament sekarang, atau dibuat saat dibutuhkan?
3. Bahasa UI semuanya Indonesia, atau bilingual (ID/EN)?