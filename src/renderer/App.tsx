import React, { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { MainMenu } from './components/menu/MainMenu';
import { SettingsPage } from './components/settings/SettingsPage';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { initMultiplayerSync } from './multiplayer/syncCoordinator';

export function App() {
  const appView = useAppStore((s) => s.appView);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);

  useEffect(() => {
    if (appView === 'app') {
      initMultiplayerSync();
    }
  }, [appView]);

  if (appView === 'menu') {
    return (
      <>
        <MainMenu />
        {settingsOpen && <SettingsPage />}
      </>
    );
  }

  return <AppShell />;
}
