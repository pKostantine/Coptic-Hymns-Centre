import { useCallback, useEffect, useRef, useState } from 'react';

import {
  loadCloudSermonPlan,
  loadLocalSermonPlan,
  saveCloudSermonPlan,
  saveLocalSermonPlan,
} from '@/services/sermonPlannerService';
import type { SermonHighlight, SermonHighlightColor, SermonPlan } from '@/types/sermonPlanner';
import { emptySermonPlan, mergeSermonPlans } from '@/utils/sermonPlanner';

export type SermonPlanSyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export function useSermonPlanner(
  documentKey: string,
  serviceDate: string,
  userId?: string | null,
  enabled = true,
) {
  const identity = `${documentKey}:${serviceDate}:${userId || 'local'}`;
  const [plan, setPlan] = useState<SermonPlan>(() => emptySermonPlan(documentKey, serviceDate));
  const [loadedIdentity, setLoadedIdentity] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SermonPlanSyncStatus>('local');
  const cloudSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setPlan(emptySermonPlan(documentKey, serviceDate));
      setLoadedIdentity(identity);
      setSyncStatus('local');
      return () => { cancelled = true; };
    }
    setLoadedIdentity(null);
    setPlan(emptySermonPlan(documentKey, serviceDate));
    setSyncStatus(userId ? 'syncing' : 'local');

    const load = async () => {
      const local = await loadLocalSermonPlan(documentKey, serviceDate);
      let next = local;
      if (userId) {
        try {
          const cloud = await loadCloudSermonPlan(documentKey, serviceDate);
          next = cloud ? mergeSermonPlans(local, cloud) : local;
          await saveLocalSermonPlan(next);
          if (!cloud || JSON.stringify(next) !== JSON.stringify(cloud)) {
            await saveCloudSermonPlan(userId, next);
          }
          if (!cancelled) setSyncStatus('synced');
        } catch (error) {
          console.warn('Unable to synchronize sermon notes:', error);
          if (!cancelled) setSyncStatus('error');
        }
      }
      if (cancelled) return;
      setPlan(next);
      setLoadedIdentity(identity);
    };

    void load();
    return () => { cancelled = true; };
  }, [documentKey, enabled, identity, serviceDate, userId]);

  useEffect(() => {
    if (!enabled || loadedIdentity !== identity) return;
    void saveLocalSermonPlan(plan);
    if (!userId) {
      setSyncStatus('local');
      return;
    }

    const snapshot = plan;
    const timer = setTimeout(() => {
      setSyncStatus('syncing');
      cloudSaveQueueRef.current = cloudSaveQueueRef.current
        .catch(() => undefined)
        .then(() => saveCloudSermonPlan(userId, snapshot))
        .then(() => setSyncStatus('synced'))
        .catch((error) => {
          console.warn('Unable to save sermon notes:', error);
          setSyncStatus('error');
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [enabled, identity, loadedIdentity, plan, userId]);

  const updatePlan = useCallback((updater: (current: SermonPlan) => SermonPlan) => {
    setPlan((current) => {
      const updatedAt = new Date().toISOString();
      return { ...updater(current), updatedAt };
    });
  }, []);

  const addHighlights = useCallback((highlights: SermonHighlight[]) => {
    if (!highlights.length) return;
    updatePlan((current) => ({ ...current, highlights: [...current.highlights, ...highlights].slice(0, 1000) }));
  }, [updatePlan]);

  const updateHighlight = useCallback((id: string, patch: Partial<Pick<SermonHighlight, 'note' | 'color'>>) => {
    const updatedAt = new Date().toISOString();
    updatePlan((current) => ({
      ...current,
      highlights: current.highlights.map((highlight) => (
        highlight.id === id ? { ...highlight, ...patch, updatedAt } : highlight
      )),
    }));
  }, [updatePlan]);

  const deleteHighlight = useCallback((id: string) => {
    updatePlan((current) => ({
      ...current,
      highlights: current.highlights.filter((highlight) => highlight.id !== id),
    }));
  }, [updatePlan]);

  const setGeneralNotes = useCallback((generalNotes: string) => {
    updatePlan((current) => ({ ...current, generalNotes: generalNotes.slice(0, 100_000) }));
  }, [updatePlan]);

  const setHighlightColor = useCallback((id: string, color: SermonHighlightColor) => {
    updateHighlight(id, { color });
  }, [updateHighlight]);

  return {
    plan,
    ready: loadedIdentity === identity,
    syncStatus,
    addHighlights,
    updateHighlight,
    deleteHighlight,
    setGeneralNotes,
    setHighlightColor,
  };
}
