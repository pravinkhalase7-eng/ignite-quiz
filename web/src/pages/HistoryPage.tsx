import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HouseLine, Trash } from '@phosphor-icons/react';
import { historyGetAll, historyRemove, type HistoryEntry } from '../lib/storage';
import { LevelBars } from '../components/LevelBars';
import { Dialog } from '../components/Dialog';

export function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<HistoryEntry[]>(() => historyGetAll());
  const [pendingId, setPendingId] = useState<string | null>(null);

  function remove() {
    if (!pendingId) return;
    historyRemove(pendingId);
    setHistory(historyGetAll());
    setPendingId(null);
  }

  return (
    <main className="screen">
      <header className="header">
        <div>
          <h1>History</h1>
          <p>{'Your history of\ncompleted quizzes'}</p>
        </div>
        <button className="icon-button" type="button" aria-label="Back to home" onClick={() => navigate('/')}>
          <HouseLine size={28} />
        </button>
      </header>

      {history.length === 0 ? (
        <p className="empty">You have not finished a quiz yet.</p>
      ) : (
        <section className="history-list">
          {history.map((item) => (
            <article key={item.id} className="history-card">
              <div>
                <h2>{item.title}</h2>
                <p>
                  You got {item.points} out of {item.questions} right
                </p>
              </div>
              <LevelBars level={item.level} />
              <button
                className="trash"
                type="button"
                aria-label={`Remove ${item.title}`}
                onClick={() => setPendingId(item.id)}
              >
                <Trash size={22} />
              </button>
            </article>
          ))}
        </section>
      )}

      {pendingId && (
        <Dialog
          title="Remove"
          message="Do you want to remove this record?"
          confirmLabel="Yes"
          cancelLabel="No"
          onCancel={() => setPendingId(null)}
          onConfirm={remove}
        />
      )}
    </main>
  );
}
