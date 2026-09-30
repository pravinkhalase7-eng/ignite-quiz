import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CloudArrowUp,
  FileArrowUp,
  CodeSimple,
  DeviceMobile,
  GitFork,
  PaintBucket,
  ToggleLeft,
  Plus,
  Trash,
  Trophy,
  BookOpen,
} from '@phosphor-icons/react';
import type { Quiz } from '../data/quizzes';
import { Dialog } from '../components/Dialog';
import { LevelBars } from '../components/LevelBars';
import { customQuizRemove, getAllQuizzes, refreshCustomQuizzes } from '../lib/storage';

const ICONS = {
  toggle: ToggleLeft,
  code: CodeSimple,
  git: GitFork,
  paint: PaintBucket,
  cloud: CloudArrowUp,
  device: DeviceMobile,
  file: FileArrowUp,
};

const FILTERS = [
  { level: 1, label: 'Easy', className: 'easy' },
  { level: 2, label: 'Medium', className: 'medium' },
  { level: 3, label: 'Hard', className: 'hard' },
] as const;

export function HomePage() {
  const navigate = useNavigate();
  const [levels, setLevels] = useState<number[]>([1, 2, 3]);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [quizzes, setQuizzes] = useState(() => getAllQuizzes());
  const [pendingDelete, setPendingDelete] = useState<Quiz | null>(null);
  const [pendingStart, setPendingStart] = useState<Quiz | null>(null);
  const [questionCount, setQuestionCount] = useState('');
  const [rangeStart, setRangeStart] = useState(0);
  const [randomOrder, setRandomOrder] = useState(false);

  useEffect(() => {
    refreshCustomQuizzes().then(() => setQuizzes(getAllQuizzes()));
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const visibleQuizzes = quizzes.filter((quiz) => levels.includes(quiz.level));

  function toggleLevel(level: number) {
    setLevels((current) => {
      if (current.includes(level)) {
        return current.length === 1 ? current : current.filter((item) => item !== level);
      }
      return [...current, level];
    });
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
  }

  return (
    <main className="screen">
      <header className="header">
        <div className="header-copy">
          <h1>Let’s study</h1>
          <p>Train your knowledge</p>
        </div>
        <div className="header-end">
          <button className="icon-button" type="button" aria-label="Open history" onClick={() => navigate('/history')}>
            <Trophy size={28} />
          </button>
        </div>
      </header>

      {installEvent && (
        <button className="install" type="button" onClick={install}>
          Install Ignite Quiz
        </button>
      )}

      <div className="levels">
        {FILTERS.map((filter) => (
          <button
            key={filter.level}
            type="button"
            className={`level-chip ${filter.className} ${levels.includes(filter.level) ? 'on' : ''}`}
            onClick={() => toggleLevel(filter.level)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="upload-row">
        <button className="btn" type="button" onClick={() => navigate('/upload')}>
          <Plus size={20} weight="bold" /> Upload quiz
        </button>
        <button className="btn-outline" type="button" onClick={() => navigate('/story')}>
          <BookOpen size={20} weight="bold" /> Story quiz
        </button>
      </div>

      <section className="card-grid">
        {visibleQuizzes.length === 0 && <p className="empty">No quizzes yet. Upload one to start.</p>}
        {visibleQuizzes.map((quiz, index) => (
          <QuizCard
            key={quiz.id}
            quiz={quiz}
            index={index}
            onOpen={() => {
              setPendingStart(quiz);
              setQuestionCount(String(quiz.questions.length));
              setRangeStart(0);
              setRandomOrder(false);
            }}
            onDelete={quiz.id.startsWith('custom-') ? () => setPendingDelete(quiz) : undefined}
          />
        ))}
      </section>

      {pendingStart && (
        <StartQuiz
          quiz={pendingStart}
          questionCount={questionCount}
          rangeStart={rangeStart}
          randomOrder={randomOrder}
          onCount={(value) => {
            setQuestionCount(value);
            setRangeStart(0);
          }}
          onRange={setRangeStart}
          onRandom={setRandomOrder}
          onCancel={() => setPendingStart(null)}
          onStart={() => {
            const total = pendingStart.questions.length;
            const count = Math.min(total, Math.max(1, Math.floor(Number(questionCount)) || total));
            const start = Math.min(Math.max(0, rangeStart), Math.max(0, total - 1));
            const params = new URLSearchParams({ count: String(count), start: String(start) });
            if (randomOrder) params.set('random', '1');
            setPendingStart(null);
            navigate(`/quiz/${pendingStart.id}?${params}`);
          }}
        />
      )}

      {pendingDelete && (
        <Dialog
          title="Delete quiz"
          message={`Delete “${pendingDelete.title}”? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            customQuizRemove(id).then(() => setQuizzes(getAllQuizzes()));
          }}
        />
      )}
    </main>
  );
}

function QuizCard({
  quiz,
  index,
  onOpen,
  onDelete,
}: {
  quiz: Quiz;
  index: number;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const Icon = ICONS[quiz.icon];
  return (
    <article className="quiz-card" style={{ animationDelay: `${index * 80}ms` }}>
      <header>
        <span className="quiz-icon">
          <Icon size={24} />
        </span>
        <LevelBars level={quiz.level} />
      </header>
      <button className="quiz-open" type="button" onClick={onOpen}>
        <h2>{quiz.title}</h2>
        {quiz.category && <p className="quiz-category">{quiz.category}</p>}
      </button>
      {onDelete && (
        <button className="quiz-delete" type="button" aria-label={`Delete ${quiz.title}`} onClick={onDelete}>
          <Trash size={16} />
        </button>
      )}
    </article>
  );
}

function questionRanges(total: number, count: number) {
  const size = Math.min(total, Math.max(1, count));
  const slots: { start: number; end: number }[] = [];
  for (let start = 0; start < total; start += size) {
    slots.push({ start, end: Math.min(start + size, total) });
  }
  return slots;
}

function StartQuiz({
  quiz,
  questionCount,
  rangeStart,
  randomOrder,
  onCount,
  onRange,
  onRandom,
  onCancel,
  onStart,
}: {
  quiz: Quiz;
  questionCount: string;
  rangeStart: number;
  randomOrder: boolean;
  onCount: (value: string) => void;
  onRange: (value: number) => void;
  onRandom: (value: boolean) => void;
  onCancel: () => void;
  onStart: () => void;
}) {
  const total = quiz.questions.length;
  const presets = [10, 20, 50, 100].filter((count) => count < total);
  const count = Math.min(total, Math.max(1, Math.floor(Number(questionCount)) || total));
  const ranges = questionRanges(total, count);

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="start-title">
        <h2 id="start-title">{quiz.category || quiz.title}</h2>
        <p>{total} questions available</p>
        <div className="start-form">
          <label>
            How many questions?
            <input
              type="number"
              min={1}
              max={total}
              value={questionCount}
              onChange={(event) => onCount(event.target.value)}
            />
          </label>
          {presets.length > 0 && (
            <div className="start-counts">
              {presets.map((count) => (
                <button key={count} type="button" className={questionCount === String(count) ? 'on' : ''} onClick={() => onCount(String(count))}>
                  {count}
                </button>
              ))}
              <button type="button" className={questionCount === String(total) ? 'on' : ''} onClick={() => onCount(String(total))}>
                All
              </button>
            </div>
          )}
          {ranges.length > 1 && (
            <div className="start-ranges">
              <span>Which range?</span>
              <div className="start-counts">
                {ranges.map((range) => (
                  <button
                    key={range.start}
                    type="button"
                    className={rangeStart === range.start ? 'on' : ''}
                    onClick={() => onRange(range.start)}
                  >
                    {range.start}-{range.end}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="random-row">
            <input type="checkbox" checked={randomOrder} onChange={(event) => onRandom(event.target.checked)} />
            Random questions
          </label>
        </div>
        <div className="footer">
          <button className="btn-outline" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn" type="button" onClick={onStart}>
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};
