import type { Quiz } from '../data/quizzes';
import { QUIZZES } from '../data/quizzes';

export type HistoryEntry = {
  id: string;
  title: string;
  points: number;
  questions: number;
  level: number;
};

const HISTORY_KEY = '@ignite_quiz:history';
const CUSTOM_KEY = '@ignite_quiz:custom';

let sharedQuizzes: Quiz[] | null = null;

export function historyGetAll(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function historyAdd(entry: HistoryEntry) {
  const current = historyGetAll();
  localStorage.setItem(HISTORY_KEY, JSON.stringify([...current, entry]));
}

export function historyRemove(id: string) {
  const next = historyGetAll().filter((item) => item.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function readLocalQuizzes(): Quiz[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as Quiz[]) : [];
  } catch {
    return [];
  }
}

function rememberQuizzes(list: Quiz[]) {
  sharedQuizzes = list;
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(list));
}

export function customQuizzesGet(): Quiz[] {
  return sharedQuizzes ?? readLocalQuizzes();
}

export async function refreshCustomQuizzes(): Promise<Quiz[]> {
  const local = readLocalQuizzes();
  try {
    const response = await fetch('/api/quizzes');
    if (!response.ok) throw new Error('Could not load quizzes.');
    let remote = (await response.json()) as Quiz[];
    const remoteIds = new Set(remote.map((quiz) => quiz.id));
    for (const quiz of local) {
      if (!quiz.id.startsWith('custom-') || remoteIds.has(quiz.id)) continue;
      const saved = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quiz),
      });
      if (!saved.ok) continue;
      const stored = (await saved.json()) as Quiz;
      remote = [stored, ...remote.filter((item) => item.id !== stored.id)];
    }
    rememberQuizzes(remote);
    return remote;
  } catch {
    rememberQuizzes(local);
    return local;
  }
}

export async function customQuizAdd(quiz: Quiz) {
  const response = await fetch('/api/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(quiz),
  });
  if (!response.ok) throw new Error('Could not save this quiz for other devices.');
  const stored = (await response.json()) as Quiz;
  rememberQuizzes([stored, ...customQuizzesGet().filter((item) => item.id !== stored.id)]);
}

export async function customQuizRemove(id: string) {
  const response = await fetch(`/api/quizzes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok && response.status !== 204) throw new Error('Could not delete this quiz.');
  rememberQuizzes(customQuizzesGet().filter((quiz) => quiz.id !== id));
}

export function getAllQuizzes(): Quiz[] {
  return [...customQuizzesGet(), ...QUIZZES];
}

export function getQuizById(id: string) {
  return getAllQuizzes().find((quiz) => quiz.id === id);
}
