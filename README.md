# Bewerbungsseite

Bewerbungsseite für "Captnblacky gegen Chat" (siehe [grundidee.md](./grundidee.md)). Angular +
Supabase, Deployment auf Cloudflare Pages.

## Setup

1. Supabase-Projekt anlegen, dann per Supabase-CLI verknüpfen und Schema + Seed einspielen:
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # spielt supabase/migrations ein
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
   ```
2. In Supabase unter Authentication → Providers Twitch aktivieren (Client-ID/Secret von
   dev.twitch.tv), Redirect-URL ist die Supabase-Callback-Adresse.
3. `src/environments/environment.ts` mit der echten Supabase-URL und dem **anon key** befüllen. Der
   service_role key gehört dort niemals hinein.
4. Vor dem produktiven Einsatz einmal einloggen und `raw_user_meta_data` in der Supabase-Konsole
   prüfen, ob die Twitch-Schlüsselnamen zum Trigger in der Migration passen (siehe Kommentar dort).

## Deployment (Cloudflare Pages)

Build-Befehl `npm run build`, Ausgabeverzeichnis `dist/bewerbungsseite/browser`. Die
`_redirects`-Datei für den SPA-Fallback liegt in `public/` und landet automatisch im Build-Output.

---

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.8.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
