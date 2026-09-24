import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Trophy } from '@phosphor-icons/react';
import { getQuizById } from '../lib/storage';

type FinishState = {
  quizId?: string;
  title?: string;
  points?: number;
  answers?: (number | null)[];
};

export function FinishPage() {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: FinishState | null };
  const quiz = state?.quizId ? getQuizById(state.quizId) : undefined;
  const points = state?.points;
  const answers = state?.answers;

  if (!quiz || points === undefined || !answers) {
    return <Navigate to="/" replace />;
  }

  return (
    <main className="screen finish">
      <header className="finish-hero">
        <Trophy size={40} color="#00B37E" weight="duotone" />
        <h1>Quiz complete</h1>
        <p>
          {quiz.title} · {points} of {quiz.questions.length} correct
        </p>
      </header>

      <section className="review-list" aria-label="Question review">
        {quiz.questions.map((question, index) => {
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
        <button className="btn" type="button" onClick={() => navigate('/')}>
          Back to home
        </button>
      </div>
    </main>
  );
}
