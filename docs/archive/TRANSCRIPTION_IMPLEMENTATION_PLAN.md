# AudioFlam Transcription Implementation Plan

**Version:** 1.0  
**Scope:** Add Transcribe tab with Xenova/Whisper base, multilingual support  
**Tech Stack:** SvelteKit, Transformers.js (@xenova/transformers), Tailwind CSS  
**Style Guide:** AudioFlam design system (src/app.css), existing component patterns  
**Reference Mockups:** See `/info/all.png` - Mock-ups 1, 2, 3, 4

---

## CRITICAL PREREQUISITES FOR AGENT

**BEFORE WRITING ANY CODE:**

1. **Study the mockups in `/info/all.png`:**
   - Mock-up 1: Initial upload cluster state (three buttons: Upload, URL, Record)
   - Mock-up 2: Recording interface (mic button active, countdown, live waveform, trim handles)
   - Mock-up 3: Waveform trimmer state (loaded audio, purple Transcribe button, Language & Settings dropdown)
   - Mock-up 4: Transcription complete state (transcript window, Copy/Download buttons, word count)

2. **Study existing AudioFlam components for style consistency:**
   - `src/lib/components/AudiogramPage.svelte` - layout structure, button styling, panels
   - `src/lib/components/CompositionCanvas.svelte` - waveform rendering, trim handles
   - `src/lib/components/WaveformPanel.svelte` - collapsible panel pattern (reuse for Language & Settings)
   - `src/app.css` - design tokens: colors, spacing, typography, transitions

3. **Icon inventory (new icons in static/icons/):**
   - `icon-transcribe.svg` - nav button (primary color, same size as mic/waveform icons)
   - `icon-link.svg` - URL input button
   - `icon-checkbox-blank.svg` - inactive checkbox (grey #777777)
   - `icon-checkbox-fill.svg` - active checkbox (purple #5422b0)
   - `icon-copy.svg` - Copy button
   - `icon-download.svg` - Download button
   - `icon-upload.svg` - existing, reuse for Upload button
   - `icon-mic.svg` - existing, reuse for Record button

4. **Design system enforcement:**
   - Primary color: `--accent-brand` (#5422b0)
   - Text primary: `--text-primary` (#1f1f1f)
   - Text secondary: `--text-secondary` (#777777)
   - Background: `--bg-main` (#efefef), `--bg-white` (#ffffff)
   - Border color: `--color-border` (#e0e0e0)
   - Active border: `--color-border-active` (#999999)
   - Spacing: Use `--spacing-*` scale (xs/sm/md/lg/xl)
   - Border radius: `--radius-md` (8px), `--radius-lg` (12px)
   - All buttons use existing ButtonBase patterns from AudiogramPage

---

## PHASE 1: COMPONENT EXTRACTION (Foundation)
*Prerequisite: Ensure robustness by creating reusable components used by both Audiogram and Transcribe*

### Task 1.1: Extract `AudioRecorder.svelte`
**File:** `src/lib/components/AudioRecorder.svelte`

**Purpose:** Encapsulate recording logic so both AudiogramPage and TranscribePage use identical implementation.

**Extract from:** `src/lib/components/AudiogramPage.svelte`

**What to extract:**
- Recording state machine (idle → recording → trimming)
- MediaRecorder setup and audio context creation
- Live waveform visualization during recording (canvas-based, real-time FFT)
- Countdown timer (elapsed time display)
- Mic button (active/pulsing state, icon: `icon-mic.svg`)
- Cancel button (stops recording, discards audio, returns to initial state)
- Max duration validation and enforcement (60 minutes)
- Audio blob generation and AudioBuffer decoding

**Component API:**

```typescript
// Props
interface AudioRecorderProps {
  maxDuration?: number; // Default: 3600 (seconds), Max: 3600
}

// Emitted events
// event:recordingComplete → { audioBlob: Blob, audioBuffer: AudioBuffer, duration: number }
// event:cancelled → void
```

**Critical visual requirements (from Mock-up 2):**
- Mic button: Icon in center, purple (#5422b0) filled circle background
- When active: Pulsing animation (opacity 0.6 → 1.0)
- Countdown timer: Centered above mic button, format HH:MM:SS
- Live waveform: Below mic button, full width, animated in real-time, same style as Audiogram
- Cancel (X) button: Top right of waveform area

**Implementation notes:**
- Reuse `MediaRecorder` setup from AudiogramPage
- Reuse canvas waveform rendering logic (use AnalyserNode.getByteFrequencyData)
- NO state outside component (pass all props, emit all events)
- Match AudiogramPage's recording UI layout exactly

**Status Check:** Both AudiogramPage and TranscribePage must use this identically.

---

### Task 1.2: Extract `WaveformTrimmer.svelte`
**File:** `src/lib/components/WaveformTrimmer.svelte`

**Purpose:** Encapsulate waveform display and trimming logic for both Audiogram and Transcribe.

**Extract from:** `src/lib/components/CompositionCanvas.svelte` (waveform rendering logic) + AudiogramPage (trim controls)

**What to extract:**
- Waveform canvas rendering (uses precomputed FFT frames from `src/lib/utils/waveform.ts`)
- Trim handles (left/right, drag-to-adjust, visual feedback)
- Play button (plays trimmed audio segment)
- Back/Forward buttons (seek ±5 sec, same icons as Audiogram)
- Delete button (clears audio, emits delete event)
- Current playback position indicator (vertical line on waveform)
- Duration display (total length: MM:SS)
- Optional timestamps overlay (hidden by default, shown when enabled)

**Component API:**

```typescript
// Props
interface WaveformTrimmerProps {
  audioBuffer: AudioBuffer;
  isEditable?: boolean; // Default: true (allow trimming)
  showTimestamps?: boolean; // Default: false
  maxDuration?: number; // Display-only, no enforcement
}

// Emitted events
// event:trimmedRangeChange → { start: number, end: number, duration: number }
// event:delete → void
// event:playbackPositionChange → { currentTime: number }
```

**Critical visual requirements (from Mock-up 3):**
- Waveform canvas: Full width, fixed height ~120px, dark background
- Trim handles: Vertical draggable bars on left/right edges, thick (8px), purple color on hover
- Play button: Icon in center of waveform, purple circle, centered vertically
- Back/Forward buttons: Left/right of Play button, same style as Audiogram
- Delete button: Below waveform, left-aligned, red icon or "Delete" text
- Duration display: Right-aligned, below waveform (MM:SS format)

**Implementation notes:**
- Reuse precomputed FFT frame rendering from `waveform.ts:precomputeFrequencyFrames()`
- Reuse canvas composition logic (no synthetic sine-wave generation)
- Handle trim range validation (start < end, within audio bounds)
- Support timestamp rendering overlay (word-level if available)

**Status Check:** Waveform must look pixel-perfect identical in Audiogram and Transcribe.

---

### Task 1.3: Update `AudiogramPage.svelte`
**File:** `src/lib/components/AudiogramPage.svelte`

**Change:** Refactor to use new `AudioRecorder` and `WaveformTrimmer` components.

**Before (current state):**
- Recording logic inline
- Waveform trimming inline
- Both scattered across file

**After:**
```svelte
<script>
  import AudioRecorder from './AudioRecorder.svelte';
  import WaveformTrimmer from './WaveformTrimmer.svelte';
  
  let recordingState = 'idle'; // 'idle' | 'recording' | 'trimming'
  let audioBuffer: AudioBuffer | null = null;
  
  function handleRecordingComplete(event) {
    audioBuffer = event.detail.audioBuffer;
    recordingState = 'trimming';
  }
  
  function handleDelete() {
    recordingState = 'idle';
    audioBuffer = null;
  }
</script>

{#if recordingState === 'idle' || recordingState === 'recording'}
  <AudioRecorder on:recordingComplete={handleRecordingComplete} />
{/if}

{#if recordingState === 'trimming'}
  <WaveformTrimmer {audioBuffer} on:delete={handleDelete} />
{/if}
```

**Regression testing:**
- [ ] Audiogram recording works as before
- [ ] Waveform trimming works as before
- [ ] Audio playback works as before
- [ ] No visual changes to Audiogram UI
- [ ] No performance degradation

---

## PHASE 2: TRANSCRIPTION CORE LOGIC
*Implement Whisper transcription engine and model management*

### Task 2.1: Create Transcription Utility
**File:** `src/lib/utils/transcription.ts`

**Purpose:** Centralized transcription logic including model loading, caching, and transcription execution.

**Type definitions:**

```typescript
export interface TranscriptionOptions {
  multilingualEnabled: boolean;
  quantized: boolean;
  language: string; // 'auto' or ISO 639-1 code (e.g., 'yo', 'ha', 'en')
}

export interface WhisperConfig {
  modelName: string; // 'Xenova/whisper-base.en' or 'Xenova/whisper-base'
  quantized: boolean;
}

export interface TranscriptionProgress {
  stage: 'downloading' | 'loaded' | 'transcribing' | 'complete';
  text: string; // Partial transcript
  progress: number; // 0-100 for progress indication
}
```

**Exported functions:**

```typescript
/**
 * Load Whisper model based on options.
 * Handles caching to avoid re-downloading.
 * 
 * @param options - Multilingual and quantization settings
 * @param onProgress - Callback for load progress (downloading, loaded)
 * @returns Whisper pipeline ready for transcription
 */
export async function loadWhisperModel(
  options: TranscriptionOptions,
  onProgress?: (stage: string) => void
): Promise<any>

/**
 * Transcribe audio blob using loaded Whisper pipeline.
 * Streams partial results in real-time.
 * 
 * @param audioBlob - Audio file to transcribe
 * @param pipeline - Loaded Whisper pipeline
 * @param language - ISO 639-1 language code or 'auto'
 * @param onProgress - Callback with partial transcript text
 * @returns Full transcript string
 */
export async function transcribeAudio(
  audioBlob: Blob,
  pipeline: any,
  language: string,
  onProgress?: (partialText: string) => void
): Promise<string>

/**
 * Get list of supported languages with display names.
 */
export const SUPPORTED_LANGUAGES: Record<string, string> = {
  'auto': 'Auto-detect language',
  'en': 'English',
  'yo': 'Yoruba',
  'ha': 'Hausa',
  'fr': 'French',
  // ... include all 99 languages from Whisper
}

/**
 * Calculate word count from transcript text.
 */
export function getWordCount(text: string): number
```

**Critical implementation details:**

1. **Model selection logic:**
   - If `multilingualEnabled: false` → Use `Xenova/whisper-base.en`
   - If `multilingualEnabled: true` → Use `Xenova/whisper-base`
   - Both support `quantized: true/false` flag

2. **Model caching:**
   - Store loaded pipeline in `whisperPipelineStore` (created in Phase 2.2)
   - On second transcription, reuse cached pipeline (no redownload)
   - If user changes multilingual/quantized, release old pipeline and load new one
   - Release pipeline on app unload to free memory

3. **Progress callbacks:**
   - `onProgress('downloading')` → Model file downloading from Hugging Face
   - `onProgress('loaded')` → Model ready, transcription starting
   - `onProgress(partialText)` → Real-time partial transcript (stream chunks)

4. **Error handling:**
   - Catch network errors (model download fails) → Throw with message "Failed to download model"
   - Catch OOM errors → Throw with message "Not enough memory for transcription"
   - Catch audio decode errors → Throw with message "Unable to process audio file"
   - Timeout errors (>60 seconds) → Throw with message "Transcription taking too long"

5. **Language parameter:**
   - If `language: 'auto'` → Whisper auto-detects
   - If `language: 'yo'` → Forces Yoruba transcription
   - If `language: 'ha'` → Forces Hausa transcription
   - Whisper language codes: ISO 639-1 standard

---

### Task 2.2: Create Transcription Store
**File:** `src/lib/stores.ts` (append to existing file)

**Add new stores:**

```typescript
import { writable } from 'svelte/store';

/**
 * Main transcription state
 */
export const transcriptionStore = writable({
  transcript: '',
  wordCount: 0,
  isLoading: false,
  isModelLoaded: false,
  error: null as string | null,
  stage: 'idle' as 'idle' | 'downloading' | 'transcribing' | 'complete',
});

/**
 * User settings (persist across sessions if desired)
 */
export const transcriptionSettingsStore = writable({
  multilingualEnabled: false,
  quantized: true, // Default: optimized for file size
  selectedLanguage: 'auto',
  showTimestamps: false,
});

/**
 * Cached Whisper pipeline (in-memory, released on unload)
 */
export const whisperPipelineStore = writable<any>(null);

/**
 * Current model configuration (reflects what's loaded)
 */
export const whisperConfigStore = writable({
  modelName: 'Xenova/whisper-base.en',
  quantized: true,
  loadedAt: 0, // Timestamp for cache invalidation
});
```

**Usage in components:**

```svelte
<script>
  import { transcriptionStore, transcriptionSettingsStore } from '$lib/stores';
  
  $transcriptionStore.transcript // Access transcript
  $transcriptionSettingsStore.multilingualEnabled // Access settings
</script>
```

---

### Task 2.3: Implement Timestamp Generation (Optional Feature)
**File:** `src/lib/utils/transcription.ts` (extend Task 2.1)

**Add function:**

```typescript
/**
 * Add timestamps to transcript.
 * Called only if user enables "Add timestamps" checkbox.
 * 
 * Format: [HH:MM:SS] Text content
 * 
 * @param transcript - Raw Whisper output
 * @param segments - Segment data from Whisper (contains timing info)
 * @returns Formatted transcript with timestamps
 */
export function addTimestampsToTranscript(
  transcript: string,
  segments: any[]
): string {
  // Whisper returns segments with start/end times
  // Format: [00:15] Hello world [00:20] Next sentence
  // Implementation: Reconstruct from segment boundaries
}
```

**Implementation notes:**
- Whisper response includes `response_format: 'verbose_json'` with segment data
- Extract `start` and `end` timestamps from each segment
- Format as `[HH:MM:SS]` prefix for each segment
- User sees formatted text in transcript window
- Download includes timestamps if checkbox was enabled

---

## PHASE 3: UI COMPONENTS
*Build Transcribe page matching mockup specifications and AudioFlam design system*

### Task 3.1: Create `TranscribePage.svelte`
**File:** `src/lib/components/TranscribePage.svelte`

**Purpose:** Main container for transcription workflow, state management.

**Reference:** Mock-ups 1, 2, 3, 4 (all states)

**State machine:**

```
IDLE (Mock-up 1)
  ↓ (user selects audio)
RECORDING (Mock-up 2)
  ↓ (recording completes)
TRIMMING (Mock-up 3, waveform shown)
  ↓ (user clicks Transcribe)
TRANSCRIBING (Mock-up 4, spinner + partial text)
  ↓ (transcription completes)
COMPLETE (Mock-up 4, full transcript + Copy/Download)
  ↓ (user clicks Delete or selects new audio)
IDLE
```

**Component structure:**

```svelte
<script>
  import AudioInputCluster from './AudioInputCluster.svelte';
  import AudioRecorder from './AudioRecorder.svelte';
  import WaveformTrimmer from './WaveformTrimmer.svelte';
  import LanguageSettings from './LanguageSettings.svelte';
  import TranscribeButton from './TranscribeButton.svelte';
  import TranscriptWindow from './TranscriptWindow.svelte';
  import CopyDownloadButtons from './CopyDownloadButtons.svelte';
  import ErrorMessage from './ErrorMessage.svelte'; // For inline errors
  
  import { transcriptionStore, transcriptionSettingsStore, whisperPipelineStore } from '$lib/stores';
  import { loadWhisperModel, transcribeAudio } from '$lib/utils/transcription';
  
  let state = 'idle'; // 'idle' | 'recording' | 'trimming' | 'transcribing' | 'complete'
  let audioBlob: Blob | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let trimmedStart = 0;
  let trimmedEnd = 0;
  
  // State transitions
  async function handleAudioSelected(event) {
    audioBlob = event.detail;
    // Decode to AudioBuffer
    audioBuffer = await decodeAudio(audioBlob);
    state = 'trimming';
  }
  
  async function handleRecordingComplete(event) {
    audioBlob = event.detail.audioBlob;
    audioBuffer = event.detail.audioBuffer;
    state = 'trimming';
  }
  
  async function handleDelete() {
    state = 'idle';
    audioBlob = null;
    audioBuffer = null;
    transcriptionStore.set({ transcript: '', wordCount: 0, error: null });
  }
  
  async function handleTranscribe() {
    state = 'transcribing';
    try {
      const options = {
        multilingualEnabled: $transcriptionSettingsStore.multilingualEnabled,
        quantized: $transcriptionSettingsStore.quantized,
        language: $transcriptionSettingsStore.selectedLanguage
      };
      
      // Load model (cached on second call)
      let pipeline = $whisperPipelineStore;
      if (!pipeline) {
        pipeline = await loadWhisperModel(options, (stage) => {
          transcriptionStore.update(s => ({ ...s, stage }));
        });
        whisperPipelineStore.set(pipeline);
      }
      
      // Transcribe
      const transcript = await transcribeAudio(audioBlob, pipeline, options.language, (partial) => {
        transcriptionStore.update(s => ({ ...s, transcript: partial }));
      });
      
      transcriptionStore.update(s => ({
        ...s,
        transcript,
        wordCount: getWordCount(transcript),
        stage: 'complete'
      }));
      
      state = 'complete';
    } catch (error) {
      transcriptionStore.update(s => ({ ...s, error: error.message }));
    }
  }
</script>

<!-- STATE: IDLE (Mock-up 1) -->
{#if state === 'idle'}
  <AudioInputCluster on:fileSelected={handleAudioSelected} on:recordClick={() => state = 'recording'} />
{/if}

<!-- STATE: RECORDING (Mock-up 2) -->
{#if state === 'recording'}
  <AudioRecorder on:recordingComplete={handleRecordingComplete} on:cancelled={() => state = 'idle'} />
{/if}

<!-- STATE: TRIMMING (Mock-up 3) -->
{#if state === 'trimming'}
  <WaveformTrimmer {audioBuffer} on:delete={handleDelete} on:trimmedRangeChange={(e) => {
    trimmedStart = e.detail.start;
    trimmedEnd = e.detail.end;
  }} />
  
  <TranscribeButton on:click={handleTranscribe} />
  
  <LanguageSettings />
{/if}

<!-- STATE: TRANSCRIBING (Mock-up 4) -->
{#if state === 'transcribing'}
  <TranscriptWindow transcript={$transcriptionStore.transcript} loading={true} />
{/if}

<!-- STATE: COMPLETE (Mock-up 4) -->
{#if state === 'complete'}
  <TranscriptWindow transcript={$transcriptionStore.transcript} editable={true} showTimestamps={$transcriptionSettingsStore.showTimestamps} wordCount={$transcriptionStore.wordCount} />
  <CopyDownloadButtons transcript={$transcriptionStore.transcript} />
{/if}

<!-- Error display -->
{#if $transcriptionStore.error}
  <ErrorMessage message={$transcriptionStore.error} />
{/if}
```

---

### Task 3.2: Create `AudioInputCluster.svelte`
**File:** `src/lib/components/AudioInputCluster.svelte`

**Reference:** Mock-up 1 (initial state)

**Visual specification from mockup:**
```
┌─────────────────────────────────────────┐
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Upload     [↑ icon]              │  │ ← Dashed border
│  └───────────────────────────────────┘  │
│                                         │
│  ┌──────────────────┐ ┌──────────────┐  │
│  │  URL   [🔗 icon] │ │Record [🎤]   │  │
│  └──────────────────┘ └──────────────┘  │
│                                         │
│  Helper text below:                     │
│  "Upload audio or video, load from      │
│   link or record your voice to          │
│   transcribe. Multiple languages        │
│   supported"                            │
│                                         │
└─────────────────────────────────────────┘
```

**Implementation details:**

1. **Upload button:**
   - Dashed border (#e0e0e0), 2px dashed
   - Icon: `icon-upload.svg` (existing)
   - Label: "Upload"
   - Drag-and-drop enabled (onChange and drop handlers)
   - Accepted formats: .mp3, .wav, .mp4, .m4a, .flac, .ogg
   - Max file size: 500MB (browser limit for Whisper)

2. **URL button:**
   - Solid border (#e0e0e0)
   - Icon: `icon-link.svg` (new)
   - Label: "URL"
   - On click: Open URLInputModal

3. **Record button:**
   - Solid border (#e0e0e0)
   - Icon: `icon-mic.svg` (existing)
   - Label: "Record"
   - On click: Emit event to parent (TranscribePage) to switch to 'recording' state

4. **Helper text (below cluster):**
   - Color: `--text-secondary` (#777777)
   - Font size: `--font-size-base`
   - Line height: `--line-height-normal` (1.5)
   - Centered, max-width for readability
   - Text: "Upload audio or video, load from link or record your voice to transcribe. Multiple languages supported"

5. **Error message (below helper text):**
   - Color: #d32f2f (red)
   - Font size: `--font-size-sm`
   - Appears only on invalid file type
   - Text: "Invalid file type. Use MP3, WAV or MP4."
   - Clear on successful selection

**File validation:**

```typescript
const ACCEPTED_FORMATS = [
  'audio/mpeg',     // MP3
  'audio/wav',      // WAV
  'audio/mp4',      // MP4 audio
  'audio/m4a',      // M4A
  'audio/flac',     // FLAC
  'audio/ogg',      // OGG
  'video/mp4',      // MP4 video
];

function validateFile(file: File): { valid: boolean; error?: string } {
  if (!ACCEPTED_FORMATS.includes(file.type)) {
    return { valid: false, error: 'Invalid file type. Use MP3, WAV or MP4.' };
  }
  if (file.size > 500 * 1024 * 1024) {
    return { valid: false, error: 'File too large. Maximum 500MB.' };
  }
  return { valid: true };
}
```

**Component API:**

```typescript
// Emitted events
// event:fileSelected → { detail: Blob }
// event:recordClick → void
```

---

### Task 3.3: Create `URLInputModal.svelte`
**File:** `src/lib/components/URLInputModal.svelte`

**Reference:** Mock-up 1 (triggered by URL button)

**Visual specification:**
```
┌─────────────────────────────────────────┐
│ (Modal overlay, white background)       │
│                                         │
│ Add URL of audio or video               │ ← Label
│ ┌─────────────────────────────────────┐ │
│ │ Paste link here...            [paste]│ │ ← Input
│ └─────────────────────────────────────┘ │
│                                         │
│ [Cancel]                    [Load]      │ ← Buttons
│                                         │
└─────────────────────────────────────────┘
```

**Implementation details:**

1. **Modal styling:**
   - Background: Semi-transparent overlay (rgba(0,0,0,0.5))
   - Modal box: `--bg-white` (#ffffff)
   - Border radius: `--radius-lg` (12px)
   - Max width: 500px, centered on screen
   - Padding: `--spacing-lg` (20px)

2. **Input field:**
   - Placeholder: "Paste link here..."
   - Type: URL validation (basic regex or URL object)
   - Focus state: Border color `--color-border-active`

3. **Buttons:**
   - Cancel: Secondary style (outlined, grey)
   - Load: Primary style (purple, `--accent-brand`)
   - Disabled state: If URL empty or invalid

4. **Error display:**
   - Below input, color #d32f2f
   - Text: "Invalid URL or unsupported format"

5. **Behavior:**
   - Escape key closes modal
   - Click outside modal closes modal
   - On successful Load: Fetch URL, convert to Blob, emit fileSelected event

**Component API:**

```typescript
// Emitted events
// event:fileSelected → { detail: Blob }
// event:close → void
```

---

### Task 3.4: Create `LanguageSettings.svelte`
**File:** `src/lib/components/LanguageSettings.svelte`

**Reference:** Mock-up 3 (Language & Settings dropdown)

**Visual specification from mockup:**

```
[Text only: Language & Settings ▼]  ← Collapsed (no border, just text + chevron)

When expanded:
┌─────────────────────────────────────────────┐
│ ☑ Optimise for Speed                        │
│   Smaller file size. Slightly less          │
│   accurate.                                 │
│                                             │
│ ☐ Multilingual support                      │
│   Enable for non-English audio              │
│                                             │
│ [When multilingual checked:]                │
│                                             │
│ Language                                    │
│ ┌───────────────────────────────────────┐   │
│ │ Auto-detect language              ▼  │   │
│ │ Afrikaans                             │   │
│ │ Albanian                              │   │
│ │ Amharic                               │   │
│ │ ... (99 languages total)              │   │
│ │ ... Yoruba (yo)                       │   │
│ │ ... Hausa (ha)                        │   │
│ └───────────────────────────────────────┘   │
│                                             │
│ ☐ Add timestamps                            │
│   [00:15] Text [00:20] More text           │
│                                             │
└─────────────────────────────────────────────┘
```

**Implementation details:**

1. **Collapsed state:**
   - Label: "Language & Settings" (text only, no border)
   - Icon: Chevron-down (points down when collapsed, right when expanded)
   - Color: `--text-primary`
   - Cursor: pointer

2. **Expanded state (collapsible panel):**
   - Background: `--bg-white` or very pale background
   - Border: None
   - Padding: `--spacing-md`
   - Border radius: `--radius-md`
   - Margin top: `--spacing-md`

3. **Checkbox 1: "Optimise for Speed"**
   - Checked by default (quantized model)
   - Icon when ON: `icon-checkbox-fill.svg` (purple #5422b0)
   - Icon when OFF: `icon-checkbox-blank.svg` (grey #777777)
   - Helper text: "Smaller file size. Slightly less accurate."
   - Helper text color: `--text-secondary`
   - Helper text font size: `--font-size-sm`

4. **Checkbox 2: "Multilingual support"**
   - Unchecked by default
   - Same icon style as above
   - Helper text: "Enable for non-English audio"
   - Reveals Language dropdown only when checked

5. **Language dropdown (conditional - shows only if multilingual checked):**
   - Label: "Language" (above dropdown)
   - Dropdown background: Solid pale grey (#efefef), NO border
   - Dropdown header text: Selected language (default: "Auto-detect language")
   - Dropdown list: 99 languages (from SUPPORTED_LANGUAGES in transcription.ts)
   - First option: "Auto-detect language" (always available)
   - Language order: Alphabetical, with Yoruba and Hausa included
   - Z-index: Higher than parent container (can overflow)
   - Selection: Click to select, dropdown closes

6. **Checkbox 3: "Add timestamps" (optional)**
   - Unchecked by default
   - Helper text: "[00:15] Text [00:20] More text"
   - When checked: Timestamps appear in transcript during/after transcription
   - When unchecked: Transcript shows text only
   - Does NOT re-transcribe (just toggles display)

7. **Dropdown close behavior:**
   - Click outside dropdown → Closes
   - Click on language → Closes and selects
   - Escape key → Closes
   - Focus loss → Closes

**Component API:**

```typescript
// Subscribes to transcriptionSettingsStore
// Updates settings in store when changed
// No props or events needed (store-driven)
```

**Style reference:** Use `WaveformPanel.svelte` pattern for collapsible panel (icon + label + expandable content).

---

### Task 3.5: Create `TranscribeButton.svelte`
**File:** `src/lib/components/TranscribeButton.svelte`

**Reference:** Mock-up 3 and Mock-up 4

**Visual specification:**

```
When audio loaded (Mock-up 3):
┌─────────────────────────────────┐
│      [purple] Transcribe        │  ← Full width, purple (#5422b0)
└─────────────────────────────────┘

When transcribing - First time (Mock-up 4):
┌─────────────────────────────────┐
│  [⟳] Starting engine            │  ← Spinner + text
└─────────────────────────────────┘

When transcribing - Subsequent times:
┌─────────────────────────────────┐
│  [⟳] Transcribing               │  ← Spinner + text
└─────────────────────────────────┘

When transcribing - Error (timeout):
Below button, inline error:
"This is taking too long. Try again"
(Color: #d32f2f red, font-size: sm)
```

**Implementation details:**

1. **Button styling:**
   - Background color: `--accent-brand` (#5422b0)
   - Full width
   - Padding: `--spacing-md` vertical, `--spacing-lg` horizontal
   - Border radius: `--radius-md`
   - Font weight: `--font-weight-medium`
   - Hover: Slightly darker shade or opacity change
   - Active/click: Visual feedback (scale down 0.98)

2. **Spinner (loading state):**
   - Use Tailwind spinner (`animate-spin`)
   - Color: white or light grey (match text color)
   - Size: 20px
   - Display inline with text

3. **State progression:**
   - Initial: "Transcribe" (static text)
   - On click: Check if model loaded
     - If NOT loaded: Display "[⟳] Starting engine" for duration of model download
     - If model loaded: Display "[⟳] Transcribing" immediately
   - On complete: Revert to "Transcribe"

4. **Error timeout:**
   - If transcription > 60 seconds: Show error below button
   - Error text: "This is taking too long. Try again"
   - Error color: #d32f2f
   - Error font size: `--font-size-sm`
   - Allow user to click button again to retry (no user action needed to dismiss)

5. **Button state:**
   - Always clickable (after audio loaded)
   - Disabled: Only if audio not loaded yet (greyed out)
   - NOT disabled during transcription (user can theoretically click again, but prevents duplicate)

**Component API:**

```typescript
// Props
interface TranscribeButtonProps {
  disabled?: boolean; // Disabled if no audio loaded
  stage?: 'idle' | 'starting' | 'transcribing'; // Controls spinner/text
}

// Emitted events
// event:click → void
```

---

### Task 3.6: Create `TranscriptWindow.svelte`
**File:** `src/lib/components/TranscriptWindow.svelte`

**Reference:** Mock-up 4 (transcript display area)

**Visual specification from mockup:**

```
┌────────────────────────────────────────────┐
│ [Transcript text with paragraph spacing]   │        Word count: 1,247
│                                            │ (right-aligned)
│ The audio was transcribed and text        │
│ displays here with proper line breaks.    │
│                                            │
│ [Speaker A] If user added labels, they   │
│ appear formatted.                         │
│                                            │
│ ☐ Add timestamps                          │ (left-aligned, below text)
│   [Optional: shows timestamps when        │
│    user checks box]                       │
│                                            │
└────────────────────────────────────────────┘
```

**Implementation details:**

1. **Transcript display:**
   - Container: `--bg-white` (#ffffff) background, `--radius-lg` border
   - Padding: `--spacing-lg`
   - Border: Thin border (`--color-border`)
   - Min height: 200px (for empty state while loading)
   - Font: Monospace or readable serif
   - Line height: `--line-height-relaxed` (1.8 for readability)
   - Preserve paragraph breaks (whitespace)
   - Text color: `--text-primary`

2. **Editable mode (when complete):**
   - Textarea element (not just text display)
   - Same styling as display mode
   - User can add "[Speaker A]:" labels manually
   - Text is fully editable (spelling corrections, etc.)
   - On edit: Update `transcriptionStore.transcript`

3. **Loading state (during transcription):**
   - Show spinner/skeleton
   - Display partial text as it arrives (real-time streaming)
   - Clear placeholder: "Transcription starting..."

4. **Word count (right-aligned, above transcript):**
   - Text: "Word count: [number]"
   - Color: `--text-secondary`
   - Font size: `--font-size-sm`
   - Position: Top-right of transcript window
   - Update in real-time as transcript grows

5. **Add timestamps checkbox (below transcript):**
   - Icon: `icon-checkbox-blank.svg` or fill based on state
   - Label: "Add timestamps"
   - Helper text: "[00:15] Text [00:20] More text"
   - When checked: Show timestamps in transcript (if available)
   - When unchecked: Hide timestamps (keep underlying data)
   - Does NOT re-transcribe

6. **Timestamp formatting (if enabled):**
   - Format: `[HH:MM:SS]` prefix on each segment
   - Example:
     ```
     [00:00] Hello everyone, welcome to the press conference.
     [00:08] Today we'll discuss new policy initiatives.
     [00:15] Minister will give opening remarks.
     ```
   - Timestamps included in download if enabled

**Component API:**

```typescript
// Props
interface TranscriptWindowProps {
  transcript: string;
  editable?: boolean; // Default: false (display mode)
  loading?: boolean; // Default: false (show spinner while true)
  showTimestamps?: boolean; // Default: false
  wordCount?: number; // Display word count
}

// Emitted events
// event:transcriptChange → { detail: string } (if editable)
```

---

### Task 3.7: Create `CopyDownloadButtons.svelte`
**File:** `src/lib/components/CopyDownloadButtons.svelte`

**Reference:** Mock-up 4 (bottom action buttons)

**Visual specification from mockup:**

```
        [Copy]  [Download]
    (Centered, two buttons side-by-side)
```

**Implementation details:**

1. **Button layout:**
   - Two buttons, centered horizontally
   - Gap between buttons: `--spacing-md`
   - Margin top: `--spacing-lg`

2. **Copy button:**
   - Icon: `icon-copy.svg` (new)
   - Label: "Copy"
   - Color: Purple (#5422b0)
   - On click: Copy transcript to clipboard
   - Feedback: Toast notification "Copied" (brief, 2-second duration)
   - Visual effect: Button text changes momentarily to "Copied!" or shows checkmark

3. **Download button:**
   - Icon: `icon-download.svg` (new)
   - Label: "Download"
   - Color: Purple (#5422b0)
   - On click: Generate and download .txt file
   - Filename: `transcription_[YYYY-MM-DD_HH-MM].txt`
   - File content: Transcript text (with timestamps if enabled)

4. **Copy feedback:**
   - Toast notification (use existing toast component from AudioFlam if available)
   - Message: "Copied to clipboard"
   - Duration: 2 seconds
   - Position: Bottom-center or top-center (consistent with app)

5. **Button states:**
   - Both buttons always active after transcription complete
   - Hover: Slightly darker shade
   - Click: Scale down (0.98) for tactile feedback

**Component API:**

```typescript
// Props
interface CopyDownloadButtonsProps {
  transcript: string;
  includeTimestamps?: boolean; // Default: false
}
```

---

## PHASE 4: NAVIGATION & ROUTING
*Integrate Transcribe tab into main application navigation*

### Task 4.1: Update Navigation Header
**File:** `src/routes/+page.svelte` (root layout)

**Reference:** Existing nav implementation for TTS and Audiogram tabs

**Changes:**
1. Add Transcribe button to right nav area (far right, after Audiogram)
2. Icon: `icon-transcribe.svg` (new, primary color)
3. Size: Match existing nav icons (32x32 or similar)
4. Click handler: Toggle to Transcribe tab state

**Navigation bar layout (left to right):**
```
[AudioFlam Logo]  [Spacer]  [TTS icon]  [Audiogram icon]  [Transcribe icon]
```

**Icon styling:**
- Inactive: Grey (#999999)
- Active: Purple (#5422b0)
- Hover: Lighter shade
- Transition: `--transition-normal` (200ms ease)

---

### Task 4.2: Add Transcribe Route (Optional)
**File:** `src/routes/transcribe/+page.svelte` (new file, optional)

**If app uses tab routing:**
```svelte
<script>
  import TranscribePage from '$lib/components/TranscribePage.svelte';
</script>

<TranscribePage />
```

**If app uses state-based tabs:**
- Add 'transcribe' to tab state in `+page.svelte`
- Render `<TranscribePage />` when tab === 'transcribe'

---

## PHASE 5: ERROR HANDLING & VALIDATION
*Implement robust error states and user feedback*

### Task 5.1: File Format Validation
**Location:** `AudioInputCluster.svelte`

**Acceptable MIME types:**
```typescript
const ACCEPTED_FORMATS = {
  'audio/mpeg': ['mp3'],
  'audio/wav': ['wav'],
  'audio/mp4': ['mp4'],
  'audio/m4a': ['m4a'],
  'audio/flac': ['flac'],
  'audio/ogg': ['ogg'],
  'video/mp4': ['mp4'],
};
```

**Validation rules:**
1. Check file MIME type against whitelist
2. Check file extension against whitelist
3. Check file size < 500MB
4. If invalid: Show inline error "Invalid file type. Use MP3, WAV or MP4."

**Validation UI:**
- Error appears below Upload cluster
- Color: #d32f2f (red)
- Font size: `--font-size-sm`
- Clear on successful selection

---

### Task 5.2: Transcription Error Handling
**Location:** `TranscribePage.svelte` and `transcription.ts`

**Error scenarios and messages:**

| Scenario | Error Message | Display Location | Recovery |
|----------|---------------|------------------|----------|
| Model download fails | "Failed to load transcription engine. Check internet connection and try again." | Inline, below Transcribe button | Retry button |
| Model download timeout (>60s) | "This is taking too long. Try again" | Inline, below Transcribe button | Retry button |
| Audio file too large for browser | "File too large. Try a shorter audio clip (max 30 min)." | Inline, below Transcribe button | User selects new file |
| Unsupported audio format | "Unsupported format. Use MP3, WAV or MP4." | Below Upload cluster | User selects new file |
| Out of memory (OOM) | "Not enough memory. Try a shorter audio or close other apps." | Inline, below button | Retry or select shorter file |
| Network error (URL load) | "Unable to load URL. Check the link and try again." | Modal, below input | Retry in modal |
| Transcription fails | "Transcription failed. Try again with different settings." | Inline, below button | Retry button |

**Error display component:**

Create `ErrorMessage.svelte`:
```svelte
<script>
  export let message = '';
  export let type = 'error'; // 'error' | 'warning' | 'info'
</script>

<div class="error-message" class:type>
  {message}
</div>

<style>
  .error-message {
    color: #d32f2f;
    font-size: var(--font-size-sm);
    margin-top: var(--spacing-md);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: #ffebee;
    border-radius: var(--radius-sm);
  }
</style>
```

---

### Task 5.3: Timeout Protection
**Location:** `transcription.ts`

**Implementation:**
- Set timeout on model download: 120 seconds (2 minutes)
- Set timeout on transcription: 300 seconds per minute of audio (e.g., 60-min audio = 5 min timeout)
- If timeout exceeded: Throw error with message "This is taking too long. Try again"
- Provide retry mechanism (user clicks Transcribe button again)

---

## PHASE 6: TESTING CHECKPOINTS
*Validate functionality and visual consistency at each phase*

### Checkpoint 6.1: Component Extraction
**Target:** Ensure AudioRecorder and WaveformTrimmer work in both Audiogram and Transcribe

- [ ] AudiogramPage still functions identically (no visual/functional regression)
- [ ] TranscribePage can use AudioRecorder for recording
- [ ] TranscribePage can use WaveformTrimmer for audio editing
- [ ] Waveform display matches pixel-perfectly in both tabs
- [ ] Record UI matches exactly in both tabs
- [ ] Audio playback/seeking works in both

**Test environment:** Local dev, Chrome/Firefox/Safari

---

### Checkpoint 6.2: Whisper Integration
**Target:** Model loading, caching, and basic transcription work correctly

- [ ] English model (`Xenova/whisper-base.en`) loads successfully
- [ ] Multilingual model (`Xenova/whisper-base`) loads successfully
- [ ] Quantized vs. unquantized flag switches models correctly
- [ ] Model caches after first download (2nd transcription faster)
- [ ] Model release on app unload (no memory leak)
- [ ] Language selection affects transcription correctly
- [ ] Auto-detect language works without explicit selection
- [ ] Timeout protection triggered after 2 minutes of no progress

**Test environment:** Desktop Chrome (monitor Network tab for model downloads)

---

### Checkpoint 6.3: Transcription Quality
**Target:** Transcription output matches expectations for accents and languages

**Test audio samples:**
1. English press conference (clear, professional audio)
2. Yoruba native speaker (for Yoruba accuracy test)
3. Hausa native speaker (for Hausa accuracy test)
4. Mixed English + Yoruba (code-switching test)
5. Background noise (robustness test)

**Acceptance criteria:**
- [ ] English: ≥85% accuracy (WER ≤15%)
- [ ] Yoruba: Transcribed when language selected or auto-detect enabled
- [ ] Hausa: Transcribed when language selected or auto-detect enabled
- [ ] Code-switching: Mixed English/Yoruba transcribed correctly
- [ ] Timestamps: Appear when checkbox enabled, match audio timing
- [ ] Word count: Accurate count of words in transcript

**Test environment:** Desktop + Android device (60-min audio processing)

---

### Checkpoint 6.4: UI/UX & Visual Consistency
**Target:** Mockups matched exactly, AudioFlam design system enforced

**Visual checks:**
- [ ] Mock-up 1 (initial state): Upload cluster matches, dashed border correct, spacing correct
- [ ] Mock-up 2 (recording): Mic button styling correct, countdown visible, waveform animating
- [ ] Mock-up 3 (waveform + settings): Waveform trimmer matches Audiogram, Language dropdown styled correctly
- [ ] Mock-up 4 (transcription): Spinner displays, transcript flows with paragraph spacing, Copy/Download buttons centered
- [ ] All colors: Primary (#5422b0), text (#1f1f1f), secondary (#777777), borders (#e0e0e0)
- [ ] All spacing: Consistent with --spacing-* tokens
- [ ] All icons: Correct icons in correct positions
- [ ] All typography: Font sizes, weights, line heights match system

**Test environment:** Desktop (Chrome, Safari) + Mobile (iOS Safari, Android Chrome)

---

### Checkpoint 6.5: Interaction & Feedback
**Target:** Button actions, error messages, toast notifications work smoothly

- [ ] Copy button: Copies transcript, shows "Copied" toast
- [ ] Download button: Generates .txt file with correct filename and content
- [ ] Timestamps checkbox: Toggles timestamps without re-transcribing
- [ ] Language dropdown: Opens/closes smoothly, selection updates model
- [ ] Multilingual checkbox: Toggles language dropdown visibility
- [ ] Quantized checkbox: Changes loading time on next transcription
- [ ] Error messages: Appear in correct locations, clear on successful action
- [ ] Spinner: Displays "Starting engine" on first use, "Transcribing" on subsequent
- [ ] Timeout error: Shows after 60s transcription with retry option

**Test environment:** Local dev, all browsers

---

### Checkpoint 6.6: Edge Cases & Robustness
**Target:** App handles unusual inputs and network conditions gracefully

- [ ] 60-minute audio: Loads and transcribes without crash
- [ ] Very small file (10s): Processes and displays transcript
- [ ] Invalid file type: Rejected with error message
- [ ] Slow network: Model download shows progress, user doesn't get stuck
- [ ] Session persistence: Close Transcribe tab, reopen, audio/transcript still there
- [ ] Memory management: App doesn't consume excessive RAM during/after transcription
- [ ] Android device (low RAM): Doesn't crash on 60-min audio with multilingual model
- [ ] Multiple rapid transcriptions: No race conditions, order preserved

**Test environment:** Desktop + Android (8GB/4GB RAM), throttled network

---

## PHASE 7: DOCUMENTATION & POLISH
*Finalize code quality, accessibility, performance*

### Task 7.1: Code Documentation
**Location:** Each file in Phase 3

Add JSDoc comments to all exported functions:

```typescript
/**
 * Load Whisper transcription model based on user settings.
 * 
 * Handles model caching to avoid re-downloading on subsequent calls.
 * Shows progress feedback for long downloads.
 * 
 * @param {TranscriptionOptions} options - Multilingual and quantization settings
 * @param {Function} onProgress - Callback for download progress ('downloading' | 'loaded')
 * @returns {Promise<any>} Loaded Whisper pipeline ready for transcription
 * @throws {Error} If model download fails or network error occurs
 * 
 * @example
 * const pipeline = await loadWhisperModel(
 *   { multilingualEnabled: true, quantized: true, language: 'auto' },
 *   (stage) => console.log(`Stage: ${stage}`)
 * );
 */
export async function loadWhisperModel(options, onProgress) { ... }
```

---

### Task 7.2: Accessibility (a11y)
**Location:** All UI components

**Keyboard navigation:**
- [ ] Language dropdown: Arrow keys to navigate, Enter to select, Escape to close
- [ ] All buttons: Tab-focusable, Enter/Space to activate
- [ ] Checkboxes: Tab-focusable, Space to toggle
- [ ] Error messages: Announced with `aria-live="polite"`

**Screen reader support:**
- [ ] Buttons: `aria-label` for icon-only buttons (e.g., "Record audio")
- [ ] Checkboxes: `aria-label` or associated `<label>` element
- [ ] Dropdowns: `aria-expanded`, `aria-haspopup`, `role="listbox"`
- [ ] Error messages: Wrapped in `<div role="alert">`
- [ ] Loading state: `aria-busy="true"` on button during transcription

**Example:**
```svelte
<button aria-label="Record audio" on:click={startRecording}>
  <img src="/icons/icon-mic.svg" alt="" />
</button>
```

---

### Task 7.3: Performance Optimization
**Location:** All components

1. **Lazy-load Whisper model:**
   - Don't download model until user clicks Transcribe
   - Show "Starting engine" while downloading
   - Don't preload on app init (saves bandwidth for users who don't transcribe)

2. **Debounce word count updates:**
   - Don't recalculate on every character
   - Debounce with 500ms delay

3. **Cache language list:**
   - Generate SUPPORTED_LANGUAGES once, not per render
   - Store in constant or Svelte store

4. **Optimize waveform rendering:**
   - Use OffscreenCanvas if available (offload to worker)
   - Limit redraws during playback (RAF throttling)

5. **Memory cleanup:**
   - Release AudioBuffer after transcription complete
   - Release WebAudio context on unload
   - Clear transcript on tab switch if desired

---

### Task 7.4: Browser Compatibility
**Target:** Works on all major browsers used in journalist workflow

- [ ] Chrome/Edge (latest): Full support
- [ ] Firefox (latest): Full support
- [ ] Safari (latest): Full support
- [ ] Android Chrome: Full support, test on low-RAM device
- [ ] iOS Safari: Test recording functionality (limited microphone access)

**Known limitations to document:**
- iOS Safari: Recording may require HTTPS (localhost works)
- Firefox: Some WebCodecs features may differ
- Safari: Older versions may not support some WebGL features

---

## IMPLEMENTATION ORDER (Recommended Timeline)

### Week 1: Foundation
- Phase 1: Component Extraction (Task 1.1, 1.2, 1.3)
  - ✅ Checkpoint 6.1 (Audiogram still works)
- Phase 2: Transcription Core (Task 2.1, 2.2, 2.3)
  - ✅ Checkpoint 6.2 (Whisper loads and transcribes)

### Week 2: UI Components
- Phase 3: UI Components (Task 3.1–3.7)
  - Build in order: 3.2 (input), 3.3 (URL modal), 3.4 (settings), 3.5 (button), 3.6 (transcript), 3.7 (actions)
  - 3.1 (main page) ties together all others
  - ✅ Checkpoint 6.4 (Mockups matched, visual consistency)
  - ✅ Checkpoint 6.5 (Interactions smooth)

### Week 3: Integration & Testing
- Phase 4: Navigation & Routing (Task 4.1, 4.2)
  - Add Transcribe button to nav
  - ✅ Checkpoint 6.6 (Edge cases, robustness)
- Phase 5: Error Handling (Task 5.1, 5.2, 5.3)
  - Validation and timeout protection
- Phase 6: Testing (All checkpoints)
  - Desktop + mobile testing
  - Accuracy testing with sample audio
- Phase 7: Polish (Task 7.1–7.4)
  - Documentation, a11y, optimization, browser support

---

## SUCCESS CRITERIA (Final Acceptance)

✅ **Functionality:**
- Journalists can import audio from file, URL, or live recording
- Audio is transcribed in <5 minutes (60-min press conference)
- Transcription works in English, Yoruba, Hausa, and code-switched audio
- Editable transcript with optional speaker labels
- .txt download includes optional timestamps
- Copy button works with toast feedback
- Works offline after model cache (subsequent transcriptions need no download)
- Zero API costs (fully local processing)

✅ **User Experience:**
- Mockups 1-4 followed exactly
- UI matches AudioFlam design system (colors, spacing, typography)
- AudioRecorder and WaveformTrimmer reused from Audiogram (consistency)
- Error messages clear and actionable
- Mobile-responsive (tested on Android and iOS)
- Keyboard navigation accessible

✅ **Code Quality:**
- Reusable components (no code duplication)
- Comprehensive error handling
- Well-documented functions
- No memory leaks
- Tested on Chrome, Firefox, Safari, mobile browsers

---

## NOTES FOR AGENT

1. **Mockups are authoritative:** If mockup contradicts anything in this plan, follow mockup.

2. **Component reuse is critical:** Extract AudioRecorder and WaveformTrimmer BEFORE building Transcribe tab. Saves time and prevents bugs.

3. **Style consistency:** Check `AudiogramPage.svelte` and `CompositionCanvas.svelte` for examples of button styling, waveform rendering, panel patterns. Replicate exactly.

4. **Icon sizing:** Ensure icons are same size as existing nav icons (check Chrome DevTools).

5. **Test early:** Don't wait until Phase 6 to test. Test each component as you build.

6. **On Android, test low-RAM scenarios:** Use Chrome DevTools memory profiling to watch for leaks.

---

**Plan ready for execution. Good luck!**
