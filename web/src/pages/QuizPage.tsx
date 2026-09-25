import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Question } from '../data/quizzes';
import { ArrowLeft, Check } from '@phosphor-icons/react';
import { getQuizById, refreshCustomQuizzes } from '../lib/storage';
import { historyAdd } from '../lib/storage';
import { playAnswerSound, vibrateError } from '../lib/sound';
import { Dialog } from '../components/Dialog';

type DialogState = null | 'skip' | 'stop';

function pickQuestions(questions: Question[], count: number, random: boolean) {
  const total = Math.min(questions.length, Math.max(1, Math.floor(count)));
  const source = random ? shuffle(questions) : questions;
  return source.slice(0, total);
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [next[index], next[swap]] = [next[swap], next[index]];
  }
  return next;
}

export function QuizPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState(() => (id ? getQuizById(id) : undefined));
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null);
  const [shake, setShake] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [locked, setLocked] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  useEffect(() => {
    let live = true;
    refreshCustomQuizzes().then(() => {
      if (!live) return;
      const loaded = id ? getQuizById(id) : undefined;
      if (!loaded) {
        setQuiz(undefined);
        setReady(true);
        return;
      }
      const requested = Number(searchParams.get('count'));
      const count = Number.isFinite(requested) && requested > 0 ? requested : loaded.questions.length;
      setQuiz({
        ...loaded,
        questions: pickQuestions(loaded.questions, count, searchParams.get('random') === '1'),
      });
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!ready) {
    return (
      <main className="screen">
        <p className="empty">Loading quiz…</p>
      </main>
    );
  }

  if (!quiz) {
    return (
      <main className="screen">
        <p className="empty">This quiz could not be found.</p>
        <div className="footer" style={{ padding: 32 }}>
          <button className="btn" type="button" onClick={() => navigate('/')}>
            Back to home
          </button>
        </div>
      </main>
    );
  }

  const question = quiz.questions[index];
  const progress = ((index + 1) / quiz.questions.length) * 100;

  function finish(nextPoints: number, review: (number | null)[]) {
    historyAdd({
      id: Date.now().toString(),
      title: quiz!.title,
      level: quiz!.level,
      points: nextPoints,
      questions: quiz!.questions.length,
    });
    navigate('/finish', {
      state: {
        quizId: quiz!.id,
        title: quiz!.title,
        points: nextPoints,
        answers: review,
        questions: quiz!.questions,
        count: Number.isFinite(Number(searchParams.get('count'))) && Number(searchParams.get('count')) > 0
          ? Number(searchParams.get('count'))
          : quiz!.questions.length,
        random: searchParams.get('random') === '1',
      },
    });
  }

  function goNext(nextPoints: number, chosen: number | null) {
    const review = [...answers, chosen];
    if (index < quiz!.questions.length - 1) {
      setAnswers(review);
      setIndex((current) => current + 1);
      setSelected(null);
      setLocked(false);
      return;
    }
    finish(nextPoints, review);
  }

  function confirm() {
    if (locked) return;
    if (selected === null) {
      setDialog('skip');
      return;
    }

    const correct = question.correct === selected;
    setLocked(true);
    setFeedback(correct ? 'ok' : 'bad');
    playAnswerSound(correct);

    if (correct) {
      const nextPoints = points + 1;
      setPoints(nextPoints);
      window.setTimeout(() => {
        setFeedback(null);
        goNext(nextPoints, selected);
      }, 700);
      return;
    }

    vibrateError();
    setShake(true);
    window.setTimeout(() => {
      setShake(false);
      setFeedback(null);
      goNext(points, selected);
    }, 700);
  }

  function onDragEnd(event: React.PointerEvent<HTMLElement>) {
    const start = Number(event.currentTarget.dataset.x || 0);
    if (event.clientX - start < -120) setDialog('skip');
  }

  return (
    <main className="screen">
      <div className={`overlay ${feedback ? `show ${feedback}` : ''}`} />
      <div className="quiz-scroll">
        <div className="quiz-heading">
          <div className="quiz-title-row">
            <button className="icon-button" type="button" aria-label="Back to home" onClick={() => setDialog('stop')}>
              <ArrowLeft size={24} />
            </button>
            <h2>{quiz.title}</h2>
          </div>
          <div className="quiz-meta">
            <span>Question {index + 1}</span>
            <span>
              {index + 1}/{quiz.questions.length}
            </span>
          </div>
          <div className="track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <article
          key={question.title}
          className={`question-card ${shake ? 'shake' : ''}`}
          onPointerDown={(event) => {
            event.currentTarget.dataset.x = String(event.clientX);
          }}
          onPointerUp={onDragEnd}
        >
          <h3>{question.title}</h3>
          {question.alternatives.map((alternative, optionIndex) => (
            <button
              key={alternative}
              type="button"
              className={`option ${selected === optionIndex ? 'checked' : ''}`}
              onClick={() => !locked && setSelected(optionIndex)}
            >
              <span>{alternative}</span>
              <span className="check" aria-hidden="true">
                <i />
              </span>
            </button>
          ))}
        </article>

        <div className="footer">
          <button className="btn-outline" type="button" onClick={() => setDialog('stop')}>
            Stop
          </button>
          <button className="btn" type="button" onClick={confirm}>
            Confirm <Check size={22} weight="bold" />
          </button>
        </div>
      </div>

      {dialog === 'skip' && (
        <Dialog
          title="Skip"
          message="Do you really want to skip this question?"
          confirmLabel="Yes"
          cancelLabel="No"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            setFeedback(null);
            goNext(points, null);
          }}
        />
      )}
      {dialog === 'stop' && (
        <Dialog
          title="Stop"
          message="Do you want to stop now?"
          confirmLabel="Yes"
          cancelLabel="No"
          onCancel={() => setDialog(null)}
          onConfirm={() => navigate('/')}
        />
      )}
    </main>
  );
}
