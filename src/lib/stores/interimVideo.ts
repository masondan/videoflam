/**
 * Interim video store — passes an explainer-rendered blob to the Subtitle tab
 * without requiring a file download/re-upload cycle.
 *
 * Usage:
 *   ExplainerPage: interimVideoStore.set({ blob, mimeType })
 *   VideoSubtitlePage: interimVideoStore.consume() on mount
 */

import { writable } from 'svelte/store';

export interface InterimVideo {
  blob: Blob;
  mimeType: string;
}

function createInterimVideoStore() {
  const { subscribe, set, update } = writable<InterimVideo | null>(null);

  return {
    subscribe,
    set: (value: InterimVideo | null) => set(value),
    /** Read the current value and immediately clear the store. */
    consume(): InterimVideo | null {
      let value: InterimVideo | null = null;
      update((current) => {
        value = current;
        return null;
      });
      return value;
    },
  };
}

export const interimVideoStore = createInterimVideoStore();
