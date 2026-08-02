import { useEffect, useState } from 'react';
import {
  getNotifySettings,
  subscribeNotify,
  type NotifySettings,
} from '../lib/goalSong';

export function useNotifySettings() {
  const [settings, setSettings] = useState<NotifySettings>(() => getNotifySettings());

  useEffect(() => subscribeNotify(() => setSettings(getNotifySettings())), []);

  return settings;
}
