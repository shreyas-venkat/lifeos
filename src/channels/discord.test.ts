import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { ChannelOpts } from './registry.js';

// vi.hoisted runs before vi.mock hoisting, so these classes are available
// inside the mock factory without triggering the no-require-imports rule.
const { MockClient, MockTextChannel } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { EventEmitter: EE } = require('events');

  class MockTextChannel {
    id: string;
    name: string;
    send: ReturnType<typeof vi.fn>;
    sendTyping: ReturnType<typeof vi.fn>;

    constructor(id: string, name = 'general') {
      this.id = id;
      this.name = name;
      this.send = vi.fn().mockResolvedValue(undefined);
      this.sendTyping = vi.fn().mockResolvedValue(undefined);
    }
  }

  class MockClient extends EE {
    user = { id: 'bot-user-id', tag: 'TestBot#1234' };
    _channels = new Map<string, InstanceType<typeof MockTextChannel>>();
    _ready = false;

    channels = {
      fetch: vi.fn(async (id: string) => this._channels.get(id) ?? null),
    };

    isReady() {
      return this._ready;
    }

    async login(_token: string) {
      this._ready = true;
      queueMicrotask(() => this.emit('ready', this));
    }

    destroy() {
      this._ready = false;
    }

    _addChannel(ch: InstanceType<typeof MockTextChannel>) {
      this._channels.set(ch.id, ch);
    }
  }

  return { MockClient, MockTextChannel };
});

vi.mock('discord.js', () => ({
  Client: MockClient,
  TextChannel: MockTextChannel,
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4,
    DirectMessages: 8,
    GuildMembers: 16,
  },
  Events: {
    ClientReady: 'ready',
    MessageCreate: 'messageCreate',
    Error: 'error',
  },
}));

// Import after mocks are set up
import { DiscordChannel, splitMessage } from './discord.js';
import { getChannelFactory } from './registry.js';

// Type aliases for the mock instances
type TMockClient = InstanceType<typeof MockClient> &
  EventEmitter & {
    _addChannel(ch: InstanceType<typeof MockTextChannel>): void;
    _channels: Map<string, InstanceType<typeof MockTextChannel>>;
  };
type TMockTextChannel = InstanceType<typeof MockTextChannel>;

// --- Helpers ---

function makeOpts(overrides: Partial<ChannelOpts> = {}): ChannelOpts {
  return {
    onMessage: vi.fn(),
    onChatMetadata: vi.fn(),
    registeredGroups: () => ({}),
    ...overrides,
  };
}

function makeMockTextChannel(id: string, name = 'general'): TMockTextChannel {
  return new MockTextChannel(id, name);
}

function makeDiscordMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-123',
    channelId: '999888777',
    content: 'Hello world',
    createdAt: new Date('2026-03-29T12:00:00Z'),
    author: {
      id: 'user-456',
      bot: false,
      username: 'testuser',
      displayName: 'Test User',
    },
    member: {
      displayName: 'Server Nickname',
    },
    guild: { id: 'guild-1' },
    channel: makeMockTextChannel('999888777', 'general'),
    ...overrides,
  };
}

// --- Tests ---

describe('splitMessage', () => {
  it('returns single-element array for short messages', () => {
    expect(splitMessage('hello')).toEqual(['hello']);
  });

  it('returns single-element array for exactly 2000 chars', () => {
    const msg = 'a'.repeat(2000);
    const result = splitMessage(msg);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(msg);
  });

  it('splits long messages at newline boundaries', () => {
    const line = 'a'.repeat(1000);
    const text = `${line}\n${line}\n${line}`;
    const result = splitMessage(text);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(result.join('\n')).toBe(text);
  });

  it('hard-splits when no newline exists within limit', () => {
    const text = 'a'.repeat(4500);
    const result = splitMessage(text);
    expect(result).toHaveLength(3);
    expect(result[0].length).toBe(2000);
    expect(result[1].length).toBe(2000);
    expect(result[2].length).toBe(500);
  });

  it('handles empty string', () => {
    expect(splitMessage('')).toEqual(['']);
  });
});

describe('DiscordChannel factory registration', () => {
  const originalToken = process.env.DISCORD_BOT_TOKEN;

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.DISCORD_BOT_TOKEN = originalToken;
    } else {
      delete process.env.DISCORD_BOT_TOKEN;
    }
  });

  it('factory returns null when DISCORD_BOT_TOKEN is missing', () => {
    delete process.env.DISCORD_BOT_TOKEN;
    const factory = getChannelFactory('discord');
    expect(factory).toBeDefined();
    const channel = factory!(makeOpts());
    expect(channel).toBeNull();
  });

  it('factory returns DiscordChannel when DISCORD_BOT_TOKEN is set', () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    const factory = getChannelFactory('discord');
    expect(factory).toBeDefined();
    const channel = factory!(makeOpts());
    expect(channel).toBeInstanceOf(DiscordChannel);
    expect(channel!.name).toBe('discord');
  });
});

describe('DiscordChannel', () => {
  let channel: DiscordChannel;
  let opts: ChannelOpts;
  let mockClient: TMockClient;

  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = 'test-token';
    opts = makeOpts();
    channel = new DiscordChannel(opts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient = (channel as any).client as TMockClient;
  });

  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
  });

  describe('ownsJid', () => {
    it('returns true for dc: prefixed JIDs', () => {
      expect(channel.ownsJid('dc:123456789')).toBe(true);
    });

    it('returns false for non-dc: JIDs', () => {
      expect(channel.ownsJid('tg:123456789')).toBe(false);
      expect(channel.ownsJid('123@g.us')).toBe(false);
      expect(channel.ownsJid('discord:123')).toBe(false);
    });
  });

  describe('connect', () => {
    it('throws when DISCORD_BOT_TOKEN is not set', async () => {
      delete process.env.DISCORD_BOT_TOKEN;
      const ch = new DiscordChannel(opts);
      await expect(ch.connect()).rejects.toThrow('DISCORD_BOT_TOKEN');
    });

    it('logs in and becomes ready', async () => {
      await channel.connect();
      await new Promise((r) => setTimeout(r, 10));
      expect(channel.isConnected()).toBe(true);
    });
  });

  describe('sendMessage', () => {
    it('sends text to the correct channel', async () => {
      const mockTextCh = makeMockTextChannel('12345', 'test');
      mockClient._addChannel(mockTextCh);

      await channel.sendMessage('dc:12345', 'Hello Discord');

      expect(mockClient.channels.fetch).toHaveBeenCalledWith('12345');
      expect(mockTextCh.send).toHaveBeenCalledWith('Hello Discord');
    });

    it('splits long messages into multiple sends', async () => {
      const mockTextCh = makeMockTextChannel('12345', 'test');
      mockClient._addChannel(mockTextCh);

      const longText = 'a'.repeat(4500);
      await channel.sendMessage('dc:12345', longText);

      expect(mockTextCh.send).toHaveBeenCalledTimes(3);
      for (const call of mockTextCh.send.mock.calls) {
        expect((call[0] as string).length).toBeLessThanOrEqual(2000);
      }
    });

    it('handles missing channel gracefully', async () => {
      await expect(
        channel.sendMessage('dc:nonexistent', 'Hello'),
      ).resolves.toBeUndefined();
    });
  });

  describe('setTyping', () => {
    it('calls sendTyping when isTyping is true', async () => {
      const mockTextCh = makeMockTextChannel('12345', 'test');
      mockClient._addChannel(mockTextCh);

      await channel.setTyping('dc:12345', true);

      expect(mockTextCh.sendTyping).toHaveBeenCalled();
    });

    it('does nothing when isTyping is false', async () => {
      const mockTextCh = makeMockTextChannel('12345', 'test');
      mockClient._addChannel(mockTextCh);

      await channel.setTyping('dc:12345', false);

      expect(mockTextCh.sendTyping).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('destroys the client', async () => {
      await channel.connect();
      await new Promise((r) => setTimeout(r, 10));
      expect(channel.isConnected()).toBe(true);

      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
    });
  });

  describe('message handler', () => {
    it('builds correct NewMessage and calls onMessage', async () => {
      await channel.connect();

      const msg = makeDiscordMessage();
      mockClient.emit('messageCreate', msg);

      expect(opts.onMessage).toHaveBeenCalledWith(
        'dc:999888777',
        expect.objectContaining({
          id: 'msg-123',
          chat_jid: 'dc:999888777',
          sender: 'user-456',
          sender_name: 'Server Nickname',
          content: 'Hello world',
          timestamp: '2026-03-29T12:00:00.000Z',
          is_from_me: false,
        }),
      );
    });

    it('calls onChatMetadata with channel info', async () => {
      await channel.connect();

      const msg = makeDiscordMessage();
      mockClient.emit('messageCreate', msg);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'dc:999888777',
        '2026-03-29T12:00:00.000Z',
        'general',
        'discord',
        true,
      );
    });

    it('ignores bot messages', async () => {
      await channel.connect();

      const botMsg = makeDiscordMessage({
        author: {
          id: 'bot-id',
          bot: true,
          username: 'bot',
          displayName: 'Bot',
        },
      });
      mockClient.emit('messageCreate', botMsg);

      expect(opts.onMessage).not.toHaveBeenCalled();
    });

    it('translates @bot mentions to @AssistantName', async () => {
      await channel.connect();

      const msg = makeDiscordMessage({
        content: 'Hey <@bot-user-id> what is the weather?',
      });
      mockClient.emit('messageCreate', msg);

      const call = (opts.onMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      const newMessage = call[1] as { content: string };
      expect(newMessage.content).toContain('@Andy');
      expect(newMessage.content).not.toContain('<@bot-user-id>');
    });

    it('translates @! style mentions too', async () => {
      await channel.connect();

      const msg = makeDiscordMessage({
        content: 'Hey <@!bot-user-id> do something',
      });
      mockClient.emit('messageCreate', msg);

      const call = (opts.onMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      const newMessage = call[1] as { content: string };
      expect(newMessage.content).toContain('@Andy');
      expect(newMessage.content).not.toContain('<@!bot-user-id>');
    });

    it('uses author displayName when member is null (DM)', async () => {
      await channel.connect();

      const msg = makeDiscordMessage({
        member: null,
        guild: null,
        channel: { name: undefined },
      });
      mockClient.emit('messageCreate', msg);

      const call = (opts.onMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      const newMessage = call[1] as { sender_name: string };
      expect(newMessage.sender_name).toBe('Test User');
    });

    it('uses author username as final fallback for sender_name', async () => {
      await channel.connect();

      const msg = makeDiscordMessage({
        member: null,
        guild: null,
        author: {
          id: 'user-456',
          bot: false,
          username: 'testuser',
          displayName: '',
        },
        channel: { name: undefined },
      });
      mockClient.emit('messageCreate', msg);

      const call = (opts.onMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      const newMessage = call[1] as { sender_name: string };
      expect(newMessage.sender_name).toBe('testuser');
    });

    it('sets is_from_me true when author is the bot', async () => {
      await channel.connect();

      const msg = makeDiscordMessage({
        author: {
          id: 'bot-user-id',
          bot: false,
          username: 'bot',
          displayName: 'Bot',
        },
      });
      mockClient.emit('messageCreate', msg);

      const call = (opts.onMessage as ReturnType<typeof vi.fn>).mock.calls[0];
      const newMessage = call[1] as { is_from_me: boolean };
      expect(newMessage.is_from_me).toBe(true);
    });

    it('sets isGroup false for DMs', async () => {
      await channel.connect();

      const msg = makeDiscordMessage({
        guild: null,
        channel: { name: undefined },
      });
      mockClient.emit('messageCreate', msg);

      expect(opts.onChatMetadata).toHaveBeenCalledWith(
        'dc:999888777',
        '2026-03-29T12:00:00.000Z',
        'DM',
        'discord',
        false,
      );
    });
  });
});
