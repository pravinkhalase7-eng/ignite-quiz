import { createContext, useContext } from 'react';

export type SessionUser = { id: string; email: string; name: string };

export type Session = {
  google: boolean;
  user: SessionUser | null;
};

type SessionValue = Session & {
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({
  session,
  setSession,
  children,
}: {
  session: Session;
  setSession: (next: Session) => void;
  children: React.ReactNode;
}) {
  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setSession({ google: true, user: null });
  }

  return <SessionContext.Provider value={{ ...session, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
