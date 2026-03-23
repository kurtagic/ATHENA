import React, { useEffect } from 'react';
import { AppShell } from './components/layout/AppShell';
import { MainMenu } from './components/menu/MainMenu';
import { BetaGate } from './components/menu/BetaGate';
import { SettingsPage } from './components/settings/SettingsPage';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { initMultiplayerSync } from './multiplayer/syncCoordinator';

const BETA_GATE = import.meta.env.VITE_BETA_GATE === 'true';

export function App() {
  const appView = useAppStore((s) => s.appView);
  const settingsOpen = useSettingsStore((s) => s.settingsOpen);
  const settings = useSettingsStore((s) => s.settings);
  const fetchSettings = useSettingsStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (appView === 'app') {
      initMultiplayerSync();
    }
  }, [appView]);

  if (BETA_GATE && settings && !settings.beta?.code) {
    return (
      <BetaGate
        onVerified={async (code) => {
          await window.athena.setSettings({ beta: { code } });
          fetchSettings();
        }}
      />
    );
  }

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
