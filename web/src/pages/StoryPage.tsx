import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Image as ImageIcon, Trash, X } from '@phosphor-icons/react';
import { Dialog } from '../components/Dialog';
import {
  deleteStory,
  generateStoryPack,
  listStories,
  llmSettings,
  saveLlmSettings,
  saveStoryPack,
  serverHasGemini,
  type LlmProvider,
  type StoryPack,
} from '../lib/storyQuiz';

type PageShot = { id: string; file: File; url: string };

const MAX_PAGES = 16;

export function StoryPage() {
  const navigate = useNavigate();
  const saved = llmSettings();
  const [text, setText] = useState('');
  const [pages, setPages] = useState<PageShot[]>([]);
  const [apiKey, setApiKey] = useState(saved.key);
  const [provider, setProvider] = useState<LlmProvider>(saved.provider);
  const [needsKey, setNeedsKey] = useState(false);
  const [stories, setStories] = useState<StoryPack[]>([]);
  const [pendingDelete, setPendingDelete] = useState<StoryPack | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    serverHasGemini().then((ready) => setNeedsKey(!ready));
    listStories().then(setStories);
    return () => {
      setPages((current) => {
        current.forEach((page) => URL.revokeObjectURL(page.url));
        return [];
      });
    };
  }, []);

  function addPages(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((file) => !file.type || file.type.startsWith('image/'));
    let overflow = false;
    setPages((current) => {
      const room = Math.max(0, MAX_PAGES - current.length);
      overflow = incoming.length > room;
      const accepted = incoming.slice(0, room);
      return [
        ...current,
        ...accepted.map((file, index) => ({
          id: `${Date.now()}-${current.length + index}-${file.name}`,
          file,
          url: URL.createObjectURL(file),
        })),
      ];
    });
    setError(overflow ? 'Add up to 16 pages.' : '');
  }

  function removePage(id: string) {
    setPages((current) => {
      const page = current.find((item) => item.id === id);
      if (page) URL.revokeObjectURL(page.url);
      return current.filter((item) => item.id !== id);
    });
  }

  async function createQuiz(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      saveLlmSettings(apiKey, provider);
      const pack = await generateStoryPack({ text, images: pages.map((page) => page.file) });
      await saveStoryPack(pack);
      navigate(`/story/practice?id=${encodeURIComponent(pack.id)}`);
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : 'Could not make the quiz.';
      setError(message === 'Load failed' || message === 'Failed to fetch' ? 'Could not send the pages. Try again with fewer pages.' : message);
    } finally {
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
          <h1>Story quiz</h1>
          <p>Add every page, then make the quiz</p>
        </div>
      </header>

      <form className="upload-form" onSubmit={createQuiz}>
        <label>
          Type the story
          <textarea
            className="story-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Once there was a window open for ventilation..."
          />
        </label>
        <label className="file-field">
          <ImageIcon size={22} />
          Add pages
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              addPages(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <label className="file-field">
          <Camera size={22} />
          Take the next photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              addPages(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        {pages.length > 0 && (
          <div className="page-strip" aria-label="Story pages">
            {pages.map((page, index) => (
              <figure key={page.id} className="page-shot">
                <img src={page.url} alt={`Page ${index + 1}`} />
                <button type="button" aria-label={`Remove page ${index + 1}`} onClick={() => removePage(page.id)}>
                  <X size={14} weight="bold" />
                </button>
                <figcaption>Page {index + 1}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <p className="hint">
          {pages.length === 0
            ? 'Add the pages in reading order. You can add more before making the quiz.'
            : `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} ready. Add more, or make the quiz.`}
        </p>
        {needsKey && (
          <>
            <label>
              Model
              <select value={provider} onChange={(event) => setProvider(event.target.value as LlmProvider)}>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label>
              API key
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Saved only in this browser"
                autoComplete="off"
              />
            </label>
          </>
        )}
        {error && <p className="login-error">{error}</p>}
        <button className="btn" type="submit" disabled={busy || (pages.length === 0 && !text.trim())}>
          {busy ? 'Making questions…' : 'Make story quiz'}
        </button>
      </form>

      {stories.length > 0 && (
        <section className="history-list" aria-label="Saved stories">
          <h2 className="saved-heading">Saved stories</h2>
          {stories.map((story) => (
            <article key={story.id} className="history-card">
              <button
                className="story-saved"
                type="button"
                onClick={() => navigate(`/story/practice?id=${encodeURIComponent(story.id)}`)}
              >
                <h2>{story.title}</h2>
                <p>{story.storyQuestions.length + story.wordQuestions.length} questions</p>
              </button>
              <button
                className="trash"
                type="button"
                aria-label={`Delete ${story.title}`}
                onClick={() => setPendingDelete(story)}
              >
                <Trash size={22} />
              </button>
            </article>
          ))}
        </section>
      )}

      {pendingDelete && (
        <Dialog
          title="Delete story"
          message={`Delete “${pendingDelete.title}”? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            deleteStory(id).then(() => listStories().then(setStories));
          }}
        />
      )}
    </main>
  );
}
