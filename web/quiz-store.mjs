import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authEnabled,
  clearSessionCookie,
  currentUser,
  deleteHistory,
  deleteQuiz,
  finishGoogleLogin,
  googleStartUrl,
  listHistory,
  listQuizzes,
  saveHistory,
  saveQuiz,
  sessionCookie,
} from './account.mjs';

const DATA = process.env.QUIZ_DATA || path.join(process.cwd(), 'data', 'quizzes.json');
const ICONS = new Set(['toggle', 'code', 'git', 'paint', 'cloud', 'device', 'file']);

loadServerEnv();

function loadServerEnv() {
  if (process.env.GEMINI_API_KEY) return;
  try {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '.env');
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$/);
      if (!match || !match[1]) continue;
      let value = match[1];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env.GEMINI_API_KEY = value;
    }
  } catch {
    // The live server gets GEMINI_API_KEY from its environment.
  }
}

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

  if (url.startsWith('/api/auth') || url.startsWith('/api/history') || (authEnabled() && url.startsWith('/api/quizzes'))) {
    handleAccount(req, res, url).catch((error) => {
      sendJson(res, 500, { error: error instanceof Error ? error.message : 'Server error.' });
    });
    return;
  }

  if (url === '/api/llm' && req.method === 'GET') {
    sendJson(res, 200, { gemini: Boolean(process.env.GEMINI_API_KEY) });
    return;
  }

  if (url === '/api/llm/gemini' && req.method === 'POST') {
    readBody(req, (raw) => {
      geminiFromServer(raw)
        .then((result) => sendJson(res, result.status, result.body))
        .catch(() => sendJson(res, 502, { error: 'Gemini could not be reached.' }));
    });
    return;
  }

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

async function handleAccount(req, res, url) {
  if (url === '/api/auth/me' && req.method === 'GET') {
    const user = authEnabled() ? await currentUser(req) : null;
    sendJson(res, 200, {
      google: authEnabled(),
      user: user ? { id: user.id, email: user.email, name: user.name } : null,
    });
    return;
  }

  if (!authEnabled()) {
    sendJson(res, 503, { error: 'Google sign-in is not set up on this server.' });
    return;
  }

  if (url === '/api/auth/google' && req.method === 'GET') {
    res.statusCode = 302;
    res.setHeader('Location', googleStartUrl(req));
    res.end();
    return;
  }

  if (url === '/api/auth/google/callback' && req.method === 'GET') {
    const params = new URL(req.url, 'http://localhost').searchParams;
    try {
      const token = await finishGoogleLogin(req, params.get('code') || '', params.get('state') || '');
      res.statusCode = 302;
      res.setHeader('Set-Cookie', sessionCookie(token, req));
      res.setHeader('Location', '/');
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed.';
      res.statusCode = 302;
      res.setHeader('Location', `/?login=failed&message=${encodeURIComponent(message)}`);
      res.end();
    }
    return;
  }

  if (url === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    sendJson(res, 200, { ok: true });
    return;
  }

  const user = await currentUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Sign in with Google.' });
    return;
  }

  if (url === '/api/quizzes' && req.method === 'GET') {
    sendJson(res, 200, await listQuizzes(user.id));
    return;
  }

  if (url === '/api/quizzes' && req.method === 'POST') {
    readBody(req, async (raw) => {
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
      sendJson(res, 200, await saveQuiz(user.id, quiz));
    });
    return;
  }

  const quizMatch = url.match(/^\/api\/quizzes\/([^/]+)$/);
  if (quizMatch && req.method === 'DELETE') {
    await deleteQuiz(user.id, decodeURIComponent(quizMatch[1]));
    res.statusCode = 204;
    res.end();
    return;
  }

  if (url === '/api/history' && req.method === 'GET') {
    sendJson(res, 200, await listHistory(user.id));
    return;
  }

  if (url === '/api/history' && req.method === 'POST') {
    readBody(req, async (raw) => {
      let entry;
      try {
        entry = JSON.parse(raw);
      } catch {
        sendJson(res, 400, { error: 'Invalid history.' });
        return;
      }
      if (!entry || typeof entry.title !== 'string' || ![1, 2, 3].includes(entry.level)) {
        sendJson(res, 400, { error: 'Invalid history.' });
        return;
      }
      sendJson(res, 200, await saveHistory(user.id, entry));
    });
    return;
  }

  const historyMatch = url.match(/^\/api\/history\/([^/]+)$/);
  if (historyMatch && req.method === 'DELETE') {
    await deleteHistory(user.id, decodeURIComponent(historyMatch[1]));
    res.statusCode = 204;
    res.end();
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
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

async function geminiFromServer(raw) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { status: 503, body: { error: 'Gemini is not set up on this server.' } };

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: 'Invalid request.' } };
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt || prompt.length > 100_000) return { status: 400, body: { error: 'Type a story, or add a photo.' } };

  const image = body.image;
  const parts = [];
  if (image && typeof image.data === 'string') {
    const mime = typeof image.mime === 'string' ? image.mime : 'image/jpeg';
    if (!mime.startsWith('image/') || image.data.length > 6_000_000) {
      return { status: 400, body: { error: 'That photo is too large.' } };
    }
    parts.push({ inline_data: { mime_type: mime, data: image.data } });
  }
  parts.push({ text: prompt });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || 'Gemini could not make the quiz.';
    return { status: response.status, body: { error: String(message).slice(0, 180) } };
  }
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought)
    .map((part) => part.text ?? '')
    .join('');
  return { status: 200, body: { text } };
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
