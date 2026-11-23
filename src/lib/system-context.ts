/**
 * The app-owned part of the system prompt: facts the model cannot know and the
 * user should not have to maintain. Always added, never editable.
 */
export function appContext(opts: { now: Date; workspace: boolean }): string {
  const date = opts.now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const lines = [`Today is ${date}.`];
  if (!opts.workspace) {
    lines.push('This chat has no tools or file access. If the user needs you to read or write files, suggest starting a Workspace chat.');
  }
  return lines.join(' ');
}
