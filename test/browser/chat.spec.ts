import { test, expect, type Page } from '@playwright/test';

test('saved citations render inline, activity follows the model, and code retains safe colors', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('messages', 'readwrite');
    tx.objectStore('messages').put({ id: 'render-fixture', threadId: 'fixture-thread', role: 'assistant', createdAt: 1,
      content: 'Created in September [[Source saved-chunk: test.txt]]. Author absent [[Source 1]]. Unknown [[Source 99]].\n\n```python\nimport json\n' + Array.from({ length: 20 }, (_, i) => `value_${i} = "example"`).join('\n') + '\n```',
      reasoning: 'Checking saved evidence.', runStatus: 'complete',
      citations: [{ id: 'saved-chunk', chunkId: 'saved-chunk', documentId: 'deleted-fixture', filename: 'test.txt', excerpt: 'Created in September. No author listed.', pageStart: 2 }],
      activity: [{ id: 'read', tool: 'read_document', arguments: '{}', result: 'Created in September. No author listed.', status: 'complete' }],
    });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  const citations = page.getByRole('link', { name: 'View source 1: test.txt' });
  await expect(citations).toHaveCount(2);
  await expect(page.getByText('[unresolved source: 99]', { exact: true })).toBeVisible();
  const activity = page.getByText('Tool activity · complete', { exact: true });
  const reasoning = page.getByRole('button', { name: /thought for/ });
  expect((await activity.boundingBox())!.y).toBeLessThan((await reasoning.boundingBox())!.y);
  const sourceList = page.getByText('Sources supplied to this answer (1)', { exact: true });
  expect((await sourceList.boundingBox())!.y).toBeGreaterThan((await citations.first().boundingBox())!.y);
  await citations.first().click();
  const dialog = page.getByRole('dialog', { name: 'test.txt', exact: true });
  await expect(dialog.getByText('Page 2', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Original document unavailable; saved evidence shown below.')).toBeVisible();
  await dialog.getByRole('button', { name: 'esc', exact: true }).click();
  await expect(citations.first()).toBeFocused();
  await expect.poll(() => page.locator('.shiki-container span[style]').count()).toBeGreaterThan(2);
  const colors = await page.locator('.shiki-container span[style]').evaluateAll((nodes) => [...new Set(nodes.map((node) => getComputedStyle(node).color))]);
  expect(colors.length).toBeGreaterThan(1);
  await page.getByRole('button', { name: /show \d+ more lines/ }).click();
  await expect(page.getByRole('button', { name: 'show less' })).toBeVisible();
  await page.reload(); await citations.last().click();
  await expect(dialog.getByText('Created in September. No author listed.', { exact: true })).toBeVisible();
});

test('composer tools open a separate keyboard-accessible dialog and global settings', async ({ page }) => {
  await seed(page, true);
  const tools = page.getByRole('button', { name: /^Tools: .*\(3 available\)/ });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  expect((await tools.boundingBox())!.y).toBeGreaterThan((await composer.boundingBox())!.y);
  await expect(page.getByLabel('MCP endpoint')).toHaveCount(0);
  await tools.click();
  const panel = page.getByRole('dialog', { name: 'Tools for this chat', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('3 built-in read tools available')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'esc', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0); await expect(tools).toBeFocused();
  await tools.click();
  await page.getByRole('switch', { name: 'Use tools', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Use tools', exact: true })).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tools: off (3 available)', exact: true })).toBeVisible();
  await tools.click(); await page.getByRole('button', { name: 'Manage connections' }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByLabel('MCP endpoint')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  const box = (await settings.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByLabel('MCP endpoint').fill('http://remote.example/mcp');
  await page.getByRole('button', { name: 'Test & add MCP' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('tools work without capability confirmation or a selected library', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('threads', 'readwrite');
    const store = tx.objectStore('threads');
    const thread = await new Promise<Record<string, unknown>>((resolve) => { const req = store.get('fixture-thread'); req.onsuccess = () => resolve(req.result); });
    delete thread.toolModelKey;
    store.put({ ...thread, libraryId: null, agentEnabled: false });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Tools: off (3 available)', exact: true }).click();
  await expect(page.getByText('This model supports function/tool calling')).toHaveCount(0);
  await expect(page.getByText('No library selected', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Use tools', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Use tools', exact: true })).toBeChecked();
  await page.getByRole('dialog', { name: 'Tools for this chat' }).getByRole('button', { name: 'esc', exact: true }).click();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('List the available documents'); await composer.press('Enter');
  await expect(page.getByText('Tool activity · complete')).toBeVisible();
  await page.getByText('Tool activity · complete').click();
  await page.getByText('list_documents · complete', { exact: true }).click();
  await expect(page.getByText('No library selected. No documents or matching evidence are available.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tools: on (3 available)', exact: true })).toBeVisible();
});

test('document agent follows whole-file cursors without skipping text', async ({ page }) => {
  await seed(page, true);
  const original = 'First page\n' + 'x'.repeat(5000) + '\nLast page';
  await page.evaluate(async (text) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').put({ id: 'whole-file', libraryId: 'fixture-library', filename: 'whole.txt', mimeType: 'text/plain', sizeBytes: text.length, chunkCount: 0, createdAt: 1, extractedText: text });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  }, original);
  let supplied = '';
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    const results = request.messages.filter((m: { role: string }) => m.role === 'tool').map((m: { content: string }) => JSON.parse(m.content));
    supplied = results.map((r: { text: string }) => r.text).join('');
    const last = results.at(-1);
    const delta = last?.complete ? { content: 'Read the whole file.' } : { tool_calls: [{ index: 0, id: `read-${results.length}`, function: { name: 'read_document', arguments: JSON.stringify({ documentId: 'whole-file', cursor: last?.nextCursor ?? null }) } }] };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta, finish_reason: last?.complete ? 'stop' : 'tool_calls' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Read the whole file'); await composer.press('Enter');
  await expect(page.getByText('Read the whole file.', { exact: true })).toBeVisible();
  expect(supplied).toBe(original);
  await expect(page.getByText('Sources supplied to this answer (2)', { exact: true })).toBeVisible();
});

test('incremental streaming follows the bottom but preserves an intentional scroll-up', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    Object.assign(window, {
      emitFixtureText: (text: string) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)),
      finishFixtureText: () => { controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close(); },
    });
    window.fetch = async (input, init) => {
      if (String(input).endsWith('/chat/completions')) {
        return new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return originalFetch(input, init);
    };
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Stream a long fixture'); await composer.press('Enter');
  await expect(page.getByRole('button', { name: 'stop', exact: true })).toBeVisible();
  const emit = (text: string) => page.evaluate((value) => (window as unknown as { emitFixtureText: (text: string) => void }).emitFixtureText(value), text);
  const scroller = page.locator('.overflow-y-auto.grid-bg');
  await emit(Array.from({ length: 60 }, (_, i) => `Paragraph ${i}: streaming evidence.\n\n`).join(''));
  await expect(page.getByText('Paragraph 59: streaming evidence.', { exact: true })).toBeVisible();
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(5);
  await scroller.evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await expect(page.getByRole('button', { name: 'Jump to latest message' })).toBeVisible();
  await emit('More streaming text after intentional scroll-up.\n\n');
  await expect(page.getByText('More streaming text after intentional scroll-up.', { exact: true })).toBeAttached();
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByRole('button', { name: 'Jump to latest message' }).click();
  await emit('Final streaming paragraph.');
  await page.evaluate(() => (window as unknown as { finishFixtureText: () => void }).finishFixtureText());
  await expect(page.getByRole('button', { name: 'stop', exact: true })).toHaveCount(0);
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(5);
  await page.reload();
  await expect(page.getByText('Final streaming paragraph.', { exact: true })).toBeVisible();
});

async function savedRunStatus(page: Page, threadId = 'fixture-thread') {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    return new Promise<string | undefined>((resolve) => {
      const req = db.transaction('messages').objectStore('messages').index('byThread').getAll(id);
      req.onsuccess = () => { const messages = req.result.filter((message) => message.role === 'assistant'); resolve(messages.at(-1)?.runStatus); db.close(); };
    });
  }, threadId);
}

test('Stop marks a pending HTTP response stopped, including after reload', async ({ page }) => {
  await seed(page);
  let requested = false;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('https://fixture.test/v1/chat/completions', async (route) => { requested = true; await gate; await route.abort().catch(() => {}); });
  try {
    const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
    await composer.fill('Wait for my stop'); await composer.press('Enter');
    await expect.poll(() => requested).toBe(true);
    await page.getByRole('button', { name: 'stop', exact: true }).click();
    await expect.poll(() => savedRunStatus(page)).toBe('stopped');
    release(); await page.reload();
    await expect.poll(() => savedRunStatus(page)).toBe('stopped');
  } finally { release(); }
});

test('stop-to-switch flow isolates a delayed response from the destination thread', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('threads', 'readwrite');
    tx.objectStore('threads').put({ id: 'destination', title: 'Destination chat', providerId: 'openai-compat', modelId: 'fixture-model', createdAt: 0, updatedAt: 0, libraryId: null });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  let requested = false; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('https://fixture.test/v1/chat/completions', async (route) => { requested = true; await gate; await route.abort().catch(() => {}); });
  try {
    const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
    await composer.fill('Delayed source question'); await composer.press('Enter');
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByText('generating — stop to switch threads')).toBeVisible();
    await page.getByRole('button', { name: 'stop', exact: true }).click();
    await expect.poll(() => savedRunStatus(page)).toBe('stopped');
    await page.getByText('Destination chat', { exact: true }).click();
    await expect.poll(() => savedRunStatus(page)).toBe('stopped');
    release();
    await expect(page.locator('.markdown-body').getByText('Delayed source question', { exact: true })).toHaveCount(0);
    expect(await savedRunStatus(page, 'destination')).toBeUndefined();
    await expect(page.getByRole('button', { name: 'stop', exact: true })).toHaveCount(0);
  } finally { release(); }
});

async function seed(page: Page, agent = false) {
  page.on('pageerror', (error) => console.error('Browser error:', error.message));
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true }));
  await page.route('https://fixture.test/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (route.request().url().endsWith('/models')) return route.fulfill({ json: { data: [{ id: 'fixture-model' }] } });
    const request = route.request().postDataJSON();
    const result = agent && request.tools && !request.messages.some((message: {role: string}) => message.role === 'tool')
      ? { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'list_documents', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }
      : { choices: [{ delta: { content: 'Fixture answer with <img src=x onerror=alert(1)> safe text.' }, finish_reason: 'stop' }] };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(result)}\n\ndata: [DONE]\n\n` });
  });
  await page.goto('/app');
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === 'htllm' && db.version === 9))).toBe(true);
  await page.evaluate(async (enableAgent) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['threads', 'settings', 'libraries'], 'readwrite');
    tx.objectStore('threads').put({ id: 'fixture-thread', title: 'Fixture chat', providerId: 'openai-compat', modelId: 'fixture-model', createdAt: 1, updatedAt: Date.now(), libraryId: enableAgent ? 'fixture-library' : null, agentEnabled: enableAgent, toolModelKey: 'openai-compat:fixture-model' });
    tx.objectStore('settings').put({ key: 'provider:openai-compat:baseURL', value: 'https://fixture.test/v1' });
    tx.objectStore('settings').put({ key: 'titleMode', value: 'first-message' });
    tx.objectStore('libraries').put({ id: 'fixture-library', name: 'Fixture library', embeddingModelId: '', createdAt: 1 });
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  }, agent);
  await page.reload();
  await expect(page.getByPlaceholder('Type a message — / for commands & templates, Enter to send')).toBeVisible();
}
test('HTTP chat works without WebGPU and sanitizes output under production CSP', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => { if (/violates.*Content Security Policy|EvalError/.test(message.text())) violations.push(message.text()); });
  await seed(page);
  await expect(page.getByText('GPU absent', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chat, with optional document evidence.' })).toBeVisible();
  await expect(page.getByText(/HTTP models receive your messages/)).toBeVisible();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Hello'); await composer.press('Enter');
  await expect(page.getByText('Fixture answer with safe text.')).toBeVisible();
  await expect(page.locator('.markdown-body img')).toHaveCount(0);
  expect(violations).toEqual([]);
  await page.reload(); await expect(page.getByText('Fixture answer with safe text.')).toBeVisible();
});
test('document agent runs a tool, persists its trail, and reloads safely', async ({ page }) => {
  await seed(page, true);
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('List my documents'); await composer.press('Enter');
  await expect(page.getByText('Tool activity · complete')).toBeVisible();
  await page.getByText('Tool activity · complete').click();
  await expect(page.getByText('list_documents · complete')).toBeVisible();
  await page.reload(); await expect(page.getByText('Tool activity · complete')).toBeVisible();
});
test('regeneration and repeated manual compaction preserve summaries across reload', async ({ page }) => {
  await seed(page);
  let answers = 0; let compactions = 0;
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    const compacting = JSON.stringify(request.messages).includes('CONTEXT CHECKPOINT COMPACTION');
    const content = compacting ? `Summary snapshot ${++compactions}.` : `Answer number ${++answers}.`;
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('First question'); await composer.press('Enter');
  await expect(page.getByText('Answer number 1.', { exact: true })).toBeVisible();
  await page.getByTitle('Regenerate response').click();
  await expect(page.getByText('Answer number 2.', { exact: true })).toBeVisible();
  await expect(page.getByText('Answer number 1.', { exact: true })).toHaveCount(0);
  await composer.fill('Second question'); await composer.press('Enter');
  await expect(page.getByText('Answer number 3.', { exact: true })).toBeVisible();
  await composer.fill('/compact'); await composer.press('Enter');
  await expect.poll(() => compactions).toBe(1);
  await expect(page.getByRole('button', { name: /^context compacted/ })).toHaveCount(1);
  await composer.fill('Third question'); await composer.press('Enter');
  await expect(page.getByText('Answer number 4.', { exact: true })).toBeVisible();
  await composer.fill('/compact'); await composer.press('Enter');
  await expect.poll(() => compactions).toBe(2);
  await expect(page.getByRole('button', { name: /^context compacted/ })).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('button', { name: /^context compacted/ })).toHaveCount(2);
});

test('MCP discovery and external writes require approval under production CSP', async ({ page }) => {
  await seed(page, true);
  let calls = 0;
  await page.route('https://mcp.fixture.test/mcp', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ status: 405 });
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 200 });
    const request = route.request().postDataJSON();
    if (request.id === undefined) return route.fulfill({ status: 202 });
    let result: unknown;
    switch (request.method) {
      case 'initialize': result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } }; break;
      case 'tools/list': result = { tools: [{ name: 'write_note', description: 'Write a note to the fixture', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true } }] }; break;
      case 'tools/call': calls++; result = { content: [{ type: 'text', text: 'Note saved.' }] }; break;
      default: return route.fulfill({ json: { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } } });
    }
    return route.fulfill({ json: { jsonrpc: '2.0', id: request.id, result } });
  });
  await page.getByRole('button', { name: /^Tools: .*\(3 available\)/ }).click();
  await page.getByRole('button', { name: 'Manage connections' }).click();
  await page.getByLabel('MCP name').fill('Fixture service');
  await page.getByLabel('MCP endpoint').fill('https://mcp.fixture.test/mcp');
  await page.getByRole('button', { name: 'Test & add MCP' }).click();
  await expect(page.getByText('connection tested', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'esc', exact: true }).click();
  await page.getByRole('button', { name: /^Tools: .*\(3 available\)/ }).click();
  await expect(page.getByLabel('write_note')).toBeVisible();
  await page.getByLabel('write_note').click();
  await expect(page.getByLabel('write_note')).toBeChecked();
  await page.getByRole('switch', { name: 'Use tools', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Use tools', exact: true })).toBeChecked();
  await page.getByRole('dialog', { name: 'Tools for this chat', exact: true }).getByRole('button', { name: 'esc', exact: true }).click();
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    const external = request.tools?.find((tool: {function: {name: string}}) => tool.function.name.startsWith('mcp_'));
    const result = external && !request.messages.some((m: {role: string}) => m.role === 'tool')
      ? { choices: [{ delta: { tool_calls: [{ index: 0, id: 'external-1', function: { name: external.function.name, arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }
      : { choices: [{ delta: { content: 'External run finished.' }, finish_reason: 'stop' }] };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(result)}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Write a note'); await composer.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Approve external tool' })).toBeVisible();
  expect(calls).toBe(0);
  await expect(page.getByText('Trust this read tool for this session')).toHaveCount(0);
  await page.getByRole('button', { name: 'Deny', exact: true }).click();
  await expect(page.getByText('External run finished.')).toBeVisible(); expect(calls).toBe(0);
  await composer.fill('Try with my approval'); await composer.press('Enter');
  await page.getByRole('button', { name: 'Allow once' }).click();
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByText('External run finished.')).toHaveCount(2);
  await composer.fill('Ask again, then reload before approval'); await composer.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Approve external tool' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Approve external tool' })).toHaveCount(0);
  await expect(page.getByText('Tool activity · stopped')).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole('button', { name: /^Tools: .*\(4 available\)/ }).click();
  await expect(page.getByLabel('write_note')).toBeChecked();
  await page.getByRole('button', { name: 'Manage connections' }).click();
  await page.getByRole('button', { name: 'Refresh tools', exact: true }).click();
  await expect(page.getByText('connection tested', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'esc', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tools: off (3 available)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Tools: .*\(3 available\)/ }).click();
  await expect(page.getByLabel('write_note')).not.toBeChecked();
  await page.getByRole('button', { name: 'Manage connections' }).click();
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByText('No MCP servers connected.')).toBeVisible();
});

async function seedRag(page: Page) {
  await seed(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['threads', 'libraries', 'documents', 'chunks', 'embeddings'], 'readwrite');
    const thread = await new Promise<Record<string, unknown>>((resolve) => { const request = tx.objectStore('threads').get('fixture-thread'); request.onsuccess = () => resolve(request.result); });
    tx.objectStore('threads').put({ ...thread, libraryId: 'fixture-library' });
    tx.objectStore('libraries').put({ id: 'fixture-library', name: 'Fixture library', embeddingProviderId: 'openai-compat', embeddingModelId: 'fixture-embed', createdAt: 1 });
    for (const [id, text, vector] of [['atlas', 'Atlas launches on November 12.', [1, 0]], ['other', 'Unrelated support hours.', [0, 1]]] as const) {
      tx.objectStore('documents').put({ id, libraryId: 'fixture-library', filename: `${id}.pdf`, mimeType: 'application/pdf', sizeBytes: text.length, chunkCount: 1, createdAt: 1 });
      tx.objectStore('chunks').put({ id: `${id}-1`, documentId: id, index: 0, text, startOffset: 0, pageStart: 2, pageEnd: 2 });
      tx.objectStore('embeddings').put({ chunkId: `${id}-1`, embeddingModelId: 'fixture-embed', dim: 2, vector: [...vector] });
    }
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.route('https://fixture.test/v1/embeddings', (route) => route.fulfill({ json: { model: 'fixture-embed', data: [{ index: 0, embedding: [1, 0] }] } }));
  await page.reload();
}
test('RAG citations survive reload and source deletion with their supplied excerpt', async ({ page }) => {
  await seedRag(page);
  let supplied = '';
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    supplied = JSON.stringify(route.request().postDataJSON().messages);
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'November 12 (atlas.pdf, page 2).' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('When does Atlas launch?'); await composer.press('Enter');
  await expect(page.getByText('Sources supplied to this answer (1)')).toBeVisible();
  expect(supplied).toContain('Atlas launches on November 12.');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('documents', 'readwrite'); tx.objectStore('documents').delete('atlas');
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByText('Sources supplied to this answer (1)').click();
  await page.getByText('atlas.pdf · p. 2', { exact: true }).click();
  await expect(page.getByText('Original document unavailable; saved evidence shown below.')).toBeVisible();
  await expect(page.getByText('Atlas launches on November 12.', { exact: true })).toBeVisible();
});
test('retrieval failure prevents an ungrounded model request', async ({ page }) => {
  await seedRag(page);
  await page.route('https://fixture.test/v1/embeddings', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
  let chats = 0;
  await page.route('https://fixture.test/v1/chat/completions', (route) => { chats++; return route.abort(); });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('When does Atlas launch?'); await composer.press('Enter');
  await expect(page.getByText('Knowledge retrieval failed.', { exact: false })).toBeVisible();
  expect(chats).toBe(0);
});

function textPdf(contents = 'The Atlas project launches on November 12.'): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = `BT /F1 12 Tf 72 720 Td (${contents}) Tj ET`;
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
test('text PDF upload extracts text with page provenance', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.getByRole('button', { name: /add documents/i }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'atlas.pdf', mimeType: 'application/pdf', buffer: textPdf() });
  await page.getByRole('button', { name: 'ingest (1)' }).click();
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('htllm'); request.onsuccess = () => resolve(request.result); });
    return new Promise<boolean>((resolve) => { const request = db.transaction('chunks').objectStore('chunks').getAll(); request.onsuccess = () => { resolve(request.result.some((chunk) => chunk.text.includes('Atlas') && chunk.pageStart === 1)); db.close(); }; });
  })).toBe(true);
});
test('image-only PDF rejection leaves no ready document or success message', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Knowledge', exact: true }).click();
  await page.getByRole('button', { name: /add documents/i }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: textPdf('') });
  await page.getByRole('button', { name: 'ingest (1)' }).click();
  await expect(page.getByRole('alert')).toContainText('no extractable text');
  await expect(page.getByText('Added 1 file', { exact: false })).toHaveCount(0);
  const count = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    return new Promise<number>((resolve) => { const req = db.transaction('documents').objectStore('documents').count(); req.onsuccess = () => { resolve(req.result); db.close(); }; });
  });
  expect(count).toBe(0);
});
