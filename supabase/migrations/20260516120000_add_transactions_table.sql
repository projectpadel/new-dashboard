-- Tabel transaksi untuk agregasi pendapatan dashboard (status: success | pending | refund).
-- Jika sudah ada di lingkungan Anda, hapus atau sesuaikan file migrasi ini.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid (),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  amount_idr bigint not null default 0,
  status text not null default 'pending',
  reference_id text null,
  reference_type text null,
  metadata jsonb null default '{}'::jsonb
);

create index if not exists transactions_created_at_idx on public.transactions (created_at);

create index if not exists transactions_status_idx on public.transactions (status);

comment on table public.transactions is 'Pembayaran/charge untuk laporan; hanya status success dihitung sebagai pendapatan.';
