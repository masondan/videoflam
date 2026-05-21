# VIDEO_PLAN.md — Explainer Video Tab for SubFlam

---

## 🚀 HANDOFF NOTE

**Branch:** `feature/explainer-video` has been created and is ready for Phase 1 implementation.

**What's ready:**
- Complete design specification (data model, component architecture, export pipeline)
- Phase 1 scope clearly defined (core pipeline: upload audio → transcription → panel cards → assign images → export MP4)
- All gotchas and patterns documented for implementation

**How to proceed:**
1. Start with Phase 1 steps (see "Phased Implementation" section below)
2. Test end-to-end on Android Chrome and iOS Safari before moving to Phase 2
3. This branch can be cancelled anytime by staying on `main` — no breaking changes to existing SubFlam features

**Questions?** Refer to "Known Gotchas for Implementation Agent" section at the end of this document.

---

**Purpose:** Implementation plan for a new Explainer Video tab within the existing SubFlam web app (SvelteKit 2 + Svelte 5, Cloudflare Pages).
**Status:** Pre-development — design complete, ready for phased build
**Last Updated:** May 2026

---

## Overview

This plan adds an Explainer Video tab to SubFlam. The tab allows a journalist to combine a voiceover (recorded or uploaded) with images to produce a timed explainer video, where image display duration is driven by audio transcription timestamps. The output is an MP4 (or WebM fallback) that can then be opened in SubFlam's existing Subtitle tab for captioning.

The feature is built as a new tab within SubFlam's existing component architecture, reusing the WebCodecs export pipeline, Deepgram transcription endpoint, canvas compositor, and (the currently unused) `ImageCropDrawer.svelte`.

---

## Core Principles

- **Mobile-first, no-server:** All rendering is client-side via WebCodecs (Android/Desktop) or MediaRecorder + cloud transcode fallback (iOS). No new server infrastructure.
- **Timeline-free editing:** The journalist never sees or manipulates a timeline. Image timing is derived from transcription, not manually set.
- **One drawer, one job:** The combined Voiceover & Images drawer is the only editing space. Script is optional and lives in its own drawer.
- **Reuse before rebuild:** Deepgram transcription, WebCodecs export, canvas compositor, ImageCropDrawer — all exist. Wire them, don't rewrite them.

---

## Data Model

This is the single source of truth flowing between all drawers and the encoder. Define as a Svelte writable store.

```typescript
// src/lib/stores/videoProject.ts

type AspectRatio = '9:16' | '1:1' | '16:9';
type KenBurnsPreset = 'none' | 'zoom-in' | 'zoom-out';
type TransitionPreset = 'none' | 'zoom-in' | 'zoom-out';

interface VideoPanel {
  id: string;
  text: string;           // Transcription text for this segment
  startTime: number;      // Audio timestamp start (seconds)
  endTime: number;        // Audio timestamp end (seconds)
  imageBlob: Blob | null; // Cropped image, pre-sized to canvas dimensions
  imageSuggestion: string | null; // Populated from script generator (optional)
}

interface VideoProject {
  aspectRatio: AspectRatio;
  kenBurns: KenBurnsPreset;
  kenBurnsSpeed: number;     // 0.5 (slow) to 2.0 (fast), default 1.0
  transition: TransitionPreset;
  transitionSpeed: number;   // 0.5 to 2.0, default 1.0
  audio: {
    blob: Blob;
    duration: number;
  } | null;
  panels: VideoPanel[];
  script: string | null;     // Plain text script, shared with Recording Drawer
}
```

### Project persistence (Phase 1–3)

**Phase 1–2:** No persistence — projects live in memory only (`$state`). On page reload, the project is cleared. This keeps Phase 1 implementation focused on the core pipeline without storage overhead.

**Phase 3 (Archive page):** Full persistence via **localStorage + IndexedDB split:**
- **localStorage:** Stores only lightweight metadata (panel IDs, text, timestamps, aspect ratio, Ken Burns/transition settings, script text, audio metadata). Approx 5–10KB per project.
- **IndexedDB:** Stores image blobs (keyed by panel ID) and audio blob. Approx 200–400KB per image, no practical size limit. One IndexedDB store: `subflam-media`, indexed by panel ID.

This avoids base64 inflation (which would triple blob size) and respects the 5–10MB localStorage limit shared with other SubFlam features.

**Helper functions needed in Phase 3:**
```typescript
async function saveProject(project: VideoProject): Promise<void> {
  // Write metadata to localStorage, write blobs to IndexedDB
}
async function loadProject(projectId: string): Promise<VideoProject | null> {
  // Read metadata from localStorage, load blobs from IndexedDB
}
```

### Canvas dimensions per aspect ratio

| Ratio | Width | Height |
|-------|-------|--------|
| 9:16  | 1080  | 1920   |
| 1:1   | 1080  | 1080   |
| 16:9  | 1920  | 1080   |

All images must be cropped and downscaled to these dimensions before storage. This happens in the crop overlay at import time.

---

## Tab Structure

The new tab sits alongside Subtitle and Title in the existing tab navigation. Working name during development: **Explainer** (not VidFlam — that is a later phase rename decision).

New files to create:

```
src/lib/components/
├── ExplainerPage.svelte          # Main tab container
├── explainer/
│   ├── ScriptDrawer.svelte       # Optional script generator
│   ├── VoiceoverImagesDrawer.svelte  # Combined voiceover + image assignment
│   ├── RecordingDrawer.svelte    # Full-screen recording with script display
│   ├── PanelCard.svelte          # Individual panel card (text + image bar)
│   └── KenBurnsPreview.svelte    # Animated CSS thumbnails for KB selector

src/lib/stores/
└── videoProject.ts               # Project state store

src/lib/utils/
└── explainer-export.ts           # Canvas compositor for explainer video
```

Reused without modification:
- `src/routes/api/transcribe-deepgram/+server.ts` — same transcription endpoint
- `src/lib/utils/webcodecs-export.ts` — same WebCodecs encoder
- `src/lib/utils/video-export.ts:smartExportVideo()` — same export orchestration
- `src/lib/components/ImageCropDrawer.svelte` — same crop overlay (currently unused)

---

## Dashboard (ExplainerPage.svelte)

### Layout (top to bottom, mobile)

```
┌─────────────────────────────────┐
│           [Header]              │
├─────────────────────────────────┤
│  [9:16]   [1:1]   [16:9]  [Archive icon] │
├─────────────────────────────────┤
│   Need a script? Start here →   │  ← text button, subdued style
├─────────────────────────────────┤
│       [Voiceover & Images]      │  ← primary CTA button (dominant)
│  completion state: waveform icon + green tick when done │
├─────────────────────────────────┤
│      [Transitions]  dropdown    │
│      [Pan & Zoom]   dropdown    │
├─────────────────────────────────┤
│         Preview window          │  ← appears only when panels + audio exist
│     (resizes to aspect ratio)   │
│         ▶ / ■  progress bar     │
├─────────────────────────────────┤
│         [Download]              │
├─────────────────────────────────┤
│         [New project]           │
└─────────────────────────────────┘
```

### Completion states

- **Voiceover:** Button shows audio waveform icon (from existing icon set) + green check when `project.audio !== null`
- **Images:** Button shows count label e.g. "3 / 5 images" when panels exist but not all images assigned; green check when all panels have `imageBlob`
- **Preview window:** Hidden until `project.audio !== null && project.panels.some(p => p.imageBlob !== null)`

### Incomplete images modal

Triggered when user taps Download and not all panels have images:

> **Heads up:** You have 2 of 5 images assigned. Add more, or adjust your voiceover.
> [Cancel] [Got it — download anyway]

"Download anyway" renders blank (black) frames for unassigned panels.

### Transitions dropdown

Options: None (default) · Zoom In · Zoom Out
Each option has a small CSS-animated thumbnail (looping, plays on tap).
Below options: Speed slider (Slow ←→ Fast).

### Pan & Zoom dropdown

Options: None · Zoom In · Zoom Out
Each option has a small CSS-animated thumbnail (see KenBurnsPreview.svelte).
Below options: Speed slider (Slow ←→ Fast).

**Ken Burns implementation note:** Pure canvas interpolation — no WebGL library required in V1. Each preset is a named easing function applied to `ctx.drawImage()` source rect across frames. See explainer-export.ts spec below.

---

## Script Drawer (ScriptDrawer.svelte)

Full-screen drawer. Optional — accessed via "Need a script? Start here" text button.

### Layout

```
┌─────────────────────────────────┐
│ [✕]     Script Generator    [Done] │
├─────────────────────────────────┤
│ Audience                        │
│ [Who are you writing for?]      │
├─────────────────────────────────┤
│ Topic / Question                │
│ [What's the story?]             │
├─────────────────────────────────┤
│ Duration  [30s] [1 min] [2 min] │
├─────────────────────────────────┤
│        [Generate Script]        │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ Script (editable)           │ │
│ │                             │ │
│ │                  [word count]│ │
│ └─────────────────────────────┘ │
│ [Copy icon]   [Regenerate]      │
│ [Add to recording notes →]      │  ← text button; writes to store
├─────────────────────────────────┤
│ Image suggestions               │
│ ┌─────────────────────────────┐ │
│ │ (suggestions appear here)   │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### API: Gemini Flash

Use `gemini-2.0-flash` via a new SvelteKit API route: `src/routes/api/generate-script/+server.ts`. This keeps the Gemini API key server-side using the existing `$env/dynamic/private` pattern — no separate Cloudflare Worker needed.

**System prompt starter (refine during build):**

```
You are helping a journalist create a short explainer video script.
Write in clear, plain language. Use the inverted pyramid: most important information first.
Do not editorialize or express opinions. Write as if for broadcast — short sentences, active voice.
Avoid jargon unless the audience requires it.
Separate image suggestions from the script. Return JSON with two keys:
- "script": the narration text as a single string
- "imageSuggestions": an array of strings, one per visual beat, describing what image to source
Do not include any markdown formatting, preamble, or explanation outside the JSON.
```

**Script drawer does not connect to panels.** Image suggestions stay in the Script drawer. The journalist uses the script to guide their own image sourcing. The "Add to recording notes" button writes `script` text to the `videoProject` store for the Recording Drawer to read.

---

## Voiceover & Images Drawer (VoiceoverImagesDrawer.svelte)

Combined full-screen drawer. This is the primary editing space.

### Layout

```
┌─────────────────────────────────┐
│ [✕]  Voiceover & Images   [Save] │
├─────────────────────────────────┤
│  [Upload audio]  [Record]       │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │  ← slim audio player, appears after upload/record
│  │ ▶  ──────────────── 0:42  │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  [Transcribing... spinner]      │  ← shown during Deepgram call
├─────────────────────────────────┤
│  Panel cards (scroll)           │
│  ┌──────────────────────────┐   │
│  │ 0.0s – 4.2s        SPLIT │   │
│  │ "This is the first..."   │   │
│  │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄[img]┄┄┄ │   │  ← dashed bar, image icon
│  └──────────────────────────┘   │
│           ⊕ (merge)             │  ← between cards
│  ┌──────────────────────────┐   │
│  │ 4.2s – 8.5s        SPLIT │   │
│  │ "And the next section..." │   │
│  │ ┄┄ 1 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄[✕]┄ │   │  ← green bar: image assigned, number + delete
│  └──────────────────────────┘   │
│           ⊕ (merge)             │
│  ... more panels ...            │
└─────────────────────────────────┘
```

### Audio upload/record

- **Upload:** File picker (MP3, M4A, WAV, MP4 audio) → stored as blob → slim player appears
- **Record:** Opens RecordingDrawer.svelte (see below) → on Save, recording blob returned → treated identically to upload

### Transcription → panel generation

On audio load (upload or recording return):
1. POST audio blob to `/api/transcribe-deepgram` (existing endpoint, existing format)
2. Receive `{ segments: [{ start, end, text, words: [...] }] }`
3. **Flatten and re-split:** Concatenate the `words[]` arrays from all segments into a single timeline, then split into panels at:
   - Sentence-ending punctuation (`.`, `?`, `!`) detected in word text
   - Silence gaps > 0.5s between consecutive words (detected from `nextWord.start - currentWord.end`)
4. Each panel = `{ id, text, startTime, endTime, imageBlob: null, imageSuggestion: null }` where `startTime`/`endTime` come directly from word timestamps
5. Render panel cards

**Important:** The Deepgram endpoint already segments words server-side (max 8 words, 0.4s pause threshold). Do not re-segment the returned `segments[]` — instead, treat them as a convenience grouping and work with the flattened `words[]` array.

### Panel card: image assignment

Tapping the dashed bar (or image icon) on a card:
1. Opens native file picker (image files)
2. On file select: `ImageCropDrawer.svelte` opens with `currentRatio` prop set to `project.aspectRatio`
   - Crop border locked to the selected ratio (no free-form crop)
   - User pinch/drag to frame crop; `touch-action: none` prevents parent scroll interference
   - On confirm: returns `CropData = { x, y, width, height, scale }`
3. **In VoiceoverImagesDrawer (not in ImageCropDrawer):** Render `CropData` to an offscreen canvas:
   - Use `createImageBitmap()` to crop the image source
   - Draw to a target canvas (1080×1920, 1080×1080, or 1920×1080 per aspect ratio)
   - `canvas.toBlob('image/jpeg', 0.85)` to produce the final blob
   - Store blob in panel's `imageBlob` field
4. Dashed bar → green bar with card number (1, 2, 3...) + delete [✕] icon
5. Delete [✕] sets `imageBlob: null`, bar returns to dashed state

**Touch event note:** `ImageCropDrawer.svelte` already uses `touch-action: none` and `e.preventDefault()` for pinch handling. No additional gotchas.

### Panel card: split and merge

Matches the existing "Edit Subtitles" pattern in SubFlam (see screenshot in conversation):
- **SPLIT** label (top right of card): tapping opens word-tap split modal — user taps the word at which to split, two new cards created at that word's timestamp boundary
- **⊕ button** (between cards): merges the card above with the card below into one panel

### Audio playback during editing

A small play button sits above the panel cards (or within the slim player). During playback, the currently active panel card is highlighted with a subtle border/background change, based on `currentTime` vs panel `startTime`/`endTime`. This lets the journalist verify splits before assigning images. Uses the same audio element approach as the subtitle editor.

### Save behaviour

Tapping Save:
1. If any panels have no image assigned: show modal — "X of Y images assigned. Continue or go back?"
2. On confirm: write `project.panels` to store, close drawer, return to dashboard
3. Dashboard preview window activates if at least one image is assigned

---

## Recording Drawer (RecordingDrawer.svelte)

Full-screen drawer, opened from the [Record] button in VoiceoverImagesDrawer.

```
┌─────────────────────────────────┐
│ [✕]   Recording notes           │
│ [Paste or push script here]     │  ← pre-filled if script exists in store
│ Text size: [−] [+]              │
│                                 │
│ (scrollable script text)        │
│                                 │
│                                 │
├─────────────────────────────────┤
│  ●  ━━━━━━━━━━━━━━━━━━━  0:00   │  ← record button + waveform/timer
│       [Review] [Save]           │  ← shown after recording stops
└─────────────────────────────────┘
```

### Behaviour

- Script text auto-populated from `videoProject.script` store (written by Script drawer "Add to recording notes" button)
- Text area is read-only in recording view; user can scroll manually
- Text size −/+ adjusts font size (min 16px, max 28px), stored in localStorage preference
- **Recording:** Implemented fresh in SubFlam using `MediaRecorder` on the browser's microphone stream (`navigator.mediaDevices.getUserMedia()`). Display a waveform or timer during recording. After recording stops, show a slim player for review (play/pause/stop).
- [Save]: recording blob passed back to VoiceoverImagesDrawer, treated identically to uploaded audio

---

## Explainer Export (explainer-export.ts)

New utility, modelled on the existing `webcodecs-export.ts` and `video-export.ts` pattern.

### Inputs

```typescript
interface ExplainerExportOptions {
  panels: VideoPanel[];
  audioBlob: Blob;
  aspectRatio: AspectRatio;
  kenBurns: KenBurnsPreset;
  kenBurnsSpeed: number;
  transition: TransitionPreset;
  transitionSpeed: number;
  onProgress?: (ratio: number) => void;
}
```

### Canvas compositor per panel

For each panel, render N frames (panel duration × 25fps):

```
Frame render order per panel:
1. Draw image (with Ken Burns transform applied)
2. Draw transition overlay (if within transition window)
3. (Subtitles are NOT burned here — user opens completed video in Subtitle tab)
```

### Ken Burns implementation (pure canvas, no library)

```typescript
// For each frame within a panel:
const progress = frameIndex / totalPanelFrames; // 0 → 1
const eased = easeInOut(progress) * kenBurnsSpeed;

switch (kenBurns) {
  case 'zoom-in':
    // Start at 100%, end at 115%
    const scale = 1 + (0.15 * eased);
    const offset = ((scale - 1) / 2) * canvasWidth;
    ctx.drawImage(img, -offset, -offset * (canvasHeight/canvasWidth),
                  canvasWidth * scale, canvasHeight * scale);
    break;
  case 'zoom-out':
    // Start at 115%, end at 100%
    const scale = 1.15 - (0.15 * eased);
    // ... same pattern, inverted
    break;
  case 'none':
    ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
    break;
}
```

### Transitions implementation

Transition frames are the overlap between two panels. Duration: `transitionSpeed * 0.5s` = 6–25 frames at 25fps.

```typescript
// Zoom In transition (outgoing panel scales up + fades, incoming scales in)
// Render both images on canvas during transition window:
case 'zoom-in':
  const t = transitionProgress; // 0 → 1 over transition window
  // Outgoing: scale up from 1.0 to 1.15, opacity 1 → 0
  ctx.globalAlpha = 1 - t;
  drawScaled(ctx, outgoingImg, 1 + (0.15 * t));
  // Incoming: scale from 1.15 down to 1.0, opacity 0 → 1
  ctx.globalAlpha = t;
  drawScaled(ctx, incomingImg, 1.15 - (0.15 * t));
  ctx.globalAlpha = 1;
  break;

// Zoom Out: reverse scale directions
```

### Hold-last-frame behaviour

**CRITICAL:** If `project.audio.duration` exceeds the end time of the last panel (can happen due to trailing silence), the last panel's image is held on canvas until audio ends. The encoder continues rendering frames with the last image (no Ken Burns animation) until audio finishes.

### Audio encoding

The `project.audio.blob` is decoded and passed as the audio track, same pattern as the audiogram export in AudioFlam. Mono audio must be converted to stereo before AAC encoding (existing gotcha, already handled in `webcodecs-export.ts` — replicate that fix).

### Export tiers (same as existing SubFlam)

1. WebCodecs + Mediabunny → MP4 (Android Chrome, Desktop Chrome)
2. MediaRecorder → WebM (iOS Safari, Firefox)
3. Cloud transcode via api.video → MP4 (fallback)

**Create new `smartExportExplainer()` function** (do not extend `smartExportVideo()`). Reason: `smartExportVideo()` expects an `HTMLAudioElement` (for `MediaRecorder.captureStream()` on iOS), while the explainer has only an `audioBlob`. The new function should:
1. Accept `audioBlob: Blob` instead of `audioElement: HTMLAudioElement`
2. Decode the blob to `AudioBuffer` for WebCodecs path
3. Create a temporary `<audio>` element for the MediaRecorder path (same pattern as [`webcodecs-export.ts:342–350`](src/lib/utils/webcodecs-export.ts))
4. Mirror the three-tier export strategy (WebCodecs → MediaRecorder → cloud transcode)
5. Return the same `ExportResult` type

File: `src/lib/utils/explainer-export.ts`

---

## KenBurnsPreview.svelte

Small component used in the Pan & Zoom dropdown to show animated CSS demos of each preset.

Each option contains a `<div>` with a placeholder image and a CSS animation:

```css
/* zoom-in demo */
@keyframes kb-zoom-in {
  from { transform: scale(1.0); }
  to   { transform: scale(1.15); }
}
.kb-demo-zoom-in img {
  animation: kb-zoom-in 2s ease-in-out infinite alternate;
}

/* zoom-out demo */
@keyframes kb-zoom-out {
  from { transform: scale(1.15); }
  to   { transform: scale(1.0); }
}
```

Placeholder image: provide a static news-appropriate photo at ~200×200px in `/static/icons/` or `/static/`. Animation plays on mount (always looping), not only on tap — simpler implementation, same effect.

---

## Image Crop Integration (ImageCropDrawer.svelte)

The existing [`ImageCropDrawer.svelte`](src/lib/components/ImageCropDrawer.svelte) is currently unused. It already supports all required features:

- ✅ Accepts `currentRatio: '9:16' | '1:1' | '16:9'` prop (aspect ratio locking)
- ✅ Crop border locks to the correct ratio — no free-form crop allowed
- ✅ Returns `CropData = { x, y, width, height, scale }` via `onDone` callback
- ✅ Already uses `touch-action: none` and `e.preventDefault()` for pinch handling

**What needs to be added in `VoiceoverImagesDrawer`:** After receiving `CropData`, perform the image resize/downscale:
```typescript
async function cropDataToBlob(
  imageFile: File,
  cropData: CropData,
  canvasWidth: number,
  canvasHeight: number
): Promise<Blob> {
  const bitmap = await createImageBitmap(imageFile);
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;
  // Apply crop coordinates and render to target size
  ctx.drawImage(bitmap, cropData.x, cropData.y, cropData.width, cropData.height, 0, 0, canvasWidth, canvasHeight);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}
```

**No refactoring of `ImageCropDrawer.svelte` needed** — activate by passing the `currentRatio` prop only.

---

## Phased Implementation

### Phase 1 — Core pipeline (checkpoint before Phase 2)

**Goal:** A working end-to-end flow: upload audio → transcription → panel cards → assign images → export MP4. No script generator. Ken Burns: Zoom In and Zoom Out. Transition: None only.

Steps for agent:
1. Create `videoProject.ts` store with full data model
2. Create `ExplainerPage.svelte` (tab shell, dashboard layout, ratio toggle, archive icon placeholder)
3. Create `VoiceoverImagesDrawer.svelte` — upload path only (no recording yet), transcription call, panel card generation (flatten words[] then re-split), split/merge, `CropData` → blob rendering
4. Use `ImageCropDrawer.svelte` as-is — pass `currentRatio` prop, handle `CropData` → blob conversion in `VoiceoverImagesDrawer`
5. Create `PanelCard.svelte` — dashed bar, green bar state, image assignment tap, delete
6. Add audio playback with active panel highlight
7. Create `explainer-export.ts` — Ken Burns (zoom-in, zoom-out, none), transition (none only), hold-last-frame, audio encoding
8. Create `smartExportExplainer()` in `explainer-export.ts` — accepts `audioBlob: Blob`, mirrors three-tier export strategy (WebCodecs → MediaRecorder → cloud)
9. Add preview window to dashboard (plays assembled panels in sequence — can be a JS animation preview, not a full encode)
10. Add Download button with incomplete-images modal

**Checkpoint:** Test end-to-end on Android Chrome and iOS Safari with a 1-minute audio file and 5 images. Confirm MP4 output plays correctly in VLC and on device.

---

### Phase 2 — Recording + Script generator (checkpoint before Phase 3)

**Goal:** Add the Recording Drawer and Script Generator. Add Zoom In and Zoom Out transitions.

Steps for agent:
1. Create `RecordingDrawer.svelte` — implement recording fresh using `navigator.mediaDevices.getUserMedia()` + `MediaRecorder` (no AudioFlam import possible across project boundaries), script display, text size controls, Save → blob return
2. Create `ScriptDrawer.svelte` — Gemini Flash API call, script display, image suggestions panel, "Add to recording notes" → store write
3. Add `[Record]` button to VoiceoverImagesDrawer → opens RecordingDrawer
4. Add "Need a script? Start here" text button to dashboard → opens ScriptDrawer
5. Implement Zoom In and Zoom Out transitions in `explainer-export.ts`
6. Create `KenBurnsPreview.svelte` with CSS-animated thumbnails
7. Add Speed sliders for Ken Burns and Transitions to dashboard dropdowns

**Checkpoint:** Test script → record → images → export full flow. Test transition output visually on device.

---

### Phase 3 — Polish and archive

**Goal:** Archive page (saved projects), completion state micro-animations, PWA offline support for export.

Steps for agent:
1. Archive page (same pattern as PicFlam) — save project metadata to localStorage + image/audio blobs to IndexedDB (`subflam-media` store, keyed by panel ID), load and list saved projects
2. Completion state animations on dashboard buttons
3. Review and tighten mobile performance on low-end Android (frame rate, memory usage during encode)
4. Final QA against testing checklist (see below)

---

### Next phases (future consideration)

- **Rename SubFlam → VidFlam:** Once the Explainer tab is stable and the subtitle/title tab is verified still working, consider renaming the app, updating the domain alias, and updating flamtools.com hub. This is a branding decision, not a code decision — the renaming itself is minimal work.
- **Additional Ken Burns directions:** Pan Left, Pan Right — extend the canvas interpolation to translate X/Y rather than scale.
- **WebGL transitions:** Evaluate `gre/kenburns` (WebGL) for smoother high-res rendering once the core pipeline is stable. Requires pixel readback sync with WebCodecs — treat as a performance experiment, not a V1 requirement.
- **Stock image search:** Wikimedia Commons API or Pexels free tier for in-app image sourcing. Low cost, good licensing for journalism training use.
- **AI video panels:** If low-cost AI image-to-video APIs emerge at suitable price, panels could optionally use short video clips rather than stills.

---

## Testing Checklist

### Dashboard
- [ ] Ratio toggle: 9:16 / 1:1 / 16:9 updates canvas dimensions correctly
- [ ] Voiceover completion state: waveform icon + green tick after audio loaded
- [ ] Completion state absent on fresh project
- [ ] Preview hidden until audio + ≥1 image assigned
- [ ] Preview plays panels in sequence with correct timing
- [ ] Download: incomplete images modal fires when panels missing images
- [ ] Download: "download anyway" renders black frames for missing panels
- [ ] "Need a script?" button opens ScriptDrawer
- [ ] New Project: clears store and localStorage

### Voiceover & Images Drawer
- [ ] Upload: MP3, M4A, WAV, MP4 audio accepted
- [ ] Upload: slim player appears with correct duration
- [ ] Transcription: Deepgram call fires on audio load
- [ ] Transcription: panels split at sentence boundaries
- [ ] Transcription: panels split at silence gaps > 0.5s
- [ ] Panel cards: text displays correctly
- [ ] Panel cards: timestamp labels correct
- [ ] Split: tapping SPLIT → word-tap modal → two new cards at correct timestamps
- [ ] Merge: tapping ⊕ → two adjacent cards become one
- [ ] Image assign: tapping dashed bar → file picker → crop overlay opens
- [ ] Crop overlay: aspect ratio border matches selected ratio
- [ ] Crop overlay: pinch/drag works without parent scroll interference
- [ ] Crop confirm: stored blob is at correct canvas dimensions
- [ ] Green bar: appears after crop confirm, shows card number + delete icon
- [ ] Delete icon: removes image, bar returns to dashed state
- [ ] Audio playback: current panel highlighted during playback
- [ ] Save: modal fires if not all images assigned
- [ ] Save: project written to store and localStorage

### Recording Drawer
- [ ] Opens from [Record] button in Voiceover drawer
- [ ] Script text pre-populated if script exists in store
- [ ] Script text manually scrollable
- [ ] Text size −/+ adjusts font size (16px–28px)
- [ ] Recording starts on tap, waveform/timer displays
- [ ] Review player appears after recording stops
- [ ] Save: blob returned to Voiceover drawer, treated as upload

### Script Drawer
- [ ] Audience, Topic, Duration inputs
- [ ] Generate Script: Gemini Flash call fires
- [ ] Script displays in editable text area with word count
- [ ] Regenerate: new call, replaces script text
- [ ] Copy: copies script to clipboard
- [ ] Image suggestions: separate panel, populated from API response
- [ ] "Add to recording notes": writes to videoProject.script store

### Export
- [ ] Android Chrome: MP4 via WebCodecs
- [ ] Desktop Chrome: MP4 via WebCodecs
- [ ] iOS Safari: WebM fallback
- [ ] Ken Burns Zoom In: smooth scale animation visible in output
- [ ] Ken Burns Zoom Out: smooth scale animation visible in output
- [ ] Transition Zoom In: push-in effect between panels visible
- [ ] Transition Zoom Out: pull-out effect between panels visible
- [ ] Hold last frame: audio tail after last panel doesn't go black
- [ ] Mono audio: auto-converted to stereo (no AAC encoder rejection)
- [ ] Image resize: exported frames at correct canvas dimensions
- [ ] 5-panel, 1-minute video: export completes without timeout
- [ ] Output playable in VLC, Android Gallery, iOS Photos

---

## Known Gotchas for Implementation Agent

1. **Touch conflict in crop overlay:** Already handled — `ImageCropDrawer.svelte` uses `touch-action: none` and `e.preventDefault()` on all touch events. No additional work needed.

2. **Mono audio → stereo conversion:** The WebCodecs AAC encoder rejects mono audio on mobile. Auto-convert mono to stereo before encoding. Pattern already exists in `webcodecs-export.ts:277-294` — replicate exactly.

3. **Hold last frame:** After the last panel's `endTime`, continue rendering the last `imageBlob` to canvas until `audioBlob.duration` ends. Do not allow the canvas to go black.

4. **Image blob size:** Always downscale imported images to canvas dimensions (1080×1920 / 1080×1080 / 1920×1080) in the crop overlay before storing. Never store the original camera JPEG — 8–12MB blobs per panel will cause OOM on low-end Android during the encode loop.

5. **Transcription endpoint reuse:** Do not create a new transcription endpoint. POST to the existing `/api/transcribe-deepgram` endpoint with the audio blob from voiceover upload/recording. The response format is identical.

6. **Panel split uses word timestamps:** When the user taps a word to split a panel, use the word's `start` timestamp from the Deepgram response as the `startTime` of the new second panel. Do not estimate — use the exact timestamp.

7. **Ken Burns scale origin:** When scaling an image for Ken Burns, the scale origin must be the canvas centre, not the top-left corner. Use `ctx.translate(cx, cy)`, `ctx.scale(s, s)`, `ctx.translate(-cx, -cy)` before `drawImage` — then restore the transform after.

8. **Svelte 5 reactivity:** The project uses Svelte 5 runes. Use `$state()` and `$derived()` for reactive state in new components. Do not use Svelte 4 `$:` syntax.

9. **Persistence architecture (Phase 3):** Do NOT base64-encode blobs into localStorage — this triples size and risks hitting the 5–10MB limit. Use localStorage for metadata only (panel text, timestamps, settings) and IndexedDB for blobs. Phase 1–2: memory only, no persistence needed.

10. **ImageCropDrawer output:** The component returns `CropData = { x, y, width, height, scale }`, not a blob. Perform the offscreen canvas render in `VoiceoverImagesDrawer`: `createImageBitmap(file)` → draw to `OffscreenCanvas` at target dimensions → `canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 })`. Do not modify `ImageCropDrawer` — just pass `currentRatio` prop.

11. **Recording implementation:** AudioFlam is a separate project — cannot import across Cloudflare Pages project boundaries. Implement recording in SubFlam using `navigator.mediaDevices.getUserMedia({ audio: true })` + `MediaRecorder`. Display a live timer during recording.

12. **`smartExportExplainer()` signature:** Create new function accepting `audioBlob: Blob` (not `audioElement: HTMLAudioElement`). Decode blob to `AudioBuffer` for WebCodecs path; create temp `<audio>` element for MediaRecorder fallback. Mirror the three-tier strategy from `smartExportVideo()`.

---

*End of VIDEO_PLAN.md*
