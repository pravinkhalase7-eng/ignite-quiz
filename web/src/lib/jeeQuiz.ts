export type JeeQuestion = {
  id?: string;
  stem: string;
  options: string[];
  choices?: string[];
  correct: number;
};

export type JeePack = {
  title: string;
  year: string;
  subject: string;
  topic?: string;
  count: number;
  questions: JeeQuestion[];
};

export type JeeTopic = { name: string; count: number };

export type JeeTopicReport = {
  ready: boolean;
  total: number;
  done: number;
  topics: JeeTopic[];
};

export type JeeYear = {
  year: string;
  subjects: { Physics: number; Chemistry: number; Mathematics: number };
};

const PACK_KEY = 'ignite_jee_pack';

export async function loadJeeCatalog(): Promise<{ ready: boolean; years: JeeYear[]; note?: string; error?: string }> {
  const response = await fetch('/api/jee');
  if (!response.ok) throw new Error('Could not read the JEE papers.');
  return response.json();
}

export async function loadJeeTopics(year: string, subject: string): Promise<JeeTopicReport> {
  const response = await fetch('/api/jee/topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, subject }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Could not group those questions.');
  return body as JeeTopicReport;
}

export async function startJeeQuiz(year: string, subject: string, count: number, topic?: string): Promise<JeePack> {
  const response = await fetch('/api/jee/quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ year, subject, count, topic }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Could not start that quiz.');
  return body as JeePack;
}

export async function loadJeeChoices(id: string): Promise<string[]> {
  const response = await fetch('/api/jee/choices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(body.choices) || body.choices.length !== 4) {
    throw new Error(body.error || 'Could not read those options.');
  }
  return body.choices as string[];
}

export async function explainJeeQuestion(id: string): Promise<string> {
  const response = await fetch('/api/jee/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.explanation !== 'string') {
    throw new Error(body.error || 'Could not explain that question.');
  }
  return body.explanation;
}

export function saveJeePack(pack: JeePack) {
  sessionStorage.setItem(PACK_KEY, JSON.stringify(pack));
}

export function loadJeePack(): JeePack | null {
  const raw = sessionStorage.getItem(PACK_KEY);
  if (!raw) return null;
  try {
    const pack = JSON.parse(raw) as JeePack;
    if (!pack?.questions?.length) return null;
    return pack;
  } catch {
    return null;
  }
}
