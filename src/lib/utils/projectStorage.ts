/**
 * projectStorage.ts — Explainer project persistence
 *
 * Split strategy (per VIDEO_PLAN.md Phase 3):
 * - localStorage: lightweight metadata only (panel text, timestamps, settings, script)
 * - IndexedDB:    image blobs (keyed by panel ID) + audio blob (keyed by project ID)
 *
 * Never base64-encode blobs into localStorage — triples size, risks 5–10MB limit.
 */

import type {
  VideoProject,
  VideoPanel,
  AspectRatio,
  KenBurnsPreset,
  KenBurnsSpeed,
  TransitionPreset,
  TransitionSpeed,
} from '$lib/stores/videoProject';

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'subflam-explainer-projects';
const IDB_NAME = 'subflam-media';
const IDB_VERSION = 1;
const IDB_STORE = 'blobs';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanelMeta {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  imageSuggestion: string | null;
  words: { word: string; start: number; end: number }[];
  hasImage: boolean; // true if an image blob is stored in IDB for this panel
}

export interface ProjectMeta {
  id: string;
  createdAt: number;   // Unix ms
  updatedAt: number;
  aspectRatio: AspectRatio;
  kenBurns: KenBurnsPreset;
  kenBurnsSpeed: KenBurnsSpeed;
  transition: TransitionPreset;
  transitionSpeed: TransitionSpeed;
  script: string | null;
  audioDuration: number;
  hasAudio: boolean;
  panels: PanelMeta[];
  /** Human-readable label derived from first panel text */
  label: string;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readAllMeta(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ProjectMeta[];
  } catch {
    return [];
  }
}

function writeAllMeta(projects: ProjectMeta[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(projects));
  } catch (e) {
    console.warn('[projectStorage] localStorage write failed:', e);
  }
}

// ─── IDB key helpers ──────────────────────────────────────────────────────────

function audioKey(projectId: string): string {
  return `audio:${projectId}`;
}

function imageKey(projectId: string, panelId: string): string {
  return `img:${projectId}:${panelId}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save (or update) a project. Generates a new ID if none provided.
 * Returns the project ID.
 */
export async function saveProject(
  project: VideoProject,
  existingId?: string
): Promise<string> {
  const id = existingId ?? `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  const db = await openIDB();

  // Write audio blob to IDB
  if (project.audio?.blob) {
    await idbPut(db, audioKey(id), project.audio.blob);
  }

  // Write image blobs to IDB
  for (const panel of project.panels) {
    if (panel.imageBlob) {
      await idbPut(db, imageKey(id, panel.id), panel.imageBlob);
    }
  }

  db.close();

  // Build metadata (no blobs)
  const panelsMeta: PanelMeta[] = project.panels.map(p => ({
    id: p.id,
    text: p.text,
    startTime: p.startTime,
    endTime: p.endTime,
    imageSuggestion: p.imageSuggestion,
    words: p.words,
    hasImage: p.imageBlob !== null,
  }));

  const label = project.panels[0]?.text?.slice(0, 60) ?? 'Untitled project';

  const meta: ProjectMeta = {
    id,
    createdAt: now,
    updatedAt: now,
    aspectRatio: project.aspectRatio,
    kenBurns: project.kenBurns,
    kenBurnsSpeed: project.kenBurnsSpeed,
    transition: project.transition,
    transitionSpeed: project.transitionSpeed,
    script: project.script,
    audioDuration: project.audio?.duration ?? 0,
    hasAudio: project.audio !== null,
    panels: panelsMeta,
    label,
  };

  // Upsert in localStorage list
  const all = readAllMeta();
  const existingIdx = all.findIndex(p => p.id === id);
  if (existingIdx >= 0) {
    all[existingIdx] = { ...meta, createdAt: all[existingIdx].createdAt };
  } else {
    all.unshift(meta); // newest first
  }
  writeAllMeta(all);

  return id;
}

/**
 * Load a full VideoProject from storage (metadata + blobs).
 * Returns null if not found.
 */
export async function loadProject(projectId: string): Promise<VideoProject | null> {
  const all = readAllMeta();
  const meta = all.find(p => p.id === projectId);
  if (!meta) return null;

  const db = await openIDB();

  // Load audio blob
  let audio: VideoProject['audio'] = null;
  if (meta.hasAudio) {
    const blob = await idbGet(db, audioKey(projectId));
    if (blob) {
      audio = { blob, duration: meta.audioDuration };
    }
  }

  // Load panel image blobs
  const panels: VideoPanel[] = await Promise.all(
    meta.panels.map(async (pm): Promise<VideoPanel> => {
      let imageBlob: Blob | null = null;
      if (pm.hasImage) {
        const blob = await idbGet(db, imageKey(projectId, pm.id));
        imageBlob = blob ?? null;
      }
      return {
        id: pm.id,
        text: pm.text,
        startTime: pm.startTime,
        endTime: pm.endTime,
        imageBlob,
        imageSuggestion: pm.imageSuggestion,
        words: pm.words,
      };
    })
  );

  db.close();

  return {
    aspectRatio: meta.aspectRatio,
    kenBurns: meta.kenBurns,
    kenBurnsSpeed: meta.kenBurnsSpeed,
    transition: meta.transition,
    transitionSpeed: (['slower', 'normal', 'faster'] as TransitionSpeed[]).includes(meta.transitionSpeed as TransitionSpeed)
      ? meta.transitionSpeed as TransitionSpeed
      : 'normal',
    audio,
    panels,
    script: meta.script,
  };
}

/**
 * List all saved project metadata (no blobs), newest first.
 */
export function listProjects(): ProjectMeta[] {
  return readAllMeta();
}

/**
 * Load a single image blob from IDB for thumbnail display.
 * Returns an object URL string, or null if not found.
 * Caller is responsible for revoking the URL when done.
 */
export async function loadThumbnailUrl(
  projectId: string,
  panelId: string
): Promise<string | null> {
  try {
    const db = await openIDB();
    const blob = await idbGet(db, imageKey(projectId, panelId));
    db.close();
    if (!blob) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Delete a project and all its blobs from IDB.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const all = readAllMeta();
  const meta = all.find(p => p.id === projectId);

  // Remove from localStorage
  writeAllMeta(all.filter(p => p.id !== projectId));

  if (!meta) return;

  // Remove blobs from IDB
  try {
    const db = await openIDB();
    const keys: string[] = [audioKey(projectId)];
    for (const panel of meta.panels) {
      keys.push(imageKey(projectId, panel.id));
    }
    await Promise.all(keys.map(k => idbDelete(db, k)));
    db.close();
  } catch (e) {
    console.warn('[projectStorage] IDB delete failed:', e);
  }
}

/**
 * Format a Unix ms timestamp as a human-readable date string.
 */
export function formatProjectDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Format seconds as m:ss
 */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
