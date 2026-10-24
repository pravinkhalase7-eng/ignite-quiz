import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { loadJeeCatalog, loadJeeTopics, saveJeePack, startJeeQuiz, type JeeTopicReport, type JeeYear } from '../lib/jeeQuiz';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'] as const;
const COUNTS = [5, 10, 20];

export function JeePage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Reading the papers…');
  const [years, setYears] = useState<JeeYear[]>([]);
  const [year, setYear] = useState('');
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number] | ''>('');
  const [topics, setTopics] = useState<JeeTopicReport | null>(null);
  const [topic, setTopic] = useState('All');
  const [count, setCount] = useState(10);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    async function poll() {
      try {
        const catalog = await loadJeeCatalog();
        if (!live) return;
        if (catalog.error) {
          setError(catalog.error);
          setReady(true);
          return;
        }
        if (!catalog.ready) {
          setStatus(catalog.note || 'Reading the papers…');
          window.setTimeout(poll, 1000);
          return;
        }
        setYears(catalog.years);
        setReady(true);
        if (catalog.years[0]) setYear((current) => current || catalog.years[0].year);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not read the JEE papers.');
      }
    }
    poll();
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!year || !subject) return;
    let live = true;
    async function poll() {
      try {
        const report = await loadJeeTopics(year, subject);
        if (!live) return;
        setTopics(report);
        if (!report.ready) window.setTimeout(poll, 1500);
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not group those questions.');
      }
    }
    setTopics(null);
    setTopic('All');
    poll();
    return () => {
      live = false;
    };
  }, [year, subject]);

  const selected = years.find((item) => item.year === year);
  const subjectTotal = selected && subject ? selected.subjects[subject] : 0;
  const topicTotal = topic === 'All' ? subjectTotal : topics?.topics.find((item) => item.name === topic)?.count ?? 0;
  const available = topicTotal;
  const counts = COUNTS.filter((value) => value < available);
  const chosenCount = Math.min(available, count);

  async function start() {
    if (!year || !subject || available < 1) return;
    setBusy(true);
    setError('');
    try {
      const pack = await startJeeQuiz(year, subject, chosenCount, topic);
      saveJeePack(pack);
      navigate('/jee/play');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start that quiz.');
      setBusy(false);
    }
  }

  return (
    <main className="screen upload">
      <header className="header">
        <button className="icon-button" type="button" aria-label="Back to home" onClick={() => navigate('/')}>
          <ArrowLeft size={28} />
        </button>
        <div className="header-copy">
          <h1>JEE Main</h1>
          <p>Choose a year, a subject, then a topic</p>
        </div>
      </header>

      {!ready && !error && <p className="empty">{status}</p>}
      {ready && years.length === 0 && <p className="empty">No JEE Main papers were found.</p>}

      {ready && years.length > 0 && (
        <div className="upload-form">
          <div className="start-ranges">
            <span>Year</span>
            <div className="start-counts">
              {years.map((item) => (
                <button
                  key={item.year}
                  type="button"
                  className={year === item.year ? 'on' : ''}
                  onClick={() => {
                    setYear(item.year);
                    if (subject && item.subjects[subject] < 1) setSubject('');
                  }}
                >
                  {item.year}
                </button>
              ))}
            </div>
          </div>

          <div className="start-ranges">
            <span>Subject</span>
            <div className="start-counts">
              {SUBJECTS.map((name) => {
                const total = selected?.subjects[name] ?? 0;
                return (
                  <button
                    key={name}
                    type="button"
                    className={subject === name ? 'on' : ''}
                    disabled={total < 1}
                    onClick={() => {
                      setSubject(name);
                      setTopic('All');
                      setCount(10);
                    }}
                  >
                    {name}
                    {total > 0 ? ` · ${total}` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {subject && (
            <div className="start-ranges">
              <span>Topic</span>
              {topics && !topics.ready && (
                <p className="hint">
                  Grouping questions by topic… {topics.done} of {topics.total}
                </p>
              )}
              <div className="start-counts">
                <button type="button" className={topic === 'All' ? 'on' : ''} onClick={() => { setTopic('All'); setCount(10); }}>
                  All{subjectTotal > 0 ? ` · ${subjectTotal}` : ''}
                </button>
                {topics?.topics.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className={topic === item.name ? 'on' : ''}
                    onClick={() => {
                      setTopic(item.name);
                      setCount(10);
                    }}
                  >
                    {item.name} · {item.count}
                  </button>
                ))}
              </div>
            </div>
          )}

          {subject && available > 0 && (
            <div className="start-ranges">
              <span>How many questions?</span>
              <div className="start-counts">
                {counts.map((value) => (
                  <button key={value} type="button" className={chosenCount === value ? 'on' : ''} onClick={() => setCount(value)}>
                    {value}
                  </button>
                ))}
                <button type="button" className={chosenCount === available ? 'on' : ''} onClick={() => setCount(available)}>
                  All
                </button>
              </div>
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
          <button className="btn" type="button" disabled={busy || !subject || available < 1} onClick={start}>
            {busy ? 'Preparing the questions…' : 'Start'}
          </button>
        </div>
      )}
    </main>
  );
}
