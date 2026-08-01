import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RadioTower } from 'lucide-react';

import {
  ApiError,
  authApi,
  forgetSession,
  setupApi,
  type Session,
  type SetupStatus,
} from './api/client.js';
import { AppShell } from './components/AppShell.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { DeliveriesPage } from './pages/DeliveriesPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { PostsPage } from './pages/PostsPage.js';
import { SetupPage } from './pages/SetupPage.js';

const sessionQueryKey = ['auth', 'session'] as const;

const BootScreen = () => (
  <main className="boot-screen" aria-live="polite">
    <div className="boot-screen__beacon" aria-hidden="true">
      <RadioTower size={28} />
    </div>
    <p className="eyebrow">Tuning the signal desk</p>
  </main>
);

export const App = () => {
  const queryClient = useQueryClient();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setPathname(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const sessionQuery = useQuery({
    queryKey: sessionQueryKey,
    queryFn: authApi.session,
  });
  const setupQuery = useQuery({
    queryKey: ['setup'],
    queryFn: setupApi.status,
    enabled: Boolean(sessionQuery.data),
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

  if (setupQuery.isPending) return <BootScreen />;

  if (setupQuery.isError || !setupQuery.data) {
    return (
      <AppShell onLogout={() => logout.mutate()} loggingOut={logout.isPending}>
        <section className="desk-error" role="alert">
          <p className="eyebrow eyebrow--dark">Signal interrupted</p>
          <h1>The setup state could not be loaded.</h1>
          <p>Check the server connection, then try again.</p>
          <button type="button" onClick={() => void setupQuery.refetch()}>
            Retry connection
          </button>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell
      onLogout={() => logout.mutate()}
      loggingOut={logout.isPending}
      {...(setupQuery.data.complete ? { pathname, onNavigate: navigate } : {})}
    >
      {setupQuery.data.complete ? (
        pathname === '/posts' ? (
          <PostsPage />
        ) : pathname === '/deliveries' ? (
          <DeliveriesPage />
        ) : (
          <DashboardPage onNavigate={navigate} />
        )
      ) : (
        <SetupPage
          setup={setupQuery.data}
          onSetupChanged={(status: SetupStatus) => {
            queryClient.setQueryData(['setup'], status);
          }}
        />
      )}
    </AppShell>
  );
};
