-- Rahasia server-only (OpenAI, dll.). Tanpa policy RLS = hanya service_role yang bisa baca/tulis.
create table if not exists public.platform_secrets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.platform_secrets enable row level security;

comment on table public.platform_secrets is
  'Kunci API server-side. Isi via Supabase SQL (service role) atau gunakan OPENAI_API_KEY di .env.';
