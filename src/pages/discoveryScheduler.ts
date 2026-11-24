import { useEffect } from 'react';
import { useApp } from '../app/AppContext';
import { isDiscoveryDue, runDiscovery } from '../core/ai/discovery';
import { aiGenerate, aiStatus } from '../platform/native';
import { isTauri } from '../platform/env';

/**
 * Periodic discovery (Daily / Weekly). Runs in the main window, which stays alive (hidden) while the app is in the tray.
 * It only creates PENDING suggestions — nothing enters the learning deck without approval.
 */
export function useDiscoveryScheduler() {
  const { db, settings, updateSettings, dataChanged } = useApp();
  useEffect(() => {
    if (!isTauri()) return;
    let running = false;
    const tick = async () => {
      if (running || !isDiscoveryDue(settings['ai.schedule'], settings['ai.lastRunAt'])) return;
      const status = await aiStatus();
      if (!status[settings['ai.provider']]) return;
      running = true;
      try {
        await runDiscovery(
          db,
          {
            topicId: settings['ai.scheduleTopic'],
            count: settings['ai.scheduleCount'],
            provider: settings['ai.provider'],
            model: settings['ai.model'],
            trigger: settings['ai.schedule'] as 'daily' | 'weekly',
          },
          (req) => aiGenerate({ ...req, provider: settings['ai.provider'], model: settings['ai.model'] }),
        );
        dataChanged('ai-suggestions');
      } catch (e) {
        console.warn('scheduled discovery failed', e);
      } finally {
        await updateSettings({ 'ai.lastRunAt': new Date().toISOString() });
        running = false;
      }
    };
    const first = setTimeout(() => void tick(), 60_000);
    const iv = setInterval(() => void tick(), 60 * 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
    };
  }, [db, settings, updateSettings, dataChanged]);
}
