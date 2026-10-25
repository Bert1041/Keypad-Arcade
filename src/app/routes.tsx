import { Navigate, Route, Routes } from 'react-router-dom';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { GamePlayerScreen } from '@/features/game-player/GamePlayerScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LibraryScreen />} />
      {/* Real URLs per game so a shared link opens straight into play. */}
      <Route path="/play/:gameId" element={<GamePlayerScreen />} />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
