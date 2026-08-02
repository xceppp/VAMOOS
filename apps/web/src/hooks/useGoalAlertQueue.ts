import { useCallback, useRef, useState } from 'react';
import type { GoalAlertPayload } from '../components/GoalAlertBar';

/** Queue goal bars so a second goal waits until the current bar finishes. */
export function useGoalAlertQueue() {
  const queueRef = useRef<GoalAlertPayload[]>([]);
  const [current, setCurrent] = useState<GoalAlertPayload | null>(null);

  const push = useCallback((alert: GoalAlertPayload) => {
    setCurrent((cur) => {
      if (cur) {
        queueRef.current.push(alert);
        return cur;
      }
      return alert;
    });
  }, []);

  const dismiss = useCallback(() => {
    const next = queueRef.current.shift() ?? null;
    setCurrent(next);
  }, []);

  return { current, push, dismiss };
}
