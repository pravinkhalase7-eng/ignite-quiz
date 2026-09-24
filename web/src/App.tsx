import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { QuizPage } from './pages/QuizPage';
import { FinishPage } from './pages/FinishPage';
import { HistoryPage } from './pages/HistoryPage';
import { UploadPage } from './pages/UploadPage';

export function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <div className="phone">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/quiz/:id" element={<QuizPage />} />
            <Route path="/finish" element={<FinishPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
