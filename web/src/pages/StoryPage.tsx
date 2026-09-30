import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Image as ImageIcon } from '@phosphor-icons/react';
import { generateStoryPack, llmSettings, saveLlmSettings, saveStoryPack, type LlmProvider } from '../lib/storyQuiz';

export function StoryPage() {
  const navigate = useNavigate();
  const saved = llmSettings();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState(saved.key);
  const [provider, setProvider] = useState<LlmProvider>(saved.provider);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function createQuiz(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      saveLlmSettings(apiKey, provider);
      const pack = await generateStoryPack({ text, image: photo });
      saveStoryPack(pack);
      navigate('/story/practice');
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
        {error && <p className="login-error">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Making questions…' : 'Make story quiz'}
        </button>
      </form>
    </main>
  );
}
