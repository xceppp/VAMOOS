import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AudioGate } from './components/AudioGate';
import { Layout } from './components/Layout';
import { ToastStack } from './components/ToastStack';
import { useAlertBridge } from './hooks/useAlertBridge';
import { useFavorites } from './hooks/useFavorites';
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

export default function App() {
  const { matches, mode, connected, rateLimited, notice, lastEvent, eventVersion } = useLiveSocket();
  const { ids, toggle, isFav } = useFavorites();
  const { toasts, dismiss, audioGateOpen, enableAudio } = useAlertBridge(
    lastEvent,
    eventVersion,
    matches,
  );

  useEffect(() => {
    void reloadAudioFromDb();
  }, []);

  // Prioritize pulsing favorite matches on the server for near-instant goal alerts.
  useEffect(() => {
    void fetch(apiUrl('/api/watch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matchIds: ids }),
      cache: 'no-store',
    }).catch(() => {});
  }, [ids]);

  const pulseId = lastEvent?.type === 'goal' ? lastEvent.matchId : null;
  const displayMode = mode === 'connecting' ? 'connecting' : mode;

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
