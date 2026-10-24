import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'jee-main-papers');
const INDEX = path.join(ROOT, 'index.json');
const ANSWERS = path.join(ROOT, 'answers.json');
const EXPLANATIONS = path.join(ROOT, 'explanations.json');
const CHOICES = path.join(ROOT, 'choices.json');
const TOPICS = path.join(ROOT, 'topics.json');
const SYLLABUS = {
  Physics: [
    'Units and Measurement',
    'Kinematics',
    'Laws of Motion',
    'Work, Energy and Power',
    'Rotational Motion',
    'Gravitation',
    'Properties of Matter',
    'Thermodynamics',
    'Oscillations and Waves',
    'Electrostatics',
    'Current Electricity',
    'Magnetism',
    'Electromagnetic Induction',
    'Optics',
    'Modern Physics',
    'Electronic Devices',
  ],
  Chemistry: [
    'Some Basic Concepts of Chemistry',
    'Atomic Structure',
    'Chemical Bonding',
    'States of Matter',
    'Thermodynamics',
    'Equilibrium',
    'Redox and Electrochemistry',
    'Chemical Kinetics',
    'Solutions',
    'Organic Chemistry',
    'Hydrocarbons',
    'Biomolecules',
    'Coordination Compounds',
    'p-Block Elements',
    'd- and f-Block Elements',
  ],
  Mathematics: [
    'Sets, Relations and Functions',
    'Complex Numbers and Quadratic Equations',
    'Matrices and Determinants',
    'Permutations and Combinations',
    'Binomial Theorem',
    'Sequences and Series',
    'Trigonometry',
    'Inverse Trigonometric Functions',
    'Limits, Continuity and Differentiability',
    'Integral Calculus',
    'Differential Equations',
    'Coordinate Geometry',
    'Three Dimensional Geometry',
    'Vector Algebra',
    'Statistics and Probability',
  ],
};
const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];

let indexTask = null;

const indexState = { started: false, ready: false, index: null, error: '' };
let paperNote = '';

export function jeeCatalog() {
  if (!indexState.started) {
    indexState.started = true;
    indexState.error = '';
    ensureIndex()
      .then((index) => {
        indexState.index = index;
        indexState.ready = true;
      })
      .catch((error) => {
        indexState.error = error instanceof Error ? error.message : 'Could not read the JEE papers.';
        indexState.index = { questions: [] };
        indexState.ready = true;
      });
  }
  if (!indexState.ready) return { ready: false, years: [], note: paperNote || 'Reading the papers…' };
  if (indexState.error) return { ready: true, years: [], error: indexState.error };
  return catalogFrom(indexState.index);
}

export async function makeJeeQuiz({ year, subject, count, topic }) {
  const index = await ensureIndex();
  indexState.index = index;
  indexState.ready = true;
  const chosenTopic = typeof topic === 'string' ? topic.trim() : '';
  if (chosenTopic && chosenTopic !== 'All' && !knownTopic(chosenTopic, subject)) {
    return { status: 400, body: { error: 'Choose a topic from that subject.' } };
  }
  let pool = index.questions.filter((item) => item.year === String(year) && item.subject === subject);
  if (chosenTopic && chosenTopic !== 'All') {
    const savedTopics = topicMemory();
    pool = pool.filter((item) => savedTopics[item.id] === chosenTopic);
  }
  if (!pool.length) {
    return { status: 404, body: { error: 'No questions for that year and subject.' } };
  }
  const size = Math.min(pool.length, Math.max(1, Math.floor(Number(count)) || 10));
  const answers = readAnswers();
  const choiceBank = readJson(CHOICES);
  const ready = shuffle(pool.filter((item) => Number.isInteger(answers[item.id])));
  const fresh = shuffle(pool.filter((item) => !Number.isInteger(answers[item.id])));
  const list = [...ready, ...fresh];
  const questions = [];
  let cursor = 0;
  async function take() {
    while (questions.length < size && cursor < list.length) {
      const item = list[cursor];
      cursor += 1;
      if (!Number.isInteger(answers[item.id]) && geminiStopped) continue;
      let images = null;
      try {
        images = await imagesFor(item);
      } catch {
        images = null;
      }
      if (!images) continue;
      let correct = answers[item.id];
      if (!Number.isInteger(correct)) {
        correct = await solveImages(images);
        if (!Number.isInteger(correct)) continue;
        answers[item.id] = correct;
      }
      if (questions.length >= size) return;
      const savedChoices = await localChoices(images.options, choiceBank[item.id]);
      if (savedChoices) choiceBank[item.id] = savedChoices;
      questions.push({
        id: item.id,
        stem: `data:image/png;base64,${images.stem.toString('base64')}`,
        options: images.options.map((png) => `data:image/png;base64,${png.toString('base64')}`),
        ...(savedChoices ? { choices: savedChoices } : {}),
        correct,
      });
    }
  }
  await Promise.all([take(), take(), take()]);
  writeAnswers(answers);
  writeJson(CHOICES, choiceBank);
  if (!questions.length) {
    const error = geminiStopped
      ? 'New answers are paused because the Gemini credits are used up. Pick a subject that already has prepared questions, or add credits and try again.'
      : 'Could not read a question from those papers.';
    return { status: 502, body: { error } };
  }
  return {
    status: 200,
    body: {
      title: chosenTopic && chosenTopic !== 'All' ? `JEE Main ${year} · ${subject} · ${chosenTopic}` : `JEE Main ${year} · ${subject}`,
      year: String(year),
      subject,
      topic: chosenTopic && chosenTopic !== 'All' ? chosenTopic : 'All',
      count: questions.length,
      questions: questions.slice(0, size),
    },
  };
}

function catalogFrom(index) {
  const years = new Map();
  for (const item of index.questions) {
    if (!years.has(item.year)) years.set(item.year, { Physics: 0, Chemistry: 0, Mathematics: 0 });
    years.get(item.year)[item.subject] += 1;
  }
  return {
    ready: true,
    years: [...years.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, subjects]) => ({ year, subjects })),
  };
}

function ensureIndex() {
  if (!indexTask) indexTask = readOrBuild().catch((error) => {
    indexTask = null;
    throw error;
  });
  return indexTask;
}

async function readOrBuild() {
  fs.mkdirSync(ROOT, { recursive: true });
  for (const name of ['topics.json', 'answers.json', 'choices.json', 'explanations.json']) seedJson(name);
  let papers = listPapers();
  if (!papers.length) {
    await downloadOfficialPapers();
    papers = listPapers();
  }
  if (!papers.length) throw new Error('No JEE Main papers were found.');
  seedJson('index.json');
  try {
    const saved = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    if (saved && saved.version === 2 && saved.count === papers.length && Array.isArray(saved.questions)) {
      bindPaperFiles(saved, papers);
      if (saved.questions.every((item) => item.file && fs.existsSync(item.file))) return saved;
    }
  } catch {
    // Build the index from the saved papers.
  }
  paperNote = 'Reading the papers…';
  const questions = [];
  for (const paper of papers) {
    try {
      const found = await scanPaper(paper);
      questions.push(...found);
    } catch {
      // Skip a paper that the reader cannot open.
    }
  }
  const index = { version: 2, count: papers.length, questions };
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(INDEX, JSON.stringify(index));
  return index;
}

function listPapers() {
  if (!fs.existsSync(ROOT)) return [];
  const papers = [];
  for (const year of fs.readdirSync(ROOT)) {
    if (!/^\d{4}$/.test(year)) continue;
    const yearDir = path.join(ROOT, year);
    for (const folder of fs.readdirSync(yearDir)) {
      if (!folder.startsWith('B-Tech')) continue;
      const dir = path.join(yearDir, folder);
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.pdf')) continue;
        papers.push({
          year,
          folder,
          name,
          file: path.join(dir, name),
          rank: folder === 'B-Tech' || folder === 'B-Tech-English' ? 0 : 1,
        });
      }
    }
  }
  const kept = new Map();
  for (const paper of papers) {
    const key = `${paper.year}/${paper.name}`;
    const previous = kept.get(key);
    if (!previous || paper.rank < previous.rank) kept.set(key, paper);
  }
  return [...kept.values()];
}

const CATALOG = 'https://www.commerceinsights.co.in/jee-main-pyq-data.js?v=1';
const REGIONAL = ['Kannada', 'Hindi', 'Assamese', 'Telugu', 'Bengali', 'Gujarati', 'Odia', 'Punjabi', 'Tamil', 'Marathi', 'Urdu', 'Malayalam'];

function seedJson(name) {
  const dest = path.join(ROOT, name);
  if (fs.existsSync(dest)) return;
  const src = path.join(path.dirname(fileURLToPath(import.meta.url)), 'jee-seed', name);
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dest);
}

function bindPaperFiles(index, papers) {
  const byKey = new Map(papers.map((paper) => [`${paper.year}/${paper.name}`, paper.file]));
  for (const item of index.questions) {
    const file = byKey.get(`${item.year}/${path.basename(item.file)}`);
    if (file) item.file = file;
  }
}

function keepOfficial(name) {
  if (!name.startsWith('B.Tech')) return false;
  if (name.includes('English')) return true;
  return !REGIONAL.some((lang) => name.includes(`(${lang}`));
}

async function downloadOfficialPapers() {
  paperNote = 'Downloading the official JEE Main papers…';
  const response = await fetch(CATALOG, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error('Could not download the JEE Main papers.');
  const text = await response.text();
  const rows = [...text.matchAll(/\{"y":"(\d+)","p":"(.*?)","d":"(.*?)","s":"(.*?)","u":"(.*?)"\}/g)]
    .map((match) => ({ year: match[1], paper: match[2], date: match[3], shift: match[4], url: match[5] }))
    .filter((row) => keepOfficial(row.paper));
  if (!rows.length) throw new Error('Could not download the JEE Main papers.');
  let done = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor];
      cursor += 1;
      const folder = row.paper.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const dest = path.join(ROOT, row.year, folder, `${row.date}-shift-${row.shift}.pdf`);
      try {
        await saveOfficialPdf(row.url.replace(/^https:\/\/nta\.ac\.in\//, 'https://www.nta.ac.in/'), dest);
      } catch {
        // A shift that does not download is left out. The papers that saved still open.
      }
      done += 1;
      paperNote = `Downloading the official JEE Main papers… ${done} of ${rows.length}`;
      if (done % 10 === 0 || done === rows.length) console.log(paperNote);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  paperNote = 'Reading the papers…';
}

async function saveOfficialPdf(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
    const head = Buffer.alloc(5);
    const fd = fs.openSync(dest, 'r');
    try {
      fs.readSync(fd, head, 0, 5, 0);
    } finally {
      fs.closeSync(fd);
    }
    if (head.toString() === '%PDF-') return;
  }
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) return;
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 2000 || bytes.subarray(0, 5).toString() !== '%PDF-') return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
}

async function scanPaper(paper) {
  const data = new Uint8Array(fs.readFileSync(paper.file));
  const doc = await getDocument({ data, disableWorker: true, verbosity: 0 }).promise;
  const questions = [];
  const state = { subject: null, open: null, seen: new Set() };
  let tech = true;
  try {
    const first = await pageLines(await doc.getPage(1));
    const head = first.map((line) => line.text).join(' ');
    if (/Arch|Planning/i.test(head) && !/Tech/i.test(head)) tech = false;
  } catch {
    tech = false;
  }
  if (!tech) {
    await doc.cleanup?.();
    return [];
  }
  for (let number = 1; number <= doc.numPages; number += 1) {
    let page;
    try {
      page = await doc.getPage(number);
    } catch {
      continue;
    }
    let events;
    try {
      events = await pageEvents(page);
    } catch {
      continue;
    }
    for (const event of events) {
      if (event.kind === 'line') {
        const section = event.text.match(/(Mathematics|Physics|Chemistry)\s*-?\s*Section\s+([A-Z])/i);
        if (section && !event.text.includes('Question Number')) {
          state.subject = normalizeSubject(section[1]);
          if (state.open && !state.open.subject) state.open.subject = state.subject;
        } else if (/^(Mathematics|Physics|Chemistry)$/i.test(event.text)) {
          state.subject = normalizeSubject(event.text);
          if (state.open && !state.open.subject) state.open.subject = state.subject;
        }
        const match = event.text.match(/Question Number\s*:\s*(\d+)/i) || event.text.match(/^Q:\s*(\d+)/i);
        if (match) {
          const num = Number(match[1]);
          if (state.open && state.open.number === num) {
            pushOpen(state, questions, paper, number);
            state.open = { number: -1, subject: state.subject, from: number, to: number, stem: null, options: [], want: 'stem' };
            continue;
          }
          pushOpen(state, questions, paper, number);
          state.open = {
            number: num,
            subject: state.subject,
            from: number,
            to: number,
            stem: null,
            options: [],
            want: 'stem',
          };
        } else if (state.open && (/^Options\s*:?\s*$/i.test(event.text) || /^[A-D]$/.test(event.text))) {
          state.open.want = 'option';
        }
        continue;
      }
      if (!state.open || !state.subject || state.open.number === -1) continue;
      const image = event.image;
        if (state.open.want === 'stem') {
        if (!state.open.stem && image.boxWidth >= 80) {
          state.open.stem = image;
          state.open.to = number;
        }
      } else if (state.open.number !== -1 && state.open.options.length < 4 && image.boxWidth < 220) {
        state.open.options.push(image);
        state.open.to = number;
      }
    }
  }
  pushOpen(state, questions, paper, doc.numPages);
  await doc.cleanup?.();
  return questions;
}

function pushOpen(state, questions, paper, page) {
  const open = state.open;
  state.open = null;
  if (!open || !open.subject || !open.stem || open.options.length !== 4) return;
  const key = `${open.subject}:${open.number}`;
  if (state.seen.has(key)) return;
  state.seen.add(key);
  questions.push({
    id: `${paper.year}/${paper.name.replace(/\.pdf$/, '')}/${open.subject}/${open.number}`,
    year: paper.year,
    subject: open.subject,
    file: paper.file,
    from: open.from,
    to: open.to || page,
    number: open.number,
  });
}

async function imagesFor(record, existing) {
  const doc = existing || await getDocument({ data: new Uint8Array(fs.readFileSync(record.file)), disableWorker: true, verbosity: 0 }).promise;
  const state = { subject: record.subject, open: null, seen: new Set() };
  let match = null;
  try {
    for (let number = record.from; number <= record.to; number += 1) {
      const events = await pageEvents(await doc.getPage(number));
      for (const event of events) {
        if (event.kind === 'line') {
          const found = event.text.match(/Question Number\s*:\s*(\d+)/i) || event.text.match(/^Q:\s*(\d+)/i);
          if (found) {
            const num = Number(found[1]);
            if (state.open && state.open.number === num) {
              if (!match && state.open.stem && state.open.options.length === 4) match = snapshot(state.open);
              state.open = { number: -1, stem: null, options: [], want: 'stem' };
              continue;
            }
            if (state.open && state.open.number === record.number && state.open.stem && state.open.options.length === 4) {
              match = snapshot(state.open);
            }
            state.open = {
              number: num,
              stem: null,
              options: [],
              want: 'stem',
            };
          } else if (state.open && (/^Options\s*:?\s*$/i.test(event.text) || /^[A-D]$/.test(event.text))) {
            state.open.want = 'option';
          }
          continue;
        }
        if (!state.open || state.open.number !== record.number) continue;
        const image = event.image;
        if (state.open.want === 'stem') {
          if (!state.open.stem && image.boxWidth >= 80) state.open.stem = image;
        } else if (state.open.number !== -1 && state.open.options.length < 4 && image.boxWidth < 220) {
          state.open.options.push(image);
        }
      }
    }
    if (!match && state.open && state.open.number === record.number && state.open.stem && state.open.options.length === 4) {
      match = snapshot(state.open);
    }
  } finally {
    if (!existing) await doc.cleanup?.();
  }
  return match;
}

function snapshot(open) {
  return {
    stem: toPng(open.stem, 900, 0),
    options: open.options.map((image) => toPng(image, 960, 120)),
  };
}

async function pageEvents(page) {
  const lines = await pageLines(page);
  const images = await pageImages(page);
  return [
    ...lines.map((line) => ({ kind: 'line', y: line.y, text: line.text })),
    ...images.map((image) => ({ kind: 'image', y: image.y, image })),
  ].sort((a, b) => b.y - a.y);
}

async function pageLines(page) {
  const content = await page.getTextContent();
  const items = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    items.push({ y: item.transform[5], x: item.transform[4], text: item.str.trim() });
  }
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) < 2) last.text += ` ${item.text}`;
    else lines.push({ y: item.y, text: item.text });
  }
  return lines;
}

async function pageImages(page) {
  const ops = await page.getOperatorList();
  const stack = [[1, 0, 0, 1, 0, 0]];
  let ctm = [1, 0, 0, 1, 0, 0];
  const images = [];
  for (let index = 0; index < ops.fnArray.length; index += 1) {
    const fn = ops.fnArray[index];
    const args = ops.argsArray[index];
    if (fn === OPS.save) stack.push(ctm.slice());
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = multiply(ctm, args);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      try {
        const img = fn === OPS.paintInlineImageXObject ? args[0] : await page.objs.get(args[0]);
        if (!img?.data || !img.width || !img.height) continue;
        images.push({
          y: ctm[5],
          boxWidth: Math.hypot(ctm[0], ctm[1]),
          boxHeight: Math.hypot(ctm[2], ctm[3]),
          width: img.width,
          height: img.height,
          kind: img.kind,
          data: Buffer.from(img.data),
        });
      } catch {
        // A broken image is skipped.
      }
    }
  }
  return images;
}

function multiply(m, a) {
  return [
    m[0] * a[0] + m[2] * a[1],
    m[1] * a[0] + m[3] * a[1],
    m[0] * a[2] + m[2] * a[3],
    m[1] * a[2] + m[3] * a[3],
    m[0] * a[4] + m[2] * a[5] + m[4],
    m[1] * a[4] + m[3] * a[5] + m[5],
  ];
}

function toPng(image, maxWidth, minHeight) {
  const { width, height } = image;
  const rgb = toRgb(image);
  let scale = 1;
  if (minHeight > height && height > 0) scale = Math.max(2, Math.round(minHeight / height));
  if (width * scale > maxWidth) scale = Math.max(1, Math.floor(maxWidth / width));
  if (scale <= 1) return encodePng(width, height, rgb);
  const nextW = width * scale;
  const nextH = height * scale;
  const out = Buffer.alloc(nextW * nextH * 3);
  for (let y = 0; y < nextH; y += 1) {
    const sourceY = Math.floor(y / scale);
    for (let x = 0; x < nextW; x += 1) {
      const sourceX = Math.floor(x / scale);
      const from = (sourceY * width + sourceX) * 3;
      const to = (y * nextW + x) * 3;
      out[to] = rgb[from];
      out[to + 1] = rgb[from + 1];
      out[to + 2] = rgb[from + 2];
    }
  }
  return encodePng(nextW, nextH, out);
}

function toRgb(image) {
  const { width, height, data, kind } = image;
  if (kind === 2) return data;
  const rgb = Buffer.alloc(width * height * 3);
  if (kind === 3) {
    for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    return rgb;
  }
  rgb.fill(255);
  return rgb;
}

function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 3 + 1);
    raw[start] = 0;
    rgb.copy(raw, start + 1, y * width * 3, (y + 1) * width * 3);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function normalizeSubject(value) {
  const name = value.toLowerCase();
  if (name.startsWith('phys')) return 'Physics';
  if (name.startsWith('chem')) return 'Chemistry';
  return 'Mathematics';
}

function topicMemory() {
  return readJson(TOPICS);
}

function knownTopic(name, subject) {
  return name === 'Other' || (SYLLABUS[subject] || []).includes(name);
}

export function jeeTopics({ year, subject }) {
  if (!/^\d{4}$/.test(String(year)) || !SYLLABUS[subject]) {
    return Promise.resolve({ status: 400, body: { error: 'Choose a year and a subject.' } });
  }
  return topicSnapshot(String(year), subject).then((body) => ({ status: 200, body }));
}

let savingTopics = null;

export function ensureTopicsSaved() {
  if (!savingTopics) {
    savingTopics = saveAllTopics().catch(() => {
      savingTopics = null;
    });
  }
  return savingTopics;
}

export async function saveAllTopics() {
  const index = await ensureIndex();
  const saved = readJson(TOPICS);
  let topicFlush = Promise.resolve();
  function storeTopic(id, topic) {
    saved[id] = topic;
    topicFlush = topicFlush.then(() => writeJson(TOPICS, saved));
    return topicFlush;
  }
  const missing = () => index.questions.filter((item) => !knownTopic(saved[item.id], item.subject));
  let pending = missing();
  let stalled = 0;
  while (pending.length && stalled < 2 && !geminiStopped) {
    const before = pending.length;
    const byFile = new Map();
    for (const item of pending) {
      if (!byFile.has(item.file)) byFile.set(item.file, []);
      byFile.get(item.file).push(item);
    }
    for (const [file, records] of byFile) {
      let doc = null;
      try {
        doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), disableWorker: true, verbosity: 0 }).promise;
      } catch {
        for (const record of records) await storeTopic(record.id, 'Other');
        console.log(`topics ${Object.keys(saved).length}/${index.questions.length}`);
        continue;
      }
      const prepared = [];
      try {
        for (const record of records) {
          try {
            const images = await imagesFor(record, doc);
            prepared.push({ record, stem: images?.stem || null });
          } catch {
            await storeTopic(record.id, 'Other');
          }
        }
      } finally {
        try { await doc.cleanup?.(); } catch { /* A damaged paper is already recorded. */ }
      }
      const batches = [];
      const current = new Map();
      function pushBatch(subject, batch) {
        if (batch.length) batches.push({ subject, batch: batch.slice() });
      }
      for (const item of prepared) {
        if (!item.stem) {
          await storeTopic(item.record.id, 'Other');
          continue;
        }
        const bucket = current.get(item.record.subject) || [];
        bucket.push(item);
        current.set(item.record.subject, bucket);
        if (bucket.length === 4) {
          pushBatch(item.record.subject, bucket);
          current.set(item.record.subject, []);
        }
      }
      for (const [subject, bucket] of current) pushBatch(subject, bucket);
      let cursor = 0;
      async function worker() {
        while (cursor < batches.length) {
          const next = batches[cursor];
          cursor += 1;
          const topics = await askTopics(next.batch.map((item) => item.stem), next.subject);
          if (!topics) continue;
          for (let index = 0; index < next.batch.length; index += 1) await storeTopic(next.batch[index].record.id, topics[index]);
        }
      }
      await Promise.all([worker(), worker()]);
      await topicFlush;
      console.log(`topics ${Object.keys(saved).length}/${index.questions.length}`);
      if (geminiStopped) break;
    }
    pending = missing();
    stalled = pending.length === before ? stalled + 1 : 0;
  }
  await topicFlush;
  console.log(`topics saved ${Object.keys(saved).length}/${index.questions.length}`);
}

async function topicSnapshot(year, subject) {
  const index = await ensureIndex();
  const items = index.questions.filter((item) => item.year === year && item.subject === subject);
  const saved = topicMemory();
  const counts = new Map();
  let done = 0;
  for (const item of items) {
    const topic = saved[item.id];
    if (!knownTopic(topic, subject)) continue;
    done += 1;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return {
    ready: items.length > 0 && done === items.length,
    total: items.length,
    done,
    topics: [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count })),
  };
}

async function askTopics(stems, subject) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const list = [...SYLLABUS[subject], 'Other'].map((name) => `- ${name}`).join('\n');
  const parts = stems.map((png) => ({
    inline_data: { mime_type: 'image/png', data: png.toString('base64') },
  }));
  parts.push({
    text: `Each image is one JEE Main ${subject} question, in order. Choose exactly one topic for each image from this list:\n${list}\nReturn JSON {"topics":["..."]} with ${stems.length} topics in the same order. Copy the topic name exactly.`,
  });
  const text = await geminiText(apiKey, parts);
  if (!text) return null;
  const parsed = parseGeminiJson(text);
  const topics = parsed?.topics;
  if (!Array.isArray(topics) || topics.length !== stems.length) return null;
  return topics.map((item) => canonicalTopic(item, subject));
}

function canonicalTopic(value, subject) {
  const text = String(value || '').trim().toLowerCase();
  const match = SYLLABUS[subject].find((name) => name.toLowerCase() === text);
  if (match) return match;
  const loose = SYLLABUS[subject].find((name) => text.includes(name.toLowerCase()));
  return loose || 'Other';
}

export async function explainJeeQuestion(id) {
  if (!/^\d{4}\/[^/]+\/(Physics|Chemistry|Mathematics)\/\d+$/.test(id)) {
    return { status: 400, body: { error: 'That question was not found.' } };
  }
  const index = await ensureIndex();
  const record = index.questions.find((item) => item.id === id);
  if (!record) return { status: 404, body: { error: 'That question was not found.' } };

  const saved = readJson(EXPLANATIONS);
  if (typeof saved[id] === 'string' && saved[id].trim()) {
    return { status: 200, body: { explanation: formatLines(saved[id]) } };
  }

  const images = await imagesFor(record);
  if (!images) return { status: 502, body: { error: 'Could not read that question.' } };
  const answers = readAnswers();
  let correct = answers[id];
  if (!Number.isInteger(correct)) {
    correct = await solveImages(images);
    if (!Number.isInteger(correct)) return { status: 502, body: { error: 'Could not explain that question.' } };
    answers[id] = correct;
    writeAnswers(answers);
  }
  const explanation = await explainImages(images, correct);
  if (!explanation) return { status: 502, body: { error: 'Could not explain that question.' } };
  const formatted = formatLines(explanation);
  saved[id] = formatted;
  writeJson(EXPLANATIONS, saved);
  return { status: 200, body: { explanation: formatted } };
}

const choiceJobs = new Map();

export function jeeChoices(id) {
  if (choiceJobs.has(id)) return choiceJobs.get(id);
  const job = loadChoices(id).finally(() => choiceJobs.delete(id));
  choiceJobs.set(id, job);
  return job;
}

async function loadChoices(id) {
  if (!/^\d{4}\/[^/]+\/(Physics|Chemistry|Mathematics)\/\d+$/.test(id)) {
    return { status: 400, body: { error: 'That question was not found.' } };
  }
  const saved = readJson(CHOICES);
  if (isChoiceList(saved[id])) return { status: 200, body: { choices: saved[id] } };
  const index = await ensureIndex();
  const record = index.questions.find((item) => item.id === id);
  if (!record) return { status: 404, body: { error: 'That question was not found.' } };
  const images = await imagesFor(record);
  if (!images) return { status: 502, body: { error: 'Could not read that question.' } };
  const choices = await transcribeChoices(images);
  if (!choices) return { status: 502, body: { error: 'Could not read those options.' } };
  saved[id] = choices;
  writeJson(CHOICES, saved);
  return { status: 200, body: { choices } };
}

function isChoiceList(value) {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'string' && item.trim());
}

function formatLines(text) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.includes('\n')) return normalized;
  let out = '';
  let math = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '$') math = !math;
    out += char;
    if (!math && char === '.' && normalized[index + 1] === ' ') {
      out += '\n';
      index += 1;
    }
  }
  return out;
}

async function explainImages(images, correct) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const letter = ['A', 'B', 'C', 'D'][correct];
  const parts = [images.stem, ...images.options].map((png) => ({
    inline_data: { mime_type: 'image/png', data: png.toString('base64') },
  }));
  parts.push({
    text: `The first image is one JEE Main question. The next four images are options A, B, C and D, in that order. The correct option is ${letter}. Explain why a student got there. Write every formula between dollar signs, for example $S = \\frac{1}{2}at^2$. Put each step on its own line, separated by a newline. Name option ${letter} as the answer. Stay under 120 words. Return JSON {"explanation":"..."}.`,
  });
  const text = await geminiText(apiKey, parts);
  if (!text) return null;
  const parsed = parseGeminiJson(text);
  const explanation = typeof parsed?.explanation === 'string' ? parsed.explanation.trim() : '';
  return explanation ? explanation.slice(0, 2000) : null;
}

async function transcribeChoices(images) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const parts = [images.stem, ...images.options].map((png) => ({
    inline_data: { mime_type: 'image/png', data: png.toString('base64') },
  }));
  parts.push({
    text: 'The first image is one JEE Main question. The next four images are options A, B, C and D, in that order. Transcribe each option. Write every formula between dollar signs, for example $S = \\frac{1}{2}at^2$. Leave ordinary words as words. If an option is a diagram that cannot be written as math or words, use FIGURE. Return JSON {"options":["...","...","...","..."]}.',
  });
  const text = await geminiText(apiKey, parts);
  if (!text) return null;
  const parsed = parseGeminiJson(text);
  const options = parsed?.options;
  if (!Array.isArray(options) || options.length !== 4) return null;
  const choices = options.map((item) => {
    if (typeof item !== 'string') return '';
    const value = item.trim();
    if (!value || value.length > 600) return '';
    if (/^(figure|diagram|graph|image)$/i.test(value)) return 'FIGURE';
    return value;
  });
  return choices.every(Boolean) ? choices : null;
}

async function solveImages(images) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const parts = [images.stem, ...images.options].map((png) => ({
    inline_data: { mime_type: 'image/png', data: png.toString('base64') },
  }));
  parts.push({
    text: 'The first image is one JEE Main question. The next four images are options A, B, C and D, in that order. Solve it and return JSON {"correct":0} where 0 is A, 1 is B, 2 is C and 3 is D.',
  });
  const text = await geminiText(apiKey, parts);
  if (!text) return null;
  const parsed = parseGeminiJson(text);
  const correct = Number(parsed?.correct);
  return correct >= 0 && correct <= 3 ? correct : null;
}

let geminiStopped = '';

async function geminiText(apiKey, parts) {
  if (geminiStopped) return null;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof data.error?.message === 'string' ? data.error.message.slice(0, 160) : '';
      if ((response.status === 402 || response.status === 429) && !geminiStopped) {
        geminiStopped = message || String(response.status);
        console.log(`gemini ${response.status} ${message}`);
      }
      return null;
    }
    return (data.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? '')
      .join('');
  } catch {
    return null;
  }
}

const TOPIC_RULES = {
  Physics: [
    ['Units and Measurement', /dimension|vernier|screw gauge|significant figure|least count|error in the measurement/i],
    ['Kinematics', /projectile|displacement|velocity|acceleration|uniformly accelerated/i],
    ['Rotational Motion', /torque|moment of inertia|angular momentum|rolling|rotational/i],
    ['Gravitation', /gravitat|kepler|escape velocity|orbital velocity|satellite/i],
    ['Properties of Matter', /viscosity|surface tension|young|stress|strain|elastici|capillar|bernoulli|fluid|terminal velocity/i],
    ['Thermodynamics', /carnot|adiabatic|isothermal|entropy|heat engine|ideal gas|real gas|thermodynamic/i],
    ['Oscillations and Waves', /oscillat|simple harmonic|wave|doppler|beats|resonance|frequency of/i],
    ['Electrostatics', /coulomb|electric field|capacitor|electrostatic|gauss/i],
    ['Current Electricity', /kirchhoff|wheatstone|potentiometer|drift velocity|resistivity|ohm/i],
    ['Electromagnetic Induction', /faraday|induced emf|inductance|transformer|impedance|alternating current|lcr/i],
    ['Magnetism', /magnetic field|biot|solenoid|cyclotron|galvanometer|ampere/i],
    ['Optics', /lens|mirror|refraction|diffraction|interference|prism|focal|polaroid|telescope|microscope/i],
    ['Modern Physics', /photoelectric|de broglie|bohr|nucleus|nuclear|half[- ]life|radioactiv|photon|x-ray|work function/i],
    ['Electronic Devices', /diode|transistor|semiconductor|zener|rectifier|logic gate|p-n junction/i],
    ['Laws of Motion', /friction|newton|tension|impulse|free body|momentum|force/i],
    ['Work, Energy and Power', /kinetic energy|potential energy|work done|power|collision/i],
  ],
  Chemistry: [
    ['Coordination Compounds', /ligand|coordination|crystal field|werner|chelate/i],
    ['Biomolecules', /glucose|protein|amino acid|carbohydrate|peptide|dna|rna|enzyme/i],
    ['Hydrocarbons', /alkene|alkane|alkyne|benzene|aromatic/i],
    ['Chemical Kinetics', /rate constant|order of the reaction|activation energy|half[- ]life of the reaction|arrhenius/i],
    ['Redox and Electrochemistry', /electrochemical|nernst|electrode|electrolysis|cell potential|faraday/i],
    ['Equilibrium', /equilibrium constant|le chatelier|buffer|solubility product|pH|ka |kb /i],
    ['Thermodynamics', /enthalpy|gibbs|hess|entropy|adiabatic|internal energy/i],
    ['Solutions', /henry|raoult|colligative|molality|mole fraction|van't hoff|in water|solubility/i],
    ['Chemical Bonding', /hybridisation|vsepr|bond order|dipole moment|molecular orbital|ionic bond|covalent/i],
    ['Atomic Structure', /quantum number|orbital|aufbau|bohr|wavelength of the electron|photoelectric/i],
    ['p-Block Elements', /xenon|borax|silane|interhalogen|noble gas|phosphorus|sulphur|chlorine/i],
    ['d- and f-Block Elements', /lanthanoid|actinoid|transition metal|permanganate|dichromate|potassium dichromate/i],
    ['States of Matter', /van der waal|ideal gas|compressibility|boyle|charles/i],
    ['Organic Chemistry', /reagent|isomer|iupac|functional group|sn1|sn2|grignard|aldehyde|ketone|amine|ester/i],
    ['Some Basic Concepts of Chemistry', /molar mass|stoichiometr|mole|limiting reagent|number of moles|reacts with/i],
  ],
  Mathematics: [
    ['Differential Equations', /differential equation/i],
    ['Inverse Trigonometric Functions', /inverse trigonometric|sin\^\{-1\}|arcsin|arctan/i],
    ['Complex Numbers and Quadratic Equations', /complex number|argand|quadratic equation|\biota\b/i],
    ['Matrices and Determinants', /matrix|matrices|determinant|adjoint|eigen/i],
    ['Permutations and Combinations', /permutation|combination/i],
    ['Binomial Theorem', /binomial/i],
    ['Sequences and Series', /arithmetic progression|geometric progression|sequence|series/i],
    ['Trigonometry', /trigonometric|\bsin\b|\bcos\b|\btan\b|triangle/i],
    ['Limits, Continuity and Differentiability', /limit|continuity|derivative|differentiab/i],
    ['Integral Calculus', /integral|integration|area bounded|area under/i],
    ['Coordinate Geometry', /parabola|ellipse|hyperbola|circle|straight line|focal chord|conic/i],
    ['Three Dimensional Geometry', /direction cosine|skew line|tetrahedron|plane in space|shortest distance/i],
    ['Vector Algebra', /vector|scalar triple|dot product|cross product/i],
    ['Statistics and Probability', /probability|variance|standard deviation|bayes|random variable|mean of/i],
    ['Sets, Relations and Functions', /relation|equivalence|function f|domain|range of/i],
  ],
};

function localTopic(subject, text) {
  for (const [name, pattern] of TOPIC_RULES[subject] || []) {
    if (pattern.test(text)) return name;
  }
  return 'Other';
}

function readableChoice(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 80) return 'FIGURE';
  if (!/[A-Za-z0-9]/.test(clean)) return 'FIGURE';
  return clean.slice(0, 80);
}

async function localChoices(options, saved) {
  if (isChoiceList(saved)) return saved;
  const choices = [];
  for (const png of options) choices.push(readableChoice(await ocrImage(png, '7')));
  return isChoiceList(choices) ? choices : null;
}

export async function saveLocalTopics() {
  const index = await ensureIndex();
  const saved = readJson(TOPICS);
  const pending = index.questions.filter((item) => !knownTopic(saved[item.id], item.subject));
  const byFile = new Map();
  for (const item of pending) {
    if (!byFile.has(item.file)) byFile.set(item.file, []);
    byFile.get(item.file).push(item);
  }
  for (const [file, records] of byFile) {
    let doc = null;
    try {
      doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), disableWorker: true, verbosity: 0 }).promise;
    } catch {
      for (const record of records) saved[record.id] = 'Other';
      writeJson(TOPICS, saved);
      console.log(`topics ${Object.keys(saved).length}/${index.questions.length}`);
      continue;
    }
    const stems = [];
    try {
      for (const record of records) {
        try {
          const images = await imagesFor(record, doc);
          stems.push({ record, png: images?.stem || null });
        } catch {
          saved[record.id] = 'Other';
        }
      }
    } finally {
      try { await doc.cleanup?.(); } catch { /* A damaged paper is skipped. */ }
    }
    let cursor = 0;
    async function worker() {
      while (cursor < stems.length) {
        const item = stems[cursor];
        cursor += 1;
        if (!item.png) {
          saved[item.record.id] = 'Other';
          continue;
        }
        const text = await ocrImage(item.png, '6');
        saved[item.record.id] = localTopic(item.record.subject, text);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    writeJson(TOPICS, saved);
    console.log(`topics ${Object.keys(saved).length}/${index.questions.length}`);
  }
  console.log(`topics saved ${Object.keys(saved).length}/${index.questions.length}`);
}

function ocrImage(png, mode) {
  return new Promise((resolve) => {
    const child = spawn('tesseract', ['stdin', 'stdout', '-l', 'eng', '--psm', mode], { stdio: ['pipe', 'pipe', 'ignore'] });
    const out = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.on('error', () => resolve(''));
    child.on('close', () => resolve(Buffer.concat(out).toString('utf8').replace(/\s+/g, ' ').trim()));
    child.stdin.on('error', () => {});
    child.stdin.write(png);
    child.stdin.end();
  });
}

function parseGeminiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function readJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeJson(file, value) {
  fs.mkdirSync(ROOT, { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value));
  fs.renameSync(temporary, file);
}

function readAnswers() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ANSWERS, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAnswers(answers) {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(ANSWERS, JSON.stringify(answers));
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export const JEE_SUBJECTS = SUBJECTS;
