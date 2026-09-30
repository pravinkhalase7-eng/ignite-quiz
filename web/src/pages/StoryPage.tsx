import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Image as ImageIcon, Trash } from '@phosphor-icons/react';
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

export function StoryPage() {
  const navigate = useNavigate();
  const saved = llmSettings();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
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
  }, []);

  async function createQuiz(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      saveLlmSettings(apiKey, provider);
      const pack = await generateStoryPack({ text, image: photo });
      await saveStoryPack(pack);
      navigate(`/story/practice?id=${encodeURIComponent(pack.id)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not make the quiz.');
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
          <p>Photo, camera, or type the story</p>
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
          {photo && !photo.name.startsWith('camera') ? photo.name : 'Upload a photo'}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        <label className="file-field">
          <Camera size={22} />
          Take a photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) setPhoto(file);
            }}
          />
        </label>
        {photo && <p className="hint">Photo ready: {photo.name}</p>}
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
        <button className="btn" type="submit" disabled={busy}>
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
