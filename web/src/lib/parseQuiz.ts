import type { Question } from '../data/quizzes';

const OPTION_MARK = /[\(\[]\s*([A-Ha-h])\s*[\)\]]|(?:^|[\s])([A-Ha-h])\s*[.)]\s+/g;

export function parseQuizText(raw: string): Question[] {
  const text = raw
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/===== PAGE \d+ =====/g, '\n');

  const keySplit = text.split(/\n\s*ANSWER\s+KEY\s*\n/i);
  const body = keySplit[0];
  const answers = keySplit.length > 1 ? parseAnswerKey(keySplit.slice(1).join('\n')) : new Map<number, number>();

  const chunks = body.split(/\n(?=\d{1,3}\.\s+)/).map((chunk) => chunk.trim()).filter(Boolean);
  const questions: Question[] = [];

  for (const chunk of chunks) {
    const start = chunk.match(/^(\d{1,3})\.\s+([\s\S]+)$/);
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

function peelInlineAnswer(block: string) {
  const match = block.match(
    /\n\s*(?:correct\s+answer|correct\s+option|answer\s+key|answer|ans\.?|correct)\s*[:\-]\s*([A-Ha-h]|\d{1,2})\b/i,
  );
  if (!match || match.index === undefined) return { body: block, correct: null as number | null };
  const token = match[1];
  const correct = /^[A-Ha-h]$/i.test(token) ? token.toUpperCase().charCodeAt(0) - 65 : Number(token) - 1;
  return { body: block.slice(0, match.index), correct };
}

function parseAnswerKey(section: string) {
  const answers = new Map<number, number>();
  const pair = /(\d{1,3})\s+([A-Ha-h])\b/g;
  let match: RegExpExecArray | null;
  while ((match = pair.exec(section))) {
    answers.set(Number(match[1]), match[2].toUpperCase().charCodeAt(0) - 65);
  }
  return answers;
}

function splitOptions(block: string): { title: string; alternatives: string[]; correct: number } | null {
  const marks: { index: number; letter: string; end: number }[] = [];
  OPTION_MARK.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OPTION_MARK.exec(block))) {
    const letter = (match[1] || match[2]).toUpperCase();
    if (letter < 'A' || letter > 'H') continue;
    marks.push({ index: match.index, letter, end: match.index + match[0].length });
  }

  if (marks.length < 2) return null;

  const title = block.slice(0, marks[0].index).replace(/\s+/g, ' ').trim();
  if (!title) return null;

  const alternatives: string[] = [];
  let correct = 0;
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
