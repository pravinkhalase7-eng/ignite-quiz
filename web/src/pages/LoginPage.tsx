export function LoginPage({ message }: { message?: string }) {
  return (
    <main className="screen login">
      <header className="header">
        <div className="header-copy">
          <h1>Ignite Quiz</h1>
          <p>Sign in to keep your quizzes</p>
        </div>
      </header>
      <div className="login-panel">
        <p>Your quizzes and scores stay with your Google account, on this phone and on your computer.</p>
        {message && <p className="login-error">{message}</p>}
        <a className="btn google-btn" href="/api/auth/google">
          Sign in with Google
        </a>
      </div>
    </main>
  );
}
