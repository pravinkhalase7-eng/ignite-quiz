import type { Question } from '../data/quizzes';
import { llmSettings, saveLlmSettings, type LlmProvider } from './parseWithLlm';

export type StoryPack = {
  title: string;
  story: string;
  storyQuestions: Question[];
  wordQuestions: Question[];
};

const PACK_KEY = 'ignite_story_pack';

export function loadStoryPack(): StoryPack | null {
  try {
    const raw = sessionStorage.getItem(PACK_KEY);
    return raw ? (JSON.parse(raw) as StoryPack) : null;
  } catch {
    return null;
  }
}

export function saveStoryPack(pack: StoryPack) {
  sessionStorage.setItem(PACK_KEY, JSON.stringify(pack));
}

export async function generateStoryPack(input: { text: string; image?: File | null }): Promise<StoryPack> {
  const { key, provider } = llmSettings();
  if (!key.trim()) {
    throw new Error('Add a Gemini or OpenAI key on this page. It is saved only in this browser.');
  }
  const story = input.text.trim();
  if (!story && !input.image) throw new Error('Type a story, or add a photo.');
  const image = input.image ? await fileToImage(input.image) : null;
  const prompt = storyPrompt(story);
  const raw = provider === 'gemini' ? await gemini(key, prompt, image) : await openai(key, prompt, image);
  return normalizePack(raw, story);
}

export { llmSettings, saveLlmSettings, type LlmProvider };

function storyPrompt(story: string) {
  return [
    'You help children understand a story.',
    'Read the story. If a photo is attached, read the story from the photo first.',
    'Write simple questions a child can answer after reading.',
    'Make two sets:',
    '1. storyQuestions: what happened, who, where, why, and the order of events. Every fact must come from the story.',
    '2. wordQuestions: harder words from the story. Ask what the word means in simple words a child knows.',
    'Example: title "What does ventilation mean?" and the correct option "fresh air".',
    'Each question has exactly 4 short options. Only one is correct. correct is 0, 1, 2, or 3.',
    'Use the same language as the story.',
    'Return 4 to 8 story questions and 4 to 8 word questions.',
    'Return only JSON:',
    '{"title":"short title","story":"the full story text","storyQuestions":[{"title":"...","alternatives":["a","b","c","d"],"correct":0}],"wordQuestions":[{"title":"...","alternatives":["a","b","c","d"],"correct":0}]}',
    '',
    story ? `TYPED STORY:\n${story}` : 'TYPED STORY: (none, read the photo)',
  ].join('\n');
}

async function gemini(apiKey: string, prompt: string, image: { mime: string; data: string } | null) {
  const parts: Record<string, unknown>[] = [];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  parts.push({ text: prompt });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    },
  );
  if (!response.ok) throw new Error(await errorMessage(response, 'Gemini'));
  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

async function openai(apiKey: string, prompt: string, image: { mime: string; data: string } | null) {
  const content: Record<string, unknown>[] = [{ type: 'text', text: prompt }];
  if (image) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.data}` } });
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You write simple story quizzes for children and return JSON only.' },
        { role: 'user', content },
      ],
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, 'OpenAI'));
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? '';
}

function normalizePack(raw: string, fallbackStory: string): StoryPack {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd < jsonStart) throw new Error('The model did not return a quiz. Try again.');
  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
    title?: string;
    story?: string;
    storyQuestions?: RawQuestion[];
    wordQuestions?: RawQuestion[];
  };
  const storyQuestions = cleanQuestions(parsed.storyQuestions);
  const wordQuestions = cleanQuestions(parsed.wordQuestions);
  if (storyQuestions.length < 1 && wordQuestions.length < 1) {
    throw new Error('No questions were created. Try a longer story.');
  }
  return {
    title: (parsed.title || 'Story quiz').replace(/\s+/g, ' ').trim(),
    story: (parsed.story || fallbackStory).trim(),
    storyQuestions,
    wordQuestions,
  };
}

type RawQuestion = { title?: string; alternatives?: string[]; correct?: number };

function cleanQuestions(items: RawQuestion[] | undefined): Question[] {
  return (items ?? [])
    .filter((item) => item.title && item.alternatives && item.alternatives.length >= 2)
    .map((item) => ({
      title: item.title!.replace(/\s+/g, ' ').trim(),
      alternatives: item.alternatives!.slice(0, 4).map((option) => option.replace(/\s+/g, ' ').trim()),
      correct: Math.min(Math.max(item.correct ?? 0, 0), Math.min(item.alternatives!.length, 4) - 1),
    }));
}

function fileToImage(file: File) {
  return new Promise<{ mime: string; data: string }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const data = result.split(',')[1];
      if (!data) {
        reject(new Error('Could not read that photo.'));
        return;
      }
      resolve({ mime: file.type || 'image/jpeg', data });
    };
    reader.onerror = () => reject(new Error('Could not read that photo.'));
    reader.readAsDataURL(file);
  });
}

async function errorMessage(response: Response, name: string) {
  const detail = await response.text();
  if (response.status === 401 || response.status === 403) return `${name} rejected the API key.`;
  return `${name} could not make the quiz (${response.status}). ${detail.slice(0, 180)}`;
}
