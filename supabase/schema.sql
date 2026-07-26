-- Schéma a bezpečnostné pravidlá pre synchronizáciu appky Letákový prehľad.
--
-- PREČO EXISTUJE TENTO SÚBOR: v index.html je verejný (publishable) Supabase
-- kľúč. Jediné, čo bráni komukoľvek s týmto kľúčom čítať alebo prepisovať
-- dáta iných členov rodiny, sú policies nižšie. Pri obnove projektu alebo
-- zmene v Supabase dashboarde ich treba nastaviť presne takto a overiť.
--
-- Ďalej over v Authentication → Settings:
--   * "Allow new users to sign up" má byť VYPNUTÉ (účty vytvára správca),
--   * e-mailové potvrdenia podľa preferencie.

create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_data_payload_object check (jsonb_typeof(data) = 'object'),
  constraint user_data_payload_size check (pg_column_size(data) <= 1048576)
);

-- Pri aplikovaní na starší projekt sprísni aj už existujúcu tabuľku.
alter table public.user_data drop constraint if exists user_data_payload_object;
alter table public.user_data add constraint user_data_payload_object
  check (jsonb_typeof(data) = 'object');
alter table public.user_data drop constraint if exists user_data_payload_size;
alter table public.user_data add constraint user_data_payload_size
  check (pg_column_size(data) <= 1048576);

-- Automatická aktualizácia updated_at pri každom zápise.
create or replace function public.touch_user_data()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trigger ju môže volať interne; klienti ju nemajú volať ako RPC.
revoke all on function public.touch_user_data() from public, anon, authenticated;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before insert or update on public.user_data
  for each row
  execute function public.touch_user_data();

-- Row Level Security: každý prihlásený používateľ vidí a mení IBA svoj riadok.
alter table public.user_data enable row level security;
alter table public.user_data force row level security;

revoke all on table public.user_data from public, anon;
grant select, insert, update on table public.user_data to authenticated;

drop policy if exists "own row select" on public.user_data;
create policy "own row select"
  on public.user_data
  for select
  using (auth.uid() = user_id);

drop policy if exists "own row insert" on public.user_data;
create policy "own row insert"
  on public.user_data
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "own row update" on public.user_data;
create policy "own row update"
  on public.user_data
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Mazanie z klienta nepovoľujeme (žiadna delete policy) – riadok zmaže
-- len správca v dashboarde alebo kaskáda pri zmazaní používateľa.
