/**
 * Minimaler Twitch-IRC-Client über WebSocket. Bewusst kein npm-Paket (tmi.js
 * & co. sind auf Node's net-Modul ausgelegt, das gibt's im Workers-Runtime
 * nicht), die paar Zeilen IRC-Parsing sind einfacher als eine Node-Bibliothek
 * an die Workers-Umgebung anzupassen.
 */

export interface ParsedIrcMessage {
  tags: Record<string, string>;
  prefix: string | null;
  command: string;
  params: string[];
  trailing: string | null;
}

export function connectIrc(oauthToken: string, username: string, channel: string): WebSocket {
  const socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
  socket.addEventListener('open', () => {
    socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
    socket.send(`PASS oauth:${oauthToken.replace(/^oauth:/, '')}\r\n`);
    socket.send(`NICK ${username.toLowerCase()}\r\n`);
    socket.send(`JOIN #${channel.toLowerCase()}\r\n`);
  });
  return socket;
}

/** Parst eine einzelne IRC-Zeile (ein `message`-Event kann mehrere \r\n-getrennte Zeilen enthalten). */
export function parseIrcMessage(line: string): ParsedIrcMessage | null {
  let rest = line;
  const tags: Record<string, string> = {};

  if (rest.startsWith('@')) {
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) return null;
    for (const pair of rest.slice(1, spaceIdx).split(';')) {
      const [key, value = ''] = pair.split('=');
      tags[key] = value.replace(/\\s/g, ' ').replace(/\\:/g, ';');
    }
    rest = rest.slice(spaceIdx + 1);
  }

  let prefix: string | null = null;
  if (rest.startsWith(':')) {
    const spaceIdx = rest.indexOf(' ');
    if (spaceIdx === -1) return null;
    prefix = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }

  let trailing: string | null = null;
  let paramsPart = rest;
  const trailingIdx = rest.indexOf(' :');
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2);
    paramsPart = rest.slice(0, trailingIdx);
  }

  const params = paramsPart.split(' ').filter(Boolean);
  const command = params.shift();
  if (!command) return null;

  return { tags, prefix, command, params, trailing };
}

/** Login-Name (klein geschrieben) aus dem IRC-Prefix, z.B. "captnblacky!captnblacky@...tmi.twitch.tv". */
export function loginFromPrefix(prefix: string | null): string {
  return (prefix?.split('!')[0] ?? '').toLowerCase();
}
