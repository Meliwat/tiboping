import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RadioTower } from 'lucide-react';

import { ApiError, authApi, forgetSession, type Session } from './api/client.js';
import { AppShell } from './components/AppShell.js';
import { StatusPill } from './components/StatusPill.js';
import { LoginPage } from './pages/LoginPage.js';

const sessionQueryKey = ['auth', 'session'] as const;

const BootScreen = () => (
  <main className="boot-screen" aria-live="polite">
    <div className="boot-screen__beacon" aria-hidden="true">
      <RadioTower size={28} />
    </div>
    <p className="eyebrow">Tuning the signal desk</p>
  </main>
);

const DeskWelcome = () => (
  <section className="desk-welcome">
    <div>
      <p className="eyebrow eyebrow--dark">Listening room / authenticated</p>
      <h1>Signal desk ready.</h1>
      <p>
        The setup controls and live notification board are warming up in the next stage.
      </p>
    </div>
    <div className="desk-welcome__beacon" aria-hidden="true">
      <span />
    </div>
    <StatusPill tone="waiting">Awaiting setup</StatusPill>
  </section>
);

export const App = () => {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: authApi.session,
  });
  const logout = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      forgetSession();
      queryClient.setQueryData(sessionQueryKey, undefined);
      void queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });

  if (sessionQuery.isPending) return <BootScreen />;

  if (!sessionQuery.data) {
    const connectionError =
      sessionQuery.error instanceof ApiError && sessionQuery.error.status !== 401;
    return (
      <LoginPage
        connectionError={connectionError}
        onAuthenticated={(session: Session) => {
          queryClient.setQueryData(sessionQueryKey, session);
        }}
      />
    );
  }

  return (
    <AppShell onLogout={() => logout.mutate()} loggingOut={logout.isPending}>
      <DeskWelcome />
    </AppShell>
  );
};
