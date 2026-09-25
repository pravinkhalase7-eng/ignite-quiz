import crypto from 'node:crypto';
import pg from 'pg';

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
let schemaReady = null;

export function authEnabled() {
  return Boolean(
    pool &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.JWT_SECRET,
  );
}

export async function ensureSchema() {
  if (!pool) return;
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_users (
        id text PRIMARY KEY,
        google_sub text UNIQUE NOT NULL,
        email text NOT NULL,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS quiz_quizzes (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES quiz_users(id) ON DELETE CASCADE,
        title text NOT NULL,
        category text,
        level integer NOT NULL,
        icon text NOT NULL,
        questions jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS quiz_history (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES quiz_users(id) ON DELETE CASCADE,
        title text NOT NULL,
        points integer NOT NULL,
        questions integer NOT NULL,
        level integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }
  await schemaReady;
}

export async function currentUser(req) {
  if (!authEnabled()) return null;
  await ensureSchema();
  const token = readCookie(req, 'quiz_session');
  const payload = token ? verifySession(token) : null;
  if (!payload?.sub) return null;
  const result = await pool.query('SELECT id, email, name FROM quiz_users WHERE id = $1', [payload.sub]);
  return result.rows[0] ?? null;
}

export async function listQuizzes(userId) {
  await ensureSchema();
  const result = await pool.query(
    'SELECT id, title, category, level, icon, questions FROM quiz_quizzes WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows.map(rowToQuiz);
}

export async function saveQuiz(userId, quiz) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO quiz_quizzes (id, user_id, title, category, level, icon, questions)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, category = EXCLUDED.category, level = EXCLUDED.level, icon = EXCLUDED.icon, questions = EXCLUDED.questions
     WHERE quiz_quizzes.user_id = $2`,
    [quiz.id, userId, quiz.title, quiz.category ?? null, quiz.level, quiz.icon, JSON.stringify(quiz.questions)],
  );
  return quiz;
}

export async function deleteQuiz(userId, id) {
  await ensureSchema();
  await pool.query('DELETE FROM quiz_quizzes WHERE user_id = $1 AND id = $2', [userId, id]);
}

export async function listHistory(userId) {
  await ensureSchema();
  const result = await pool.query(
    'SELECT id, title, points, questions, level FROM quiz_history WHERE user_id = $1 ORDER BY created_at DESC',
    [userId],
  );
  return result.rows;
}

export async function saveHistory(userId, entry) {
  await ensureSchema();
  const id = typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID();
  await pool.query(
    `INSERT INTO quiz_history (id, user_id, title, points, questions, level)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [id, userId, entry.title, entry.points, entry.questions, entry.level],
  );
  return { id, title: entry.title, points: entry.points, questions: entry.questions, level: entry.level };
}

export async function deleteHistory(userId, id) {
  await ensureSchema();
  await pool.query('DELETE FROM quiz_history WHERE user_id = $1 AND id = $2', [userId, id]);
}

export function googleStartUrl(req) {
  const redirect = `${appUrl(req)}/api/auth/google/callback`;
  const state = signSession({ next: '/', exp: Date.now() + 10 * 60 * 1000 }, process.env.JWT_SECRET);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function finishGoogleLogin(req, code, state) {
  const statePayload = verifySession(state);
  if (!statePayload) throw new Error('Google sign-in expired. Try again.');
  const redirect = `${appUrl(req)}/api/auth/google/callback`;
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResponse.ok) throw new Error('Google sign-in did not complete.');
  const tokens = await tokenResponse.json();
  const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokens.id_token || '')}`);
  if (!infoResponse.ok) throw new Error('Google could not verify that sign-in.');
  const info = await infoResponse.json();
  if (info.aud !== process.env.GOOGLE_CLIENT_ID || info.email_verified !== 'true' || !info.sub || !info.email) {
    throw new Error('Google could not verify that sign-in.');
  }
  await ensureSchema();
  const existing = await pool.query('SELECT id FROM quiz_users WHERE google_sub = $1', [info.sub]);
  const id = existing.rows[0]?.id ?? crypto.randomUUID();
  const name = String(info.name || info.email.split('@')[0]).slice(0, 200);
  await pool.query(
    `INSERT INTO quiz_users (id, google_sub, email, name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name`,
    [id, info.sub, String(info.email).toLowerCase(), name],
  );
  return signSession({ sub: id, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }, process.env.JWT_SECRET);
}

export function sessionCookie(token, req) {
  const secure = appUrl(req).startsWith('https://') ? '; Secure' : '';
  return `quiz_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function clearSessionCookie() {
  return 'quiz_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0';
}

function rowToQuiz(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category ?? undefined,
    level: row.level,
    icon: row.icon,
    questions: row.questions,
  };
}

function appUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${String(proto).split(',')[0]}://${host}`;
}

function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySession(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret || !token?.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}
