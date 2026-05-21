/**
 * activeTabStore — lets child components (e.g. ExplainerPage) request a tab switch
 * without needing direct access to +page.svelte state.
 *
 * Write a tab name to trigger navigation; +page.svelte consumes and clears it.
 */

import { writable } from 'svelte/store';

export type AppTab = 'subtitle' | 'explainer';

export const activeTabStore = writable<AppTab | null>(null);
