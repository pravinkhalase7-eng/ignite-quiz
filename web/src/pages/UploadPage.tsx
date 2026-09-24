import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileArrowUp } from '@phosphor-icons/react';
import type { Question, Quiz } from '../data/quizzes';
import { parseQuizText } from '../lib/parseQuiz';
import { llmSettings, parseQuizWithLlm, saveLlmSettings, type LlmProvider } from '../lib/parseWithLlm';
import { readDocument } from '../lib/readDocument';
import { customQuizAdd } from '../lib/storage';

const CATEGORIES = [
  { level: 1, label: 'Easy' },
  { level: 2, label: 'Medium' },
  { level: 3, label: 'Hard' },
] as const;

export function UploadPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [level, setLevel] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = llmSettings();
  const [apiKey, setApiKey] = useState(saved.key);
  const [provider, setProvider] = useState<LlmProvider>(saved.provider);

  async function scan(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setQuestions(null);

    if (!name.trim()) {
      setError('Enter a quiz name.');
      return;
    }
    if (!category.trim()) {
      setError('Enter a category.');
      return;
    }
    if (!file) {
      setError('Choose a PDF or Word document.');
      return;
    }

    setBusy(true);
    try {
      const text = await readDocument(file);
      saveLlmSettings(apiKey, provider);
      const parsed = apiKey.trim()
        ? await parseQuizWithLlm(text, provider, apiKey.trim())
        : parseQuizText(text);
      setQuestions(parsed);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Could not read that document.');
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!questions) return;
    const quiz: Quiz = {
      id: `custom-${Date.now()}`,
      title: name.trim(),
      category: category.trim(),
      level,
      icon: 'file',
      questions,
    };
    customQuizAdd(quiz);
    const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${quiz.title.replace(/\s+/g, '-').toLowerCase()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    navigate('/');
  }

  return (
    <main className="screen upload">
      <header className="header">
        <div>
          <h1>Upload quiz</h1>
          <p>PDF or Word, then start it from home</p>
        </div>
        <button className="icon-button" type="button" aria-label="Back to home" onClick={() => navigate('/')}>
          <ArrowLeft size={28} />
        </button>
      </header>

      <form className="upload-form" onSubmit={scan}>
        <label>
          Quiz name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="React basics" />
        </label>
        <label>
          Category
          <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="General" />
        </label>
        <fieldset>
          <legend>Difficulty</legend>
          <div className="levels">
            {CATEGORIES.map((item) => (
              <button
                key={item.level}
                type="button"
                className={`level-chip ${item.level === 1 ? 'easy' : item.level === 2 ? 'medium' : 'hard'} ${level === item.level ? 'on' : ''}`}
                onClick={() => setLevel(item.level)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Model
          <select value={provider} onChange={(event) => setProvider(event.target.value as LlmProvider)}>
            <option value="gemini">Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label>
          API key
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
            placeholder="Optional. Used to read messy papers"
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>
        <p className="hint">
          Leave the key empty to read numbered questions and an answer table in the browser. Add a Gemini or OpenAI key when the layout is messy.
        </p>
        <label className="file-field">
          <FileArrowUp size={22} />
          <span>{file ? file.name : 'Choose a PDF or .docx file'}</span>
          <input
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setQuestions(null);
            }}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Reading document…' : 'Scan questions'}
        </button>
      </form>

      {questions && (
        <section className="review-list" aria-label="Parsed questions">
          <p className="review-index">{questions.length} questions found</p>
          {questions.map((question, index) => (
            <article key={`${question.title}-${index}`} className="review-card">
              <p className="review-index">Question {index + 1}</p>
              <h2>{question.title}</h2>
              <ul className="parsed-options">
                {question.alternatives.map((alternative, optionIndex) => (
                  <li key={alternative} className={optionIndex === question.correct ? 'correct' : ''}>
                    {alternative}
                  </li>
                ))}
              </ul>
            </article>
          ))}
          <button className="btn" type="button" onClick={save}>
            Add to home
          </button>
        </section>
      )}
    </main>
  );
}
