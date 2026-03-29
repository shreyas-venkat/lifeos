import {
  Client,
  GatewayIntentBits,
  TextChannel,
  Message,
  Events,
} from 'discord.js';
import { registerChannel, ChannelOpts } from './registry.js';
import { Channel, NewMessage } from '../types.js';
import { logger } from '../logger.js';
import { ASSISTANT_NAME } from '../config.js';

const DISCORD_MAX_LENGTH = 2000;

/**
 * Splits text into chunks that fit within Discord's 2000 character limit.
 * Prefers splitting at newline boundaries for readability.
 */
export function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_MAX_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at the last newline within the limit
    const slice = remaining.slice(0, DISCORD_MAX_LENGTH);
    const lastNewline = slice.lastIndexOf('\n');

    if (lastNewline > 0) {
      chunks.push(remaining.slice(0, lastNewline));
      remaining = remaining.slice(lastNewline + 1);
    } else {
      // No newline found — hard split at the limit
      chunks.push(slice);
      remaining = remaining.slice(DISCORD_MAX_LENGTH);
    }
  }

  return chunks;
}

/**
 * Translates Discord <@id> mentions of the bot into @AssistantName format
 * so the NanoClaw trigger system can detect them.
 */
function translateMentions(content: string, botUserId: string): string {
  return content.replace(
    new RegExp(`<@!?${botUserId}>`, 'g'),
    `@${ASSISTANT_NAME}`,
  );
}

export class DiscordChannel implements Channel {
  readonly name = 'discord';
  private client: Client;
  private opts: ChannelOpts;
  private ready = false;

  constructor(opts: ChannelOpts) {
    this.opts = opts;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
      ],
    });
  }

  async connect(): Promise<void> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'DISCORD_BOT_TOKEN is required but not set in environment',
      );
    }

    this.client.on(Events.ClientReady, () => {
      this.ready = true;
      logger.info({ bot: this.client.user?.tag }, 'Discord channel connected');
    });

    this.client.on(Events.MessageCreate, (msg: Message) => {
      this.handleMessage(msg);
    });

    this.client.on(Events.Error, (err: Error) => {
      logger.error({ err }, 'Discord client error');
    });

    await this.client.login(token);
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const channelId = jid.slice(3); // strip 'dc:'
    const channel = await this.client.channels.fetch(channelId);

    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn({ jid }, 'Discord channel not found or not a text channel');
      return;
    }

    const chunks = splitMessage(text);
    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  }

  isConnected(): boolean {
    return this.ready && this.client.isReady();
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('dc:');
  }

  async disconnect(): Promise<void> {
    this.ready = false;
    this.client.destroy();
    logger.info('Discord channel disconnected');
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!isTyping) return;

    const channelId = jid.slice(3);
    const channel = await this.client.channels.fetch(channelId);

    if (channel && channel instanceof TextChannel) {
      await channel.sendTyping();
    }
  }

  private handleMessage(msg: Message): void {
    // Ignore messages from bots (including self)
    if (msg.author.bot) return;

    const chatJid = `dc:${msg.channelId}`;
    const botUserId = this.client.user?.id ?? '';

    const content = translateMentions(msg.content, botUserId);

    const isGuild = msg.guild !== null;
    const channelName =
      (msg.channel instanceof TextChannel ? msg.channel.name : undefined) ??
      (isGuild ? 'unknown-channel' : 'DM');

    const newMessage: NewMessage = {
      id: msg.id,
      chat_jid: chatJid,
      sender: msg.author.id,
      sender_name:
        msg.member?.displayName ||
        msg.author.displayName ||
        msg.author.username,
      content,
      timestamp: msg.createdAt.toISOString(),
      is_from_me: msg.author.id === this.client.user?.id,
    };

    this.opts.onChatMetadata(
      chatJid,
      newMessage.timestamp,
      channelName,
      'discord',
      isGuild,
    );

    this.opts.onMessage(chatJid, newMessage);
  }
}

// Self-register when this module is imported
registerChannel('discord', (opts: ChannelOpts) => {
  if (!process.env.DISCORD_BOT_TOKEN) return null;
  return new DiscordChannel(opts);
});
