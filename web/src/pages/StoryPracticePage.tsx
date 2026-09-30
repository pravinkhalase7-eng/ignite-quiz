import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Play } from '@phosphor-icons/react';
import type { Question } from '../data/quizzes';
import { loadStory, loadStoryPack, rememberStoryPack, type StoryPack } from '../lib/storyQuiz';

type Item = Question & { kind: 'Story' | 'Word' };

function questionsIn(pack: StoryPack): Item[] {
  return [
    ...pack.storyQuestions.map((question) => ({ ...question, kind: 'Story' as const })),
    ...pack.wordQuestions.map((question) => ({ ...question, kind: 'Word' as const })),
  ];
}

export function StoryPracticePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const id = params.get('id');
  const [pack, setPack] = useState<StoryPack | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'review' | 'play'>('review');
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const request = id ? loadStory(id) : Promise.resolve(loadStoryPack());
    request.then((next) => {
      if (cancelled) return;
      if (next) rememberStoryPack(next);
      setPack(next);
      setMode('review');
      setPlayed(false);
      setAnswers([]);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!ready) {
    return (
      <main className="screen">
        <p className="empty">Loading…</p>
      </main>
    );
  }

  if (!pack) {
    return (
      <main className="screen">
        <p className="empty">Make a story quiz first.</p>
        <div className="footer" style={{ padding: 32 }}>
          <button className="btn" type="button" onClick={() => navigate('/story')}>
            Back to story
          </button>
        </div>
      </main>
    );
  }

  const items = questionsIn(pack);

  function play() {
    setMode('play');
    setIndex(0);
    setPoints(0);
    setSelected(null);
    setLocked(false);
    setAnswers([]);
    setPlayed(false);
  }

  if (mode === 'review') {
    return (
      <main className="screen finish">
        <header className="header">
          <button className="icon-button" type="button" aria-label="Back to stories" onClick={() => navigate('/story')}>
            <ArrowLeft size={28} />
          </button>
          <div className="header-copy">
            <h1>{pack.title}</h1>
            <p>{played ? `${points} of ${items.length} correct` : 'Questions and answers'}</p>
          </div>
        </header>

        <section className="story-recap">
          <h2>The story</h2>
          <p>{pack.story}</p>
        </section>

        <section className="review-list" aria-label="Questions and answers">
          {items.map((question, questionIndex) => {
            const correctText = question.alternatives[question.correct];
            const chosen = answers[questionIndex];
            const wasCorrect = played && chosen === question.correct;
            const skipped = played && (chosen === null || chosen === undefined);
            return (
              <article key={`${question.kind}-${questionIndex}`} className="review-card">
                <p className="review-index">
                  {question.kind === 'Story' ? 'Story question' : 'Word meaning'} {questionIndex + 1}
                </p>
                <h2>{question.title}</h2>
                <p className="answer-line correct">Answer: {correctText}</p>
                {played && !wasCorrect && (
                  <p className={`answer-line ${skipped ? 'skipped' : 'wrong'}`}>
                    {skipped ? 'Your answer: Skipped' : `Your answer: ${question.alternatives[chosen as number]}`}
                  </p>
                )}
              </article>
            );
          })}
        </section>

        <div className="finish-actions">
          <button className="btn" type="button" onClick={play}>
            <Play size={20} weight="fill" /> {played ? 'Play again' : 'Play'}
          </button>
          <button className="btn-outline" type="button" onClick={() => navigate('/story')}>
            Back to stories
          </button>
        </div>
      </main>
    );
  }

  const item = items[index];
  const progress = ((index + 1) / items.length) * 100;

  function confirm() {
    if (locked || selected === null) return;
    const correct = selected === item.correct;
    const nextPoints = points + (correct ? 1 : 0);
    const nextAnswers = [...answers];
    nextAnswers[index] = selected;
    setLocked(true);
    setPoints(nextPoints);
    setAnswers(nextAnswers);
    window.setTimeout(() => {
      if (index + 1 >= items.length) {
        setPlayed(true);
        setMode('review');
        return;
      }
      setIndex((current) => current + 1);
      setSelected(null);
      setLocked(false);
    }, 700);
  }

  return (
    <main className="screen">
      <div className="quiz-scroll">
        <div className="quiz-heading">
          <div className="quiz-title-row">
            <button className="icon-button" type="button" aria-label="Back to answers" onClick={() => setMode('review')}>
              <ArrowLeft size={24} />
            </button>
            <h2>{pack.title}</h2>
          </div>
          <div className="quiz-meta">
            <span>{item.kind === 'Story' ? 'Story question' : 'Word meaning'}</span>
            <span>
              {index + 1}/{items.length}
            </span>
          </div>
          <div className="track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>

        <article className="question-card">
          <h3>{item.title}</h3>
          {item.alternatives.map((alternative, optionIndex) => {
            const chosen = selected === optionIndex;
            const right = locked && optionIndex === item.correct;
            const wrong = locked && chosen && optionIndex !== item.correct;
            return (
              <button
                key={alternative}
                type="button"
                className={`option ${chosen || right ? 'checked' : ''} ${right ? 'story-right' : ''} ${wrong ? 'story-wrong' : ''}`}
                onClick={() => !locked && setSelected(optionIndex)}
              >
                <span>{alternative}</span>
                <span className="check" aria-hidden="true">
                  <i />
                </span>
              </button>
            );
          })}
        </article>

        <div className="footer">
          <button className="btn" type="button" onClick={confirm} disabled={selected === null || locked}>
            Confirm <Check size={22} weight="bold" />
          </button>
        </div>
      </div>
    </main>
  );
}
