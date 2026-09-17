import type { Env } from './env';
import { ChatBotDo } from './chat-bot-do';

export { ChatBotDo };

function stub(env: Env) {
  const id = env.CHAT_BOT.idFromName('main');
  return env.CHAT_BOT.get(id);
}

export default {
  // Nur zum manuellen Anstoßen/Debuggen, der eigentliche Trigger ist der Cron unten.
  async fetch(request: Request, env: Env): Promise<Response> {
    return stub(env).fetch(request);
  },

  // Hält die Twitch-IRC-Verbindung am Leben und verbindet nach einem Abriss neu.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await stub(env).fetch('https://chatbot.internal/keepalive');
  },
} satisfies ExportedHandler<Env>;
