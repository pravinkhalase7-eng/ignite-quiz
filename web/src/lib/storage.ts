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

export function customQuizzesGet(): Quiz[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as Quiz[]) : [];
  } catch {
    return [];
  }
}

export function customQuizAdd(quiz: Quiz) {
  const current = customQuizzesGet().filter((item) => item.id !== quiz.id);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify([quiz, ...current]));
}

export function customQuizRemove(id: string) {
  const next = customQuizzesGet().filter((quiz) => quiz.id !== id);
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
}

export function getAllQuizzes(): Quiz[] {
  return [...customQuizzesGet(), ...QUIZZES];
}

export function getQuizById(id: string) {
  return getAllQuizzes().find((quiz) => quiz.id === id);
}
