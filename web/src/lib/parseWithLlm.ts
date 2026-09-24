import type { Question } from '../data/quizzes';

const KEY = '@ignite_quiz:llm_key';
const PROVIDER = '@ignite_quiz:llm_provider';

export type LlmProvider = 'gemini' | 'openai';

export function llmSettings() {
  return {
    key: localStorage.getItem(KEY) ?? '',
    provider: (localStorage.getItem(PROVIDER) as LlmProvider | null) ?? 'gemini',
  };
}

export function saveLlmSettings(key: string, provider: LlmProvider) {
  if (key.trim()) localStorage.setItem(KEY, key.trim());
  else localStorage.removeItem(KEY);
  localStorage.setItem(PROVIDER, provider);
}

export async function parseQuizWithLlm(documentText: string, provider: LlmProvider, apiKey: string): Promise<Question[]> {
  const keyAt = documentText.search(/\n\s*ANSWER\s+KEY\s*\n/i);
  const answerKey = keyAt >= 0 ? documentText.slice(keyAt) : '';
  const body = keyAt >= 0 ? documentText.slice(0, keyAt) : documentText;
  const chunks = splitChunks(body);
  const questions: Question[] = [];

  for (const chunk of chunks) {
    const parsed = await askModel(provider, apiKey, chunk, answerKey);
    questions.push(...parsed);
  }

  if (questions.length === 0) {
    throw new Error('The model did not return any questions. Check the API key and try again.');
  }
  return questions;
}

function splitChunks(body: string) {
  const parts = body.split(/\n(?=Chapter\s+\d+\b)/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) return parts;
  const lines = body.split('\n');
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += 80) chunks.push(lines.slice(i, i + 80).join('\n'));
  return chunks;
}

async function askModel(provider: LlmProvider, apiKey: string, questionsText: string, answerKey: string) {
  const prompt = [
    'Extract multiple-choice questions from this exam text.',
    'Options may share a line, like "(A) Stone (B) Table" and "(C) Dog (D) Chair". Split them into four separate options.',
    'If an option wraps onto the next line, join it with the option it belongs to.',
    'The answer key is a table of question number and letter. Map each letter onto that question. A is index 0, B is 1, C is 2, D is 3.',
    'Ignore instructions, chapter titles, and the contents table.',
    'Return only JSON: {"questions":[{"title":"...","alternatives":["..."],"correct":0}]}',
    '',
    'ANSWER KEY:',
    answerKey || '(none)',
    '',
    'QUESTIONS:',
    questionsText,
  ].join('\n');

  const raw = provider === 'gemini' ? await gemini(apiKey, prompt) : await openai(apiKey, prompt);
  return normalize(raw);
}

async function gemini(apiKey: string, prompt: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    },
  );
  if (!response.ok) throw new Error(await errorMessage(response, 'Gemini'));
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

async function openai(apiKey: string, prompt: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You extract exam questions into JSON and never invent answers.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, 'OpenAI'));
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

async function errorMessage(response: Response, name: string) {
  const detail = await response.text();
  if (response.status === 401 || response.status === 403) return `${name} rejected the API key.`;
  return `${name} could not read this document (${response.status}). ${detail.slice(0, 180)}`;
}

function normalize(raw: string): Question[] {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) return [];
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
    questions?: { title?: string; alternatives?: string[]; correct?: number }[];
  };
  return (parsed.questions ?? [])
    .filter((item) => item.title && item.alternatives && item.alternatives.length >= 2)
    .map((item) => ({
      title: item.title!.replace(/\s+/g, ' ').trim(),
      alternatives: item.alternatives!.map((option) => option.replace(/\s+/g, ' ').trim()),
      correct: Math.min(Math.max(item.correct ?? 0, 0), item.alternatives!.length - 1),
    }));
}
