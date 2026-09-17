-- Schema, Profil-Trigger und RLS für die Bewerbungsseite.
-- Verknüpfung läuft überall über twitch_user_id / profiles.id, niemals über Anzeigenamen.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  is_open     boolean not null default true,   -- Bewerbungen möglich?
  created_at  timestamptz not null default now()
);

create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  twitch_user_id text unique not null,
  twitch_login   text not null,
  display_name   text not null,
  avatar_url     text,
  updated_at     timestamptz not null default now()
);

create table applications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  note        text,                              -- optional, max 200 Zeichen
  created_at  timestamptz not null default now(),
  unique (profile_id, category_id)
);

create index on applications (category_id);

-- ---------------------------------------------------------------------------
-- Profil-Anlage bei erstem Login bzw. Aktualisierung bei jedem weiteren Login.
--
-- ACHTUNG: Die Schlüsselnamen im raw_user_meta_data-JSON des Twitch-Providers
-- bitte einmal live verifizieren (einloggen, raw_user_meta_data in der
-- Supabase-Konsole ansehen), bevor das hier in Produktion läuft. Erwartet
-- werden sinngemäß provider_id/sub für die numerische ID und
-- nickname/preferred_username für den Login-Namen.
-- ---------------------------------------------------------------------------

create function handle_auth_user_upsert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_twitch_user_id text;
  v_twitch_login   text;
  v_display_name   text;
  v_avatar_url     text;
begin
  v_twitch_user_id := coalesce(
    new.raw_user_meta_data ->> 'provider_id',
    new.raw_user_meta_data ->> 'sub'
  );
  v_twitch_login := coalesce(
    new.raw_user_meta_data ->> 'nickname',
    new.raw_user_meta_data ->> 'preferred_username'
  );
  v_display_name := coalesce(new.raw_user_meta_data ->> 'name', v_twitch_login);
  v_avatar_url := new.raw_user_meta_data ->> 'avatar_url';

  if v_twitch_user_id is null or v_twitch_login is null then
    raise exception
      'Twitch-Metadaten unvollständig für auth.users.id=%: provider_id/sub oder nickname/preferred_username fehlen',
      new.id;
  end if;

  insert into profiles (id, twitch_user_id, twitch_login, display_name, avatar_url, updated_at)
  values (new.id, v_twitch_user_id, v_twitch_login, v_display_name, v_avatar_url, now())
  on conflict (id) do update set
    twitch_login = excluded.twitch_login,
    display_name = excluded.display_name,
    avatar_url   = excluded.avatar_url,
    updated_at   = now();

  return new;
end;
$$;

create trigger on_auth_user_upsert
  after insert or update of raw_user_meta_data on auth.users
  for each row
  execute function handle_auth_user_upsert();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- service_role umgeht RLS grundsätzlich (Supabase-Standard), deshalb gibt es
-- dafür keine eigenen Policies. Was hier nicht als Policy steht, ist für
-- anon/authenticated gesperrt.
-- ---------------------------------------------------------------------------

alter table categories enable row level security;
alter table profiles enable row level security;
alter table applications enable row level security;

create policy "categories_select_all" on categories
  for select using (true);

create policy "profiles_select_all" on profiles
  for select using (true);

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "applications_select_all" on applications
  for select using (true);

create policy "applications_insert_own_open_category" on applications
  for insert
  with check (
    auth.uid() = profile_id
    and exists (
      select 1 from categories c
      where c.id = category_id and c.is_open = true
    )
  );

create policy "applications_delete_own" on applications
  for delete using (auth.uid() = profile_id);
