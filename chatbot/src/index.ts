import { createClient } from '@supabase/supabase-js';
import type { Env } from './env';
import { ChatBotDo } from './chat-bot-do';

export { ChatBotDo };

// Vom Admin-Panel aufrufbare Runden-Steuerung, als Alternative zu den
// Chat-Befehlen. Führt intern dieselben DO-Methoden aus (inkl. Chat-Ansage),
// nur eben per Klick statt per !opencheckin im Chat.
const ADMIN_ROUTES = new Set(['/opencheckin', '/closecheckin', '/startvote', '/closevote', '/cancelround']);

function stub(env: Env) {
  const id = env.CHAT_BOT.idFromName('main');
  return env.CHAT_BOT.get(id);
}

function corsHeaders(env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

/** Prüft den Supabase-Access-Token des Anfragenden gegen profiles.is_admin. */
async function isAdminRequest(request: Request, env: Env): Promise<boolean> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!userResponse.ok) {
    return false;
  }
  const user = (await userResponse.json()) as { id?: string };
  if (!user.id) {
    return false;
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  return profile?.is_admin === true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!ADMIN_ROUTES.has(url.pathname)) {
      // Cron-Keepalive-Ping o.ä., kein Kommando, keine CORS/Auth nötig.
      return stub(env).fetch(request);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (!(await isAdminRequest(request, env))) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders(env) });
    }

    const response = await stub(env).fetch(request);
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { ...corsHeaders(env), 'Content-Type': 'application/json' },
    });
  },

  // Hält die Twitch-IRC-Verbindung am Leben und verbindet nach einem Abriss neu.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await stub(env).fetch('https://chatbot.internal/keepalive');
  },
} satisfies ExportedHandler<Env>;
