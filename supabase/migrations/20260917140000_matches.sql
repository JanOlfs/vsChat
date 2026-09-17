-- Ergebnis einer Check-in/Voting-Runde aus dem Twitch-Chat (Durable Object).
-- Schreibender Zugriff nur über service_role (der Chat-Bot-Worker), daher keine
-- Insert/Update/Delete-Policies für anon/authenticated.

create table matches (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references categories(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade, -- gewählter Gegner
  vote_counts  jsonb not null default '{}'::jsonb, -- twitch_login -> Stimmenzahl, zur Nachvollziehbarkeit
  created_at   timestamptz not null default now()
);

create index on matches (category_id);

alter table matches enable row level security;

create policy "matches_select_all" on matches
  for select using (true);
