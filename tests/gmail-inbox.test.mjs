import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInboxMessage, listInbox, readInboxMessage } from '../src/lib/gmail-inbox.ts';
import { hasAdminApiAccess, hasAdminPageAccess } from '../src/lib/admin-access.ts';
const encoded = value => Buffer.from(value).toString('base64url');
test('inbox requires its own permission for both the page and API', () => {
  assert.equal(hasAdminPageAccess(['/admin'], '/admin/inbox'), false);
  assert.equal(hasAdminApiAccess(['/admin/tracking'], '/api/admin/inbox'), false);
  assert.equal(hasAdminApiAccess(['/admin/inbox'], '/api/admin/inbox'), true);
  assert.equal(hasAdminApiAccess([], '/api/admin/inbox', { isOwner: true }), true);
});
test('nested multipart email prefers plain text and excludes attachments', () => {
  const result = normalizeInboxMessage({ id: 'abc', labelIds: ['UNREAD'], payload: { headers: [{ name: 'Subject', value: 'Order' }], parts: [{ parts: [{ mimeType: 'text/html', body: { data: encoded('<p>HTML</p>') } }, { mimeType: 'text/plain', body: { data: encoded('Hello café') } }] }, { filename: 'private.txt', mimeType: 'text/plain', body: { data: encoded('attachment') } }] } }, true);
  assert.equal(result.text, 'Hello café'); assert.equal(result.unread, true); assert.equal(result.subject, 'Order');
});
test('HTML-only email becomes inert text without script/style content', () => {
  const result = normalizeInboxMessage({ id: 'abc', payload: { mimeType: 'text/html', body: { data: encoded('<style>bad</style><script>bad()</script><p>Hello &amp; welcome</p>') } } }, true);
  assert.equal(result.text, 'Hello & welcome');
});
test('Gmail requests stay read-only, paginated and bound to the expected account', async t => {
  const keys = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];
  const previous = keys.map(key => process.env[key]);
  keys.forEach(key => process.env[key] = 'test');
  t.after(() => keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }));
  const calls = [];
  let email = 'motshirtmauritius@gmail.com';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('oauth2')) return Response.json({ access_token: 'test-token' });
    if (String(url).endsWith('/profile')) return Response.json({ emailAddress: email });
    if (String(url).includes('/messages/abc')) return Response.json({ id: 'abc', payload: { mimeType: 'text/plain', body: { data: encoded('Body') } } });
    return Response.json({ messages: [{ id: 'abc' }], nextPageToken: 'next' });
  });
  const list = await listInbox('from:client@example.com', 'page2');
  assert.equal(list.messages.length, 1); assert.equal(list.nextPageToken, 'next');
  const url = new URL(calls.find(call => call.url.includes('maxResults')).url);
  assert.equal(url.searchParams.get('labelIds'), 'INBOX'); assert.equal(url.searchParams.get('pageToken'), 'page2');
  assert.equal((await readInboxMessage('abc')).text, 'Body');
  assert.ok(calls.every(call => call.options.cache === 'no-store'));
  assert.ok(calls.filter(call => !call.url.includes('oauth2')).every(call => !call.options.method));
  email = 'wrong@example.com';
  await assert.rejects(listInbox('', ''), /different mailbox/);
});
