import { useEffect, useRef, useState } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Trophy, XCircle } from '@phosphor-icons/react';
import { Dialog } from '../components/Dialog';
import { explainJeeQuestion, loadJeeChoices, loadJeePack, saveJeePack, startJeeQuiz, type JeePack, type JeeQuestion } from '../lib/jeeQuiz';
import { playAnswerSound, vibrateError } from '../lib/sound';

const PASS_PERCENT = 80;
const LETTERS = ['A', 'B', 'C', 'D'];

function fitStemImage(event: { currentTarget: HTMLImageElement }) {
  const img = event.currentTarget;
  const box = img.parentElement?.clientWidth ?? img.naturalWidth;
  img.style.width = `${Math.max(box, img.naturalWidth)}px`;
  img.style.height = 'auto';
}

function fitOptionImage(event: { currentTarget: HTMLImageElement }) {
  const img = event.currentTarget;
  img.style.height = `${img.naturalHeight}px`;
  img.style.width = 'auto';
}

const notes = new Map<string, string>();
const choiceCache = new Map<string, Promise<string[]>>();

function rememberChoices(id: string) {
  const pending = choiceCache.get(id);
  if (pending) return pending;
  const next = loadJeeChoices(id).catch((error: unknown) => {
    choiceCache.delete(id);
    throw error;
  });
  choiceCache.set(id, next);
  return next;
}

function QuestionCard({
  question,
  nextId,
  selected,
  shake,
  feedback,
  onSelect,
}: {
  question: JeeQuestion;
  nextId?: string;
  selected: number | null;
  shake: boolean;
  feedback: 'ok' | 'bad' | null;
  onSelect: (index: number) => void;
}) {
  const readyChoices = question.choices?.length === 4 ? question.choices : null;
  const [choices, setChoices] = useState<string[] | null>(readyChoices);
  const [waiting, setWaiting] = useState(!readyChoices && Boolean(question.id));

  useEffect(() => {
    let cancel = false;
    if (question.choices?.length === 4) {
      setChoices(question.choices);
      setWaiting(false);
    } else if (question.id) {
      setChoices(null);
      setWaiting(true);
      rememberChoices(question.id)
        .then((next) => {
          if (cancel) return;
          setChoices(next);
          setWaiting(false);
        })
        .catch(() => {
          if (cancel) return;
          setChoices(null);
          setWaiting(false);
        });
    } else {
      setWaiting(false);
    }
    if (nextId) rememberChoices(nextId).catch(() => {});
    return () => {
      cancel = true;
    };
  }, [question, nextId]);

  return (
    <article className={`question-card ${shake ? 'shake' : ''}`}>
      <div className="jee-stem-wrap">
        <img className="jee-stem" src={question.stem} alt="Question" onLoad={fitStemImage} />
      </div>
      <Explanation key={question.id} id={question.id} />
      {question.options.map((option, optionIndex) => {
        const label = choices?.[optionIndex];
        const figure = !label || label === 'FIGURE';
        return (
          <button
            key={optionIndex}
            type="button"
              className={`option jee-option ${selected === optionIndex ? 'checked' : ''} ${
              feedback && optionIndex === question.correct ? 'right' : ''
            } ${feedback === 'bad' && selected === optionIndex && optionIndex !== question.correct ? 'wrong' : ''}`}
            onClick={() => onSelect(optionIndex)}
          >
            <span className="jee-letter">{LETTERS[optionIndex]}</span>
            {waiting ? (
              <span className="jee-choice-wait">Reading…</span>
            ) : figure ? (
              <img src={option} alt="" onLoad={fitOptionImage} />
            ) : (
              <MathText text={label} className="jee-choice" />
            )}
            <span className="check" aria-hidden="true">
              <i />
            </span>
          </button>
        );
      })}
    </article>
  );
}

function formatLines(text: string) {
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

function MathText({ text, className = 'jee-explanation' }: { text: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.textContent = text;
    renderMathInElement(node, {
      throwOnError: false,
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
    });
  }, [text]);
  return <div ref={ref} className={className} />;
}

function ReviewCard({
  question,
  number,
  chosen,
}: {
  question: JeeQuestion;
  number: number;
  chosen: number | null | undefined;
}) {
  const ready = question.choices?.length === 4 ? question.choices : null;
  const [choices, setChoices] = useState<string[] | null>(ready);
  const [waiting, setWaiting] = useState(!ready && Boolean(question.id));

  useEffect(() => {
    if (ready || !question.id) {
      setWaiting(false);
      return;
    }
    let cancel = false;
    setWaiting(true);
    rememberChoices(question.id)
      .then((next) => {
        if (cancel) return;
        setChoices(next);
        setWaiting(false);
      })
      .catch(() => {
        if (!cancel) setWaiting(false);
      });
    return () => {
      cancel = true;
    };
  }, [question.id, ready]);

  const skipped = chosen === null || chosen === undefined;
  const wasCorrect = chosen === question.correct;

  return (
    <article className="review-card">
      <p className="review-index">Question {number}</p>
      <div className="jee-stem-wrap">
        <img className="jee-stem" src={question.stem} alt="" onLoad={fitStemImage} />
      </div>
      <Explanation id={question.id} />
      <AnswerLine
        tone="correct"
        label="Correct answer"
        letter={LETTERS[question.correct]}
        text={choices?.[question.correct]}
        image={question.options[question.correct]}
        waiting={waiting}
      />
      {!wasCorrect &&
        (skipped ? (
          <p className="answer-line skipped">Your answer: Skipped</p>
        ) : (
          <AnswerLine
            tone="wrong"
            label="Your answer"
            letter={LETTERS[chosen]}
            text={choices?.[chosen]}
            image={question.options[chosen]}
            waiting={waiting}
          />
        ))}
    </article>
  );
}

function AnswerLine({
  tone,
  label,
  letter,
  text,
  image,
  waiting,
}: {
  tone: 'correct' | 'wrong';
  label: string;
  letter: string;
  text?: string;
  image?: string;
  waiting: boolean;
}) {
  const figure = !text || text === 'FIGURE';
  return (
    <div className={`answer-choice ${tone}`}>
      <span>
        {label} · {letter}
      </span>
      {waiting ? (
        <span className="jee-choice-wait">Reading…</span>
      ) : text && !figure ? (
        <MathText text={text} className="jee-answer-math" />
      ) : image ? (
        <img className="jee-answer-image" src={image} alt="" onLoad={fitOptionImage} />
      ) : null}
    </div>
  );
}

function Explanation({ id }: { id?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(id ? notes.get(id) || '' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (!id) return null;

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const saved = notes.get(id!);
    if (text || saved) {
      if (saved) setText(saved);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const explanation = await explainJeeQuestion(id!);
      notes.set(id!, explanation);
      setText(explanation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not explain that question.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button className="btn-outline jee-explain" type="button" onClick={toggle}>
        {open ? 'Hide explanation' : 'Explanation'}
      </button>
      {open &&
        (loading || error ? (
          <p className="jee-explanation">{loading ? 'Writing the explanation…' : error}</p>
        ) : (
          <MathText text={formatLines(text)} />
        ))}
    </div>
  );
}

export function JeePlayPage() {
  const navigate = useNavigate();
  const [pack, setPack] = useState<JeePack | null>(() => loadJeePack());
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'ok' | 'bad' | null>(null);
  const [shake, setShake] = useState(false);
  const moveTimer = useRef<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [done, setDone] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!pack) {
    return (
      <main className="screen">
        <p className="empty">Choose a year and subject first.</p>
        <div className="footer" style={{ padding: 32 }}>
          <button className="btn" type="button" onClick={() => navigate('/jee')}>
            Back
          </button>
        </div>
      </main>
    );
  }

  if (done) {
    const percent = Math.round((points / pack.questions.length) * 100);
    const passed = percent >= PASS_PERCENT;
    return (
      <main className={`screen finish ${passed ? 'passed' : 'failed'}`}>
        <header className={`finish-result ${passed ? 'passed' : 'failed'}`}>
          {passed ? <Trophy size={48} color="#00B37E" weight="duotone" /> : <XCircle size={48} color="#F75A68" weight="duotone" />}
          <p className="finish-score">{percent}%</p>
          <h1>{passed ? 'You passed' : 'You did not pass'}</h1>
          <p>
            {points} of {pack.questions.length} correct. You need {PASS_PERCENT}% to pass.
          </p>
          <p className="finish-quiz-name">{pack.title}</p>
        </header>
        <section className="review-list" aria-label="Question review">
          {pack.questions.map((question, questionIndex) => (
            <ReviewCard key={question.id ?? questionIndex} question={question} number={questionIndex + 1} chosen={answers[questionIndex]} />
          ))}
        </section>
        <div className="finish-actions">
          {!passed && (
            <button className="btn" type="button" disabled={busy} onClick={() => again(pack)}>
              {busy ? 'Preparing…' : 'Try again'}
            </button>
          )}
          <button className="btn-outline" type="button" onClick={() => navigate('/jee')}>
            Back
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
      </main>
    );
  }

  const question = pack.questions[index];
  const progress = ((index + 1) / pack.questions.length) * 100;

  function goNext(chosen: number | null) {
    const review = [...answers, chosen];
    if (index < pack!.questions.length - 1) {
      setAnswers(review);
      setIndex((current) => current + 1);
      setSelected(null);
      return;
    }
    let score = 0;
    review.forEach((answer, questionIndex) => {
      if (answer === pack!.questions[questionIndex].correct) score += 1;
    });
    setAnswers(review);
    setPoints(score);
    setDone(true);
  }

  function next() {
    if (selected === null || feedback) return;
    const correct = question.correct === selected;
    const chosen = selected;
    setFeedback(correct ? 'ok' : 'bad');
    setShake(!correct);
    playAnswerSound(correct);
    if (!correct) vibrateError();
    if (moveTimer.current) window.clearTimeout(moveTimer.current);
    moveTimer.current = window.setTimeout(() => {
      moveTimer.current = null;
      setFeedback(null);
      setShake(false);
      goNext(chosen);
    }, 700);
  }

  async function again(current: JeePack) {
    setBusy(true);
    setError('');
    try {
      const next = await startJeeQuiz(current.year, current.subject, current.count, current.topic);
      saveJeePack(next);
      setPack(next);
      setIndex(0);
      setPoints(0);
      setSelected(null);
      setFeedback(null);
      setAnswers([]);
      setDone(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start that quiz.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen jee-play">
      <div className={`overlay ${feedback ? `show ${feedback}` : ''}`} />
      <div className="quiz-scroll">
        <div className="quiz-heading">
          <div className="quiz-title-row">
            <button className="icon-button" type="button" aria-label="Back" onClick={() => setDialog(true)}>
              <ArrowLeft size={24} />
            </button>
            <h2>{pack.title}</h2>
          </div>
          <div className="quiz-meta">
            <span>Question {index + 1}</span>
            <span>
              {index + 1}/{pack.questions.length}
            </span>
          </div>
          <div className="track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <QuestionCard
          key={question.id ?? index}
          question={question}
          nextId={pack.questions[index + 1]?.id}
          selected={selected}
          shake={shake}
          feedback={feedback}
          onSelect={setSelected}
        />
      </div>

      <div className="footer jee-nav">
        <button className="btn-outline" type="button" onClick={() => setDialog(true)}>
          Stop
        </button>
        <button className="btn" type="button" disabled={selected === null || feedback !== null} onClick={next}>
          {index < pack.questions.length - 1 ? 'Next' : 'See result'} <Check size={22} weight="bold" />
        </button>
      </div>

      {dialog && (
        <Dialog
          title="Stop"
          message="Do you want to stop now?"
          confirmLabel="Yes"
          cancelLabel="No"
          onCancel={() => setDialog(false)}
          onConfirm={() => navigate('/jee')}
        />
      )}
    </main>
  );
}
