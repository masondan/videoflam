// VideoProject store — single source of truth for the Explainer tab
// Phase 1: memory-only (no persistence). Phase 3 will add localStorage + IndexedDB.

export type AspectRatio = '9:16' | '1:1' | '16:9';
export type KenBurnsPreset = 'none' | 'zoom-in' | 'zoom-out';
export type KenBurnsSpeed = 'slow' | 'medium' | 'fast';
export type TransitionPreset = 'none' | 'zoom-in' | 'zoom-out' | 'push-left' | 'push-up';
export type TransitionSpeed = 'slower' | 'normal' | 'faster';

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface VideoPanel {
  id: string;
  text: string;           // Transcription text for this segment
  startTime: number;      // Audio timestamp start (seconds)
  endTime: number;        // Audio timestamp end (seconds)
  imageBlob: Blob | null; // Cropped image, pre-sized to canvas dimensions
  imageSuggestion: string | null;
  words: WordTimestamp[]; // Word-level timestamps for split functionality
}

export interface VideoProject {
  aspectRatio: AspectRatio;
  kenBurns: KenBurnsPreset;
  kenBurnsSpeed: KenBurnsSpeed;  // 'slow' (1%/s) | 'medium' (2%/s) | 'fast' (3%/s)
  transition: TransitionPreset;
  transitionSpeed: TransitionSpeed; // 'slower' | 'normal' | 'faster'
  audio: {
    blob: Blob;
    duration: number;
  } | null;
  panels: VideoPanel[];
  script: string | null;
}

export const CANVAS_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1':  { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

export function createDefaultProject(): VideoProject {
  return {
    aspectRatio: '9:16',
    kenBurns: 'zoom-in',
    kenBurnsSpeed: 'medium',
    transition: 'none',
    transitionSpeed: 'normal',
    audio: null,
    panels: [],
    script: null,
  };
}

/**
 * Generate a unique panel ID
 */
export function generatePanelId(): string {
  return `panel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Flatten Deepgram segments into a single word timeline, then split into panels
 * at sentence-ending punctuation or silence gaps > 0.5s.
 */
export interface DeepgramSegment {
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
}

export function buildPanelsFromSegments(segments: DeepgramSegment[]): VideoPanel[] {
  // Flatten all words from all segments into one timeline
  const allWords: WordTimestamp[] = segments.flatMap(s => s.words ?? []);

  if (allWords.length === 0) return [];

  const panels: VideoPanel[] = [];
  let currentWords: WordTimestamp[] = [];

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    currentWords.push(word);

    const isSentenceEnd = /[.?!]$/.test(word.word.trim());
    const nextWord = allWords[i + 1];
    const silenceGap = nextWord ? nextWord.start - word.end : 0;
    const isLastWord = i === allWords.length - 1;

    if (isSentenceEnd || silenceGap > 0.5 || isLastWord) {
      if (currentWords.length > 0) {
        panels.push({
          id: generatePanelId(),
          text: currentWords.map(w => w.word).join(' '),
          startTime: currentWords[0].start,
          endTime: currentWords[currentWords.length - 1].end,
          imageBlob: null,
          imageSuggestion: null,
          words: [...currentWords],
        });
        currentWords = [];
      }
    }
  }

  return panels;
}

/**
 * Split a panel at a given word index (0-based within the panel's words array).
 * Returns two new panels replacing the original.
 */
export function splitPanel(panel: VideoPanel, splitWordIndex: number): [VideoPanel, VideoPanel] {
  const wordsA = panel.words.slice(0, splitWordIndex);
  const wordsB = panel.words.slice(splitWordIndex);

  const panelA: VideoPanel = {
    id: generatePanelId(),
    text: wordsA.map(w => w.word).join(' '),
    startTime: wordsA[0]?.start ?? panel.startTime,
    endTime: wordsA[wordsA.length - 1]?.end ?? panel.startTime,
    imageBlob: null,
    imageSuggestion: null,
    words: wordsA,
  };

  const panelB: VideoPanel = {
    id: generatePanelId(),
    text: wordsB.map(w => w.word).join(' '),
    startTime: wordsB[0]?.start ?? panel.endTime,
    endTime: wordsB[wordsB.length - 1]?.end ?? panel.endTime,
    imageBlob: null,
    imageSuggestion: null,
    words: wordsB,
  };

  return [panelA, panelB];
}

/**
 * Merge two adjacent panels into one. Image from panelA is kept if assigned.
 */
export function mergePanels(panelA: VideoPanel, panelB: VideoPanel): VideoPanel {
  return {
    id: generatePanelId(),
    text: `${panelA.text} ${panelB.text}`.trim(),
    startTime: panelA.startTime,
    endTime: panelB.endTime,
    imageBlob: panelA.imageBlob ?? panelB.imageBlob,
    imageSuggestion: panelA.imageSuggestion ?? panelB.imageSuggestion,
    words: [...panelA.words, ...panelB.words],
  };
}

/**
 * Render CropData to a blob at the target canvas dimensions.
 * Called in VoiceoverImagesDrawer after ImageCropDrawer returns CropData.
 */
export interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export async function cropDataToBlob(
  imageFile: File | Blob,
  cropData: CropData,
  canvasWidth: number,
  canvasHeight: number
): Promise<Blob> {
  const bitmap = await createImageBitmap(imageFile);
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(
    bitmap,
    cropData.x, cropData.y, cropData.width, cropData.height,
    0, 0, canvasWidth, canvasHeight
  );
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}
