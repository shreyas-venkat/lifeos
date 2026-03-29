import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { ChannelOpts } from './registry.js';

// ---------- googleapis mock ----------

const mockGetAccessToken = vi.fn().mockResolvedValue({ token: 'tok' });
const mockSetCredentials = vi.fn();
const mockMessagesList = vi.fn().mockResolvedValue({ data: { messages: [] } });
const mockMessagesGet = vi.fn();
const mockMessagesModify = vi.fn().mockResolvedValue({});
const mockMessagesSend = vi.fn().mockResolvedValue({});

vi.mock('googleapis', () => {
  // Must use a real class so `new google.auth.OAuth2(...)` works.
  class MockOAuth2 {
    getAccessToken = mockGetAccessToken;
    setCredentials = mockSetCredentials;
  }

  return {
    google: {
      auth: { OAuth2: MockOAuth2 },
      gmail: vi.fn().mockReturnValue({
        users: {
          messages: {
            list: mockMessagesList,
            get: mockMessagesGet,
            modify: mockMessagesModify,
            send: mockMessagesSend,
          },
        },
      }),
    },
    gmail_v1: {},
  };
});

// ---------- helpers ----------

function makeOpts(overrides?: Partial<ChannelOpts>): ChannelOpts {
  return {
    onMessage: overrides?.onMessage ?? vi.fn(),
    onChatMetadata: overrides?.onChatMetadata ?? vi.fn(),
    registeredGroups: overrides?.registeredGroups ?? (() => ({})),
  };
}

// ---------- tests ----------

describe('GmailChannel', () => {
  const ORIG_ENV = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'csecret';
    process.env.GOOGLE_REFRESH_TOKEN = 'rtoken';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...ORIG_ENV };
  });

  // We need to import after mocks are set up, but since vi.mock is hoisted
  // we can import at the top level after the mock block.
  // However, the factory self-registers at import time, so we import the
  // class directly and also test via the registry.

  it('factory returns null when GOOGLE_CLIENT_ID is missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    // Re-import to get factory via registry
    const { getChannelFactory } = await import('./registry.js');
    // The channel was already registered at first import, so we call the factory
    // We need the factory registered by gmail.ts — import it to ensure registration
    await import('./gmail.js');
    const factory = getChannelFactory('gmail');
    expect(factory).toBeDefined();
    const channel = factory!(makeOpts());
    expect(channel).toBeNull();
  });

  it('factory returns null when GOOGLE_CLIENT_SECRET is missing', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { getChannelFactory } = await import('./registry.js');
    await import('./gmail.js');
    const factory = getChannelFactory('gmail');
    const channel = factory!(makeOpts());
    expect(channel).toBeNull();
  });

  it('factory returns null when GOOGLE_REFRESH_TOKEN is missing', async () => {
    delete process.env.GOOGLE_REFRESH_TOKEN;
    const { getChannelFactory } = await import('./registry.js');
    await import('./gmail.js');
    const factory = getChannelFactory('gmail');
    const channel = factory!(makeOpts());
    expect(channel).toBeNull();
  });

  it('factory returns GmailChannel when all 3 env vars are set', async () => {
    const { getChannelFactory } = await import('./registry.js');
    await import('./gmail.js');
    const factory = getChannelFactory('gmail');
    const channel = factory!(makeOpts());
    expect(channel).not.toBeNull();
    expect(channel!.name).toBe('gmail');
  });

  it('ownsJid identifies gmail: prefix', async () => {
    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', makeOpts());
    expect(ch.ownsJid('gmail:user@example.com')).toBe(true);
    expect(ch.ownsJid('whatsapp:12345')).toBe(false);
    expect(ch.ownsJid('telegram:99')).toBe(false);
    expect(ch.ownsJid('')).toBe(false);
  });

  it('connect sets up OAuth2 client and starts polling', async () => {
    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', makeOpts());

    await ch.connect();
    expect(ch.isConnected()).toBe(true);
    expect(mockGetAccessToken).toHaveBeenCalledOnce();
  });

  it('isConnected returns false before connect', async () => {
    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', makeOpts());
    expect(ch.isConnected()).toBe(false);
  });

  it('inbox polling fetches unread primary emails', async () => {
    const onMessage = vi.fn();
    const onChatMetadata = vi.fn();
    const opts = makeOpts({ onMessage, onChatMetadata });

    const now = Date.now();

    mockMessagesList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-1' }] },
    });
    mockMessagesGet.mockResolvedValueOnce({
      data: {
        internalDate: String(now + 1000),
        snippet: 'Hello from test',
        payload: {
          headers: [
            { name: 'From', value: 'Alice <alice@example.com>' },
            { name: 'Subject', value: 'Test Subject' },
          ],
        },
      },
    });

    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', opts);
    await ch.connect();

    // Advance timer to trigger poll
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockMessagesList).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        q: 'is:unread category:primary',
        maxResults: 10,
      }),
    );
    expect(onMessage).toHaveBeenCalledOnce();
    expect(onChatMetadata).toHaveBeenCalledOnce();
  });

  it('message format includes sender, subject, snippet', async () => {
    const onMessage = vi.fn();
    const opts = makeOpts({ onMessage });

    const now = Date.now();

    mockMessagesList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-2' }] },
    });
    mockMessagesGet.mockResolvedValueOnce({
      data: {
        internalDate: String(now + 2000),
        snippet: 'Important content here',
        payload: {
          headers: [
            { name: 'From', value: 'Bob <bob@test.com>' },
            { name: 'Subject', value: 'Urgent' },
          ],
        },
      },
    });

    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', opts);
    await ch.connect();

    await vi.advanceTimersByTimeAsync(60_000);

    const msg = onMessage.mock.calls[0][1];
    expect(msg.content).toContain('[Email from Bob <bob@test.com>]');
    expect(msg.content).toContain('Subject: Urgent');
    expect(msg.content).toContain('Important content here');
    expect(msg.chat_jid).toBe('gmail:bob@test.com');
    expect(msg.sender_name).toBe('Bob');
  });

  it('sendMessage creates proper MIME email', async () => {
    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', makeOpts());
    await ch.connect();

    await ch.sendMessage('gmail:test@example.com', 'Hello there');

    expect(mockMessagesSend).toHaveBeenCalledOnce();
    const call = mockMessagesSend.mock.calls[0][0];
    expect(call.userId).toBe('me');

    // Decode the raw base64url message
    const raw = call.requestBody.raw;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('To: test@example.com');
    expect(decoded).toContain('Hello there');
    expect(decoded).toContain('Content-Type: text/plain; charset=utf-8');
  });

  it('disconnect stops polling', async () => {
    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', makeOpts());
    await ch.connect();
    expect(ch.isConnected()).toBe(true);

    await ch.disconnect();
    expect(ch.isConnected()).toBe(false);

    // Further polls should not fire
    mockMessagesList.mockClear();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mockMessagesList).not.toHaveBeenCalled();
  });

  it('duplicate emails are not re-processed (lastChecked tracking)', async () => {
    const onMessage = vi.fn();
    const opts = makeOpts({ onMessage });

    const now = Date.now();

    // First poll: one message
    mockMessagesList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-dup' }] },
    });
    mockMessagesGet.mockResolvedValueOnce({
      data: {
        internalDate: String(now + 500),
        snippet: 'First',
        payload: {
          headers: [
            { name: 'From', value: 'dup@test.com' },
            { name: 'Subject', value: 'Dup' },
          ],
        },
      },
    });

    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', opts);
    await ch.connect();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onMessage).toHaveBeenCalledOnce();

    // Second poll: same message returned again (still in list before Gmail index updates)
    // The internalDate is now <= lastCheckedMs, so it should be skipped
    mockMessagesList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-dup' }] },
    });
    mockMessagesGet.mockResolvedValueOnce({
      data: {
        internalDate: String(now + 500), // same timestamp as before
        snippet: 'First',
        payload: {
          headers: [
            { name: 'From', value: 'dup@test.com' },
            { name: 'Subject', value: 'Dup' },
          ],
        },
      },
    });

    onMessage.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('marks messages as read after processing', async () => {
    const opts = makeOpts();
    const now = Date.now();

    mockMessagesList.mockResolvedValueOnce({
      data: { messages: [{ id: 'msg-read' }] },
    });
    mockMessagesGet.mockResolvedValueOnce({
      data: {
        internalDate: String(now + 3000),
        snippet: 'Read me',
        payload: {
          headers: [
            { name: 'From', value: 'reader@test.com' },
            { name: 'Subject', value: 'Read Test' },
          ],
        },
      },
    });

    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', opts);
    await ch.connect();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockMessagesModify).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg-read',
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  });

  it('skips messages with no id', async () => {
    const onMessage = vi.fn();
    const opts = makeOpts({ onMessage });

    mockMessagesList.mockResolvedValueOnce({
      data: { messages: [{ id: undefined }] },
    });

    const { GmailChannel } = await import('./gmail.js');
    const ch = new GmailChannel('cid', 'csecret', 'rtoken', opts);
    await ch.connect();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onMessage).not.toHaveBeenCalled();
  });
});
