import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Trophy, XCircle } from '@phosphor-icons/react';
import type { Question } from '../data/quizzes';
import { loadStoryPack } from '../lib/storyQuiz';

type Item = Question & { kind: 'Story' | 'Word' };

const PASS_PERCENT = 80;

export function StoryPracticePage() {
  const navigate = useNavigate();
  const pack = loadStoryPack();
  const items: Item[] = pack
    ? [
        ...pack.storyQuestions.map((question) => ({ ...question, kind: 'Story' as const })),
        ...pack.wordQuestions.map((question) => ({ ...question, kind: 'Word' as const })),
      ]
    : [];
  const [index, setIndex] = useState(0);
  const [points, setPoints] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [done, setDone] = useState(false);

  if (!pack || items.length === 0) {
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

  if (done) {
    const percent = Math.round((points / items.length) * 100);
    const passed = percent >= PASS_PERCENT;
    return (
      <main className="screen finish">
        <header className={`finish-result ${passed ? 'passed' : 'failed'}`}>
          {passed ? <Trophy size={48} color="#00B37E" weight="duotone" /> : <XCircle size={48} color="#F75A68" weight="duotone" />}
          <p className="finish-score">{percent}%</p>
          <h1>{passed ? 'You understood the story' : 'Read the story once more'}</h1>
          <p>
            {points} of {items.length} correct. You need {PASS_PERCENT}% to pass.
          </p>
          <p className="finish-quiz-name">{pack.title}</p>
        </header>
        <section className="story-recap">
          <h2>The story</h2>
          <p>{pack.story}</p>
        </section>
        <div className="finish-actions">
          <button className="btn" type="button" onClick={() => navigate('/story')}>
            New story
          </button>
          <button className="btn-outline" type="button" onClick={() => navigate('/')}>
            Back to home
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
    setLocked(true);
    setPoints(nextPoints);
    window.setTimeout(() => {
      if (index + 1 >= items.length) {
        setDone(true);
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
            <button className="icon-button" type="button" aria-label="Back to story" onClick={() => navigate('/story')}>
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
