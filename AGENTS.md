# VideoFlam - AI Agent Reference

**Purpose:** Single-source-of-truth for AI agents working on VideoFlam
**Status:** Production (Video Subtitle + Title Overlay Complete)
**Updated:** May 2026 (Deepgram Nova-3 Integration)

---

## Quick Start

**What is VideoFlam?** A mobile-first web app that adds subtitles and title overlays to uploaded videos using Deepgram transcription, with real-time canvas preview and MP4 export.

**Tech Stack:**
- SvelteKit 2 + Svelte 5 (TypeScript)
- Cloudflare Pages (hosting)
- Native CSS variables (no Tailwind)
- Deepgram Nova-3 API (transcription with word-level timestamps)
- WebCodecs API (MP4 encoding on Android)
- MediaRecorder fallback (iOS/Firefox → cloud transcoding)
- Canvas composition (subtitle + title rendering)

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
│   ├── +page.svelte              # Main app container (VideoSubtitlePage)
│   ├── +layout.svelte            # Root layout
│   └── api/
│       ├── transcribe-deepgram/+server.ts  # Deepgram Nova-3 transcription
│       └── transcode/+server.ts            # Cloud video transcoding (api.video)
├── lib/
│   ├── stores.ts                 # Empty (minimal stores for VideoFlam)
│   ├── components/
│   │   ├── VideoSubtitlePage.svelte  # Main app (1483 lines)
│   │   │   ├── Video upload & preview
│   │   │   ├── Trim control (in-point/out-point)
│   │   │   ├── Canvas rendering (video + title + subtitles)
│   │   │   ├── Playback controls
│   │   │   └── Export orchestration
│   │   ├── SubtitlePanel.svelte      # Subtitle generation & styling (1649 lines)
│   │   │   ├── Audio extraction from video
│   │   │   ├── Deepgram transcription
│   │   │   ├── Subtitle styling controls
│   │   │   └── Word-level editing
│   │   ├── TitlePanel.svelte         # Title overlay controls (733 lines)
│   │   │   ├── Title text input
│   │   │   ├── Font selection
│   │   │   ├── Alignment & styling
│   │   │   └── Label background controls
│   │   ├── ColorPicker.svelte        # HSB color picker
│   │   ├── Dropdown.svelte           # Reusable dropdown component
│   │   ├── TogglePanel.svelte        # Collapsible panel (reusable)
│   │   ├── PlayButton.svelte         # Play/pause button
│   │   └── ImageCropDrawer.svelte    # Image crop overlay (unused)
│   ├── utils/
│   │   ├── video-export.ts           # Export orchestration (smartExportVideo)
│   │   ├── webcodecs-export.ts       # WebCodecs + Mediabunny (H.264/MP4)
│   │   ├── subtitles.ts              # Subtitle rendering + composition (854 lines)
│   │   ├── transcription.ts          # Whisper utilities (exists but unused)
│   │   ├── transcription-worker.ts   # Whisper worker (exists but unused)
│   │   └── compositor.ts             # Canvas layer composition
│   ├── config/
│   │   └── subtitlePlaceholders.json # Subtitle style templates
│   ├── server/
│   │   ├── audioNormalize.ts         # Audio normalization (unused)
│   │   └── silenceRemoval.ts         # Silence removal (unused)
│   └── types/
│       └── soundtouchjs.d.ts         # Type definitions
├── app.css                       # Global styles + CSS variables
└── app.html                      # HTML template

static/
  ├── icons/                        # SVG icons + logo files
  ├── fonts/                        # Self-hosted fonts (Inter, Lora, Playfair, Roboto Slab, Saira, Bebas, Oswald)
  ├── robots.txt                    # Disallow: / (no indexing)
  └── manifest.json                 # PWA manifest
```

---

## Core Workflow

### 1. Video Upload
- User uploads MP4, MOV, or WebM video
- [`VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) stores video blob and extracts dimensions
- Canvas auto-sized to match video dimensions

### 2. Audio Extraction
- [`SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte) extracts audio from video element
- Audio blob passed to Deepgram for transcription

### 3. Transcription
- **Endpoint:** POST `/api/transcribe-deepgram`
- **Provider:** Deepgram Nova-3 (word-level timestamps)
- **Input:** Audio blob (multipart/form-data)
- **Output:** `{ segments: SubtitleSegment[] }` with word-level timing
- **Language:** Auto-detect or specify ISO 639-1 code

### 4. Subtitle Styling
- User controls via [`SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte):
  - Template (flow/focus)
  - Font size, max lines
  - Text color, outline, shadow, spotlight
  - Vertical position
  - Label background styling

### 5. Title Overlay
- User controls via [`TitlePanel.svelte`](src/lib/components/TitlePanel.svelte):
  - Title text
  - Font (Inter, Lora, Roboto Slab, Saira, Playfair Display, Bebas Neue)
  - Alignment (left/center/right)
  - Text color, bold, line height, letter spacing
  - Label background (color, opacity, padding, border radius)

### 6. Trim Control
- Dual-handle scrubber (in-point / out-point)
- 0–1 ratio format (matching waveform trimmer pattern)
- Non-destructive (applied at export time)
- Playback stops at `trimEnd * videoDuration`

### 7. Canvas Preview
- Real-time rendering during playback:
  1. Draw video frame at current time
  2. Draw title overlay (if enabled)
  3. Draw subtitle (if enabled and active)
- Callback-based rendering: `renderFrame(currentTime)`

### 8. Export
- **Entry point:** [`smartExportVideo()`](src/lib/utils/video-export.ts)
- **Three-tier strategy:**
  1. **WebCodecs + Mediabunny** (Android Chrome, Chrome Desktop) → MP4
  2. **MediaRecorder** (iOS Safari, Firefox) → WebM
  3. **Cloud transcoding** (api.video) → MP4 (fallback if needed)
- **Output:** MP4 (preferred) or WebM
- **Duration:** Respects trim boundaries (trimStart to trimEnd)

---

## API Endpoints

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

---

## Key Components

### [`VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) (1483 lines)

Main application container. Manages:
- Video upload and playback
- Canvas rendering
- Trim control
- Subtitle/title state
- Export orchestration

**State:**
```typescript
let videoBlob: Blob | null;
let videoDuration: number;
let canvasWidth: number;
let canvasHeight: number;
let trimStart: number;  // 0–1 ratio
let trimEnd: number;    // 0–1 ratio
let isPlaying: boolean;
let currentTime: number;
let subtitleSegments: SubtitleSegment[];
let subtitleStyle: SubtitleStyle;
let subtitlesEnabled: boolean;
let isExporting: boolean;
let exportProgress: ExportProgress | null;
```

**Key Methods:**
- `handleVideoUpload()` - Process uploaded video
- `renderFrame(currentTime)` - Canvas rendering callback
- `startExport()` - Trigger export pipeline
- `downloadBlob()` - Save exported video

### [`SubtitlePanel.svelte`](src/lib/components/SubtitlePanel.svelte) (1649 lines)

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

### [`TitlePanel.svelte`](src/lib/components/TitlePanel.svelte) (733 lines)

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

## Environment Variables

Set in Cloudflare Pages → Settings → Environment variables:

```env
DEEPGRAM_VTT_KEY=<Deepgram API key>
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

1. **Simplicity first** - Single-purpose tool (video subtitles only)
2. **No auth system** - Public URL, hidden from search engines
3. **Deepgram API key required** - Must be set in Cloudflare environment
4. **Base64 encoding** - Use `btoa()` not `Buffer` (Cloudflare compatibility)
5. **Canvas context reset** - Must clear canvas before each frame render (`ctx.clearRect()`)
6. **Robots.txt noindex** - Must remain in [`static/robots.txt`](static/robots.txt)
7. **Manifest.json display** - Currently set to `"display": "browser"`

### Export-Specific Gotchas

- **WebCodecs audio NOT played during export** - Rendering uses time-based calculation, not live playback
- **H.264 requires even dimensions** - Canvas auto-corrected in [`webcodecs-export.ts`](src/lib/utils/webcodecs-export.ts)
- **Canvas copy needed** - Offscreen canvas required to handle dimension correction
- **Audio mono→stereo conversion** - Many mobile AAC encoders reject mono; code converts automatically
- **Mediabunny lazy-load** - Loaded dynamically to keep initial bundle small

### Video Subtitle Page Gotchas

- **Canvas `drawImage()` with video element** - Works on most browsers but has edge cases on iOS Safari. Fallback to cloud transcode is automatic.
- **Audio extraction timing** - Must wait for `loadedmetadata` before extracting audio from video element. Premature extraction yields silent audio.
- **Trim boundaries in playback** - Playback must stop exactly at `trimEnd * videoDuration`, not video duration.
- **SubtitlePanel/TitlePanel prop binding** - Both use callback-based props, NOT two-way binding. Must update parent state via callbacks.
- **Video dimensions for export** - Canvas width/height must match source video dimensions. Auto-set from `videoElement.videoWidth`/`videoHeight`.

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

---

## Testing Checklist

### Video Upload & Preview
- [ ] MP4 upload: Accepts file, displays in preview
- [ ] MOV upload: Accepts file, displays in preview
- [ ] WebM upload: Accepts file, displays in preview
- [ ] Large file (100MB+): Upload handles gracefully
- [ ] Canvas dimensions: Match source video dimensions

### Trim Control
- [ ] Drag start handle: Updates trimStart ratio
- [ ] Drag end handle: Updates trimEnd ratio
- [ ] Playback stops at trimEnd: Doesn't play past trim boundary
- [ ] Duration display: Shows trimmed duration correctly
- [ ] Non-destructive: Original video unchanged

### Subtitle Generation
- [ ] Deepgram transcription: Returns segments with word-level timestamps
- [ ] Language auto-detect: Works for English, Spanish, French
- [ ] Language override: Respects specified language code
- [ ] Error handling: Shows helpful message if API fails
- [ ] Cancellation: User can cancel mid-transcription

### Subtitle Styling
- [ ] Template selection: Flow/focus templates render correctly
- [ ] Font size: Small/medium/large render at correct sizes
- [ ] Max lines: 1-line and 2-line layouts work
- [ ] Text color: Color picker updates subtitle color
- [ ] Outline: Outline toggle and color work
- [ ] Shadow: Shadow toggle, color, opacity work
- [ ] Spotlight: Spotlight toggle and color work
- [ ] Vertical position: Slider moves subtitles up/down
- [ ] Label background: Label toggle, color, opacity work

### Title Overlay
- [ ] Text input: Title text updates in preview
- [ ] Font selection: All 6 fonts render correctly
- [ ] Alignment: Left/center/right alignment works
- [ ] Bold toggle: Bold text renders correctly
- [ ] Text color: Color picker updates title color
- [ ] Line height: Slider adjusts line spacing
- [ ] Letter spacing: Slider adjusts letter spacing
- [ ] Label background: Label toggle, color, opacity work

### Canvas Preview
- [ ] Video frame renders: Current frame displays
- [ ] Title renders: Title appears at correct position
- [ ] Subtitle renders: Active subtitle appears at correct time
- [ ] Sync accuracy: Subtitle timing matches Deepgram timestamps
- [ ] Playback sync: Canvas updates match video playback

### Export
- [ ] Android Chrome: MP4 downloads via WebCodecs
- [ ] Desktop Chrome: MP4 downloads via WebCodecs
- [ ] iOS Safari: WebM downloads locally (acceptable fallback)
- [ ] Firefox: WebM downloads locally (acceptable fallback)
- [ ] Trim applied: Exported video respects trim boundaries
- [ ] Duration correct: Exported video duration matches trimmed duration
- [ ] Audio included: Exported video has audio track
- [ ] Subtitles burned: Subtitles appear in exported video
- [ ] Title burned: Title appears in exported video
- [ ] Very long video (10+ min): Export doesn't timeout
- [ ] Rapid successive exports: No race conditions

### Edge Cases
- [ ] Slow network: Cloud transcode retries on 404
- [ ] Browser back button: State preserved or gracefully cleared
- [ ] Video with no audio: Handles gracefully
- [ ] Very small video (320x240): Exports correctly
- [ ] Very large video (4K): Exports without memory issues

---

## Navigating the Codebase by Task

### Getting Started with VideoFlam
1. **Read this file (AGENTS.md)** - 5 minutes for complete overview
2. **Check "Critical Rules & Gotchas"** - Avoid breaking patterns
3. **Check "Common Pitfalls for Agents"** - Learn from past mistakes
4. **Bookmark `/docs/archive/SUBFLAM_PLAN.md`** - For context
5. **Check `/docs/archive/QUALITY_REPORT.md`** - Known issues and fixes

### Implementing Video Upload Changes
1. Start: [`src/lib/components/VideoSubtitlePage.svelte`](src/lib/components/VideoSubtitlePage.svelte) (lines 1-100)
2. Upload handler: `handleVideoUpload()` method
3. Canvas sizing: Auto-set from `videoElement.videoWidth`/`videoHeight`
4. Consult: "Video Subtitle Page Gotchas" section

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
5. Consult: "Trim Control Pattern Confusion" in Common Pitfalls

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

**Last Updated:** May 2026
**Loaded at:** Session start (every Cline session)
