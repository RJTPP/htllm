import type { Message } from '../providers/types';

/** Keep each saved call/result pair on its owning assistant message. The
 * budgeting and compaction layers therefore cannot keep half of a pair.
 * This is historical data, not replayable permission or a resumable run. */
export function activityContext(message: Message): string {
  if (!message.activity?.length) return '';
  return '\n\n<historical-tool-data>\n' + JSON.stringify(message.activity.map((event) => ({
    tool: event.tool, server: event.server, arguments: event.arguments,
    status: event.status, result: event.result ?? 'No result was received.',
  }))) + '\n</historical-tool-data>';
}
export function withActivityContext(message: Message): Message {
  const activity = activityContext(message);
  if (!activity) return message;
  return { ...message, activity: undefined, content: typeof message.content === 'string'
    ? message.content + activity : [...message.content, { type: 'text', text: activity }] };
}

/** Results shorter than this are kept even when old: they are cheap and often
 *  carry status the model must not lose (denials, errors, unknown outcomes). */
const STUB_MIN_CHARS = 300;

/** Replace a long, successful tool result with a short stub. The call itself
 *  (tool, server, arguments, status) is kept so the model knows what it did. */
export function stubActivityResults(message: Message): Message {
  if (!message.activity?.some((e) => e.status === 'complete' && (e.result?.length ?? 0) > STUB_MIN_CHARS)) return message;
  return { ...message, activity: message.activity.map((event) =>
    event.status === 'complete' && (event.result?.length ?? 0) > STUB_MIN_CHARS
      ? { ...event, result: `[Old tool result cleared to save context. Call ${event.tool} again if you need it.]` }
      : event) };
}

/** Keep full tool results only on the most recent `keepRecent` assistant
 *  messages; older ones get stubbed results. Messages are in chronological order. */
export function stubOldActivity(messages: Message[], keepRecent = 2): Message[] {
  let seen = 0;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    const message = out[i]!;
    if (message.role !== 'assistant') continue;
    if (seen++ < keepRecent) continue;
    out[i] = stubActivityResults(message);
  }
  return out;
}
