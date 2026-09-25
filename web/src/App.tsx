import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { QuizPage } from './pages/QuizPage';
import { FinishPage } from './pages/FinishPage';
import { HistoryPage } from './pages/HistoryPage';
import { UploadPage } from './pages/UploadPage';
import { LoginPage } from './pages/LoginPage';

type Session = { google: boolean; user: { id: string; email: string; name: string } | null };

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { google: false, user: null }))
      .then((next: Session) => setSession(next))
      .catch(() => setSession({ google: false, user: null }));
  }, []);

  if (!session) {
    return (
      <div className="app-shell">
        <div className="phone">
          <main className="screen">
            <p className="empty">Loading…</p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="phone">
          {session.google && !session.user ? (
            <LoginGate />
          ) : (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/quiz/:id" element={<QuizPage />} />
              <Route path="/finish" element={<FinishPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </div>
      </div>
    </BrowserRouter>
  );
}

function LoginGate() {
  const [params] = useSearchParams();
  const message = params.get('login') === 'failed' ? params.get('message') || 'Google sign-in failed.' : undefined;
  return <LoginPage message={message} />;
}
