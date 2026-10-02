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
