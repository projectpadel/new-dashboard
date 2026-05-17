-- Email disimpan di auth.users; denormalisasi ke profiles untuk admin dashboard & query.

alter table public.profiles
  add column if not exists email text;

comment on column public.profiles.email is 'Salinan email dari auth.users (disinkronkan trigger).';

-- Backfill dari auth
update public.profiles p
set email = u.email
from auth.users u
where p.user_id = u.id
  and (p.email is distinct from u.email);

-- Sinkron saat user auth dibuat / email berubah
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email = new.email,
    updated_at = coalesce(updated_at, now())
  where user_id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_email_sync on auth.users;

create trigger on_auth_user_email_sync
  after insert or update of email on auth.users
  for each row
  execute function public.sync_profile_email_from_auth();
