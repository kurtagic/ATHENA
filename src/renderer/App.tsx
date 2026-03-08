import React, { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { initMultiplayerSync } from './multiplayer/syncCoordinator';

export function App() {
  useEffect(() => {
    initMultiplayerSync();
  }, []);

  return <AppShell />;
}
