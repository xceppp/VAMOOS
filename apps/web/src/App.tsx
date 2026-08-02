import { useCallback, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
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

  // Debounce watch updates so starring doesn't hammer the server / UI.
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
            path="/"
            element={
              <LivePage
                matches={matches}
                mode={displayMode}
                isFav={isFav}
                onToggle={toggle}
                pulseId={pulseId}
              />
            }
          />
          <Route
            path="/leagues"
            element={
              <LeaguesPage
                matches={matches}
                isFav={isFav}
                onToggle={toggle}
                pulseId={pulseId}
              />
            }
          />
          <Route
            path="/favorites"
            element={
              <FavoritesPage
                matches={matches}
                favoriteIds={ids}
                isFav={isFav}
                onToggle={toggle}
                pulseId={pulseId}
              />
            }
          />
          <Route
            path="/upcoming"
            element={<UpcomingPage isFav={isFav} onToggle={toggle} />}
          />
          <Route path="/notify" element={<NotifyPage />} />
          <Route path="/settings" element={<Navigate to="/notify" replace />} />
          <Route path="/predictions" element={<PredictionsPage />} />
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
          <Route path="*" element={<Navigate to="/" replace />} />
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
