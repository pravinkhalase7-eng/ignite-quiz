import fs from 'node:fs';
import path from 'node:path';

const DATA = process.env.QUIZ_DATA || path.join(process.cwd(), 'data', 'quizzes.json');
const ICONS = new Set(['toggle', 'code', 'git', 'paint', 'cloud', 'device', 'file']);

export function readQuizzes() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isQuiz) : [];
  } catch {
    return [];
  }
}

export function writeQuizzes(list) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(list));
}

export function quizApi(req, res, next) {
  const url = (req.url || '').split('?')[0];

  if (url === '/api/quizzes' && req.method === 'GET') {
    sendJson(res, 200, readQuizzes());
    return;
  }

  if (url === '/api/quizzes' && req.method === 'POST') {
    readBody(req, (raw) => {
      let quiz;
      try {
        quiz = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid quiz.' });
        return;
      }
      if (!isQuiz(quiz)) {
        sendJson(res, 400, { error: 'Invalid quiz.' });
        return;
      }
      const nextList = [quiz, ...readQuizzes().filter((item) => item.id !== quiz.id)];
      writeQuizzes(nextList);
      sendJson(res, 200, quiz);
    });
    return;
  }

  const match = url.match(/^\/api\/quizzes\/([^/]+)$/);
  if (match && req.method === 'DELETE') {
    const id = decodeURIComponent(match[1]);
    writeQuizzes(readQuizzes().filter((item) => item.id !== id));
    res.statusCode = 204;
    res.end();
    return;
  }

  next();
}

function isQuiz(value) {
  if (!value || typeof value !== 'object') return false;
  if (typeof value.id !== 'string' || !value.id.startsWith('custom-')) return false;
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200) return false;
  if (![1, 2, 3].includes(value.level)) return false;
  if (value.category != null && (typeof value.category !== 'string' || value.category.length > 80)) return false;
  if (!ICONS.has(value.icon)) return false;
  if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 500) return false;
  return value.questions.every(
    (question) =>
      question &&
      typeof question.title === 'string' &&
      question.title.length > 0 &&
      question.title.length <= 2000 &&
      Array.isArray(question.alternatives) &&
      question.alternatives.length >= 2 &&
      question.alternatives.length <= 8 &&
      question.alternatives.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 500) &&
      Number.isInteger(question.correct) &&
      question.correct >= 0 &&
      question.correct < question.alternatives.length,
  );
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req, done) {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 8_000_000) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
}
