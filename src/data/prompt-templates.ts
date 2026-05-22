import { v4 as uuid } from 'uuid';
import type { PromptTemplate } from '../providers/types';
import { getDb } from './db';

const BUILT_IN_TEMPLATES: Omit<PromptTemplate, 'id' | 'createdAt'>[] = [
  {
    title: 'Explain',
    content: 'Explain the following in simple terms:\n\n',
    description: 'Explain something in simple terms',
    isBuiltIn: true,
  },
  {
    title: 'Summarize',
    content: 'Summarize the following text concisely:\n\n',
    description: 'Summarize text concisely',
    isBuiltIn: true,
  },
  {
    title: 'Code Review',
    content: 'Review the following code for bugs, improvements, and best practices:\n\n```\n\n```',
    description: 'Review code for bugs and improvements',
    isBuiltIn: true,
  },
  {
    title: 'Translate',
    content: 'Translate the following text to English:\n\n',
    description: 'Translate text to English',
    isBuiltIn: true,
  },
];

export async function seedBuiltInTemplates(): Promise<void> {
  const db = await getDb();
  const existing = await db.getAll('promptTemplates');
  if (existing.some((t) => t.isBuiltIn)) return;

  const tx = db.transaction('promptTemplates', 'readwrite');
  const now = Date.now();
  for (const tpl of BUILT_IN_TEMPLATES) {
    await tx.store.put({ id: uuid(), ...tpl, createdAt: now });
  }
  await tx.done;
}

export async function listTemplates(): Promise<PromptTemplate[]> {
  const db = await getDb();
  return db.getAll('promptTemplates');
}

export async function createTemplate(data: Omit<PromptTemplate, 'id' | 'createdAt'>): Promise<PromptTemplate> {
  const template: PromptTemplate = { id: uuid(), ...data, createdAt: Date.now() };
  const db = await getDb();
  await db.put('promptTemplates', template);
  return template;
}

export async function updateTemplate(id: string, patch: Partial<PromptTemplate>): Promise<void> {
  const db = await getDb();
  const existing = await db.get('promptTemplates', id);
  if (!existing) return;
  await db.put('promptTemplates', { ...existing, ...patch, id });
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('promptTemplates', id);
}
