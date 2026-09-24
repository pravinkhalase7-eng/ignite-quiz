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
  Trophy,
} from '@phosphor-icons/react';
import type { Quiz } from '../data/quizzes';
import { LevelBars } from '../components/LevelBars';
import { getAllQuizzes } from '../lib/storage';

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

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const quizzes = getAllQuizzes().filter((quiz) => levels.includes(quiz.level));

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
        {quizzes.map((quiz, index) => (
          <QuizCard key={quiz.id} quiz={quiz} index={index} onOpen={() => navigate(`/quiz/${quiz.id}`)} />
        ))}
      </section>
    </main>
  );
}

function QuizCard({ quiz, index, onOpen }: { quiz: Quiz; index: number; onOpen: () => void }) {
  const Icon = ICONS[quiz.icon];
  return (
    <button className="quiz-card" type="button" style={{ animationDelay: `${index * 80}ms` }} onClick={onOpen}>
      <header>
        <span className="quiz-icon">
          <Icon size={24} />
        </span>
        <LevelBars level={quiz.level} />
      </header>
      <h2>{quiz.title}</h2>
      {quiz.category && <p className="quiz-category">{quiz.category}</p>}
    </button>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};
