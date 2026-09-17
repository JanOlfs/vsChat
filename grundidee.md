# Captnblacky gegen Chat, Schritt 1: Bewerbungsseite

## Kontext

Stream-Format, bei dem der Streamer in mehreren Kategorien (Schach, CS2, League of Legends usw.)
gegen jeweils einen Zuschauer antritt. Zuschauer bewerben sich vorab über diese Webseite auf
Kategorien. Im Stream laufen dann Check-in und Voting über den Twitch-Chat, gesteuert von einem
Cloudflare Durable Object.

**Dieser Auftrag umfasst ausschließlich die Bewerbungsseite.** Durable Object, Voting, Overlay und
Admin-Panel kommen in späteren Schritten. Das Datenmodell soll aber schon jetzt so angelegt sein,
dass diese Teile später andocken können.

## Stack

- Angular (aktuelle Version, standalone components, Signals, kein NgModule)
- Supabase (Postgres, Auth mit Twitch als OAuth-Provider)
- Deployment auf Cloudflare Pages
- TypeScript strict mode

## Wichtige Grundregel

Der Twitch-Chat liefert später nur die numerische Twitch-User-ID und den Login-Namen zuverlässig.
Anzeigenamen können sich ändern. **Jede Verknüpfung zwischen Bewerbung, Check-in und Vote läuft
deshalb über `twitch_user_id`, niemals über den Anzeigenamen.**

## Datenmodell

```sql
-- Kategorien, werden per SQL gepflegt (Admin-UI kommt später)
create table categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  sort_order  int not null default 0,
  is_open     boolean not null default true,   -- Bewerbungen möglich?
  created_at  timestamptz not null default now()
);

-- Profil pro eingeloggtem Twitch-User, 1:1 zu auth.users
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  twitch_user_id text unique not null,
  twitch_login   text not null,
  display_name   text not null,
  avatar_url     text,
  updated_at     timestamptz not null default now()
);

-- Bewerbung eines Users auf eine Kategorie
create table applications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  note        text,                              -- optional, max 200 Zeichen
  created_at  timestamptz not null default now(),
  unique (profile_id, category_id)
);

create index on applications (category_id);
```

### Profil-Anlage

Beim ersten Login muss automatisch ein `profiles`-Eintrag entstehen. Umsetzung als Postgres-Trigger
auf `auth.users` (after insert), der die Twitch-Daten aus `raw_user_meta_data` liest.

**Achtung:** Die genauen Schlüsselnamen im Metadaten-JSON des Twitch-Providers bitte einmal
verifizieren, bevor der Trigger fest verdrahtet wird (einmal einloggen, `raw_user_meta_data` in der
Supabase-Konsole ansehen). Erwartet werden sinngemäß `provider_id` oder `sub` für die numerische ID,
`nickname` oder `preferred_username` für den Login-Namen, dazu `name` und `avatar_url`. Der Trigger
soll bei einem fehlenden Schlüssel nicht still ein leeres Profil anlegen, sondern fehlschlagen.

Zusätzlich bei jedem Login `twitch_login`, `display_name` und `avatar_url` aktualisieren, damit
Namensänderungen nachgezogen werden.

## Row Level Security

RLS auf allen drei Tabellen aktivieren.

- `categories`: lesen für alle (auch nicht eingeloggt). Schreiben nur service_role.
- `profiles`: lesen für alle (Bewerberlisten sollen öffentlich sichtbar sein). Eigenen Datensatz
  updaten erlaubt (`auth.uid() = id`). Insert nur durch den Trigger bzw. service_role. Kein Delete.
- `applications`: lesen für alle. Insert nur für den eigenen `profile_id` (`auth.uid() = profile_id`)
  und nur wenn die zugehörige Kategorie `is_open = true` hat. Delete nur eigene Zeilen. Kein Update.

## Frontend

### Routen

- `/` Übersicht: Erklärung des Formats, Liste aller Kategorien mit Anzahl der Bewerber, Login-Button
- `/kategorie/:slug` Detailseite: Beschreibung, Bewerberliste (Avatar plus Anzeigename), Bewerben-
  bzw. Zurückziehen-Button
- `/meine-bewerbungen` nur eingeloggt: eigene Bewerbungen, einzeln zurückziehbar
- `/auth/callback` OAuth-Rücksprung

Die Routen `/admin` und `/overlay` kommen später, die Routing-Struktur bitte schon dafür offen halten
(`/overlay` soll später ein Layout ohne Kopf- und Fußzeile und mit transparentem Hintergrund bekommen).

### Services

- `SupabaseService`: kapselt den Client, stellt Session als Signal bereit
- `AuthService`: Login über Twitch-OAuth, Logout, `currentProfile` als Signal
- `CategoryService`, `ApplicationService`: Datenzugriff, keine Supabase-Aufrufe direkt in Komponenten

### Verhalten

- Ohne Login sind alle Seiten lesbar, nur das Bewerben erfordert Login.
- Klickt ein nicht eingeloggter User auf Bewerben, wird er zum Twitch-Login geschickt und danach auf
  dieselbe Kategorieseite zurückgeführt.
- Bewerben und Zurückziehen aktualisieren die Ansicht optimistisch und rollen bei einem Fehler zurück.
- Ist eine Kategorie geschlossen (`is_open = false`), wird sie angezeigt, der Button ist deaktiviert
  mit entsprechendem Hinweis.
- Fehlerzustände sichtbar machen, keine stillen Fehlschläge.

### Nicht bauen

- Kein Voting, kein Check-in, kein Scoreboard, kein Admin-Panel
- Keine Chat-Anbindung
- Keine E-Mail- oder Passwort-Anmeldung, ausschließlich Twitch

## Konfiguration und Sicherheit

- Supabase-URL und **anon key** in `environment.ts`. Der anon key darf im Frontend liegen, der
  Schutz kommt aus den RLS-Policies.
- Der **service_role key** taucht im Frontend an keiner Stelle auf, auch nicht in einer
  Environment-Datei.
- Twitch-App auf dev.twitch.tv anlegen, Client-ID und Secret in Supabase unter Auth Providers
  eintragen, Redirect-URL auf die Supabase-Callback-Adresse.

## Deployment

- Build-Ausgabe für Cloudflare Pages, SPA-Fallback auf `index.html` konfigurieren.
- Migrationsdateien für das Schema im Repo ablegen (`supabase/migrations/`), inklusive Seed-SQL mit
  den Kategorien: Schach, CS2, League of Legends. Weitere Kategorien kommen später dazu, das Seed
  soll leicht erweiterbar sein.

## Abnahmekriterien

1. Nicht eingeloggt: Startseite und Kategorieseiten laden, Bewerberlisten sind sichtbar.
2. Login über Twitch funktioniert, danach existiert ein `profiles`-Eintrag mit korrekter
   `twitch_user_id`.
3. Bewerbung auf eine offene Kategorie anlegen und wieder zurückziehen funktioniert.
4. Eine zweite Bewerbung auf dieselbe Kategorie wird abgewiesen (Unique-Constraint).
5. Ein direkter Insert mit fremder `profile_id` über den anon key schlägt an der RLS-Policy fehl.
6. Bewerbung auf eine Kategorie mit `is_open = false` schlägt fehl, sowohl in der UI als auch bei
   direktem Insert.
