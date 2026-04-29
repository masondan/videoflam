# AudioFlam - AI Agent Reference

**Purpose:** Single-source-of-truth for AI agents working on AudioFlam
**Status:** Production (Transcription + Two-Speaker Mode + Video Subtitles + MiniMax Integration Complete)
**Updated:** April 2026 (Latest: MiniMax + Video Subtitles implementation)

---

## Quick Start

**What is AudioFlam?** A mobile-first web app that converts text scripts to audio (TTS), creates audiograms (image + audio + waveform + effects → MP4), transcribes audio (Whisper), and adds subtitles to uploaded videos.

**Tech Stack:**
- SvelteKit 2 + Svelte 5 (TypeScript)
- Cloudflare Pages (hosting)
- Native CSS variables (no Tailwind)
- WebCodecs API (MP4 encoding on Android)
- MediaRecorder fallback (iOS/Firefox → cloud transcoding)
- Whisper (transcription via @huggingface/transformers)
- Subtitle rendering via canvas composition

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
│   ├── +page.svelte              # Header + TTS/Audiogram/Transcribe/Subtitle Video tabs
│   ├── +layout.svelte            # Root layout
│   └── api/
│       ├── tts/+server.ts        # TTS endpoint (Azure + YarnGPT + MiniMax)
│       ├── minimax-refresh/+server.ts # MiniMax voice clone refresh (cron)
│       ├── transcode/+server.ts  # Cloud video transcoding
│       ├── audio/
│       │   ├── silence-removal/+server.ts # Silence removal
│       │   └── normalize/+server.ts       # Audio normalization
│       └── normalize/+server.ts   # Audio normalization (legacy path)
├── lib/
│   ├── audioProcessing.ts        # Audio processing utilities (silence, concatenation)
│   ├── stores.ts                 # Voice definitions, app state, preloadedTTSAudio
│   ├── components/
│   │   ├── VoiceDropdown.svelte  # Voice selector
│   │   ├── AudiogramPage.svelte  # Main audiogram UI
│   │   ├── CompositionCanvas.svelte # Canvas preview/export
│   │   ├── ImageCropDrawer.svelte # Image crop overlay
│   │   ├── AudioImport.svelte    # Audio upload + waveform
│   │   ├── Dropdown.svelte       # Reusable dropdown component
│   │   ├── WaveformPanel.svelte  # Waveform settings
│   │   ├── TitlePanel.svelte     # Title text/font/style
│   │   ├── LightEffectPanel.svelte # Bokeh effect controls
│   │   ├── ColorPicker.svelte    # HSB color picker
│   │   ├── TogglePanel.svelte    # Collapsible panel (reusable)
│   │   ├── SpeedSlider.svelte    # Audio speed control
│   │   ├── SpeedSilenceControls.svelte # Speed + silence trim
│   │   ├── SilenceSlider.svelte  # Silence detection
│   │   ├── SpeedBlockModal.svelte # Speed warning modal
│   │   ├── TranscribePage.svelte # Transcription UI (Whisper)
│   │   ├── VideoSubtitlePage.svelte # Video subtitle/composition UI (Stage 1-4 complete)
│   │   ├── SubtitlePanel.svelte  # Subtitle transcription + styling controls
│   │   ├── VoiceDropdown.svelte  # Voice selector (two-speaker mode)
│   │   └── [other UI components]
│   ├── utils/
│   │   ├── compositor.ts         # Canvas layer composition
│   │   ├── recording.ts          # MediaRecorder wrapper
│   │   ├── timestretch.ts        # Audio speed adjustment (SoundTouchJS)
│   │   ├── waveform.ts           # FFT preprocessing + rendering (precomputeFrequencyFrames)
│   │   ├── webcodecs-export.ts   # WebCodecs + Mediabunny (H.264/MP4)
│   │   ├── video-export.ts       # Export orchestration (smartExportVideo)
│   │   ├── subtitles.ts          # Subtitle rendering + word-level composition
│   │   ├── transcription-worker.ts # Whisper worker (off-main-thread)
│   │   └── transcription.ts      # Transcription utilities (Hugging Face)
│   └── server/                   # Server-side utilities
│       ├── audioNormalize.ts     # Audio normalization
│       └── silenceRemoval.ts     # Silence removal logic
├── app.css                       # Global styles + CSS variables
└── app.html                      # HTML template

static/
  ├── icons/                        # SVG icons (22 for audiogram)
  ├── fonts/                        # Self-hosted fonts (Inter, Lora, Playfair, Roboto Slab, Saira, Bebas)
  ├── voices/                       # Sample voice files (for preview) + MiniMax samples
  ├── voice-samples/                # MiniMax voice clone training samples (Malawi + Zimbabwe)
  ├── robots.txt                    # Disallow: / (no indexing)
  └── manifest.json                 # PWA manifest
```

---

## TTS Providers

### Azure Speech (Recommended)
- **Speed:** ~3 seconds
- **Auth:** API key via `Ocp-Apim-Subscription-Key` header
- **Critical:** Cloudflare Workers require explicit `Host` header
- **Voices:**
  - Nigerian: `en-NG-AbeoNeural` (M), `en-NG-EzinneNeural` (F)
  - British: `en-GB-RyanNeural` (M), `en-GB-BellaNeural` (F), `en-GB-HollieNeural` (F), `en-GB-OliverNeural` (M)

### YarnGPT (Native Nigerian)
- **Speed:** ~30 seconds
- **Auth:** Bearer token
- **Voices:** Adaora (F), Idera (F), Regina (F), Tayo (M), Femi (M)
- **Endpoint:** `https://yarngpt.ai/api/v1.1/tts`
- **Format:** MP3

### API Endpoint: POST `/api/tts`

```json
Request:
{
  "text": "Hello world",
  "voiceName": "en-NG-AbeoNeural",
  "provider": "azure"
}

Response:
{
  "audioContent": "<base64-encoded MP3>",
  "format": "mp3"
}
```

---

## MiniMax Voice Clone Persistence

- **Voice clones auto-delete** after 7 days of inactivity
- **Weekly cron refresh:** `/api/minimax-refresh` pings each voice with single character (cost ~$0.0000024/week)
- **Clone IDs:** Stored in `src/lib/stores.ts:MINIMAX_VOICES` (format: min 10 chars, alphanumeric only)
- **Voice samples:** Stored in `static/voices/` (chisomo.mp3, mercy.mp3, tawanda.mp3, precious.mp3)
- **Training samples:** Original WAV files in `static/voice-samples/` (used for cloning, not shipped to browser)

---

## Audio Processing

### Silence Removal
- **Endpoint:** POST `/api/audio/silence-removal`
- **Levels:** `default`, `trim`, `tight`
- **Input:** Base64-encoded audio
- **Output:** Base64-encoded MP3 + duration metrics
- **File:** `src/lib/server/silenceRemoval.ts`

### Audio Normalization
- **Endpoint:** POST `/api/normalize`
- **Purpose:** Normalize audio levels before export
- **File:** `src/lib/server/audioNormalize.ts`

### Time-Stretching (Speed Control)
- **Library:** SoundTouchJS
- **Function:** `timeStretch(buffer, tempo)` in `src/lib/utils/timestretch.ts`
- **Range:** 0.5x to 2.0x speed
- **Used in:** TTS speed controls, two-speaker mode

---

## Transcription (Whisper)

### Overview
- **Model:** OpenAI Whisper (via @huggingface/transformers)
- **Execution:** Web Worker (off-main-thread)
- **Languages:** 99+ (multilingual mode) or English-only (quantized)
- **Quantization:** Optional (smaller model, faster on mobile)

### API
```typescript
// Load model (one-time)
await loadWhisperModel({ multilingualEnabled: true, quantized: true });

// Transcribe audio
const result = await transcribeAudio(audioBlob, {
  multilingualEnabled: true,
  quantized: true,
  language: 'auto' // or ISO 639-1 code
});

// Result includes segments with timestamps
result.segments.forEach(seg => console.log(`[${seg.start}s] ${seg.text}`));

// Release model from memory
await releaseModel();
```

### Files
- `src/lib/components/TranscribePage.svelte` - UI
- `src/lib/utils/transcription.ts` - Main API
- `src/lib/utils/transcription-worker.ts` - Worker thread
- `src/lib/utils/transcription.ts:SUPPORTED_LANGUAGES` - Language list

### Performance
- **First load:** 50-200MB download (model cache)
- **Quantized:** ~100MB, faster on mobile
- **Full:** ~350MB, more accurate
- **Transcription:** 30-120s per minute of audio (device-dependent)

---

## Two-Speaker Mode

### Overview
- Compose TTS from two different voices
- Per-speaker speed and silence controls
- Audio merging pipeline
- Works with all three TTS providers (Azure, YarnGPT, MiniMax)

### Implementation
- **File:** `src/routes/+page.svelte` (lines 88-90, 200+)
- **State:** `twoSpeakerMode`, `speaker1`, `speaker2`, `speaker1Speed`, `speaker2Speed`
- **Audio merge:** `concatenateAudioSegments()` in `src/lib/audioProcessing.ts`
- **UI:** Speaker dropdowns, speed sliders, silence controls

### Workflow
1. Select two voices (speaker1, speaker2) from any provider
2. Generate TTS for each voice separately
3. Apply speed/silence adjustments per speaker
4. Merge audio segments
5. Export as single audiogram

---

## Video Subtitle Page

### Overview
- Upload device video (MP4, MOV, WebM)
- Extract audio for transcription
- Optionally trim video (in-point/out-point)
- Add subtitles (via Whisper transcription) and title overlay
- Export as MP4 (WebCodecs → MediaRecorder → cloud transcode fallback)

### Implementation
- **File:** `src/lib/components/VideoSubtitlePage.svelte` (1412 lines, complete Stages 1-4)
- **State Management:**
  - `videoBlob`, `videoDuration`, `canvasWidth`, `canvasHeight`
  - `trimStart`, `trimEnd` (0–1 ratios for non-destructive trimming)
  - `subtitleSegments`, `subtitleStyle`, `subtitlesEnabled` (from SubtitlePanel)
  - `titleText`, `titleFont`, `titleColor`, `labelColor` (from TitlePanel)
  - Playback: `isPlaying`, `currentTime`, `videoElement`
  - Export: `isExporting`, `exportProgress`, `exportCancelled`

### UI Components
1. **Upload zone:** Drag-drop or file input (MP4/MOV/WebM)
2. **Video preview:** HTML5 `<video>` element with playback controls
3. **Trim control:** Dual-handle scrubber (in-point / out-point) with duration display
4. **Canvas preview:** Real-time rendering of video frame + title + subtitles during playback
5. **SubtitlePanel:** Extracts audio, generates subtitles, controls styling
6. **TitlePanel:** Title text, font, alignment, label styling
7. **Export button:** Triggers `smartExportVideo()` with trimmed duration

### Canvas Rendering
```typescript
function renderFrame(currentTime: number): void {
  // Seek to trimStart + currentTime
  videoElement.currentTime = currentTime + trimStart;
  
  // Draw video frame
  ctx.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight);
  
  // Draw title layer
  drawTitle(ctx, titleText, titleFont, ...);
  
  // Draw subtitle if enabled and active
  if (subtitlesEnabled) {
    const activeSegment = getActiveSegment(subtitleSegments, currentTime);
    if (activeSegment) {
      drawSubtitle(ctx, activeSegment, subtitleStyle, ...);
    }
  }
}
```

### Audio Extraction from Video
```typescript
async function extractAudioFromVideo(videoBlob: Blob): Promise<Blob> {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaElementAudioSource(video);
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);
  
  const mediaRecorder = new MediaRecorder(destination.stream);
  // ... record audio during video playback ...
  return audioBlob;
}
```

### Trim Control Pattern
- Two drag handles at 0–1 ratios of total duration
- Playback stops at `trimEnd * videoDuration`
- Trim is applied at export time (non-destructive)
- Pattern reused from waveform trimmer in AudiogramPage

### Export Integration
- Calls `smartExportVideo(canvas, audioBlob, width, height, trimmedDuration, renderCallback)`
- Respects three-tier export strategy (WebCodecs → MediaRecorder → cloud transcode)
- Audio passed to export is extracted audio (if subtitles enabled) or silence

### Key Files
- `src/lib/components/VideoSubtitlePage.svelte` - Main component
- `src/lib/components/SubtitlePanel.svelte` - Transcription + subtitle styling (reused, unchanged)
- `src/lib/components/TitlePanel.svelte` - Title controls (reused, unchanged)
- `src/lib/utils/subtitles.ts` - `drawSubtitle()`, `getActiveSegment()`, subtitle rendering
- `src/lib/utils/video-export.ts` - `smartExportVideo()` export orchestration

### Status
✅ Fully implemented and working (April 2026)
✅ All four stages complete: scaffold, canvas/trim, integration, testing

---

## Environment Variables

Set in Cloudflare Pages → Settings → Environment variables:

```env
AZURE_SPEECH_KEY=<84-char key>
AZURE_SPEECH_REGION=eastus
YARNGPT_API_KEY=<API key>
MINIMAX_API_KEY=<Bearer token for MiniMax API>
APIVIDEO_API_KEY=<API key for cloud transcoding>
```

**Important:** After updating env vars, deploy to activate.

### Optional (Development)
- Create `.env.local` in project root for local testing
- Never commit `.env.local` to git

---

## MP4 Export Architecture

### The Challenge
Android Chrome claims H.264 support but fails when actually encoding. Affects 85% of users.

### The Solution: Three-Tier Strategy

```
Export Button
├─ Tier 1: WebCodecs + Mediabunny (Android, Chrome Desktop)
│  └─ H.264 encoding locally → MP4 direct download
├─ Tier 2: MediaRecorder (iOS Safari, Firefox)
│  └─ WebM locally → No cloud needed, direct download
└─ Tier 3: Cloud transcoding (if Tier 2 fails or forced)
   └─ Upload WebM to api.video → Get MP4 → Download
```

### Implementation Details

**Smart Export Function:** `smartExportVideo()` (video-export.ts)
- Checks WebCodecs support first
- Falls back to MediaRecorder if unavailable
- Triggers cloud transcoding only if needed

**WebCodecs Path** (webcodecs-export.ts):
- Uses Mediabunny library (17KB, pure JS MP4 muxer)
- Encodes frames as H.264, audio as AAC
- 24 fps, 2 Mbps video bitrate, 96 kbps audio
- Codec: `avc1.42001f` (Baseline profile, level 3.1 for max compatibility)
- **Critical Design Decision:** Audio is encoded from AudioBuffer, NOT played during export (avoids stuttering from CPU load)

**MediaRecorder Path** (video-export.ts):
- Falls back to WebM if H.264 unavailable
- Includes internal RAF loop for continuous frame delivery (tightly coupled to MediaRecorder)
- Handles audio playback during recording

**Cloud Transcoding Path** (video-export.ts + api/transcode):
- Uploads WebM to api.video
- api.video transcodes to MP4 automatically
- Cost: Free encoding, ~$0.003/video for storage/delivery (negligible for ~200 videos/year)
- Cloudflare Worker proxies requests (avoids CORS, protects API key)
- Auto-deletes video after download

### Browser Support Matrix

| Browser | Method | Output |
|---------|--------|--------|
| Chrome Android | WebCodecs | MP4 ✅ |
| Chrome Desktop | WebCodecs | MP4 ✅ |
| Safari iOS | MediaRecorder | WebM ⚠️ |
| Firefox | MediaRecorder | WebM ⚠️ |

### Performance
- WebCodecs: 10-40s for 60s video (device-dependent)
- MediaRecorder: Similar or slower
- Cloud transcode: +10-20s (upload + transcoding time)

### Key Files
- `src/lib/utils/video-export.ts` - Main orchestration
- `src/lib/utils/webcodecs-export.ts` - H.264 encoding via Mediabunny
- `src/routes/api/transcode/+server.ts` - Cloud transcoding proxy
- `src/lib/components/AudiogramPage.svelte` - Export button integration
- `src/lib/components/CompositionCanvas.svelte` - Canvas rendering

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

### Typography & Spacing

#### Font Family (Self-hosted)
| Token | Value |
|-------|-------|
| `--font-family-base` | Inter (self-hosted), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif |

#### Font Sizes
| Token | Value | Usage |
|-------|-------|-------|
| `--font-size-xs` | 0.75rem (12px) | Captions, metadata |
| `--font-size-sm` | 0.875rem (14px) | Small labels, helper text |
| `--font-size-base` | 1rem (16px) | Body text, inputs, buttons |
| `--font-size-lg` | 1.125rem (18px) | H3, subheadings |
| `--font-size-larger` | 1.25rem (20px) | H2, section titles |
| `--font-size-xl` | 1.5rem (24px) | H1, page titles |

#### Font Weights
| Token | Value | Usage |
|-------|-------|-------|
| `--font-weight-regular` | 400 | Body text, default |
| `--font-weight-medium` | 500 | Buttons, emphasis |
| `--font-weight-semibold` | 600 | Subheadings, form labels |
| `--font-weight-bold` | 700 | Headings, strong emphasis |

#### Line Heights
| Token | Value | Usage |
|-------|-------|-------|
| `--line-height-tight` | 1.2 | Headings (H1, H2, H3) |
| `--line-height-normal` | 1.5 | Body text, paragraphs, inputs |
| `--line-height-relaxed` | 1.8 | Long-form content, descriptions |

#### Spacing (Design System Scale)
| Token | Value | Px Equivalent | Usage |
|-------|-------|--------|-------|
| `--spacing-xs` | 0.375rem | 6px | Tight spacing, icon padding |
| `--spacing-sm` | 0.625rem | 10px | Element padding, gaps between small items |
| `--spacing-md` | 1rem | 16px | Default padding, section margins |
| `--spacing-lg` | 1.25rem | 20px | Vertical spacing, section separators |
| `--spacing-xl` | 1.75rem | 28px | Large gaps, layout-level spacing |

#### Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Input fields, small buttons, small containers |
| `--radius-md` | 8px | Most buttons, containers, panels |
| `--radius-lg` | 12px | Cards, larger containers |
| `--radius-xl` | 16px | Modals, largest containers |
| `--radius-round` | 50% | Circular icons, pill buttons, circles |

**Note:** Trim Handle Bar (2px) is an approved exception for visual refinement.

#### Transitions
| Token | Value |
|-------|-------|
| `--transition-normal` | 200ms ease |

All CSS variables defined in `src/app.css`.

---

## Critical Rules & Gotchas

### DO NOT Break These

1. **Simplicity first** - Single-purpose tool, don't over-engineer
2. **No auth system** - Public URL, hidden from search engines
3. **2000 character limit** - TTS generation per request
4. **Base64 encoding** - Use `btoa()` not `Buffer` (Cloudflare compatibility)
5. **XML escaping** - Always escape user text before embedding in SSML (prevents injection)
6. **Host header required** - Azure requests in Cloudflare Workers need explicit `Host` header
7. **Audio format consistency** - All responses must include `format: 'mp3'` field
8. **Robots.txt noindex** - Must remain in `static/robots.txt` (educational use only)
9. **Manifest.json display** - Currently set to `"display": "browser"` (not standalone)

### Export-Specific Gotchas

- **WebCodecs audio NOT played during export** - Rendering uses pre-computed FFT frames, not live playback
- **Pre-computed frames critical for parity** - `precomputeFrequencyFrames()` must be called before export; determines visual output
- **H.264 requires even dimensions** - Canvas auto-corrected in webcodecs-export.ts (lines 194-196)
- **Canvas copy needed** - Offscreen canvas required to handle dimension correction
- **Audio mono→stereo conversion** - Many mobile AAC encoders reject mono; code converts automatically
- **Mediabunny lazy-load** - Loaded dynamically to keep initial bundle small
- **Type assertions risky** - `webcodecs-export.ts:445` has unchecked type assertion; add guard if changing (KNOWN ISSUE)

### TTS Gotchas

- **YarnGPT slower but native** - Nigerian voices sound more natural but take ~30s (user education needed)
- **Azure faster but slightly accented** - 3s generation but international accent
- **MiniMax API returns no audio** - Despite proper handler implementation, API consistently returns empty response. Likely due to account mismatch (GitHub OAuth login created separate account without billing). DO NOT use in production until resolved. Workaround: Route requests to Azure/YarnGPT if MiniMax selected.
- **Error handling loose** - If API fails, user gets generic "error" message (KNOWN ISSUE - see Quality Report)
- **No request throttling** - Users can spam TTS API (KNOWN ISSUE - see Quality Report)

### Transcription Gotchas

- **Worker thread isolation** - Transcription runs off-main-thread; UI stays responsive but model loading is slow
- **Model caching** - First transcription downloads 100-350MB; subsequent calls use cache
- **Language detection** - `language: 'auto'` works but may misidentify mixed-language audio
- **Quantized vs full** - Quantized is faster but less accurate; full is slower but better quality

### Video Subtitle Page Gotchas

- **Canvas `drawImage()` with video element** - Works on most browsers but has edge cases on iOS Safari when rendering to canvas. If `ctx.drawImage(videoElement)` fails, video frame may not render; fallback to cloud transcode is automatic.
- **Audio extraction timing** - Must wait for `loadedmetadata` before extracting audio from video element. Premature extraction yields silent audio.
- **Trim boundaries in playback** - Playback must stop exactly at `trimEnd * videoDuration`, not video duration. Failing to enforce this causes export to include untrimmed section.
- **Canvas context reset** - Must clear canvas before each frame render (`ctx.clearRect()`) to avoid ghosting/visual artifacts.
- **SubtitlePanel/TitlePanel prop binding** - Both use callback-based props (`onStyleChange`, `onTextChange`), NOT two-way binding. Must update parent state via callbacks, not direct mutations.
- **Video dimensions for export** - Canvas width/height must match source video dimensions to preserve quality. Auto-set from `videoElement.videoWidth`/`videoHeight` on upload.
- **Audio blob for subtitles** - Must pass extracted audio blob to SubtitlePanel for transcription. If no subtitles enabled, audio is still required for export (can pass silence or original).

---

## Current Phase Focus

✅ **Completed:**
- TTS with Azure + YarnGPT + MiniMax (single + two-speaker modes)
- Full Audiogram creation (image, audio, waveform, title, effects)
- **Waveform visual parity:** Preview and export waveforms match exactly via pre-computed FFT frames
- MP4 export via WebCodecs (Android)
- MediaRecorder fallback (iOS/Firefox)
- Cloud transcoding via api.video
- **Transcription:** Whisper model (multilingual + quantized options)
- **Audio processing:** Silence removal, normalization, time-stretching
- **Two-speaker mode:** Multi-voice TTS composition with per-speaker controls (all three providers)
- **Subtitles (audiogram):** Whisper-generated word-level subtitles burned into audiogram canvas + export (April 2026)
- **Video Subtitle Page:** Full implementation (1412 lines) with upload, trim, canvas preview, subtitle generation, title overlay, and export (April 2026) ✅ All stages complete
- **MiniMax voice cloning:** Malawi (Chisomo M, Mercy F) + Zimbabwe (Tawanda M, Precious F) voices cloned and integrated (April 2026) - **Note:** API integration complete but testing ongoing due to account/billing issue

**Waveform Export Fix (Critical Implementation):**
- `precomputeFrequencyFrames()` in `waveform.ts` performs offline FFT using Cooley-Tukey algorithm with Blackman windowing
- Generates `Uint8Array[]` frames matching `AnalyserNode.getByteFrequencyData()` output format
- Export pipeline passes pre-computed frames to `renderFrame(currentTime)` callback for frame-accurate rendering
- Eliminates visual mismatch between live preview and exported MP4 (was caused by synthetic sine-wave generation)

**Known Issues (See QUALITY_REPORT.md):**
- 🔴 **MiniMax API returns no audio** despite proper credentials (HIGH priority) - Root cause: account billing/subscription mismatch (GitHub OAuth login created separate account without subscription). Awaiting MiniMax support response. Implementation verified correct; workaround: Use Azure/YarnGPT until resolved.
- 🔴 Type assertion in `webcodecs-export.ts:445` without runtime guard (HIGH priority)
- 🔴 TTS error handling gaps - generic "error" messages (HIGH priority)
- 🟡 Audio encoding inconsistency between WebCodecs/MediaRecorder paths (MEDIUM)
- 🟡 Missing request throttling for TTS API (MEDIUM)
- 🟡 Canvas export validation gaps (MEDIUM)

**Future Development:**
- MiniMax billing issue resolution (once account is properly linked)
- TTS→Audiogram one-click integration (store exists, UI not wired)
- Enhanced iOS fallback with better error guidance
- Performance optimization (OffscreenCanvas for preview)
- Fix known issues from QUALITY_REPORT.md

---

## Architecture Decision Log

### Why WebCodecs + Mediabunny Instead of MediaRecorder?

**Context:** August 2025 - Android Chrome was producing black-screen videos with MediaRecorder H.264

**Options Considered:**
1. MediaRecorder only → Doesn't work reliably on Android
2. FFmpeg.wasm → Heavy (~5MB), slow, overkill for simple MP4
3. WebCodecs + Mediabunny → Lightweight, native H.264 support, Mediabunny is 17KB pure JS

**Decision:** Go with #3 (WebCodecs + Mediabunny)

**Why:** Direct H.264 encoding bypasses MediaRecorder's browser implementation bugs. Mediabunny proved more reliable than larger alternatives in testing.

**Document:** See `docs/archive/EXPORT_TECH_PLAN.md` for full analysis.

### Why Cloud Transcoding Instead of Browser WebM Only?

**Context:** iOS Safari doesn't support WebCodecs. Users want MP4, not WebM.

**Options:**
1. WebM only for all browsers → Users unhappy with non-standard format
2. Cloud transcoding via Cloudinary → Already used for images, but expensive (~$0.06/video)
3. Cloud transcoding via api.video → Cheap (~$0.003/video), free encoding

**Decision:** api.video with Cloudflare Worker proxy

**Why:** Free encoding + negligible storage cost. Cloudflare Worker avoids CORS issues and keeps API key server-side.

**Limitation:** Requires internet connection for iOS users (unavoidable architectural constraint).

### Why NOT Play Audio During WebCodecs Export?

**Context:** WebCodecs encoding is CPU-intensive. Playing audio during export causes stuttering.

**Decision:** Encode audio from AudioBuffer (no playback), use time-based frame rendering with pre-computed FFT data

**Why:** Guarantees smooth 24fps export without competing for CPU with Web Audio playback

**Implementation:** 
- `precomputeFrequencyFrames()` pre-computes FFT for entire audio before export starts
- `renderFrame(currentTime)` callback retrieves pre-computed frame by index instead of generating synthetic data
- Eliminates visual mismatch: export now uses same frequency data as live preview (AnalyserNode-compatible format)
- Uses Cooley-Tukey FFT with Blackman windowing for spectral accuracy

---

## Common Pitfalls for Agents

### 1. Assuming MediaRecorder H.264 Works on All Android
**Reality:** It claims support but fails in practice. Always check WebCodecs first.

### 2. Forgetting Audio MIME Type Field
**Reality:** All TTS providers must return `{ audioContent, format: 'mp3' }`. YarnGPT + MiniMax were fixed to match Azure response format.

**File:** `src/routes/api/tts/+server.ts`

### 3. Not Handling Mono Audio in WebCodecs
**Reality:** AAC encoder on mobile browsers rejects mono. Code auto-converts mono→stereo.

**File:** `src/lib/utils/webcodecs-export.ts:277-294`

### 4. Type Assertions Without Guards
**Reality:** `webcodecs-export.ts:445` does unchecked type assertion on Mediabunny target. Could fail silently if target changes.

**Fix:** Add runtime check before assertion. (KNOWN ISSUE)

### 5. Forgetting Cloudflare Workers Host Header
**Reality:** Azure Speech API requires explicit `Host` header in Cloudflare environment.

**File:** `src/routes/api/tts/+server.ts` - Header correctly set.

### 6. Breaking XML Escaping in SSML
**Reality:** User text embedded in SSML XML without escaping = potential injection. Function exists to fix this.

**File:** `src/routes/api/tts/+server.ts` - Check for `escapeXml()` or equivalent.

### 7. Blocking Main Thread During Transcription
**Reality:** Whisper model loading is slow (~30-60s). Must run in Web Worker to keep UI responsive.

**File:** `src/lib/utils/transcription.ts` - Worker management via `getWorker()`

**Pattern:** Use `workerRequest<T>()` to send messages and wait for responses.

### 8. Forgetting to Release Transcription Model
**Reality:** Whisper model consumes 100-350MB RAM. Call `releaseModel()` when done.

**File:** `src/lib/utils/transcription.ts:releaseModel()`

### 9. Not Syncing Waveform Animation Between Export Paths
**Reality:** WebCodecs (no audio playback) and MediaRecorder (with playback) need different timing logic.

**File:** `src/lib/utils/compositor.ts:renderFrame()` - Must use `currentTime` parameter, not live audio data.

### 10. Assuming Two-Speaker Audio Merges Automatically
**Reality:** Must explicitly call `concatenateAudioSegments()` after generating both voices. Works with all three providers (Azure, YarnGPT, MiniMax).

**File:** `src/lib/audioProcessing.ts` - Audio merging logic

### 11. MiniMax Account Billing Mismatch
**Reality:** GitHub OAuth creates separate account from direct subscription. Both can have same GroupID but only one has billing/subscription. ALWAYS verify account that was charged matches the account you're using for API requests. Symptoms: API returns empty audio despite proper implementation.

**File:** `src/routes/api/tts/+server.ts:handleMiniMax()` - Check MINIMAX_API_KEY points to correct account

**Workaround:** Until resolved, route MiniMax requests to Azure/YarnGPT as fallback.

### 12. Video Subtitle Trim Control Pattern Confusion
**Reality:** Trim uses 0–1 ratios (like waveform trimmer in AudiogramPage), NOT absolute seconds. Must convert to seconds when seeking: `videoElement.currentTime = currentTime + (trimStart * videoDuration)`.

**File:** `src/lib/components/VideoSubtitlePage.svelte:renderFrame()` - Trim offset applied here

### 13. Canvas drawImage() Failing on iOS Safari
**Reality:** Some iOS Safari versions fail when rendering video element to canvas (`ctx.drawImage(videoElement)`). Fallback is automatic (MediaRecorder → cloud transcode), but user may not see preview.

**File:** `src/lib/components/VideoSubtitlePage.svelte` - No workaround needed; fallback automatic

---

## Testing Checklist

### TTS Pipeline
- [ ] Azure Nigerian voice: fast (~3s), clear
- [ ] YarnGPT voice: slow (~30s), natural
- [ ] Error handling: Invalid API key shows helpful message
- [ ] Base64 decoding: Audio plays without skips/artifacts
- [ ] 2000 char limit: Enforced UI-side, rejected server-side if exceeded

### Audiogram Export
- [ ] Image upload: Accepts JPG, PNG; auto-resizes
- [ ] Audio import: Accepts MP3, WAV; waveform renders
- [ ] Composition: Image + audio + waveform sync visually
- [ ] Export Android: MP4 downloads via WebCodecs (no cloud needed)
- [ ] Export iOS: WebM downloads locally (acceptable fallback)
- [ ] Export desktop Chrome: MP4 via WebCodecs
- [ ] Export desktop Firefox: WebM locally

### Edge Cases
- [ ] Very long audio (5+ min): Export doesn't timeout
- [ ] Very large image (10MB+): Upload handles gracefully
- [ ] Slow network: Cloud transcode retries on 404 (api.video timing)
- [ ] Rapid successive exports: No race conditions
- [ ] Browser back button: State preserved (or gracefully cleared)

---

## Navigating the Codebase by Task

### Getting Started with AudioFlam
1. **Read this file (AGENTS.md)** - 5 minutes for complete overview
2. **Check "Critical Rules & Gotchas"** - Avoid breaking patterns
3. **Check "Common Pitfalls for Agents"** - Learn from past mistakes
4. **Bookmark `/docs/TROUBLESHOOTING.md`** - For debugging later
5. **Check `/docs/QUALITY_REPORT.md`** - Known issues and fixes

### Implementing TTS Changes
1. Start: `src/routes/api/tts/+server.ts` (handler)
2. Reference: `src/lib/stores.ts` (voice definitions, MINIMAX_VOICES)
3. UI: `src/routes/+page.svelte` (TTS panel, two-speaker mode)
4. **MiniMax note:** Test thoroughly before production; current API issue requires workaround
5. Consult: TROUBLESHOOTING.md → TTS Pipeline Issues

### Implementing Audiogram Changes
1. Start: `src/lib/components/AudiogramPage.svelte` (main container)
2. UI logic: Individual panel components (WaveformPanel, TitlePanel, etc.)
3. Rendering: `src/lib/components/CompositionCanvas.svelte` (canvas logic)
4. Composition: `src/lib/utils/compositor.ts` (layer stacking)
5. Consult: TROUBLESHOOTING.md → Audiogram Export Issues

### Implementing Video Subtitle Changes
1. Start: `src/lib/components/VideoSubtitlePage.svelte` (main container, 1412 lines)
2. Upload/trim logic: Built-in to VideoSubtitlePage (no external components)
3. Subtitle rendering: `src/lib/utils/subtitles.ts` (`drawSubtitle()`, `getActiveSegment()`)
4. Title rendering: Reuse `src/lib/utils/compositor.ts:drawTitle()` pattern
5. Export: Call `smartExportVideo()` from `src/lib/utils/video-export.ts`
6. Panel integration: `SubtitlePanel.svelte` + `TitlePanel.svelte` (reused unchanged)
7. Consult: TROUBLESHOOTING.md → Video Subtitle Issues (if created)

### Implementing Export Changes
1. Entry point: `src/lib/utils/video-export.ts:smartExportVideo()`
2. Branch A (WebCodecs): `src/lib/utils/webcodecs-export.ts`
3. Branch B (MediaRecorder): `src/lib/utils/video-export.ts:exportCanvasVideoLegacy()`
4. Branch C (Cloud): `src/routes/api/transcode/+server.ts`
5. Consult: TROUBLESHOOTING.md → Export Issues + ARCHITECTURE.md

### Implementing Transcription Changes
1. Start: `src/lib/components/TranscribePage.svelte` (UI)
2. API: `src/lib/utils/transcription.ts` (main interface)
3. Worker: `src/lib/utils/transcription-worker.ts` (off-main-thread)
4. Model: `@huggingface/transformers` (Whisper)
5. Consult: TROUBLESHOOTING.md → Transcription Issues

### Implementing Audio Processing Changes
1. Silence removal: `src/lib/server/silenceRemoval.ts` + `/api/audio/silence-removal`
2. Normalization: `src/lib/server/audioNormalize.ts` + `/api/normalize`
3. Time-stretching: `src/lib/utils/timestretch.ts` (SoundTouchJS)
4. Utilities: `src/lib/audioProcessing.ts` (silence, concatenation)

### Implementing Design/CSS Changes
1. Colors/spacing: `src/app.css` (CSS variables)
2. Icons: `static/icons/` (SVG files)
3. Fonts: `static/fonts/` (self-hosted)
4. Components: Individual `.svelte` files (use design tokens)

### Debugging Issues
1. **Search TROUBLESHOOTING.md** for your symptom
2. Check "Debug steps" section for your issue
3. Check "Critical Rules & Gotchas" in this file
4. Check console logs for prefixes: `[WebCodecs]`, `[VideoExport]`, `[TTS]`, `[Transcription]`
5. Check QUALITY_REPORT.md for known issues

### Understanding Design Decisions
1. Check this file → "Architecture Decision Log" section
2. For deep dives: see "Useful References" for archive docs

---

## Debugging Tips

### Export Black Screen
1. Check console for `[WebCodecs]` or `[VideoExport]` logs
2. Verify image is rendering in preview canvas
3. If WebCodecs fails, check `checkWebCodecsSupport()` output
4. On mobile, ensure MediaRecorder fallback triggers

### Audio Not Playing After TTS Generation
1. Check Base64 decoding in `src/routes/+page.svelte:554-560`
2. Verify MIME type is `audio/mp3`
3. Check audio element `loadedmetadata` event fires
4. Check browser console for CORS errors

### Waveform Not Rendering
1. Check audio decode success (AudioContext.decodeAudioData)
2. Verify canvas context available
3. Check `waveform.ts:precomputeFrequencyFrames()` generates data (FFT computation)
4. Verify container has dimensions
5. Check preview vs export mismatch: are pre-computed frames being passed to export pipeline?

### Video Subtitle Export Issues
1. Check console for `[VideoExport]` or `[WebCodecs]` logs
2. Verify video upload succeeded: `videoBlob !== null` and dimensions set
3. Check canvas context available and dimensions match video
4. If frame render fails: verify `ctx.drawImage(videoElement)` supported on device
5. If subtitle not appearing: check `subtitleSegments` populated and `subtitlesEnabled === true`
6. If trim not working: verify trim handles dragging updates `trimStart`/`trimEnd` ratios
7. If export black screen: check if iOS Safari—fallback to MediaRecorder/cloud transcode automatic

### MiniMax Integration Issues
1. **No audio returned from API** - Check `MINIMAX_API_KEY` is set and valid
2. Verify account has billing/subscription active (GitHub OAuth creates separate account; ensure subscription applies to correct account)
3. Check voice ID format: min 10 chars, alphanumeric only (no underscores)
4. Verify voice clone ID exists in `src/lib/stores.ts:MINIMAX_VOICES`
5. Test with single character "a" first (verify API connectivity before full text)
6. Current workaround: Route MiniMax requests to Azure if testing (temporary until account resolved)

---

## Reference Documents

### For Debugging & Problem-Solving
- **`/docs/TROUBLESHOOTING.md`** - Searchable Q&A for common issues (TTS, export, mobile, performance, deployment)
- **`/docs/CHALLENGES_AND_FIXES.md`** - Consolidated reference for known issues, root causes, and fixes applied

### For System Design & Architecture
- **`/docs/ARCHITECTURE.md`** - Visual diagrams and data flows (TTS pipeline, export pipeline, canvas composition, browser compatibility)

### For Historical Context & Design Decisions
- **`/docs/archive/MANIFEST.md`** - Index & status guide for archived documents
- **`/docs/archive/EXPORT_TECH_PLAN.md`** - Why WebCodecs + Mediabunny was chosen over FFmpeg/MediaRecorder
- **`/docs/archive/ROADMAP.md`** - 14-step development timeline and completion status
- **`/docs/archive/MOBILE_EXPORT_FIX.md`** - Black-screen issue diagnostic approach (learning resource)
- **`/docs/archive/EXPORT_FIX_IMPLEMENTATION.md`** - How RAF loop decoupling fixed export stuttering

### For Design & UI Reference
- **`/docs/archive/DESIGN_VISION.md`** - Original design specification (design tokens now in `src/app.css`)
- **`/docs/archive/TTS_REDESIGN_SUMMARY.md`** - TTS page UI redesign history (completed February 2026)

---

## Agent Guidance

**This file (AGENTS.md) is your primary reference. It should answer 90% of questions:**

- **How does AudioFlam work?** → Read relevant section above
- **How do I implement X?** → See "How to Navigate by Task" section
- **I'm stuck on an issue** → Check "Debugging Tips" above, then `/docs/TROUBLESHOOTING.md`
- **Why was decision Y made?** → Check "Architecture Decision Log" above, then `/docs/archive/` for deep dives
- **How do systems interact?** → See `/docs/ARCHITECTURE.md` for visual diagrams

**For code tracing:** Grep for log prefixes to trace execution: `[WebCodecs]`, `[VideoExport]`, `[TTS]`

---

## Future Development: TTS→Audiogram Integration

**Vision:** Users generate TTS audio, then one-click to create audiogram without manual download/upload cycle.

**Current State:** `preloadedTTSAudio` store exists in `src/lib/stores.ts`, but UI logic not wired up.

**Implementation:** When user clicks "Generate & Create Audiogram" button (future):
1. TTS generates audio, stores in `preloadedTTSAudio` store
2. Auto-switch to Audiogram tab
3. AudioImport component detects preloaded audio on mount
4. Pre-populate waveform visualization

**Files to Modify:** `src/lib/components/AudiogramPage.svelte`, TTS panel component (not yet named)

---

## Further Assistance

This document should answer 90% of questions. If not, check:
1. **Architecture**: `docs/ARCHITECTURE.md`
2. **Troubleshooting**: `docs/TROUBLESHOOTING.md`
3. **History**: `docs/archive/` (for why decisions were made)
4. **Code**: Grep for `[WebCodecs]`, `[VideoExport]`, `[TTS]` log prefixes to trace execution

---

## Manifest & PWA Configuration Brief

Objectives:
- Remove unwanted "Install App?" prompts when launching sub-apps from FlamTools
- Remove browser chrome (header/close button/URL bar) when app is open
- Ensure proper sharing metadata (OG tags) for social media & messaging apps

### Manifest.json Checklist

Manifest location: `static/manifest.json` (served at `/manifest.json` via SvelteKit static folder)

Each app must have static/manifest.json with:

```json
{
  "name": "[AppName]",
  "short_name": "[AppName]",
  "description": "[Brief description]",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#5422B0",
  "theme_color": "#5422B0",
  "scope": "/",
  "icons": [
    {
      "src": "/[icons-or-logos]/[app-icon].png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/[icons-or-logos]/[app-maskable].png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Key settings:**
- `"display": "standalone"` — removes browser chrome when installed
- `"scope": "/"` — ensures proper PWA scope
- `"theme_color"` & `"background_color"` — both should be `#5422B0`
- `maskable` icon — for adaptive icon support on Android

### Meta Tags (in `<head>` or `app.html`)

Verify these exist:

```html
<meta name="theme-color" content="#5422B0" />
<meta name="description" content="[Description]" />

<!-- Open Graph (for sharing) -->
<meta property="og:title" content="[AppName]" />
<meta property="og:description" content="[Description]" />
<meta property="og:image" content="https://[app].flamtools.com/[icons-or-logos]/[og-image].png" />
<meta property="og:type" content="website" />

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image" />
<meta property="twitter:title" content="[AppName]" />
<meta property="twitter:image" content="https://[app].flamtools.com/[icons-or-logos]/[og-image].png" />

<!-- Search engines (training/non-commercial apps) -->
<meta name="robots" content="noindex, nofollow" />
```

### Deployment Checklist

- [ ] Manifest.json located at `static/manifest.json`
- [ ] Manifest.json has `"display": "standalone"`
- [ ] Manifest.json has `"scope": "/"`
- [ ] Both `theme_color` & `background_color` set to `#5422B0`
- [ ] Icons referenced exist and are correct paths (check icon folder structure—may be `/icons/` or `/logos/`)
- [ ] Meta tags in head include `theme-color`, OG tags, Twitter tags
- [ ] `<meta name="robots" content="noindex, nofollow" />` present in `<head>` (required for all training/non-commercial apps)

### After Completion

**Update AGENTS.md:** Add notes about any app-specific icon paths or manifest peculiarities to the "Manifest & PWA Configuration" section for future reference.

---

**Last Updated:** April 2026
**Maintainer Notes:** Keep this document updated as new phases complete. Move old docs to archive, don't delete. Update .clinerules whenever AGENTS.md changes significantly.
