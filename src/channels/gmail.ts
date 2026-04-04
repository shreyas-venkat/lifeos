import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import { Channel, NewMessage } from '../types.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';

const POLL_INTERVAL_MS = 60_000;
const MAX_RESULTS = 10;

export class GmailChannel implements Channel {
  readonly name = 'gmail';

  private oauth2: OAuth2Client;
  private gmail: gmail_v1.Gmail;
  private opts: ChannelOpts;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private lastCheckedMs = 0;

  constructor(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    opts: ChannelOpts,
  ) {
    this.opts = opts;
    this.oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    this.oauth2.setCredentials({ refresh_token: refreshToken });
    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2 });
  }

  async connect(): Promise<void> {
    // Validate credentials by fetching a fresh access token
    await this.oauth2.getAccessToken();
    this.connected = true;
    this.lastCheckedMs = Date.now();

    this.pollTimer = setInterval(() => {
      this.pollInbox().catch((err: unknown) => {
        logger.error({ err }, 'Gmail poll error');
      });
    }, POLL_INTERVAL_MS);

    logger.info('Gmail channel connected');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const email = jid.replace(/^gmail:/, '');
    const mimeMessage = [
      `To: ${email}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: Re: LifeOS`,
      '',
      text,
    ].join('\r\n');

    const encoded = Buffer.from(mimeMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('gmail:');
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.connected = false;
    logger.info('Gmail channel disconnected');
  }

  // --- private helpers ---

  private async pollInbox(): Promise<void> {
    const res = await this.gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread category:primary',
      maxResults: MAX_RESULTS,
    });

    const messages = res.data.messages ?? [];
    if (messages.length === 0) return;

    for (const stub of messages) {
      if (!stub.id) continue;

      const full = await this.gmail.users.messages.get({
        userId: 'me',
        id: stub.id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject'],
      });

      const internalDate = Number(full.data.internalDate ?? 0);
      if (internalDate <= this.lastCheckedMs) continue;

      const headers = full.data.payload?.headers ?? [];
      const sender = headers.find((h) => h.name === 'From')?.value ?? 'unknown';
      const subject =
        headers.find((h) => h.name === 'Subject')?.value ?? '(no subject)';
      const snippet = full.data.snippet ?? '';

      const chatJid = `gmail:${extractEmail(sender)}`;
      const newMsg: NewMessage = {
        id: stub.id,
        chat_jid: chatJid,
        sender: chatJid,
        sender_name: extractName(sender),
        content: `[Email from ${sender}] Subject: ${subject}\n\n${snippet}`,
        timestamp: new Date(internalDate).toISOString(),
      };

      // Create/update chat entry BEFORE storing message (FK constraint)
      this.opts.onChatMetadata(
        chatJid,
        newMsg.timestamp,
        extractName(sender),
        'gmail',
        false,
      );
      this.opts.onMessage(chatJid, newMsg);

      // Mark as read
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: stub.id,
        requestBody: { removeLabelIds: ['UNREAD'] },
      });
    }

    this.lastCheckedMs = Date.now();
  }
}

/** Extract bare email from "Name <email>" or plain "email" format. */
function extractEmail(from: string): string {
  const match = /<([^>]+)>/.exec(from);
  return match ? match[1] : from;
}

/** Extract display name from "Name <email>" or return the address. */
function extractName(from: string): string {
  const match = /^"?([^"<]+)"?\s*</.exec(from);
  return match ? match[1].trim() : from;
}

// --- Factory + self-registration ---

registerChannel('gmail', (opts: ChannelOpts): Channel | null => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    logger.info(
      'Gmail channel disabled — missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REFRESH_TOKEN',
    );
    return null;
  }

  return new GmailChannel(clientId, clientSecret, refreshToken, opts);
});
