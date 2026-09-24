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
} from '@phosphor-icons/react';
import type { Quiz } from '../data/quizzes';
import { Dialog } from '../components/Dialog';
import { LevelBars } from '../components/LevelBars';
import { customQuizRemove, getAllQuizzes } from '../lib/storage';

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
        <div>
          <h1>Let’s study</h1>
          <p>Train your knowledge</p>
        </div>
        <button className="icon-button" type="button" aria-label="Open history" onClick={() => navigate('/history')}>
          <Trophy size={28} />
        </button>
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
      </div>

      <section className="card-grid">
        {visibleQuizzes.map((quiz, index) => (
          <QuizCard
            key={quiz.id}
            quiz={quiz}
            index={index}
            onOpen={() => navigate(`/quiz/${quiz.id}`)}
            onDelete={quiz.id.startsWith('custom-') ? () => setPendingDelete(quiz) : undefined}
          />
        ))}
      </section>

      {pendingDelete && (
        <Dialog
          title="Delete quiz"
          message={`Delete “${pendingDelete.title}”? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            customQuizRemove(pendingDelete.id);
            setQuizzes(getAllQuizzes());
            setPendingDelete(null);
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

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};
