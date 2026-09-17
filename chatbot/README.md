# Chatbot (Durable Object)

Eigenständiger Cloudflare Worker, getrennt vom Angular-Frontend deployt. Hält per Durable Object
eine WebSocket-Verbindung zu Twitch-IRC, steuert Check-in/Voting per Chat-Befehl und schreibt das
Ergebnis in Supabase (`matches`-Tabelle, siehe
[supabase/migrations/20260917140000_matches.sql](../supabase/migrations/20260917140000_matches.sql),
vorher einspielen).

## Ablauf einer Runde

1. `!opencheckin <slug>` (Mod/Streamer) öffnet den Check-in für eine Kategorie (z.B. `schach`).
2. `!checkin` (jeder Zuschauer) checkt ein, wenn `twitch_user_id` eine offene Bewerbung auf diese
   Kategorie hat. Keine Chat-Antwort pro Check-in (Spam-Vermeidung), stattdessen:
3. `!closecheckin` (Mod) schließt den Check-in, Bot postet die Liste der Eingecheckten.
4. `!startvote` (Mod) öffnet das Voting unter den Eingecheckten.
5. `!vote <Twitch-Name>` (jeder Zuschauer) stimmt ab, spätere Stimme überschreibt die vorherige.
6. `!closevote` (Mod) wertet aus, postet den Gewinner im Chat und schreibt eine Zeile in `matches`.
7. `!status` (Mod) zeigt Phase/Kategorie/Anzahl Eingecheckter, nützlich solange es kein Admin-Panel gibt.

Bei Gleichstand gewinnt der zuerst eingecheckte Kandidat (kein Losverfahren,
`ponytail`-Kommentar dazu im Code).

## Setup

1. **Bot-Account** bei Twitch anlegen (separater Account, z.B. `captnblacky_bot`), und im eigenen
   Kanal per `/mod captnblacky_bot` zum Moderator machen (sonst greifen die Mod-Checks im Bot nicht,
   weil Twitch selbst dann kein `moderator`-Badge sendet).
2. **OAuth-Token** für den Bot-Account mit den Scopes `chat:read` und `chat:edit` holen, z.B. über
   https://twitchtokengenerator.com (Bot Chat Token) oder die Twitch-CLI. Nur den reinen Token-Wert
   behalten, ohne führendes `oauth:` (der Code hängt das selbst an).
3. In [wrangler.jsonc](./wrangler.jsonc) `TWITCH_BOT_USERNAME` auf den Bot-Login setzen,
   `TWITCH_CHANNEL` bei Bedarf anpassen (Standard: `captnblacky`).
4. Secrets setzen (landen verschlüsselt bei Cloudflare, nie im Repo):
   ```bash
   npx wrangler secret put TWITCH_BOT_OAUTH_TOKEN
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   ```
   Der `service_role`-Key kommt aus Supabase unter Project Settings → API Keys (nicht der
   anon/publishable Key, der reicht hier nicht, weil der Bot in `matches` schreiben muss).
5. Deployen:
   ```bash
   npm install
   npm run deploy
   ```
6. Einmal die Worker-URL manuell aufrufen (oder 2 Minuten auf den Cron-Trigger warten), damit die
   Durable-Object-Instanz die erste IRC-Verbindung aufbaut.

## Warum ein eigener Worker statt im Angular-Worker?

Der Angular-Worker ist ein reiner Static-Assets-Worker mit denkbar einfacher Deploy-Pipeline
(`npm run build` → `wrangler deploy`, siehe [../wrangler.jsonc](../wrangler.jsonc)). Durable
Objects, Cron-Trigger und Secrets hier reinzumischen hätte diese Pipeline unnötig verkompliziert,
für zwei fachlich getrennte Dinge (Bewerbungsseite vs. Chat-Bot) lohnt sich der eigene, unabhängig
deploybare Worker.
