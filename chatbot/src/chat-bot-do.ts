import { createClient } from '@supabase/supabase-js';
import type { Env } from './env';
import { connectIrc, loginFromPrefix, parseIrcMessage } from './twitch-irc';

interface CheckedInEntry {
  twitchUserId: string;
  twitchLogin: string;
  profileId: string;
}

type Phase = 'idle' | 'checkin' | 'voting';

interface RoundState {
  phase: Phase;
  categorySlug: string | null;
  categoryId: string | null;
  checkedIn: Record<string, CheckedInEntry>; // key: twitchUserId
  votes: Record<string, string>; // key: voter twitchUserId, value: gewählter twitchLogin
}

const EMPTY_ROUND: RoundState = {
  phase: 'idle',
  categorySlug: null,
  categoryId: null,
  checkedIn: {},
  votes: {},
};

const RECONNECT_CHECK_MS = 2 * 60_000;
// Twitch-Access-Tokens laufen üblicherweise nach ~4h ab, wir erneuern proaktiv
// deutlich davor, damit es im laufenden Stream keinen stillen Verbindungsabriss gibt.
const TOKEN_REFRESH_INTERVAL_MS = 3 * 60 * 60_000;

interface TokenState {
  access: string;
  refresh: string;
  refreshedAt: number;
}

/**
 * Ein einziges globales Durable-Object-Exemplar (siehe idFromName('main') in
 * index.ts). Hält die Twitch-IRC-WebSocket-Verbindung und die aktuelle
 * Check-in/Voting-Runde. Zustand liegt in Durable-Object-Storage, übersteht
 * also einen Neustart des Workers.
 */
export class ChatBotDo implements DurableObject {
  private socket: WebSocket | null = null;
  private round: RoundState = EMPTY_ROUND;
  private tokens: TokenState | null = null;
  private ready: Promise<void>;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env: Env,
  ) {
    this.ready = (async () => {
      const [savedRound, savedTokens] = await Promise.all([
        this.ctx.storage.get<RoundState>('round'),
        this.ctx.storage.get<TokenState>('tokens'),
      ]);
      if (savedRound) this.round = savedRound;
      if (savedTokens) {
        this.tokens = savedTokens;
      } else {
        // Erster Start: Tokens aus den Secrets übernehmen und ab jetzt selbst verwalten.
        this.tokens = {
          access: this.env.TWITCH_BOT_OAUTH_TOKEN,
          refresh: this.env.TWITCH_BOT_REFRESH_TOKEN,
          refreshedAt: Date.now(),
        };
        await this.ctx.storage.put('tokens', this.tokens);
      }
    })();
  }

  async fetch(_request: Request): Promise<Response> {
    await this.ready;
    await this.ensureConnected();
    return new Response('ok');
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.ensureConnected();
    await this.ctx.storage.setAlarm(Date.now() + RECONNECT_CHECK_MS);
  }

  private async ensureConnected(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      console.log('ensureConnected: already open, skipping');
      return;
    }
    if (!this.tokens) return; // ready ist noch nicht durchgelaufen, sollte durch await this.ready oben nicht passieren
    if (Date.now() - this.tokens.refreshedAt > TOKEN_REFRESH_INTERVAL_MS) {
      await this.refreshTokens();
    }

    console.log('ensureConnected: opening IRC connection as', this.env.TWITCH_BOT_USERNAME, 'for channel', this.env.TWITCH_CHANNEL);
    const socket = connectIrc(this.tokens.access, this.env.TWITCH_BOT_USERNAME, this.env.TWITCH_CHANNEL);
    socket.addEventListener('open', () => {
      console.log('irc socket open');
    });
    socket.addEventListener('message', (event) => {
      void this.onIrcData(String(event.data));
    });
    socket.addEventListener('close', (event) => {
      console.log('irc socket closed', event.code, event.reason);
      if (this.socket === socket) this.socket = null;
    });
    socket.addEventListener('error', (event) => {
      console.error('irc socket error', event);
      if (this.socket === socket) this.socket = null;
    });
    this.socket = socket;

    const existingAlarm = await this.ctx.storage.getAlarm();
    if (existingAlarm === null) {
      await this.ctx.storage.setAlarm(Date.now() + RECONNECT_CHECK_MS);
    }
  }

  /**
   * Erneuert über twitchtokengenerator.com's Refresh-Endpunkt
   * (GET /api/refresh/<refresh_token>). Deren genaues Antwortformat ist nicht
   * offiziell dokumentiert, daher werden mehrere plausible Feldnamen akzeptiert
   * und eine unerwartete Antwort geloggt statt stillschweigend zu scheitern.
   */
  private async refreshTokens(): Promise<void> {
    if (!this.tokens) return;
    try {
      const response = await fetch(`https://twitchtokengenerator.com/api/refresh/${this.tokens.refresh}`);
      const data = (await response.json()) as Record<string, unknown>;
      const access = data['token'] ?? data['access_token'] ?? data['access'];
      const refresh = data['refresh'] ?? data['refresh_token'] ?? this.tokens.refresh;
      if (typeof access !== 'string' || typeof refresh !== 'string') {
        console.error('token refresh: unerwartete Antwort', JSON.stringify(data));
        return;
      }
      this.tokens = { access, refresh, refreshedAt: Date.now() };
      await this.ctx.storage.put('tokens', this.tokens);
      console.log('twitch token refreshed');
    } catch (err) {
      console.error('token refresh fehlgeschlagen', err);
    }
  }

  private async onIrcData(raw: string): Promise<void> {
    console.log('irc data:', raw);
    for (const line of raw.split('\r\n')) {
      if (!line) continue;
      const msg = parseIrcMessage(line);
      if (!msg) continue;

      if (msg.command === 'PING') {
        this.socket?.send(`PONG :${msg.trailing ?? 'tmi.twitch.tv'}\r\n`);
        continue;
      }
      if (msg.command === 'NOTICE') {
        console.log('irc notice:', msg.trailing);
        if (msg.trailing?.toLowerCase().includes('login authentication failed')) {
          // Twitch trennt die Verbindung direkt danach selbst; der nächste Alarm
          // (spätestens in RECONNECT_CHECK_MS) verbindet mit dem neuen Token neu.
          await this.refreshTokens();
        }
      }
      if (msg.command === 'PRIVMSG') {
        console.log('privmsg from', loginFromPrefix(msg.prefix), ':', msg.trailing);
        await this.handleChatMessage(msg.tags, msg.prefix, msg.trailing ?? '');
      }
    }
  }

  private async handleChatMessage(
    tags: Record<string, string>,
    prefix: string | null,
    text: string,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed.startsWith('!')) return;

    const [rawCommand, ...rest] = trimmed.slice(1).split(/\s+/);
    const command = rawCommand.toLowerCase();
    const arg = rest.join(' ').trim();

    const twitchUserId = tags['user-id'];
    if (!twitchUserId) return;
    const twitchLogin = loginFromPrefix(prefix);
    const badges = tags['badges'] ?? '';
    const isMod = badges.includes('moderator') || badges.includes('broadcaster');

    switch (command) {
      case 'opencheckin':
        if (isMod) await this.openCheckin(arg);
        break;
      case 'checkin':
        await this.checkin(twitchUserId, twitchLogin);
        break;
      case 'closecheckin':
        if (isMod) await this.closeCheckin();
        break;
      case 'startvote':
        if (isMod) await this.startVote();
        break;
      case 'vote':
        await this.vote(twitchUserId, arg);
        break;
      case 'closevote':
        if (isMod) await this.closeVote();
        break;
      case 'botstatus':
        if (isMod) this.say(this.statusText());
        break;
    }
  }

  private async openCheckin(slug: string): Promise<void> {
    if (!slug) {
      this.say('Bitte Kategorie angeben: !opencheckin <slug>');
      return;
    }
    const { data: category, error } = await this.supabase()
      .from('categories')
      .select('id, name, is_open')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !category) {
      this.say(`Kategorie "${slug}" nicht gefunden.`);
      return;
    }
    if (!category.is_open) {
      this.say(`Kategorie "${category.name}" ist geschlossen.`);
      return;
    }

    this.round = { ...EMPTY_ROUND, phase: 'checkin', categorySlug: slug, categoryId: category.id };
    await this.persist();
    this.say(`Check-in für ${category.name} ist offen! Schreibt !checkin im Chat, wenn ihr euch beworben habt.`);
  }

  private async checkin(twitchUserId: string, twitchLogin: string): Promise<void> {
    if (this.round.phase !== 'checkin' || !this.round.categoryId) return;
    if (this.round.checkedIn[twitchUserId]) return;

    const { data: profile } = await this.supabase()
      .from('profiles')
      .select('id')
      .eq('twitch_user_id', twitchUserId)
      .maybeSingle();
    if (!profile) return;

    const { data: application } = await this.supabase()
      .from('applications')
      .select('id')
      .eq('profile_id', profile.id)
      .eq('category_id', this.round.categoryId)
      .maybeSingle();
    if (!application) return;

    this.round.checkedIn[twitchUserId] = { twitchUserId, twitchLogin, profileId: profile.id };
    await this.persist();
  }

  private async closeCheckin(): Promise<void> {
    if (this.round.phase !== 'checkin') return;
    this.round.phase = 'idle';
    await this.persist();

    const names = Object.values(this.round.checkedIn).map((c) => c.twitchLogin);
    this.say(
      names.length === 0
        ? 'Check-in geschlossen, niemand hat sich eingecheckt.'
        : `Check-in geschlossen. Eingecheckt: ${names.join(', ')}`,
    );
  }

  private async startVote(): Promise<void> {
    if (Object.keys(this.round.checkedIn).length === 0) {
      this.say('Niemand eingecheckt, Voting macht keinen Sinn.');
      return;
    }
    this.round.phase = 'voting';
    this.round.votes = {};
    await this.persist();

    const names = Object.values(this.round.checkedIn).map((c) => c.twitchLogin);
    this.say(`Voting läuft! Stimmt ab mit !vote <Name>: ${names.join(', ')}`);
  }

  private async vote(voterTwitchUserId: string, rawName: string): Promise<void> {
    if (this.round.phase !== 'voting' || !rawName) return;
    const name = rawName.toLowerCase().replace(/^@/, '');
    const candidate = Object.values(this.round.checkedIn).find((c) => c.twitchLogin === name);
    if (!candidate) return;

    this.round.votes[voterTwitchUserId] = candidate.twitchLogin;
    await this.persist();
  }

  private async closeVote(): Promise<void> {
    if (this.round.phase !== 'voting' || !this.round.categoryId) return;

    const candidates = Object.values(this.round.checkedIn);
    if (candidates.length === 0) {
      this.say('Kein Kandidat eingecheckt.');
      await this.resetRound();
      return;
    }

    const tally: Record<string, number> = {};
    for (const login of Object.values(this.round.votes)) {
      tally[login] = (tally[login] ?? 0) + 1;
    }

    // ponytail: Gleichstand gewinnt der zuerst eingecheckte Kandidat, kein Losverfahren.
    let winner = candidates[0];
    let best = tally[winner.twitchLogin] ?? 0;
    for (const candidate of candidates) {
      const count = tally[candidate.twitchLogin] ?? 0;
      if (count > best) {
        best = count;
        winner = candidate;
      }
    }

    const { error } = await this.supabase()
      .from('matches')
      .insert({ category_id: this.round.categoryId, profile_id: winner.profileId, vote_counts: tally });
    if (error) {
      this.say('Konnte das Ergebnis nicht speichern, bitte Logs checken.');
    } else {
      this.say(`Voting beendet! ${winner.twitchLogin} tritt gegen den Streamer an (${best} Stimmen).`);
    }

    await this.resetRound();
  }

  private async resetRound(): Promise<void> {
    this.round = EMPTY_ROUND;
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.ctx.storage.put('round', this.round);
  }

  private statusText(): string {
    const count = Object.keys(this.round.checkedIn).length;
    return `Phase: ${this.round.phase}, Kategorie: ${this.round.categorySlug ?? '-'}, eingecheckt: ${count}`;
  }

  private supabase() {
    return createClient(this.env.SUPABASE_URL, this.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  private say(message: string): void {
    this.socket?.send(`PRIVMSG #${this.env.TWITCH_CHANNEL} :${message}\r\n`);
  }
}
