-- Live-Stand der aktuellen Check-in/Voting-Runde, wird vom Chatbot-Durable-Object
-- laufend aktualisiert. Eine einzige Zeile (Singleton), das Overlay liest sie aus.
-- Schreibender Zugriff nur über service_role (der Chat-Bot-Worker).

create table live_round (
  id           int primary key default 1 check (id = 1),
  phase        text not null default 'idle', -- idle | checkin | voting
  category_id  uuid references categories(id) on delete set null,
  checked_in   jsonb not null default '[]'::jsonb, -- [{twitch_login, display_name}]
  vote_counts  jsonb not null default '{}'::jsonb, -- twitch_login -> Stimmenzahl
  updated_at   timestamptz not null default now()
);

insert into live_round (id) values (1);

alter table live_round enable row level security;

create policy "live_round_select_all" on live_round
  for select using (true);
