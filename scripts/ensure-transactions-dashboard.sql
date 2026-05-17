-- Catatan: Project dashboard-padel (Supabase terhubung) memakai tabel `transaksi` dan `refund`, BUKAN `payment_ledger`.
-- Skrip ini hanya untuk lingkungan yang masih memakai pola Lovable + `payment_ledger` + `transactions` (EN).
-- Jalankan hanya jika tabel `payment_ledger` ada: `supabase db query --linked -f scripts/ensure-transactions-dashboard.sql`

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

create unique index if not exists transactions_ledger_backup_unique
  on public.transactions ((metadata ->> 'ledger_id'))
  where metadata ? 'ledger_id';

insert into public.transactions (
  created_at,
  updated_at,
  amount_idr,
  status,
  reference_id,
  reference_type,
  metadata
)
select
  pl.created_at,
  pl.updated_at,
  abs(pl.amount_idr)::bigint,
  case
    when lower(pl.kind) like '%refund%' then 'refund'
    when lower(coalesce(pl.status, '')) in ('settled', 'success', 'completed', 'paid') then 'success'
    when lower(trim(coalesce(pl.status, ''))) = '' then 'pending'
    else lower(trim(pl.status))
  end,
  pl.reference_id,
  pl.reference_type,
  jsonb_build_object(
    'source', 'payment_ledger_backfill',
    'ledger_id', pl.id::text,
    'kind', pl.kind
  )
from public.payment_ledger as pl
where not exists (
  select 1
  from public.transactions as t
  where (t.metadata ->> 'ledger_id') = pl.id::text
);
