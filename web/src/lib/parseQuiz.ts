import type { Question } from '../data/quizzes';

const DEVANAGARI_DIGITS = '०१२३४५६७८९';
const OPTION_MARK = /(?:[([]\s*([A-Ha-hकखगघ])\s*[)\]\.])|(?:^|[^\p{L}])([A-Ha-hकखगघ])\s*[)\]\.]/gu;
const QUESTION_SPLIT = /\n(?=\s*(?:Q\s*)?\d{1,3}[.)]\s*)/i;
const QUESTION_START = /^(?:Q\s*)?(\d{1,3})[.)]\s*([\s\S]+)$/i;

export function parseQuizText(raw: string): Question[] {
  const text = normalizeText(raw);
  const { body, key } = splitAnswerKey(text);
  const answers = parseAnswerKey(key);

  const chunks = body.split(QUESTION_SPLIT).map((chunk) => chunk.trim()).filter(Boolean);
  const questions: Question[] = [];

  for (const chunk of chunks) {
    const start = chunk.match(QUESTION_START);
    if (!start) continue;
    const number = Number(start[1]);
    const peeled = peelInlineAnswer(start[2]);
    const parsed = splitOptions(peeled.body);
    if (!parsed || parsed.alternatives.length < 2) continue;

    const fromKey = answers.get(number) ?? peeled.correct;
    questions.push({
      title: parsed.title,
      alternatives: parsed.alternatives,
      correct: fromKey != null && fromKey < parsed.alternatives.length ? fromKey : parsed.correct,
    });
  }

  if (questions.length === 0) {
    throw new Error(
      'No questions were found. Use numbered questions with options such as (A) (B) (C) (D), and an answer key table if the answers are listed separately.',
    );
  }

  return questions;
}

function normalizeText(raw: string) {
  return raw
    .replace(/\r/g, '')
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ')
    .replace(/[०-९]/g, (digit) => String(DEVANAGARI_DIGITS.indexOf(digit)))
    .replace(/===== PAGE \d+ =====/g, '\n');
}

function optionIndex(token: string) {
  const letter = token.toUpperCase();
  if (letter >= 'A' && letter <= 'H') return letter.charCodeAt(0) - 65;
  const marathi: Record<string, number> = { क: 0, ख: 1, ग: 2, घ: 3 };
  return marathi[token] ?? null;
}

function peelInlineAnswer(block: string) {
  const match = block.match(
    /\n\s*(?:correct\s+answer|correct\s+option|answer\s+key|answer|ans\.?|correct|उत्तर)\s*[:：\-]\s*[([]?\s*([A-Ha-hकखगघ]|\d{1,2})/i,
  );
  if (!match || match.index === undefined) return { body: block, correct: null as number | null };
  const token = match[1];
  const correct = optionIndex(token) ?? (Number.isNaN(Number(token)) ? null : Number(token) - 1);
  return { body: block.slice(0, match.index), correct };
}

function splitAnswerKey(text: string) {
  const pattern = /answer\s+key|उत्तर\s*कुंजी/gi;
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) last = match;
  if (!last) return { body: text, key: '' };
  const lineEnd = text.indexOf('\n', last.index);
  const cut = lineEnd === -1 ? text.length : lineEnd + 1;
  return { body: text.slice(0, last.index), key: text.slice(cut) };
}

function parseAnswerKey(section: string) {
  const answers = new Map<number, number>();
  const patterns = [
    /(\d{1,3})\s*[-–—]\s*([A-Ha-hकखगघ])/g,
    /(\d{1,3})\.?\s+[([]?\s*([A-Ha-hकखगघ])\s*[)\]]?/g,
  ];
  for (const pair of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pair.exec(section))) {
      const index = optionIndex(match[2]);
      if (index != null) answers.set(Number(match[1]), index);
    }
  }
  return answers;
}

function splitOptions(block: string): { title: string; alternatives: string[]; correct: number } | null {
  const marks: { index: number; letterIndex: number; end: number }[] = [];
  OPTION_MARK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPTION_MARK.exec(block))) {
    const letterIndex = optionIndex(match[1] ?? match[2]);
    if (letterIndex == null) continue;
    marks.push({ index: match.index, letterIndex, end: match.index + match[0].length });
  }

  if (marks.length < 2) return null;

  const before = block.slice(0, marks[0].index);
  const breakAt = before.lastIndexOf('\n');
  const missingFirstOption = marks[0].letterIndex !== 0 && breakAt >= 0;
  const title = (missingFirstOption ? before.slice(0, breakAt) : before).replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const alternatives: string[] = [];
  let correct = 0;
  if (missingFirstOption) {
    const leading = before.slice(breakAt + 1).replace(/\s+/g, ' ').trim();
    if (leading) alternatives.push(leading);
  }

  for (let i = 0; i < marks.length; i += 1) {
    const next = marks[i + 1]?.index ?? block.length;
    let value = block.slice(marks[i].end, next).replace(/\s+/g, ' ').trim();
    const marked = /\(correct\)|\[correct\]|\*$/i.test(value);
    value = value.replace(/\s*(?:\(correct\)|\[correct\]|\*)$/i, '').trim();
    if (!value) continue;
    if (marked) correct = alternatives.length;
    alternatives.push(value);
  }

  if (alternatives.length < 2) return null;
  return { title, alternatives, correct };
}
