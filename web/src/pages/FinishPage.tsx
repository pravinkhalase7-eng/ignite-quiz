import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Trophy, XCircle } from '@phosphor-icons/react';
import type { Question } from '../data/quizzes';
import { getQuizById } from '../lib/storage';

const PASS_PERCENT = 80;

type FinishState = {
  quizId?: string;
  title?: string;
  points?: number;
  answers?: (number | null)[];
  questions?: Question[];
  count?: number;
  random?: boolean;
};

export function FinishPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: FinishState | null };
  const quiz = state?.quizId ? getQuizById(state.quizId) : undefined;
  const points = state?.points;
  const answers = state?.answers;
  const questions = state?.questions ?? quiz?.questions;

  if (!quiz || !questions || points === undefined || !answers) {
    return <Navigate to="/" replace />;
  }

  const percent = questions.length === 0 ? 0 : Math.round((points / questions.length) * 100);
  const passed = percent >= PASS_PERCENT;

  function tryAgain() {
    const count = state?.count ?? questions!.length;
    const params = new URLSearchParams({ count: String(count) });
    if (state?.random) params.set('random', '1');
    navigate(`/quiz/${quiz!.id}?${params}`);
  }

  return (
    <main className={`screen finish ${passed ? 'passed' : 'failed'}`}>
      <header className={`finish-result ${passed ? 'passed' : 'failed'}`}>
        {passed ? (
          <Trophy size={48} color="#00B37E" weight="duotone" />
        ) : (
          <XCircle size={48} color="#F75A68" weight="duotone" />
        )}
        <p className="finish-score">{percent}%</p>
        <h1>{passed ? 'You passed' : 'You did not pass'}</h1>
        <p>
          {points} of {questions.length} correct. You need {PASS_PERCENT}% to pass.
        </p>
        <p className="finish-quiz-name">{quiz.title}</p>
      </header>

      <section className="review-list" aria-label="Question review">
        {questions.map((question, index) => {
          const chosen = answers[index];
          const correctText = question.alternatives[question.correct];
          const wasCorrect = chosen === question.correct;
          const skipped = chosen === null || chosen === undefined;

          return (
            <article key={question.title} className="review-card">
              <p className="review-index">Question {index + 1}</p>
              <h2>{question.title}</h2>
              <p className="answer-line correct">Correct answer: {correctText}</p>
              {!wasCorrect && (
                <p className={`answer-line ${skipped ? 'skipped' : 'wrong'}`}>
                  {skipped ? 'Your answer: Skipped' : `Your answer: ${question.alternatives[chosen]}`}
                </p>
              )}
            </article>
          );
        })}
      </section>

      <div className="finish-actions">
        {!passed && (
          <button className="btn btn-danger" type="button" onClick={tryAgain}>
            Try again
          </button>
        )}
        <button className={passed ? 'btn' : 'btn-outline'} type="button" onClick={() => navigate('/')}>
          Back to home
        </button>
      </div>
    </main>
  );
}
