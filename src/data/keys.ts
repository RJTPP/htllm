import { getDb } from './db';

export async function setKey(providerId: string, value: string): Promise<void> {
  const db = await getDb();
  await db.put('keys', { providerId, value });
}

export async function getKey(providerId: string): Promise<string | undefined> {
  const db = await getDb();
  const entry = await db.get('keys', providerId);
  return entry?.value;
}

export async function deleteKey(providerId: string): Promise<void> {
  const db = await getDb();
  await db.delete('keys', providerId);
}
