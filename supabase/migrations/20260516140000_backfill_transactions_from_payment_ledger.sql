-- Isi transactions dari payment_ledger (sekali jalur migrasi — idempotent lewat ledger_id).
-- Setelah ada baris di transactions, dashboard memakai tabel ini; baris baru app sebaiknya insert ke transactions.

CREATE UNIQUE INDEX IF NOT EXISTS transactions_ledger_backup_unique
ON public.transactions ((metadata ->> 'ledger_id'))
WHERE metadata ? 'ledger_id';

INSERT INTO public.transactions (
  created_at,
  updated_at,
  amount_idr,
  status,
  reference_id,
  reference_type,
  metadata
)
SELECT
  pl.created_at,
  pl.updated_at,
  abs(pl.amount_idr)::bigint,
  CASE
    WHEN lower(pl.kind) LIKE '%refund%' THEN 'refund'
    WHEN lower(coalesce(pl.status, '')) IN ('settled', 'success', 'completed', 'paid') THEN 'success'
    WHEN lower(trim(coalesce(pl.status, ''))) = '' THEN 'pending'
    ELSE lower(trim(pl.status))
  END,
  pl.reference_id,
  pl.reference_type,
  jsonb_build_object(
    'source', 'payment_ledger_backfill',
    'ledger_id', pl.id::text,
    'kind', pl.kind
  )
FROM public.payment_ledger AS pl
WHERE NOT EXISTS (
  SELECT 1
  FROM public.transactions AS t
  WHERE (t.metadata ->> 'ledger_id') = pl.id::text
);
