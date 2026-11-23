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
  const tools = page.getByRole('button', { name: /^Tools: .*\(9 available\)/ });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  expect((await tools.boundingBox())!.y).toBeGreaterThan((await composer.boundingBox())!.y);
  await expect(page.getByLabel('MCP endpoint')).toHaveCount(0);
  await tools.click();
  const panel = page.getByRole('dialog', { name: 'Tools for this chat', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Library mounted read-only at /library/Fixture library')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'esc', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0); await expect(tools).toBeFocused();
  await tools.click();
  // D-14/D-15: a Workspace chat has no Tools switch and no Automatic RAG; tools stay on.
  await expect(panel.getByRole('switch', { name: 'Use tools', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('switch', { name: 'Automatic RAG', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tools: on (9 available)', exact: true })).toBeVisible();
  await tools.click(); await page.getByRole('tab', { name: 'External tools', exact: true }).click(); await page.getByRole('button', { name: 'Manage connections' }).click();
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

test('workspace tools work without a switch, capability confirmation or a selected library', async ({ page }) => {
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
  // A legacy agentEnabled:false does not matter in a Workspace chat (D-14).
  await page.getByRole('button', { name: 'Tools: on (9 available)', exact: true }).click();
  await expect(page.getByText('This model supports function/tool calling')).toHaveCount(0);
  await expect(page.getByText('No library attached', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Tools for this chat' }).getByRole('button', { name: 'esc', exact: true }).click();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('List the available documents'); await composer.press('Enter');
  await expect(page.getByText('Tool activity · complete')).toBeVisible();
  await page.getByText('Tool activity · complete').click();
  await page.getByText('list_files · complete', { exact: true }).click();
  await expect(page.getByText('The workspace is empty. The user can attach files; you can write notes under /notes.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Tools: on (9 available)', exact: true })).toBeVisible();
});

test('workspace reads follow continue hints through a whole library file without skipping text', async ({ page }) => {
  await seed(page, true);
  // One 5,000-character line: wrapped into numbered lines so every character stays reachable.
  const original = 'First page\n' + 'x'.repeat(5000) + '\nLast page';
  await page.evaluate(async (text) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('documents', 'readwrite');
    tx.objectStore('documents').put({ id: 'whole-file', libraryId: 'fixture-library', filename: 'whole.txt', mimeType: 'text/plain', sizeBytes: text.length, chunkCount: 0, createdAt: 1, extractedText: text });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  }, original);
  let supplied = ''; let reads = 0;
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    const results: string[] = request.messages.filter((m: { role: string }) => m.role === 'tool').map((m: { content: string }) => m.content);
    supplied = results.map((r) => [...r.matchAll(/^\d+: (.*)$/gm)].map((m) => m[1]).join('')).join('');
    reads = results.length;
    const last = results.at(-1);
    const next = last === undefined ? '1' : /Use offset=(\d+) to continue/.exec(last)?.[1];
    const delta = next ? { tool_calls: [{ index: 0, id: `read-${results.length}`, function: { name: 'read_file', arguments: JSON.stringify({ path: '/library/Fixture library/whole.txt', offset: Number(next) }) } }] } : { content: 'Read the whole file.' };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta, finish_reason: next ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Read the whole file'); await composer.press('Enter');
  await expect(page.getByText('Read the whole file.', { exact: true })).toBeVisible();
  expect(supplied).toBe(original.replace(/\n/g, ''));
  expect(reads).toBeGreaterThan(1);
  await expect(page.getByText(`Sources supplied to this answer (${reads})`, { exact: true })).toBeVisible();
});

test('library selection reuses the custom picker and RAG has distinct on/off styles', async ({ page }) => {
  await seedRag(page);
  await page.getByRole('button', { name: /^Knowledge:/ }).click();
  const rag = page.getByRole('switch', { name: 'Automatic RAG', exact: true });
  await expect(rag).toHaveClass(/bg-accent\/10/);
  await rag.click(); await expect(rag).not.toBeChecked();
  await expect(rag).not.toHaveClass(/bg-accent\/10/);
  const pickerButton = page.getByRole('button', { name: 'Choose knowledge library' });
  await pickerButton.click();
  const picker = page.getByRole('dialog', { name: 'Choose a knowledge library', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'None — no document access', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(pickerButton).toBeFocused();
  await expect(rag).toBeDisabled();
  await pickerButton.click();
  await picker.getByRole('button', { name: /Fixture library/ }).click();
  await expect(rag).toBeEnabled(); await expect(rag).not.toBeChecked();
  await pickerButton.click(); await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Knowledge for this chat', exact: true })).toBeVisible();
});

test('incremental streaming follows the bottom but preserves an intentional scroll-up', async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    Object.assign(window, {
      fixtureStreamReady: () => !!controller,
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
  await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureStreamReady: () => boolean }).fixtureStreamReady())).toBe(true);
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
      ? { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'list_files', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] }
      : { choices: [{ delta: { content: 'Fixture answer with <img src=x onerror=alert(1)> safe text.' }, finish_reason: 'stop' }] };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(result)}\n\ndata: [DONE]\n\n` });
  });
  await page.goto('/app');
  await expect.poll(() => page.evaluate(async () => (await indexedDB.databases()).some((db) => db.name === 'htllm' && (db.version ?? 0) >= 10))).toBe(true);
  await page.evaluate(async (enableAgent) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['threads', 'settings', 'libraries'], 'readwrite');
    tx.objectStore('threads').put({ id: 'fixture-thread', title: 'Fixture chat', providerId: 'openai-compat', modelId: 'fixture-model', createdAt: 1, updatedAt: Date.now(), libraryId: enableAgent ? 'fixture-library' : null, agentEnabled: enableAgent, mode: enableAgent ? 'workspace' : 'chat', toolModelKey: 'openai-compat:fixture-model' });
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
  let dialogs = 0;
  page.on('dialog', (dialog) => { dialogs++; void dialog.dismiss(); });
  page.on('console', (message) => { if (/violates.*Content Security Policy|EvalError/.test(message.text())) violations.push(message.text()); });
  await seed(page);
  await expect(page.getByText('GPU absent', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chat, or work with files.' })).toBeVisible();
  await expect(page.getByText(/HTTP models receive your messages/)).toBeVisible();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Hello'); await composer.press('Enter');
  await expect(page.getByText('Fixture answer with safe text.')).toBeVisible();
  await expect(page.locator('.markdown-body img')).toHaveCount(0);
  // Chrome 157+ reports an inline-handler violation while DOMPurify parses
  // the untrusted `<img onerror>` in its detached document. Nothing runs
  // there and the sanitized output reaches the page without it, so that one
  // class is expected. Every other violation (eval, scripts, styles…) still
  // fails, and the fixture's alert must never fire.
  expect(violations.filter((text) => !/Executing inline event handler/.test(text))).toEqual([]);
  expect(dialogs).toBe(0);
  await page.reload(); await expect(page.getByText('Fixture answer with safe text.')).toBeVisible();
  expect(dialogs).toBe(0);
});
test('new chats offer Chat or Workspace and lock the choice at the first message', async ({ page }) => {
  await seed(page);
  const modes = page.getByRole('radiogroup', { name: 'Chat mode' });
  await expect(modes.getByRole('radio', { name: /^Chat/ })).toHaveAttribute('aria-checked', 'true');
  await modes.getByRole('radio', { name: /^Workspace/ }).click();
  await expect(modes.getByRole('radio', { name: /^Workspace/ })).toHaveAttribute('aria-checked', 'true');
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Hello'); await composer.press('Enter');
  await expect(page.getByText('Fixture answer with safe text.')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Chat mode' })).toHaveCount(0);
  await expect(page.getByLabel('Workspace chat')).toBeVisible();
  const mode = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const thread = await new Promise<{ mode?: string }>((resolve) => { const req = db.transaction('threads').objectStore('threads').get('fixture-thread'); req.onsuccess = () => resolve(req.result); });
    db.close(); return thread.mode;
  });
  expect(mode).toBe('workspace');
  await page.reload();
  await expect(page.getByRole('radiogroup', { name: 'Chat mode' })).toHaveCount(0);
});
test('document agent runs a tool, persists its trail, and reloads safely', async ({ page }) => {
  await seed(page, true);
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('List my documents'); await composer.press('Enter');
  await expect(page.getByText('Tool activity · complete')).toBeVisible();
  await page.getByText('Tool activity · complete').click();
  await expect(page.getByText('list_files · complete')).toBeVisible();
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

test('oversized manual compaction saves only the final aggregate', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('messages', 'readwrite');
    for (let i = 0; i < 10; i++) tx.objectStore('messages').put({ id: `long-${i}`, threadId: 'fixture-thread', role: i % 2 ? 'assistant' : 'user', content: `Turn ${i} ` + 'x'.repeat(5000), createdAt: i + 1 });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  let calls = 0;
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    expect(request.max_tokens).toBeUndefined();
    const aggregate = JSON.stringify(request.messages).includes('### Part 1');
    calls++;
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: aggregate ? 'Final aggregate.' : `Partial ${calls}.` }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('/compact'); await composer.press('Enter');
  await expect(page.getByRole('button', { name: /^context compacted/ })).toHaveCount(1);
  expect(calls).toBeGreaterThan(2);
  const records = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    return new Promise<{text: string; replacedMessageIds: string[]}[]>((resolve) => { const req = db.transaction('summaries').objectStore('summaries').getAll(); req.onsuccess = () => { resolve(req.result); db.close(); }; });
  });
  expect(records).toHaveLength(1); expect(records[0]!.text).toBe('Final aggregate.');
  expect(records[0]!.replacedMessageIds).not.toContain('long-9');
  expect(records[0]!.replacedMessageIds).toContain('long-8');
  await page.reload(); await expect(page.getByRole('button', { name: /^context compacted/ })).toHaveCount(1);
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
  await page.getByRole('button', { name: /^Tools: .*\(9 available\)/ }).click();
  await page.getByRole('tab', { name: 'External tools', exact: true }).click();
  await page.getByRole('button', { name: 'Manage connections' }).click();
  await page.getByLabel('MCP name').fill('Fixture service');
  await page.getByLabel('MCP endpoint').fill('https://mcp.fixture.test/mcp');
  await page.getByRole('button', { name: 'Test & add MCP' }).click();
  await expect(page.getByText('connection tested', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'esc', exact: true }).click();
  await page.getByRole('button', { name: /^Tools: .*\(9 available\)/ }).click();
  await expect(page.getByLabel('write_note')).toBeVisible();
  await page.getByLabel('write_note').click();
  await expect(page.getByLabel('write_note')).toBeChecked();
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
  await page.getByRole('button', { name: /^Tools: .*\(10 available\)/ }).click();
  await page.getByRole('tab', { name: 'External tools', exact: true }).click();
  await expect(page.getByLabel('write_note')).toBeChecked();
  await page.getByRole('button', { name: 'Manage connections' }).click();
  await page.getByRole('button', { name: 'Refresh tools', exact: true }).click();
  await expect(page.getByText('connection tested', { exact: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Settings', exact: true }).getByRole('button', { name: 'esc', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Tools: on (9 available)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Tools: .*\(9 available\)/ }).click();
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
async function captureRequests(page: Page) {
  const seen = { embeddings: 0, request: undefined as { tools?: unknown[]; messages: unknown[] } | undefined };
  await page.route('https://fixture.test/v1/embeddings', (route) => { seen.embeddings++; return route.fulfill({ json: { model: 'fixture-embed', data: [{ index: 0, embedding: [1, 0] }] } }); });
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    seen.request = route.request().postDataJSON();
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'Matrix answer.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  return seen;
}
// D-10: Chat has no tools and keeps Automatic RAG as a persisted per-chat choice.
for (const ragOn of [false, true]) test(`Chat with Automatic RAG=${ragOn} persists the choice and never sends tools`, async ({ page }) => {
  await seedRag(page);
  const seen = await captureRequests(page);
  await page.getByRole('button', { name: /^Knowledge:/ }).click();
  const panel = page.getByRole('dialog', { name: 'Knowledge for this chat', exact: true });
  await expect(panel.getByRole('switch', { name: 'Use tools', exact: true })).toHaveCount(0);
  await expect(panel.getByText('list_files', { exact: true })).toHaveCount(0);
  const rag = panel.getByRole('switch', { name: 'Automatic RAG', exact: true });
  await expect(rag).toBeChecked();
  if (!ragOn) await rag.click();
  await expect(rag).toHaveAttribute('aria-checked', String(ragOn));
  await page.reload();
  await page.getByRole('button', { name: /^Knowledge:/ }).click();
  await expect(rag).toHaveAttribute('aria-checked', String(ragOn));
  await panel.getByRole('button', { name: 'esc', exact: true }).click();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('When does Atlas launch?'); await composer.press('Enter');
  await expect(page.getByText('Matrix answer.', { exact: true })).toBeVisible();
  expect(seen.embeddings > 0).toBe(ragOn); expect(seen.request?.tools?.length ?? 0).toBe(0);
  // App-owned context: today's date, and in Chat the no-tools note.
  expect(JSON.stringify(seen.request?.messages)).toMatch(/Today is \w+day, \w+ \d{1,2}, \d{4}\./);
  expect(JSON.stringify(seen.request?.messages)).toContain('This chat has no tools or file access.');
  expect(JSON.stringify(seen.request?.messages).includes('Atlas launches on November 12.')).toBe(ragOn);
  if (ragOn) expect(JSON.stringify(seen.request?.messages)).toContain('[[Source <exact supplied source ID>]]');
});
// D-14/D-15: Workspace always sends tools and never retrieves before the answer.
test('Workspace sends tools and never retrieves automatically, even with a library attached', async ({ page }) => {
  await seedRag(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('threads', 'readwrite'); const store = tx.objectStore('threads');
    const thread = await new Promise<Record<string, unknown>>((resolve) => { const req = store.get('fixture-thread'); req.onsuccess = () => resolve(req.result); });
    store.put({ ...thread, mode: 'workspace', automaticRagEnabled: true });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  const seen = await captureRequests(page);
  await page.getByRole('button', { name: /^Tools:/ }).click();
  await expect(page.getByRole('tab', { name: 'Documents', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const name of ['list_files', 'read_file', 'search', 'grep']) await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Automatic RAG', exact: true })).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Tools for this chat' }).getByRole('button', { name: 'esc', exact: true }).click();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('When does Atlas launch?'); await composer.press('Enter');
  await expect(page.getByText('Matrix answer.', { exact: true })).toBeVisible();
  expect(seen.embeddings).toBe(0); expect(seen.request?.tools?.length ?? 0).toBeGreaterThan(0);
  expect(JSON.stringify(seen.request?.messages)).toMatch(/Today is /);
  expect(JSON.stringify(seen.request?.messages)).not.toContain('This chat has no tools');
  expect(JSON.stringify(seen.request?.messages)).not.toContain('Atlas launches on November 12.');
  expect(JSON.stringify(seen.request?.messages)).toContain('[[Source <exact supplied source ID>]]');
});

test('a Workspace chat refuses to send when its model is marked as unable to use tools', async ({ page }) => {
  await seed(page, true);
  let chatRequests = 0;
  await page.route('https://fixture.test/v1/chat/completions', (route) => { chatRequests++; return route.fulfill({ status: 500 }); });
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'modelToolOverrides', value: { 'openai-compat:fixture-model': false } });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await expect(page.getByRole('button', { name: /^Tools: unavailable/ })).toBeVisible();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Hello'); await composer.press('Enter');
  await expect(page.getByText(/Workspace needs a model that can use tools/)).toBeVisible();
  expect(chatRequests).toBe(0);
});
test('presented files open at their version in the side panel, with version navigation, download and a Files list', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['workspaceFiles', 'workspaceVersions', 'messages'], 'readwrite');
    const now = Date.now();
    tx.objectStore('workspaceFiles').put({ id: 'note-1', threadId: 'fixture-thread', path: '/notes/plan.md', kind: 'note', text: '# Plan\n\nVersion two', mimeType: 'text/markdown', version: 2, createdAt: now, updatedAt: now });
    tx.objectStore('workspaceVersions').put({ fileId: 'note-1', threadId: 'fixture-thread', version: 1, text: '# Plan\n\nVersion one', change: 'create', createdAt: now });
    tx.objectStore('workspaceVersions').put({ fileId: 'note-1', threadId: 'fixture-thread', version: 2, text: '# Plan\n\nVersion two', change: 'edit', createdAt: now });
    tx.objectStore('workspaceFiles').put({ id: 'up-1', threadId: 'fixture-thread', path: '/uploads/data.csv', kind: 'upload', text: 'name,qty\n"Tent, 2p",1', mimeType: 'text/csv', version: 1, createdAt: now, updatedAt: now });
    tx.objectStore('messages').put({ id: 'm-a', threadId: 'fixture-thread', role: 'assistant', createdAt: 1, content: 'First draft.', runStatus: 'complete', presentedFiles: [{ fileId: 'note-1', path: '/notes/plan.md', version: 1, caption: 'Draft plan' }] });
    tx.objectStore('messages').put({ id: 'm-b', threadId: 'fixture-thread', role: 'assistant', createdAt: 2, content: 'Revised.', runStatus: 'complete', presentedFiles: [{ fileId: 'note-1', path: '/notes/plan.md', version: 2 }] });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  // D-28: each card opens the version presented at that time.
  await page.getByRole('button', { name: 'Open plan.md v1' }).click();
  const panel = page.getByRole('complementary', { name: 'Workspace files' });
  await expect(panel.getByText('Version one')).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Versions' })).toContainText('v1of 2');
  await panel.getByRole('button', { name: 'Next version' }).click();
  await expect(panel.getByText('Version two')).toBeVisible();
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download plan.md v2' }).click();
  expect((await download).suggestedFilename()).toBe('plan.md');
  await page.getByRole('button', { name: 'Open plan.md v2' }).click();
  await expect(panel.getByText('Version two')).toBeVisible();
  // Files list, and a CSV upload rendered as a table.
  await panel.getByRole('button', { name: 'Back to files' }).click();
  await expect(panel.getByText('Uploads · 1')).toBeVisible(); await expect(panel.getByText('Notes · 1')).toBeVisible();
  await panel.getByRole('button', { name: /data\.csv/ }).click();
  await expect(panel.getByRole('cell', { name: 'Tent, 2p' })).toBeVisible();
  await panel.getByRole('button', { name: 'Close workspace panel' }).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Workspace files' }).click();
  await expect(panel.getByText('Uploads · 1')).toBeVisible();
});
test('an answer that echoes the internal history format is shown and saved without it', async ({ page }) => {
  await seed(page);
  await page.route('https://fixture.test/v1/chat/completions', (route) => route.fulfill({ contentType: 'text/event-stream',
    body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'Updated the list.\n\n<historical-tool-data>\n[{"tool":"edit_file"}]\n</historical-tool-data>' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` }));
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Update it'); await composer.press('Enter');
  await expect(page.getByText('Updated the list.', { exact: true })).toBeVisible();
  await expect(page.getByText(/historical-tool-data/)).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const all = await new Promise<{ role: string; content: string }[]>((resolve) => { const req = db.transaction('messages').objectStore('messages').getAll(); req.onsuccess = () => resolve(req.result); });
    db.close(); return all.filter((m) => m.role === 'assistant').map((m) => m.content);
  });
  expect(saved).toEqual(['Updated the list.']);
});
test('workspace uploads go to /uploads, lock the mode, and are listed for the model', async ({ page }) => {
  await seed(page);
  let system = ''; let lastUser = '';
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    system = JSON.stringify(request.messages.filter((m: { role: string }) => m.role === 'system'));
    lastUser = String([...request.messages].reverse().find((m: { role: string }) => m.role === 'user')?.content);
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'Seen.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await expect(page.getByLabel('Attach files to this workspace')).toHaveCount(0);
  await page.getByRole('radiogroup', { name: 'Chat mode' }).getByRole('radio', { name: /^Workspace/ }).click();
  await page.getByLabel('Workspace file upload').setInputFiles([
    { name: 'brief.md', mimeType: 'text/markdown', buffer: Buffer.from('# Brief\nShip on Friday.') },
    { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) },
  ]);
  await expect(page.getByRole('button', { name: 'Don\'t attach brief.md to this message' })).toBeVisible();
  await expect(page.getByText(/photo\.png is not supported/)).toBeVisible();
  // Files lock the mode even before the first message.
  await expect(page.getByRole('radiogroup', { name: 'Chat mode' })).toHaveCount(0);
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('What is in the brief?'); await composer.press('Enter');
  await expect(page.getByText('Seen.', { exact: true })).toBeVisible();
  expect(system).toContain('/uploads/brief.md (upload, read-only');
  expect(lastUser).toContain('[Attached with this message: /uploads/brief.md');
  expect(lastUser).toMatch(/Source ID: [0-9a-f-]{36}:L1-2\n<\/uploads\/brief\.md>\n1: # Brief\n2: Ship on Friday\./);
  await expect(page.getByRole('button', { name: /Don't attach/ })).toHaveCount(0);
  await expect(page.getByTitle('Open /uploads/brief.md')).toBeVisible();
  await page.getByRole('button', { name: 'Workspace files' }).click();
  await page.getByRole('complementary', { name: 'Workspace files' }).getByRole('button', { name: /brief\.md/ }).click();
  await expect(page.getByRole('complementary', { name: 'Workspace files' }).getByText('Ship on Friday.')).toBeVisible();
});
test('a reply stopped at the tool-call cap offers continue', async ({ page }) => {
  await seed(page, true);
  const sent: string[] = [];
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    const lastUser = [...request.messages].reverse().find((m: { role: string }) => m.role === 'user');
    sent.push(String(lastUser?.content));
    const n = request.messages.filter((m: { role: string }) => m.role === 'tool').length;
    const delta = request.tools ? { tool_calls: [{ index: 0, id: `c${n}`, function: { name: 'grep', arguments: JSON.stringify({ pattern: `p${n}` }) } }] } : { content: 'Partial answer.' };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta, finish_reason: request.tools ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Search everything'); await composer.press('Enter');
  await expect(page.getByText('Partial answer.', { exact: true })).toBeVisible();
  await expect(page.getByText("Stopped at this chat's tool-call limit.")).toBeVisible();
  await page.reload();
  const before = sent.length;
  await page.getByRole('button', { name: 'continue →' }).click();
  // The fixture keeps calling tools after continuing, so later requests end with the
  // cap message again; check that the follow-up itself was sent.
  await expect.poll(() => sent.slice(before).includes('Continue where you left off.')).toBe(true);
});
test('regenerate warns that file changes from the removed reply remain, and delete counts files', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['workspaceFiles', 'workspaceVersions', 'messages'], 'readwrite');
    tx.objectStore('messages').put({ id: 'u1', threadId: 'fixture-thread', role: 'user', createdAt: 1, content: 'Write it' });
    tx.objectStore('messages').put({ id: 'a1', threadId: 'fixture-thread', role: 'assistant', createdAt: 2, content: 'Wrote it.', runStatus: 'complete' });
    tx.objectStore('workspaceFiles').put({ id: 'n1', threadId: 'fixture-thread', path: '/notes/out.md', kind: 'note', text: 'v1', mimeType: 'text/markdown', version: 1, createdAt: 2, updatedAt: 2 });
    tx.objectStore('workspaceVersions').put({ fileId: 'n1', threadId: 'fixture-thread', version: 1, text: 'v1', change: 'create', messageId: 'a1', createdAt: 2 });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'regenerate' }).click();
  await expect(page.getByText('File changes from the removed reply remain: /notes/out.md (v1).', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss file change notice' }).click();
  await expect(page.getByText(/File changes from the removed reply remain/)).toHaveCount(0);
  const row = page.getByText('Fixture chat').first();
  await row.hover();
  await page.getByTitle('Delete thread').first().click();
  await expect(page.getByRole('button', { name: 'Delete chat and its 1 workspace file' })).toBeVisible();
});
test('end to end: the model reads an upload, writes a note, presents it, and the card opens that version', async ({ page }) => {
  await seed(page, true);
  await page.getByLabel('Workspace file upload').setInputFiles([{ name: 'facts.txt', mimeType: 'text/plain', buffer: Buffer.from('Launch: May 4\nOwner: Dana') }]);
  await expect(page.getByRole('button', { name: 'Don\'t attach facts.txt to this message' })).toBeVisible();
  const script = [
    { name: 'read_file', arguments: { path: '/uploads/facts.txt' } },
    { name: 'write_file', arguments: { path: '/notes/summary.md', content: '# Summary\n\nLaunch on May 4, owned by Dana.' } },
    { name: 'present_file', arguments: { path: '/notes/summary.md', caption: 'Launch summary' } },
  ];
  const results: string[] = [];
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    const done = request.messages.filter((m: { role: string }) => m.role === 'tool');
    if (done.length) results.push(done.at(-1).content);
    const step = script[done.length];
    const delta = step ? { tool_calls: [{ index: 0, id: `s${done.length}`, function: { name: step.name, arguments: JSON.stringify(step.arguments) } }] } : { content: 'Here is the summary [[Source /uploads/facts.txt]].' };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta, finish_reason: step ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('Summarize the facts'); await composer.press('Enter');
  await expect(page.getByText(/Here is the summary/)).toBeVisible();
  expect(results[0]).toContain('1: Launch: May 4');
  expect(results[1]).toContain('Created /notes/summary.md (v1');
  expect(results[2]).toContain('Presented /notes/summary.md (v1)');
  await expect(page.getByRole('link', { name: 'View source 1: /uploads/facts.txt' })).toBeVisible();
  await page.getByRole('button', { name: 'Open summary.md v1' }).click();
  await expect(page.getByRole('complementary', { name: 'Workspace files' }).getByText('Launch on May 4, owned by Dana.')).toBeVisible();
});
test('a Workspace chat can attach several libraries, each mounted read-only', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['libraries', 'documents'], 'readwrite');
    tx.objectStore('libraries').put({ id: 'second', name: 'Second library', embeddingModelId: '', createdAt: 2 });
    tx.objectStore('documents').put({ id: 'b', libraryId: 'second', filename: 'b.txt', mimeType: 'text/plain', sizeBytes: 5, chunkCount: 0, createdAt: 1, extractedText: 'Bravo' });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  let system = '';
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    system = JSON.stringify(route.request().postDataJSON().messages.filter((m: { role: string }) => m.role === 'system'));
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta: { content: 'Ok.' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
  });
  await page.getByRole('button', { name: /^Tools:/ }).click();
  await page.getByRole('button', { name: 'attach another library' }).click();
  await page.getByRole('dialog', { name: 'Attach another library' }).getByRole('button', { name: /Second library/ }).click();
  const panel = page.getByRole('dialog', { name: 'Tools for this chat' });
  await expect(panel.getByText('Second library', { exact: true })).toBeVisible();
  await expect(panel.getByText(/and 1 more/)).toBeVisible();
  await panel.getByRole('button', { name: 'esc', exact: true }).click();
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  await composer.fill('What do you have?'); await composer.press('Enter');
  await expect(page.getByText('Ok.', { exact: true })).toBeVisible();
  expect(system).toContain('/library/Second library/b.txt (library, read-only');
  await page.getByRole('button', { name: /^Tools:/ }).click();
  await page.getByRole('button', { name: 'Detach Second library' }).click();
  await expect(panel.getByText('Second library', { exact: true })).toHaveCount(0);
});
test('a runaway grep pattern is stopped by its worker deadline and the page stays responsive', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('workspaceFiles', 'readwrite');
    tx.objectStore('workspaceFiles').put({ id: 'aaa', threadId: 'fixture-thread', path: '/uploads/a.txt', kind: 'upload', text: 'a'.repeat(390) + '\nplain line', mimeType: 'text/plain', version: 1, createdAt: 1, updatedAt: 1 });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  let toolResult = '';
  await page.route('https://fixture.test/v1/chat/completions', async (route) => {
    const request = route.request().postDataJSON();
    const tool = request.messages.find((m: { role: string }) => m.role === 'tool');
    if (tool) toolResult = tool.content;
    const delta = tool ? { content: 'Pattern was too slow.' } : { tool_calls: [{ index: 0, id: 'g', function: { name: 'grep', arguments: JSON.stringify({ pattern: 'a*a*a*a*b', regex: true }) } }] };
    await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ choices: [{ delta, finish_reason: tool ? 'stop' : 'tool_calls' }] })}\n\ndata: [DONE]\n\n` });
  });
  const composer = page.getByPlaceholder('Type a message — / for commands & templates, Enter to send');
  const started = Date.now();
  await composer.fill('Find it'); await composer.press('Enter');
  // The main thread is not blocked while the worker runs.
  expect(await page.evaluate(() => 1 + 1)).toBe(2);
  await expect(page.getByText('Pattern was too slow.', { exact: true })).toBeVisible({ timeout: 15000 });
  expect(toolResult).toContain('was stopped');
  expect(Date.now() - started).toBeLessThan(12000);
});
test('regenerating a Workspace reply with a no-tools model is refused before any reply is removed', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['messages', 'settings'], 'readwrite');
    tx.objectStore('messages').put({ id: 'u1', threadId: 'fixture-thread', role: 'user', createdAt: 1, content: 'Question' });
    tx.objectStore('messages').put({ id: 'a1', threadId: 'fixture-thread', role: 'assistant', createdAt: 2, content: 'Keep this answer.', runStatus: 'complete' });
    tx.objectStore('settings').put({ key: 'modelToolOverrides', value: { 'openai-compat:fixture-model': false } });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'regenerate' }).click();
  await expect(page.getByText(/nothing was changed/)).toBeVisible();
  await expect(page.getByText('Keep this answer.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Keep this answer.', { exact: true })).toBeVisible();
});
test('switching mode on a new chat keeps each mode\'s own default model', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'modeDefaultModels', value: { chat: { providerId: 'openai-compat', modelId: 'fixture-model' }, workspace: { providerId: 'openai-compat', modelId: 'workspace-model' } } });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  const read = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const get = <T,>(store: string, key: string) => new Promise<T>((resolve) => { const req = db.transaction(store).objectStore(store).get(key); req.onsuccess = () => resolve(req.result); });
    const thread = await get<{ modelId: string }>('threads', 'fixture-thread');
    const defaults = await get<{ value: Record<string, { modelId: string }> }>('settings', 'modeDefaultModels');
    db.close(); return { model: thread.modelId, chat: defaults.value.chat?.modelId, workspace: defaults.value.workspace?.modelId };
  });
  const modes = page.getByRole('radiogroup', { name: 'Chat mode' });
  await modes.getByRole('radio', { name: /^Workspace/ }).click();
  await expect.poll(read).toEqual({ model: 'workspace-model', chat: 'fixture-model', workspace: 'workspace-model' });
  await modes.getByRole('radio', { name: /^Chat/ }).click();
  await expect.poll(read).toEqual({ model: 'fixture-model', chat: 'fixture-model', workspace: 'workspace-model' });
});
test('new chat starts a fresh draft when the current empty chat already has files', async ({ page }) => {
  await seed(page);
  await page.getByRole('radiogroup', { name: 'Chat mode' }).getByRole('radio', { name: /^Workspace/ }).click();
  await page.getByLabel('Workspace file upload').setInputFiles([{ name: 'brief.md', mimeType: 'text/markdown', buffer: Buffer.from('# Brief') }]);
  await expect(page.getByRole('button', { name: 'Don\'t attach brief.md to this message' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Chat mode' })).toHaveCount(0);
  const threadCount = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const n = await new Promise<number>((resolve) => { const req = db.transaction('threads').objectStore('threads').count(); req.onsuccess = () => resolve(req.result); });
    db.close(); return n;
  });
  const before = await threadCount();
  await page.getByRole('button', { name: 'new chat' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Chat mode' })).toBeVisible();
  await expect.poll(threadCount).toBe(before + 1);
});
test('the viewer renders a generated CSV note as a table and shows each version\'s own copy source', async ({ page }) => {
  await seed(page, true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('htllm'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['workspaceFiles', 'workspaceVersions'], 'readwrite');
    tx.objectStore('workspaceFiles').put({ id: 'csv', threadId: 'fixture-thread', path: '/notes/totals.csv', kind: 'note', text: 'item,total\nTent,200', mimeType: 'text/markdown', version: 1, createdAt: 1, updatedAt: 1 });
    tx.objectStore('workspaceVersions').put({ fileId: 'csv', threadId: 'fixture-thread', version: 1, text: 'item,total\nTent,200', change: 'create', createdAt: 1 });
    tx.objectStore('workspaceFiles').put({ id: 'cp', threadId: 'fixture-thread', path: '/notes/quote.md', kind: 'note', text: 'from b', mimeType: 'text/markdown', version: 2, createdAt: 1, updatedAt: 2, copiedFrom: { path: '/uploads/b.txt', startLine: 5, endLine: 9 } });
    tx.objectStore('workspaceVersions').put({ fileId: 'cp', threadId: 'fixture-thread', version: 1, text: 'from a', change: 'copy', createdAt: 1, copiedFrom: { path: '/uploads/a.txt', startLine: 1, endLine: 2 } });
    tx.objectStore('workspaceVersions').put({ fileId: 'cp', threadId: 'fixture-thread', version: 2, text: 'from b', change: 'copy', createdAt: 2, copiedFrom: { path: '/uploads/b.txt', startLine: 5, endLine: 9 } });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Workspace files' }).click();
  const panel = page.getByRole('complementary', { name: 'Workspace files' });
  await panel.getByRole('button', { name: /totals\.csv/ }).click();
  await expect(panel.getByRole('cell', { name: 'Tent' })).toBeVisible();
  await panel.getByRole('button', { name: 'Back to files' }).click();
  await panel.getByRole('button', { name: /quote\.md/ }).click();
  await expect(panel.getByText('copied from /uploads/b.txt, lines 5–9')).toBeVisible();
  await panel.getByRole('button', { name: 'Previous version' }).click();
  await expect(panel.getByText('copied from /uploads/a.txt, lines 1–2')).toBeVisible();
});
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
