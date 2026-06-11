# VideoFlam - AI Agent Reference

**Purpose:** Single-source-of-truth for AI agents working on VideoFlam
**Status:** Production (Explainer + VideoFlam Complete)
**Updated:** June 2026 (Multi-feature platform)
**GitHub:** VideoFlam (renamed from SubFlam)
**URL:** videoflam.flamtools.com

---

## Quick Start

**What is VideoFlam?** A mobile-first web app with two main features:
1. **Explainer** - Create short explainer videos with Ken Burns effects, transitions, and AI-generated scripts
2. **VideoFlam** - Add subtitles and title overlays to uploaded videos using Deepgram transcription

**History:** Originally built as SubFlam (video subtitles only), then expanded with Explainer feature and rebranded as VideoFlam.

**Tech Stack:**
- SvelteKit 2 + Svelte 5 (TypeScript, strict mode)
- Cloudflare Pages (hosting)
- Native CSS variables (no Tailwind)
- Deepgram Nova-3 API (transcription with word-level timestamps)
- Gemini Flash API (script generation)
- WebCodecs API (H.264/MP4 encoding)
- MediaRecorder fallback (iOS/Firefox → cloud transcoding)
- Canvas composition (Ken Burns, transitions, subtitles, titles)

**Key Constraint:** Non-commercial, educational use. No authentication. Hidden from search engines.

---

## Commands

```bash
npm run dev          # Local development
npm run build        # Production build
npm run check        # TypeScript/Svelte checks
npm run check:watch  # Watch mode
```

---

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Main app (tab router: Explainer ↔ VideoFlam)
│   ├── +layout.svelte            # Root layout
│   └── api/
│       ├── transcribe-deepgram/+server.ts  # Deepgram Nova-3 transcription
│       ├── generate-script/+server.ts      # Gemini Flash script generation
│       ├── transcode/+server.ts            # Cloud video transcoding (api.video)
│       ├── normalize/+server.ts            # Audio normalization
│       └── audio/silence-removal/+server.ts # Silence removal
├── lib/
│   ├── stores.ts                 # Empty (minimal stores)
│   ├── stores/
│   │   ├── videoProject.ts       # Explainer project state (panels, audio, effects)
│   │   ├── interimVideo.ts       # Interim video blob storage
│   │   └── activeTab.ts          # Tab routing state
│   ├── components/
│   │   ├── VideoSubtitlePage.svelte  # VideoFlam main (1492 lines)
│   │   │   ├── Video upload & preview
│   │   │   ├── Trim control (in-point/out-point)
│   │   │   ├── Canvas rendering (video + title + subtitles)
│   │   │   ├── Playback controls
│   │   │   └── Export orchestration
│   │   ├── ExplainerPage.svelte      # Explainer main (1701 lines)
│   │   │   ├── Script generation & editing
│   │   │   ├── Voiceover recording
│   │   │   ├── Image upload & cropping
│   │   │   ├── Ken Burns & transition controls
│   │   │   ├── Canvas preview
│   │   │   ├── Project archive
│   │   │   └── Export orchestration
│   │   ├── SubtitlePanel.svelte      # Subtitle generation & styling
│   │   │   ├── Audio extraction from video
│   │   │   ├── Deepgram transcription
│   │   │   ├── Subtitle styling controls
│   │   │   └── Word-level editing
│   │   ├── TitlePanel.svelte         # Title overlay controls
│   │   │   ├── Title text input
│   │   │   ├── Font selection
│   │   │   ├── Alignment & styling
│   │   │   └── Label background controls
│   │   ├── explainer/
│   │   │   ├── VoiceoverImagesDrawer.svelte  # Image upload & cropping UI
│   │   │   ├── ScriptDrawer.svelte           # Script generation & editing UI
│   │   │   ├── RecordingDrawer.svelte        # Audio recording UI
│   │   │   ├── ArchivePage.svelte            # Project archive & restore
│   │   │   ├── PanelCard.svelte              # Individual panel editor
│   │   │   ├── KenBurnsPreview.svelte        # Ken Burns effect preview
│   │   │   └── ImageIdeasDrawer.svelte       # Image suggestion UI
│   │   ├── ColorPicker.svelte        # HSB color picker
│   │   ├── Dropdown.svelte           # Reusable dropdown component
│   │   ├── TogglePanel.svelte        # Collapsible panel (reusable)
│   │   ├── PlayButton.svelte         # Play/pause button
│   │   └── ImageCropDrawer.svelte    # Image crop overlay
│   ├── utils/
│   │   ├── video-export.ts           # Export orchestration (smartExportVideo)
│   │   ├── explainer-export.ts       # Explainer export (smartExportExplainer)
│   │   ├── explainer-renderer.ts     # Ken Burns & transition rendering (393 lines)
│   │   ├── webcodecs-export.ts       # WebCodecs + Mediabunny (H.264/MP4)
│   │   ├── subtitles.ts              # Subtitle rendering + composition (854 lines)
│   │   ├── compositor.ts             # Canvas layer composition
│   │   ├── projectStorage.ts         # Project persistence (localStorage + IndexedDB)
│   │   ├── transcription.ts          # Whisper utilities (exists but unused)
│   │   └── transcription-worker.ts   # Whisper worker (exists but unused)
│   ├── config/
│   │   ├── subtitlePlaceholders.json # Subtitle style templates
│   │   └── scriptGeneratorPrompt.json # Gemini script generation prompt
│   ├── server/
│   │   ├── audioNormalize.ts         # Audio normalization
│   │   └── silenceRemoval.ts         # Silence removal
│   └── types/
│       └── soundtouchjs.d.ts         # Type definitions
├── app.css                       # Global styles + CSS variables
└── app.html                      # HTML template

static/
  ├── icons/                        # SVG icons + logo files
  ├── logos/                        # VideoFlam logos
  ├── fonts/                        # Self-hosted fonts (Inter, Lora, Playfair, Roboto Slab, Saira, Bebas, Oswald)
  ├── robots.txt                    # Disallow: / (no indexing)
  ├── manifest.json                 # PWA manifest
  └── flam-nav.js                   # Navigation component (custom element)
```

---

## Core Workflows

### Explainer Workflow

#### 1. Script Generation
- User enters topic, audience, duration, optional URL
- [`ExplainerPage.svelte`](src/lib/components/ExplainerPage.svelte) calls `/api/generate-script`
- **Endpoint:** POST `/api/generate-script`
- **Provider:** Gemini Flash API
- **Input:** `{ topic, audience, duration, url }`
- **Output:** `{ script: string, imageSuggestions: string[] }`
- **File:** [`src/routes/api/generate-script/+server.ts`](src/routes/api/generate-script/+server.ts)

#### 2. Script Editing & Panel Creation
- User edits script in [`ScriptDrawer.svelte`](src/lib/components/explainer/ScriptDrawer.svelte)
- Script split into sentences → panels via [`buildPanelsFromSegments()`](src/lib/stores/videoProject.ts)
- Each panel has: text, startTime, endTime, imageBlob, imageSuggestion, words (word-level timestamps)

#### 3. Voiceover Recording
- User records audio in [`RecordingDrawer.svelte`](src/lib/components/explainer/RecordingDrawer.svelte)
- Audio blob stored in project state
- Optional: silence removal via `/api/audio/silence-removal`

#### 4. Image Upload & Cropping
- User uploads images in [`VoiceoverImagesDrawer.svelte`](src/lib/components/explainer/VoiceoverImagesDrawer.svelte)
- Images cropped to canvas dimensions via [`ImageCropDrawer.svelte`](src/lib/components/ImageCropDrawer.svelte)
- Cropped blob stored in panel state

#### 5. Ken Burns & Transition Effects
- User selects Ken Burns preset (none/zoom-in/zoom-out) and speed (slow/medium/fast)
- User selects transition preset (none/zoom-in/zoom-out/push-left/push-up) and speed (slower/normal/faster)
- Effects rendered in real-time preview via [`drawKenBurnsFrame()`](src/lib/utils/explainer-renderer.ts) and [`drawTransitionFrame()`](src/lib/utils/explainer-renderer.ts)

#### 6. Canvas Preview
- Real-time rendering during playback:
  1. Draw current panel image with Ken Burns effect
  2. Draw transition to next panel (if enabled)
  3. Sync with audio playback
- Callback-based rendering: `renderFrame(currentTime)`

#### 7. Project Persistence
- User can save/load projects via [`projectStorage.ts`](src/lib/utils/projectStorage.ts)
- Storage: localStorage (metadata) + IndexedDB (blobs)
- Archive view: [`ArchivePage.svelte`](src/lib/components/explainer/ArchivePage.svelte)

#### 8. Export
- **Entry point:** [`smartExportExplainer()`](src/lib/utils/explainer-export.ts)
- **Three-tier strategy:**
  1. **WebCodecs + Mediabunny** (Android Chrome, Chrome Desktop) → MP4
  2. **MediaRecorder** (iOS Safari, Firefox) → WebM
  3. **Cloud transcoding** (api.video) → MP4 (fallback if needed)
- **Output:** MP4 (preferred) or WebM
- **Duration:** Full audio duration (no trim)

### VideoFlam Workflow

#### 1. Video Upload
- User uploads MP4, MOV, or WebM video
- [`VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) stores video blob and extracts dimensions
- Canvas auto-sized to match video dimensions

#### 2. Audio Extraction
- [`SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte) extracts audio from video element
- Audio blob passed to Deepgram for transcription

#### 3. Transcription
- **Endpoint:** POST `/api/transcribe-deepgram`
- **Provider:** Deepgram Nova-3 (word-level timestamps)
- **Input:** Audio blob (multipart/form-data)
- **Output:** `{ segments: SubtitleSegment[] }` with word-level timing
- **Language:** Auto-detect or specify ISO 639-1 code
- **File:** [`src/routes/api/transcribe-deepgram/+server.ts`](src/routes/api/transcribe-deepgram/+server.ts)

#### 4. Subtitle Styling
- User controls via [`SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte):
  - Template (flow/focus)
  - Font size, max lines
  - Text color, outline, shadow, spotlight
  - Vertical position
  - Label background styling

#### 5. Title Overlay
- User controls via [`TitlePanel.svelte`](src/lib/components/TitlePanel.svelte):
  - Title text
  - Font (Inter, Lora, Roboto Slab, Saira, Playfair Display, Bebas Neue)
  - Alignment (left/center/right)
  - Text color, bold, line height, letter spacing
  - Label background (color, opacity, padding, border radius)

#### 6. Trim Control
- Dual-handle scrubber (in-point / out-point)
- 0–1 ratio format (matching Explainer pattern)
- Non-destructive (applied at export time)
- Playback stops at `trimEnd * videoDuration`

#### 7. Canvas Preview
- Real-time rendering during playback:
  1. Draw video frame at current time
  2. Draw title overlay (if enabled)
  3. Draw subtitle (if enabled and active)
- Callback-based rendering: `renderFrame(currentTime)`

#### 8. Export
- **Entry point:** [`smartExportVideo()`](src/lib/utils/video-export.ts)
- **Three-tier strategy:**
  1. **WebCodecs + Mediabunny** (Android Chrome, Chrome Desktop) → MP4
  2. **MediaRecorder** (iOS Safari, Firefox) → WebM
  3. **Cloud transcoding** (api.video) → MP4 (fallback if needed)
- **Output:** MP4 (preferred) or WebM
- **Duration:** Respects trim boundaries (trimStart to trimEnd)

---

## API Endpoints

### POST `/api/generate-script`

Generates a short explainer video script using Gemini Flash.

**Request:**
```json
{
  "topic": "How to make coffee",
  "audience": "beginners",
  "duration": "1min",
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "script": "First, gather your materials...",
  "imageSuggestions": ["coffee beans", "water kettle", "coffee cup"]
}
```

**File:** [`src/routes/api/generate-script/+server.ts`](src/routes/api/generate-script/+server.ts)

### POST `/api/transcribe-deepgram`

Transcribes audio using Deepgram Nova-3 with word-level timestamps.

**Request:**
```
multipart/form-data
- audio: File (audio blob from video)
- language: string (optional, ISO 639-1 code or 'auto')
```

**Response:**
```json
{
  "segments": [
    {
      "start": 0.5,
      "end": 2.3,
      "text": "Hello world",
      "words": [
        { "word": "Hello", "start": 0.5, "end": 1.2 },
        { "word": "world", "start": 1.3, "end": 2.3 }
      ]
    }
  ]
}
```

**File:** [`src/routes/api/transcribe-deepgram/+server.ts`](src/routes/api/transcribe-deepgram/+server.ts)

### POST `/api/transcode`

Cloud video transcoding via api.video (WebM → MP4 fallback).

**Request:**
```
multipart/form-data
- video: File (WebM blob)
```

**Response:**
```json
{
  "videoId": "vi_...",
  "downloadUrl": "https://..."
}
```

**File:** [`src/routes/api/transcode/+server.ts`](src/routes/api/transcode/+server.ts)

### POST `/api/normalize`

Audio normalization (loudness adjustment).

**File:** [`src/routes/api/normalize/+server.ts`](src/routes/api/normalize/+server.ts)

### POST `/api/audio/silence-removal`

Removes silence from audio (used in Explainer voiceover).

**File:** [`src/routes/api/audio/silence-removal/+server.ts`](src/routes/api/audio/silence-removal/+server.ts)

---

## Key Components

### [`ExplainerPage.svelte`](src/lib/components/ExplainerPage.svelte) (1701 lines)

Main Explainer application container. Manages:
- Script generation and editing
- Voiceover recording
- Image upload and cropping
- Ken Burns and transition effects
- Canvas preview and playback
- Project persistence (save/load/archive)
- Export orchestration

**State:**
```typescript
let project = $state<VideoProject>(createDefaultProject());
let showVoiceoverDrawer = $state(false);
let showScriptDrawer = $state(false);
let showRecordingDrawer = $state(false);
let showArchive = $state(false);
let isExporting = $state(false);
let exportProgress = $state<ExportProgress | null>(null);
let previewEl = $state<HTMLCanvasElement | null>(null);
let previewAudioEl = $state<HTMLAudioElement | null>(null);
let isPreviewPlaying = $state(false);
let previewTime = $state(0);
```

**Key Methods:**
- `generateScript()` - Call Gemini API
- `recordVoiceover()` - Capture audio
- `uploadImage()` - Handle image upload
- `renderFrame(currentTime)` - Canvas rendering callback
- `startExport()` - Trigger export pipeline
- `saveProject()` - Persist to storage
- `loadProject()` - Restore from storage

### [`VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) (1492 lines)

Main VideoFlam application container. Manages:
- Video upload and playback
- Canvas rendering
- Trim control
- Subtitle/title state
- Export orchestration

**State:**
```typescript
let videoBlob: Blob | null = $state(null);
let videoDuration = $state(0);
let canvasWidth = $state(1920);
let canvasHeight = $state(1080);
let trimStart = $state(0);  // 0–1 ratio
let trimEnd = $state(1);    // 0–1 ratio
let isPlaying = $state(false);
let currentTime = $state(0);
let subtitleSegments: SubtitleSegment[] = $state([]);
let subtitleStyle: SubtitleStyle = $state({ ...DEFAULT_SUBTITLE_STYLE });
let subtitlesEnabled = $state(false);
let isExporting = $state(false);
let exportProgress = $state<ExportProgress | null>(null);
```

**Key Methods:**
- `handleVideoUpload()` - Process uploaded video
- `renderFrame(currentTime)` - Canvas rendering callback
- `startExport()` - Trigger export pipeline
- `downloadBlob()` - Save exported video

### [`SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte)

Subtitle generation and styling. Manages:
- Audio extraction from video
- Deepgram transcription
- Subtitle styling controls
- Word-level editing

**Props:**
```typescript
audioBlob: Blob | null;
canvasWidth: number;
canvasHeight: number;
style: SubtitleStyle;
segments: SubtitleSegment[];
subtitlesEnabled: boolean;
onStyleChange: (style: SubtitleStyle) => void;
onSegmentsChange: (segments: SubtitleSegment[]) => void;
onEnabledChange: (enabled: boolean) => void;
```

**Key Methods:**
- `generateSubtitles()` - Call Deepgram API
- `updateStyle()` - Callback for style changes
- `reflow()` - Recalculate subtitle layout

### [`TitlePanel.svelte`](src/lib/components/TitlePanel.svelte)

Title overlay controls. Manages:
- Title text input
- Font selection
- Alignment and styling
- Label background

**Props:**
```typescript
text: string;
selectedFont: TitleFont;
selectedAlign: TitleAlign;
isBold: boolean;
lineHeight: number;
letterSpacing: number;
textColor: string;
labelEnabled: boolean;
labelOpacity: number;
labelSpace: number;
labelColor: string;
onTextChange: (text: string) => void;
onFontChange: (font: TitleFont) => void;
// ... other callbacks
```

### [`ScriptDrawer.svelte`](src/lib/components/explainer/ScriptDrawer.svelte)

Script generation and editing UI. Manages:
- Gemini API integration
- Script text editing
- Panel preview

### [`RecordingDrawer.svelte`](src/lib/components/explainer/RecordingDrawer.svelte)

Audio recording UI. Manages:
- MediaRecorder integration
- Audio playback
- Optional silence removal

### [`VoiceoverImagesDrawer.svelte`](src/lib/components/explainer/VoiceoverImagesDrawer.svelte)

Image upload and cropping UI. Manages:
- Image file upload
- Crop tool integration
- Panel assignment

### [`ArchivePage.svelte`](src/lib/components/explainer/ArchivePage.svelte)

Project archive and restore. Manages:
- List saved projects
- Load/delete projects
- Export/import projects

---

## Key Utilities

### [`video-export.ts`](src/lib/utils/video-export.ts)

Export orchestration. Exports canvas + audio to MP4/WebM.

**Main function:**
```typescript
export async function smartExportVideo(
  canvas: HTMLCanvasElement,
  audioElement: HTMLAudioElement,
  audioBuffer: AudioBuffer | undefined,
  duration: number,
  onProgress?: ProgressCallback,
  renderFrame?: (currentTime: number) => void,
  startAudioPlayback?: () => void,
  stopAudioPlayback?: () => void,
  forceCloudTranscode?: boolean
): Promise<ExportResult>
```

**Three-tier strategy:**
1. Check WebCodecs support → use [`exportWithWebCodecs()`](src/lib/utils/webcodecs-export.ts)
2. Fall back to MediaRecorder → WebM
3. If WebM produced, upload to api.video for MP4 conversion

### [`explainer-export.ts`](src/lib/utils/explainer-export.ts) (578 lines)

Explainer export orchestration. Exports canvas + audio to MP4/WebM.

**Main function:**
```typescript
export async function smartExportExplainer(
  options: ExplainerExportOptions
): Promise<ExportResult>
```

**Options:**
```typescript
export interface ExplainerExportOptions {
  panels: VideoPanel[];
  audioBlob: Blob;
  aspectRatio: AspectRatio;
  kenBurns: KenBurnsPreset;
  kenBurnsSpeed: KenBurnsSpeed;
  transition: TransitionPreset;
  transitionSpeed: TransitionSpeed;
  onProgress?: ProgressCallback;
}
```

**Three-tier strategy:** Same as VideoFlam (WebCodecs → MediaRecorder → api.video)

### [`explainer-renderer.ts`](src/lib/utils/explainer-renderer.ts) (393 lines)

Ken Burns and transition rendering. Pure functions only.

**Key exports:**
```typescript
export function drawKenBurnsFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  imageBitmap: ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  panelDuration: number,
  elapsedTime: number,
  preset: KenBurnsPreset,
  speed: KenBurnsSpeed
): void

export function drawTransitionFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  fromImage: ImageBitmap,
  toImage: ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  transitionProgress: number,
  preset: TransitionPreset,
  speed: TransitionSpeed
): void

export function getTransitionState(
  panels: VideoPanel[],
  currentTime: number,
  transitionDuration: number
): { fromPanel: VideoPanel | null; toPanel: VideoPanel | null; progress: number }
```

**Ken Burns Presets:**
- `none` - No zoom
- `zoom-in` - Zoom in at configurable speed (1%, 2%, or 3% per second)
- `zoom-out` - Zoom out at configurable speed

**Transition Presets:**
- `none` - No transition
- `zoom-in` - Zoom in with motion blur
- `zoom-out` - Zoom out with motion blur
- `push-left` - Push left with motion blur
- `push-up` - Push up with motion blur

**Transition Speeds:**
- `slower` - 0.31s
- `normal` - 0.25s
- `faster` - 0.19s

### [`webcodecs-export.ts`](src/lib/utils/webcodecs-export.ts)

WebCodecs H.264 encoding via Mediabunny library.

**Main function:**
```typescript
export async function exportWithWebCodecs(options: {
  canvas: HTMLCanvasElement;
  audioBuffer?: AudioBuffer;
  audioElement?: HTMLAudioElement;
  duration: number;
  fps?: number;
  videoBitrate?: number;
  onProgress?: ProgressCallback;
  renderFrame?: (currentTime: number) => void;
}): Promise<ExportResult>
```

**Key details:**
- 24 fps, 2 Mbps video bitrate, 96 kbps audio
- H.264 Baseline profile (level 3.1)
- Mono → stereo conversion (AAC encoder requirement)
- Canvas dimensions auto-corrected to even numbers

### [`subtitles.ts`](src/lib/utils/subtitles.ts) (854 lines)

Subtitle rendering and composition. Pure functions only.

**Key exports:**
```typescript
export function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  segment: SubtitleSegment,
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): void

export function getActiveSegment(
  segments: SubtitleSegment[],
  currentTime: number
): SubtitleSegment | null

export function reflow(
  segments: SubtitleSegment[],
  style: SubtitleStyle,
  canvasWidth: number,
  canvasHeight: number
): SubtitleSegment[]

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle
```

**Data models:**
```typescript
export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
  words: WordTimestamp[];
}

export interface SubtitleStyle {
  template: 'flow' | 'focus';
  fontSize: 'small' | 'medium' | 'large';
  maxLines: 1 | 2;
  verticalPosition: number;
  textColor: string;
  spotlightEnabled: boolean;
  spotlightColor: string;
  outlineEnabled: boolean;
  outlineColor: string;
  outlineStrokeWidth: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  textAlign: 'left' | 'center' | 'right';
  boldEnabled: boolean;
  uppercaseEnabled: boolean;
  fontFamily: 'Inter' | 'Roboto Slab' | 'Oswald' | 'Saira';
  labelEnabled: boolean;
  labelColor: string;
  labelPadding: number;
  labelBorderRadius: number;
}
```

### [`projectStorage.ts`](src/lib/utils/projectStorage.ts)

Project persistence (localStorage + IndexedDB).

**Key exports:**
```typescript
export async function saveProject(project: VideoProject): Promise<string>
export async function loadProject(projectId: string): Promise<VideoProject | null>
export async function deleteProject(projectId: string): Promise<void>
export async function listProjects(): Promise<ProjectMetadata[]>
export async function exportProject(projectId: string): Promise<Blob>
export async function importProject(blob: Blob): Promise<string>
```

### [`compositor.ts`](src/lib/utils/compositor.ts)

Canvas layer composition (video + title + subtitles).

**Main function:**
```typescript
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  videoElement: HTMLVideoElement,
  layers: LayerConfig
): void
```

---

## Data Models

### VideoProject (Explainer)

```typescript
export interface VideoProject {
  aspectRatio: AspectRatio;           // '9:16' | '1:1' | '16:9'
  kenBurns: KenBurnsPreset;           // 'none' | 'zoom-in' | 'zoom-out'
  kenBurnsSpeed: KenBurnsSpeed;       // 'slow' | 'medium' | 'fast'
  transition: TransitionPreset;       // 'none' | 'zoom-in' | 'zoom-out' | 'push-left' | 'push-up'
  transitionSpeed: TransitionSpeed;   // 'slower' | 'normal' | 'faster'
  audio: { blob: Blob; duration: number } | null;
  panels: VideoPanel[];
  script: string | null;
}

export interface VideoPanel {
  id: string;
  text: string;                       // Transcription text for this segment
  startTime: number;                  // Audio timestamp start (seconds)
  endTime: number;                    // Audio timestamp end (seconds)
  imageBlob: Blob | null;             // Cropped image, pre-sized to canvas dimensions
  imageSuggestion: string | null;
  words: WordTimestamp[];             // Word-level timestamps for split functionality
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}
```

### Canvas Dimensions

```typescript
export const CANVAS_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1':  { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};
```

---

## Environment Variables

Set in Cloudflare Pages → Settings → Environment variables:

```env
DEEPGRAM_VTT_KEY=<Deepgram API key>
GEMINI_API_KEY=<Gemini Flash API key>
APIVIDEO_API_KEY=<api.video API key>
```

**Optional (Development):**
- Create `.env.local` in project root for local testing
- Never commit `.env.local` to git

---

## Design System

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `--accent-brand` / `--color-primary` | `#5422b0` | Buttons, active states, brand color |
| `--color-highlight` | `#f0e6f7` | Highlights, hover states |
| `--text-primary` | `#1f1f1f` | Body text, labels |
| `--text-secondary` | `#777777` | Hints, helper text, disabled states |
| `--bg-white` | `#ffffff` | Card backgrounds, surfaces |
| `--bg-main` | `#efefef` | App background |
| `--color-border` | `#e0e0e0` | Dividers, inactive borders |
| `--color-border-active` | `#999999` | Active/focus borders |

### Typography

**Font Family:** Inter (self-hosted), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif

**Font Sizes:**
- `--font-size-xs`: 0.75rem (12px)
- `--font-size-sm`: 0.875rem (14px)
- `--font-size-base`: 1rem (16px)
- `--font-size-lg`: 1.125rem (18px)
- `--font-size-larger`: 1.25rem (20px)
- `--font-size-xl`: 1.5rem (24px)

**Font Weights:**
- `--font-weight-regular`: 400
- `--font-weight-medium`: 500
- `--font-weight-semibold`: 600
- `--font-weight-bold`: 700

**Line Heights:**
- `--line-height-tight`: 1.2
- `--line-height-normal`: 1.5
- `--line-height-relaxed`: 1.8

### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--spacing-xs` | 0.375rem (6px) | Tight spacing, icon padding |
| `--spacing-sm` | 0.625rem (10px) | Element padding, gaps |
| `--spacing-md` | 1rem (16px) | Default padding, section margins |
| `--spacing-lg` | 1.25rem (20px) | Vertical spacing, separators |
| `--spacing-xl` | 1.75rem (28px) | Large gaps, layout spacing |

### Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Input fields, small buttons |
| `--radius-md` | 8px | Most buttons, containers |
| `--radius-lg` | 12px | Cards, larger containers |
| `--radius-xl` | 16px | Modals, largest containers |
| `--radius-round` | 50% | Circular icons, pill buttons |

All CSS variables defined in [`src/app.css`](src/app.css).

---

## Critical Rules & Gotchas

### DO NOT Break These

1. **Simplicity first** - Two-feature tool (Explainer + VideoFlam)
2. **No auth system** - Public URL, hidden from search engines
3. **Deepgram API key required** - Must be set in Cloudflare environment
4. **Gemini API key required** - Must be set in Cloudflare environment
5. **Base64 encoding** - Use `btoa()` not `Buffer` (Cloudflare compatibility)
6. **Canvas context reset** - Must clear canvas before each frame render (`ctx.clearRect()`)
7. **Robots.txt noindex** - Must remain in [`static/robots.txt`](static/robots.txt)
8. **Manifest.json display** - Currently set to `"display": "browser"`

### Export-Specific Gotchas

- **WebCodecs audio NOT played during export** - Rendering uses time-based calculation, not live playback
- **H.264 requires even dimensions** - Canvas auto-corrected in [`webcodecs-export.ts`](src/lib/utils/webcodecs-export.ts)
- **Canvas copy needed** - Offscreen canvas required to handle dimension correction
- **Audio mono→stereo conversion** - Many mobile AAC encoders reject mono; code converts automatically
- **Mediabunny lazy-load** - Loaded dynamically to keep initial bundle small

### VideoFlam Gotchas

- **Canvas `drawImage()` with video element** - Works on most browsers but has edge cases on iOS Safari. Fallback to cloud transcode is automatic.
- **Audio extraction timing** - Must wait for `loadedmetadata` before extracting audio from video element. Premature extraction yields silent audio.
- **Trim boundaries in playback** - Playback must stop exactly at `trimEnd * videoDuration`, not video duration.
- **SubtitlePanel/TitlePanel prop binding** - Both use callback-based props, NOT two-way binding. Must update parent state via callbacks.
- **Video dimensions for export** - Canvas width/height must match source video dimensions. Auto-set from `videoElement.videoWidth`/`videoHeight`.

### Explainer Gotchas

- **Panel timing from audio** - Panels are split by sentence boundaries and silence gaps (>0.5s), not by fixed duration
- **Ken Burns animation duration** - Runs for full panel duration, not capped at 5 seconds
- **Transition timing** - Transitions occur between panels; duration is configurable (slower/normal/faster)
- **Image blob storage** - Images must be pre-cropped to canvas dimensions before storing in panel state
- **Project persistence** - Uses localStorage (metadata) + IndexedDB (blobs); IndexedDB has size limits (~50MB per origin)

### Deepgram Integration Gotchas

- **Word-level timestamps required** - Deepgram must return `words` array with start/end times for subtitle sync
- **Language auto-detection** - `language: 'auto'` works but may misidentify mixed-language audio
- **API rate limits** - No built-in throttling; users can spam transcription requests (KNOWN ISSUE)
- **Error handling loose** - If API fails, user gets generic error message (KNOWN ISSUE)

---

## Common Pitfalls for Agents

### 1. Assuming MediaRecorder H.264 Works on All Android
**Reality:** It claims support but fails in practice. Always check WebCodecs first.

### 2. Forgetting Canvas Context Reset
**Reality:** Must clear canvas before each frame render (`ctx.clearRect()`) to avoid ghosting/visual artifacts.

### 3. Not Handling Mono Audio in WebCodecs
**Reality:** AAC encoder on mobile browsers rejects mono. Code auto-converts mono→stereo.

**File:** [`src/lib/utils/webcodecs-export.ts:277-294`](src/lib/utils/webcodecs-export.ts)

### 4. Type Assertions Without Guards
**Reality:** [`webcodecs-export.ts:445`](src/lib/utils/webcodecs-export.ts) does unchecked type assertion on Mediabunny target. Could fail silently if target changes.

**Fix:** Add runtime check before assertion. (KNOWN ISSUE)

### 5. Forgetting to Wait for `loadedmetadata`
**Reality:** Audio extraction from video element must wait for `loadedmetadata` event. Premature extraction yields silent audio.

### 6. Breaking Trim Control Pattern
**Reality:** Trim uses 0–1 ratios (like waveform trimmer), NOT absolute seconds. Must convert to seconds when seeking: `videoElement.currentTime = currentTime + (trimStart * videoDuration)`.

**File:** [`src/lib/components/VideoSubtitlePage.svelte:renderFrame()`](src/lib/components/VideoSubtitlePage.svelte)

### 7. Canvas drawImage() Failing on iOS Safari
**Reality:** Some iOS Safari versions fail when rendering video element to canvas (`ctx.drawImage(videoElement)`). Fallback is automatic (MediaRecorder → cloud transcode), but user may not see preview.

**File:** [`src/lib/components/VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) - No workaround needed; fallback automatic

### 8. Not Syncing Subtitle Timing with Deepgram Response
**Reality:** Deepgram returns word-level timestamps. Must use these for accurate subtitle sync, not just segment-level timing.

**File:** [`src/lib/utils/subtitles.ts`](src/lib/utils/subtitles.ts)

### 9. Forgetting Callback-Based Props in SubtitlePanel/TitlePanel
**Reality:** Both use callback-based props (`onStyleChange`, `onTextChange`), NOT two-way binding. Must update parent state via callbacks, not direct mutations.

**File:** [`src/lib/components/SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte) + [`src/lib/components/TitlePanel.svelte`](src/lib/components/TitlePanel.svelte)

### 10. Missing Request Throttling for Deepgram API
**Reality:** No built-in throttling. Users can spam transcription requests, wasting API quota.

**File:** [`src/routes/api/transcribe-deepgram/+server.ts`](src/routes/api/transcribe-deepgram/+server.ts) - KNOWN ISSUE

### 11. Confusing Panel Timing with Audio Duration
**Reality:** Each panel has `startTime` and `endTime` (in seconds) derived from audio timestamps. These are NOT the same as video duration or trim boundaries.

**File:** [`src/lib/stores/videoProject.ts:buildPanelsFromSegments()`](src/lib/stores/videoProject.ts)

### 12. Not Handling IndexedDB Size Limits
**Reality:** IndexedDB has ~50MB limit per origin. Large projects with many high-res images may exceed this.

**File:** [`src/lib/utils/projectStorage.ts`](src/lib/utils/projectStorage.ts) - KNOWN ISSUE

---

## Testing Checklist

### Video Upload & Preview (VideoFlam)
- [ ] MP4 upload: Accepts file, displays in preview
- [ ] MOV upload: Accepts file, displays in preview
- [ ] WebM upload: Accepts file, displays in preview
- [ ] Large file (100MB+): Upload handles gracefully
- [ ] Canvas dimensions: Match source video dimensions

### Trim Control (VideoFlam)
- [ ] Drag start handle: Updates trimStart ratio
- [ ] Drag end handle: Updates trimEnd ratio
- [ ] Playback stops at trimEnd: Doesn't play past trim boundary
- [ ] Duration display: Shows trimmed duration correctly
- [ ] Non-destructive: Original video unchanged

### Subtitle Generation (VideoFlam)
- [ ] Deepgram transcription: Returns segments with word-level timestamps
- [ ] Language auto-detect: Works for English, Spanish, French
- [ ] Language override: Respects specified language code
- [ ] Error handling: Shows helpful message if API fails
- [ ] Cancellation: User can cancel mid-transcription

### Subtitle Styling (VideoFlam)
- [ ] Template selection: Flow/focus templates render correctly
- [ ] Font size: Small/medium/large render at correct sizes
- [ ] Max lines: 1-line and 2-line layouts work
- [ ] Text color: Color picker updates subtitle color
- [ ] Outline: Outline toggle and color work
- [ ] Shadow: Shadow toggle, color, opacity work
- [ ] Spotlight: Spotlight toggle and color work
- [ ] Vertical position: Slider moves subtitles up/down
- [ ] Label background: Label toggle, color, opacity work

### Title Overlay (VideoFlam)
- [ ] Text input: Title text updates in preview
- [ ] Font selection: All 6 fonts render correctly
- [ ] Alignment: Left/center/right alignment works
- [ ] Bold toggle: Bold text renders correctly
- [ ] Text color: Color picker updates title color
- [ ] Line height: Slider adjusts line spacing
- [ ] Letter spacing: Slider adjusts letter spacing
- [ ] Label background: Label toggle, color, opacity work

### Canvas Preview (VideoFlam)
- [ ] Video frame renders: Current frame displays
- [ ] Title renders: Title appears at correct position
- [ ] Subtitle renders: Active subtitle appears at correct time
- [ ] Sync accuracy: Subtitle timing matches Deepgram timestamps
- [ ] Playback sync: Canvas updates match video playback

### Script Generation (Explainer)
- [ ] Topic input: Accepts text
- [ ] Audience input: Accepts text
- [ ] Duration selection: 30s/1min/2min options work
- [ ] URL input: Optional, accepts URLs
- [ ] Gemini API call: Returns script and image suggestions
- [ ] Error handling: Shows helpful message if API fails

### Script Editing (Explainer)
- [ ] Edit script text: Changes persist
- [ ] Panel preview: Shows panels split by sentences
- [ ] Panel count: Matches sentence count

### Voiceover Recording (Explainer)
- [ ] Record audio: MediaRecorder captures voice
- [ ] Playback: Audio plays back correctly
- [ ] Duration: Matches actual recording length
- [ ] Silence removal: Optional, removes silence gaps
- [ ] Error handling: Shows helpful message if recording fails

### Image Upload & Cropping (Explainer)
- [ ] Upload image: Accepts JPG, PNG, WebP
- [ ] Crop tool: Allows cropping to canvas aspect ratio
- [ ] Assign to panel: Image stores in panel state
- [ ] Multiple images: Can upload different images per panel
- [ ] Aspect ratio: Images crop to correct dimensions (9:16, 1:1, or 16:9)

### Ken Burns & Transitions (Explainer)
- [ ] Ken Burns preset: none/zoom-in/zoom-out options work
- [ ] Ken Burns speed: slow/medium/fast options work
- [ ] Transition preset: none/zoom-in/zoom-out/push-left/push-up options work
- [ ] Transition speed: slower/normal/faster options work
- [ ] Preview rendering: Effects display in real-time preview
- [ ] Export rendering: Effects render correctly in exported video

### Canvas Preview (Explainer)
- [ ] Panel image renders: Current panel image displays
- [ ] Ken Burns effect: Zoom animation plays during panel
- [ ] Transition effect: Transition plays between panels
- [ ] Audio sync: Canvas updates match audio playback
- [ ] Playback controls: Play/pause/seek work

### Project Persistence (Explainer)
- [ ] Save project: Project saves to localStorage + IndexedDB
- [ ] Load project: Project restores from storage
- [ ] List projects: Archive shows all saved projects
- [ ] Delete project: Project removes from storage
- [ ] Export project: Project exports as blob
- [ ] Import project: Project imports from blob

### Export (Both)
- [ ] Android Chrome: MP4 downloads via WebCodecs
- [ ] Desktop Chrome: MP4 downloads via WebCodecs
- [ ] iOS Safari: WebM downloads locally (acceptable fallback)
- [ ] Firefox: WebM downloads locally (acceptable fallback)
- [ ] Trim applied (VideoFlam): Exported video respects trim boundaries
- [ ] Duration correct: Exported video duration matches expected
- [ ] Audio included: Exported video has audio track
- [ ] Subtitles burned (VideoFlam): Subtitles appear in exported video
- [ ] Title burned (VideoFlam): Title appears in exported video
- [ ] Ken Burns rendered (Explainer): Ken Burns effects appear in exported video
- [ ] Transitions rendered (Explainer): Transitions appear in exported video
- [ ] Very long video (10+ min): Export doesn't timeout
- [ ] Rapid successive exports: No race conditions

### Edge Cases
- [ ] Slow network: Cloud transcode retries on 404
- [ ] Browser back button: State preserved or gracefully cleared
- [ ] Video with no audio (VideoFlam): Handles gracefully
- [ ] Very small video (320x240): Exports correctly
- [ ] Very large video (4K): Exports without memory issues
- [ ] Empty script (Explainer): Handles gracefully
- [ ] Very long script (Explainer): Splits into many panels correctly

---

## Navigating the Codebase by Task

### Getting Started with VideoFlam
1. **Read this file (AGENTS.md)** - 5 minutes for complete overview
2. **Check "Critical Rules & Gotchas"** - Avoid breaking patterns
3. **Check "Common Pitfalls for Agents"** - Learn from past mistakes
4. **Bookmark `/docs/archive/SUBFLAM_PLAN.md`** - For context
5. **Check `/docs/archive/QUALITY_REPORT.md`** - Known issues and fixes

### Implementing VideoFlam Changes
1. Start: [`src/lib/components/VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) (lines 1-100)
2. Upload handler: `handleVideoUpload()` method
3. Canvas sizing: Auto-set from `videoElement.videoWidth`/`videoHeight`
4. Consult: "VideoFlam Gotchas" section

### Implementing Subtitle Changes
1. Start: [`src/lib/components/SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte) (main container)
2. Transcription: Call `/api/transcribe-deepgram` endpoint
3. Rendering: [`src/lib/utils/subtitles.ts`](src/lib/utils/subtitles.ts) (`drawSubtitle()`, `getActiveSegment()`)
4. Styling: SubtitlePanel controls (callback-based props)
5. Consult: "Subtitle Styling" section in Testing Checklist

### Implementing Title Changes
1. Start: [`src/lib/components/TitlePanel.svelte`](src/lib/components/TitlePanel.svelte) (main container)
2. Rendering: [`src/lib/utils/compositor.ts`](src/lib/utils/compositor.ts) (`drawTitle()` pattern)
3. Styling: TitlePanel controls (callback-based props)
4. Consult: "Title Overlay" section in Testing Checklist

### Implementing Trim Control Changes
1. Start: [`src/lib/components/VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) (trim state)
2. Drag handlers: Update `trimStart`/`trimEnd` ratios
3. Playback: Enforce `trimEnd * videoDuration` boundary
4. Export: Pass trimmed duration to `smartExportVideo()`
5. Consult: "Breaking Trim Control Pattern" in Common Pitfalls

### Implementing Explainer Changes
1. Start: [`src/lib/components/ExplainerPage.svelte`](src/lib/components/ExplainerPage.svelte) (main container)
2. Script generation: [`src/routes/api/generate-script/+server.ts`](src/routes/api/generate-script/+server.ts)
3. Panel creation: [`src/lib/stores/videoProject.ts:buildPanelsFromSegments()`](src/lib/stores/videoProject.ts)
4. Rendering: [`src/lib/utils/explainer-renderer.ts`](src/lib/utils/explainer-renderer.ts)
5. Export: [`src/lib/utils/explainer-export.ts`](src/lib/utils/explainer-export.ts)

### Implementing Export Changes
1. Entry point: [`src/lib/utils/video-export.ts:smartExportVideo()`](src/lib/utils/video-export.ts)
2. Branch A (WebCodecs): [`src/lib/utils/webcodecs-export.ts`](src/lib/utils/webcodecs-export.ts)
3. Branch B (MediaRecorder): [`src/lib/utils/video-export.ts:exportCanvasVideoLegacy()`](src/lib/utils/video-export.ts)
4. Branch C (Cloud): [`src/routes/api/transcode/+server.ts`](src/routes/api/transcode/+server.ts)
5. Consult: "Export-Specific Gotchas" section

### Implementing Deepgram Integration Changes
1. Start: [`src/routes/api/transcribe-deepgram/+server.ts`](src/routes/api/transcribe-deepgram/+server.ts) (API handler)
2. Request format: multipart/form-data with audio file
3. Response format: `{ segments: SubtitleSegment[] }` with word-level timestamps
4. Error handling: Return helpful error messages
5. Consult: "Deepgram Integration Gotchas" section

### Implementing Gemini Integration Changes
1. Start: [`src/routes/api/generate-script/+server.ts`](src/routes/api/generate-script/+server.ts) (API handler)
2. Request format: JSON with topic, audience, duration, url
3. Response format: `{ script: string, imageSuggestions: string[] }`
4. Prompt config: [`src/lib/config/scriptGeneratorPrompt.json`](src/lib/config/scriptGeneratorPrompt.json)
5. Error handling: Return helpful error messages

### Implementing Canvas Rendering Changes
1. Start: [`src/lib/components/VideoSubtitlePage.svelte:renderFrame()`](src/lib/components/VideoSubtitlePage.svelte)
2. Layer order: Video frame → Title → Subtitle
3. Composition: [`src/lib/utils/compositor.ts`](src/lib/utils/compositor.ts)
4. Subtitle rendering: [`src/lib/utils/subtitles.ts:drawSubtitle()`](src/lib/utils/subtitles.ts)
5. Consult: "Canvas Preview" section in Testing Checklist

### Debugging Issues
1. **Search `/docs/archive/SUBFLAM_PLAN.md`** for your symptom
2. Check "Critical Rules & Gotchas" section
3. Check "Common Pitfalls for Agents" section
4. Review error logs in browser console
5. Test with minimal video (small MP4) to isolate issues

---

## Reference Documents

- **AGENTS.md** - Complete agent reference (this is your primary guide)
- **docs/archive/SUBFLAM_PLAN.md** - Complete context and design decisions
- **docs/archive/QUALITY_REPORT.md** - Known issues and fixes
- **docs/archive/TROUBLESHOOTING.md** - Q&A for common problems

---

**Last Updated:** June 2026
**Loaded at:** Session start (every Cline session)
