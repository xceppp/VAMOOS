import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AudioGate } from './components/AudioGate';
import { GoalAlertBar } from './components/GoalAlertBar';
import { Layout } from './components/Layout';
import { ToastStack } from './components/ToastStack';
import { useAlertBridge } from './hooks/useAlertBridge';
import { useFavorites } from './hooks/useFavorites';
import { useGoalAlertQueue } from './hooks/useGoalAlertQueue';
import { useLiveSocket } from './hooks/useLiveSocket';
import { apiUrl } from './lib/apiBase';
import { reloadAudioFromDb } from './lib/goalSong';
import { FavoritesPage } from './pages/FavoritesPage';
import { LeaguesPage } from './pages/LeaguesPage';
import { LivePage } from './pages/LivePage';
import { MatchDetailPage } from './pages/MatchDetailPage';
import { NotifyPage } from './pages/NotifyPage';
import { PredictionsPage } from './pages/PredictionsPage';
import { UpcomingPage } from './pages/UpcomingPage';
import { ThemeProvider } from './theme/ThemeProvider';

/** Keep tab pages mounted so revisiting never flashes a loading state. */
function KeepAlivePane({
  active,
  mounted,
  children,
}: {
  active: boolean;
  mounted: boolean;
  children: ReactNode;
}) {
  if (!mounted) return null;
  return (
    <div className="keep-alive-pane" hidden={!active} aria-hidden={!active}>
      {children}
    </div>
  );
}

function TabHost({
  matches,
  displayMode,
  isFav,
  toggle,
  ids,
  pulseId,
}: {
  matches: ReturnType<typeof useLiveSocket>['matches'];
  displayMode: string;
  isFav: (id: number) => boolean;
  toggle: (id: number) => void;
  ids: number[];
  pulseId: number | null;
}) {
  const { pathname } = useLocation();

  const active =
    pathname === '/predictions'
      ? 'predictions'
      : pathname === '/favorites'
        ? 'favorites'
        : pathname === '/upcoming'
          ? 'upcoming'
          : pathname === '/notify' || pathname === '/settings'
            ? 'notify'
            : pathname === '/leagues' || pathname.startsWith('/leagues/')
              ? 'leagues'
              : 'live';

  const [mounted, setMounted] = useState({
    live: true,
    predictions: false,
    favorites: false,
    upcoming: false,
    notify: false,
    leagues: false,
  });

  useEffect(() => {
    setMounted((m) => {
      if (m[active as keyof typeof m]) return m;
      return { ...m, [active]: true };
    });
  }, [active]);

  return (
    <>
      <KeepAlivePane active={active === 'live'} mounted={mounted.live}>
        <LivePage
          matches={matches}
          mode={displayMode}
          isFav={isFav}
          onToggle={toggle}
          pulseId={pulseId}
        />
      </KeepAlivePane>
      <KeepAlivePane active={active === 'predictions'} mounted={mounted.predictions}>
        <PredictionsPage />
      </KeepAlivePane>
      <KeepAlivePane active={active === 'favorites'} mounted={mounted.favorites}>
        <FavoritesPage
          matches={matches}
          favoriteIds={ids}
          isFav={isFav}
          onToggle={toggle}
          pulseId={pulseId}
        />
      </KeepAlivePane>
      <KeepAlivePane active={active === 'upcoming'} mounted={mounted.upcoming}>
        <UpcomingPage isFav={isFav} onToggle={toggle} />
      </KeepAlivePane>
      <KeepAlivePane active={active === 'notify'} mounted={mounted.notify}>
        <NotifyPage />
      </KeepAlivePane>
      <KeepAlivePane active={active === 'leagues'} mounted={mounted.leagues}>
        <LeaguesPage
          matches={matches}
          isFav={isFav}
          onToggle={toggle}
          pulseId={pulseId}
        />
      </KeepAlivePane>
    </>
  );
}

function AppRoutes() {
  const navigate = useNavigate();
  const { matches, mode, connected, rateLimited, notice, lastEvent, eventVersion } = useLiveSocket();
  const { ids, toggle, isFav } = useFavorites();
  const goalQueue = useGoalAlertQueue();
  const { toasts, dismiss, audioGateOpen, enableAudio } = useAlertBridge(
    lastEvent,
    eventVersion,
    matches,
    goalQueue.push,
  );

  useEffect(() => {
    void reloadAudioFromDb();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(apiUrl('/api/watch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchIds: ids }),
        cache: 'no-store',
      }).catch(() => {});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ids]);

  const pulseId = lastEvent?.type === 'goal' ? lastEvent.matchId : null;
  const displayMode = mode === 'connecting' ? 'connecting' : mode;

  const onGoalTap = useCallback(
    (alert: { matchId: number }) => {
      goalQueue.dismiss();
      navigate('/');
      window.setTimeout(() => {
        const el = document.getElementById(`match-${alert.matchId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.classList.add('match-card--pulse');
        window.setTimeout(() => el?.classList.remove('match-card--pulse'), 1200);
      }, 50);
    },
    [goalQueue, navigate],
  );

  return (
    <>
      <GoalAlertBar
        alert={goalQueue.current}
        onDismiss={goalQueue.dismiss}
        onTap={onGoalTap}
      />
      <Layout
        mode={displayMode}
        connected={connected}
        rateLimited={rateLimited}
        notice={notice}
      >
        <Routes>
          <Route
            path="/match/:id"
            element={
              <MatchDetailPage
                liveMatches={matches}
                isFav={isFav}
                onToggle={toggle}
              />
            }
          />
          <Route path="/settings" element={<Navigate to="/notify" replace />} />
          <Route
            path="*"
            element={
              <TabHost
                matches={matches}
                displayMode={displayMode}
                isFav={isFav}
                toggle={toggle}
                ids={ids}
                pulseId={pulseId}
              />
            }
          />
        </Routes>
      </Layout>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <AudioGate open={audioGateOpen} onEnable={enableAudio} />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
}
