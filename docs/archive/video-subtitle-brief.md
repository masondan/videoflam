# AudioFlam Video Subtitle Page — Phase 4 Build Brief

**Document type:** Focused implementation brief for a Claude agent in VS Code  
**Scope:** Video subtitle page only (Phase 4 of subtitle feature)  
**Assumptions:** `subtitles.ts`, `SubtitlePanel.svelte`, and `TitlePanel.svelte` are complete and tested  
**Reference:** `AGENTS.md` for codebase context; `docs/subtitle-brief` for full feature overview

---

## Quick Start

**Before writing code:**

1. Ensure main branch is clean. If uncommitted changes exist, commit or stash them.
2. Create feature branch: `git checkout -b feature/video-subtitles`
3. Do all work on this branch. Never commit directly to main.
4. Commit at the end of each stage below with clear messages (e.g., `stage 1: video page scaffold`).
5. **CRITICAL:** After Stage 2 (initial build), pause and test thoroughly before proceeding to Stage 3.
6. When all stages complete and tested, merge: `git checkout main && git merge feature/video-subtitles` and push.

---

## Overview

Build a new **Subtitle video** tab alongside TTS, Audiogram, and Transcribe. Users upload a device video (MP4, MOV, WebM), optionally trim it, add subtitles and a title, then export as MP4.

**Key constraint:** Reuse `SubtitlePanel.svelte` and `TitlePanel.svelte` unchanged. No modifications to existing components.

---

## Stage 1 — Video Page Scaffold

### New component: `src/lib/components/VideoSubtitlePage.svelte`

Create a new Svelte component following the AudiogramPage pattern but simplified:

**State to manage:**
- `videoBlob: Blob | null` — uploaded video file
- `videoElement: HTMLVideoElement | null` — reference for playback and frame extraction
- `trimStart: number` — in-point (seconds)
- `trimEnd: number` — out-point (seconds)
- `isPlaying: boolean` — playback state
- `currentTime: number` — playback position
- `canvasWidth: number` — export canvas dimensions
- `canvasHeight: number` — export canvas dimensions
- `subtitleStyle: SubtitleStyle` — from SubtitlePanel
- `subtitleSegments: SubtitleSegment[]` — from SubtitlePanel
- `subtitlesEnabled: boolean` — from SubtitlePanel
- `titleText: string` — from TitlePanel
- `titleFont: TitleFont` — from TitlePanel
- `titleAlign: TitleAlign` — from TitlePanel
- `titleColor: string` — from TitlePanel
- `labelEnabled: boolean` — from TitlePanel
- `labelColor: string` — from TitlePanel
- (and all other TitlePanel props)

**Layout structure:**

```
<div class="video-page">
  <!-- Upload zone -->
  <div class="upload-zone">
    <!-- Dashed upload area, accepts MP4/MOV/WebM -->
    <!-- On mobile, triggers device camera roll -->
    <!-- Displays <video> preview once loaded -->
  </div>

  <!-- Trim control (Stage 2) -->
  <!-- Scrubber with two drag handles -->

  <!-- Playback controls -->
  <!-- Play/pause button -->

  <!-- Canvas preview (Stage 2) -->
  <!-- Renders video frame + subtitles + title during playback -->

  <!-- Subtitle panel (reused) -->
  <SubtitlePanel
    audioBlob={extractedAudioBlob}
    canvasWidth={canvasWidth}
    canvasHeight={canvasHeight}
    style={subtitleStyle}
    segments={subtitleSegments}
    subtitlesEnabled={subtitlesEnabled}
    onStyleChange={...}
    onSegmentsChange={...}
    onEnabledChange={...}
  />

  <!-- Title panel (reused) -->
  <TitlePanel
    text={titleText}
    selectedFont={titleFont}
    selectedAlign={titleAlign}
    isBold={titleBold}
    lineHeight={titleLineHeight}
    letterSpacing={titleLetterSpacing}
    textColor={titleColor}
    labelEnabled={labelEnabled}
    labelOpacity={labelOpacity}
    labelSpace={labelSpace}
    labelColor={labelColor}
    onTextChange={...}
    onFontChange={...}
    onAlignChange={...}
    onBoldChange={...}
    onLineHeightChange={...}
    onLetterSpacingChange={...}
    onTextColorChange={...}
    onLabelEnabledChange={...}
    onLabelOpacityChange={...}
    onLabelSpaceChange={...}
    onLabelColorChange={...}
  />

  <!-- Export button -->
  <button onclick={handleExport}>Download video</button>
</div>
```

**Upload zone implementation:**

- Accept drag-and-drop or file input
- Validate MIME type: `video/mp4`, `video/quicktime`, `video/webm`
- On load, extract video dimensions and set `canvasWidth` / `canvasHeight` to match
- Extract audio track from video using Web Audio API (see "Audio extraction" below)
- Store extracted audio in `extractedAudioBlob` for SubtitlePanel transcription
- Display `<video>` element for preview (hidden initially, shown after upload)

**Audio extraction from video:**

```typescript
async function extractAudioFromVideo(videoBlob: Blob): Promise<Blob> {
  const videoUrl = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  
  // Wait for metadata to load
  await new Promise(resolve => {
    video.onloadedmetadata = resolve;
  });

  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = audioContext.createMediaElementAudioSource(video);
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);

  const mediaRecorder = new MediaRecorder(destination.stream);
  const chunks: BlobPart[] = [];
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

  mediaRecorder.start();
  video.play();

  await new Promise(resolve => {
    video.onended = resolve;
  });

  mediaRecorder.stop();
  URL.revokeObjectURL(videoUrl);

  return new Blob(chunks, { type: 'audio/mp3' });
}
```

**Commit message:** `stage 1: video page scaffold with upload and audio extraction`

---

## Stage 2 — Canvas Preview & Trim Control

### Canvas rendering for video mode

Add a `<canvas>` element below the video preview. During playback, render:

1. Video frame at current time (offset by trim in-point)
2. Title layer on top (using existing title rendering logic from AudiogramPage)
3. Subtitle layer on top (using `drawSubtitle()` from subtitles.ts)

**Rendering function:**

```typescript
function renderFrame(currentTime: number): void {
  if (!canvasContext || !videoElement) return;

  // Seek video to currentTime + trimStart
  const seekTime = currentTime + trimStart;
  videoElement.currentTime = seekTime;

  // Wait for frame to be ready (use requestAnimationFrame)
  requestAnimationFrame(() => {
    // Draw video frame
    canvasContext.drawImage(videoElement, 0, 0, canvasWidth, canvasHeight);

    // Draw title (reuse logic from AudiogramPage/compositor.ts)
    drawTitle(canvasContext, titleText, titleFont, titleAlign, titleColor, canvasWidth, canvasHeight);

    // Draw subtitle if enabled
    if (subtitlesEnabled) {
      const activeSegment = getActiveSegment(subtitleSegments, currentTime);
      if (activeSegment) {
        drawSubtitle(canvasContext, activeSegment, subtitleStyle, canvasWidth, canvasHeight, currentTime);
      }
    }
  });
}
```

**iOS Safari risk — CRITICAL TEST:**

`ctx.drawImage(videoElement, ...)` has known constraints on iOS Safari. **Test this immediately on iOS Safari as the first action in Stage 2.** If it fails:
- Document the finding in AGENTS.md
- Fall back to cloud transcoding via api.video (existing path)
- Proceed with implementation

**Trim control implementation:**

Add a scrubber below the video preview with two drag handles:

```
[====|====|====]  Duration: 45.2s
     ^    ^
   start  end
```

- Horizontal slider with two draggable handles (in-point and out-point)
- Display selected clip duration
- Trim is applied at export time (non-destructive)
- Reuse the waveform trimmer pattern from `AudiogramPage.svelte` (lines ~250-300)

**Waveform trimmer pattern reference:**

The AudiogramPage uses a two-handle trimmer for audio. Adapt this pattern for video:

```typescript
// Trim state
let trimStart = $state(0);
let trimEnd = $state(videoDuration);
let isDraggingStart = $state(false);
let isDraggingEnd = $state(false);

// Mouse handlers
function handleMouseDown(e: MouseEvent, handle: 'start' | 'end') {
  if (handle === 'start') isDraggingStart = true;
  else isDraggingEnd = true;
}

function handleMouseMove(e: MouseEvent) {
  if (!isDraggingStart && !isDraggingEnd) return;
  
  const rect = trimmerElement.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const percent = Math.max(0, Math.min(1, x / rect.width));
  const time = percent * videoDuration;

  if (isDraggingStart) {
    trimStart = Math.min(time, trimEnd - 0.1); // Prevent overlap
  } else {
    trimEnd = Math.max(time, trimStart + 0.1);
  }
}

function handleMouseUp() {
  isDraggingStart = false;
  isDraggingEnd = false;
}
```

**Playback control:**

- Play/pause button below canvas
- On play, start `requestAnimationFrame` loop calling `renderFrame(currentTime)`
- Respect trim boundaries: playback stops at `trimEnd`
- Update `currentTime` from video element's `timeupdate` event

**Commit message:** `stage 2: canvas preview with video frame rendering and trim control`

---

## Stage 3 — Integration & Export

### Add tab to main navigation

In `src/routes/+page.svelte`, add a new tab alongside TTS, Audiogram, Transcribe:

```svelte
<button
  type="button"
  class="tab-btn"
  class:active={activeTab === 'subtitle-video'}
  onclick={() => activeTab = 'subtitle-video'}
>
  Subtitle video
</button>
```

And render the component:

```svelte
{#if activeTab === 'subtitle-video'}
  <VideoSubtitlePage />
{/if}
```

### Export implementation

Wire the export button to `smartExportVideo()` from `src/lib/utils/video-export.ts`:

```typescript
async function handleExport() {
  if (!videoBlob || !canvasWidth || !canvasHeight) {
    alert('Upload a video first');
    return;
  }

  isExporting = true;
  exportError = null;

  try {
    // Create a canvas-rendering callback that includes trim offset
    const renderCallback = (currentTime: number) => {
      renderFrame(currentTime); // Uses trimStart internally
    };

    // Call existing export pipeline
    await smartExportVideo(
      canvasElement,
      audioBlob, // Use extracted audio or silence if no subtitles
      canvasWidth,
      canvasHeight,
      videoDuration - (trimEnd - trimStart), // Adjusted duration
      renderCallback
    );

    alert('Video exported successfully');
  } catch (err) {
    exportError = err instanceof Error ? err.message : 'Export failed';
  } finally {
    isExporting = false;
  }
}
```

**Commit message:** `stage 3: tab integration and export wiring`

---

## Stage 4 — Testing & Merge

### Testing checklist before merge

- [ ] **iOS Safari test (CRITICAL):** `ctx.drawImage()` from video element works or falls back gracefully
- [ ] Video upload accepts MP4, MOV, WebM
- [ ] Audio extraction produces valid audio blob for transcription
- [ ] Trim handles drag smoothly and update duration display
- [ ] Playback respects trim boundaries
- [ ] Canvas preview renders video frame + title + subtitles correctly
- [ ] SubtitlePanel generates subtitles from extracted audio
- [ ] TitlePanel controls render title on canvas
- [ ] Export button triggers download (WebCodecs on Android, MediaRecorder fallback, cloud transcode if needed)
- [ ] Exported video has correct duration (trimmed)
- [ ] Exported video has subtitles and title burned in

### Merge to main

Once all tests pass:

```bash
git checkout main
git merge feature/video-subtitles
git push
```

Update `AGENTS.md` with a new "Video Subtitle Page" section documenting:
- The component structure and state management
- How `renderFrame()` integrates video, title, and subtitle layers
- The iOS `ctx.drawImage()` finding and any fallback strategy
- The trim control pattern and how it's applied at export time
- Reference to `smartExportVideo()` for export orchestration

**Commit message:** `stage 4: testing complete, merge to main`

---

## Key Implementation Notes

### Reusing SubtitlePanel & TitlePanel

Both components accept props and callbacks. Pass state from VideoSubtitlePage directly:

```svelte
<SubtitlePanel
  audioBlob={extractedAudioBlob}
  canvasWidth={canvasWidth}
  canvasHeight={canvasHeight}
  style={subtitleStyle}
  segments={subtitleSegments}
  subtitlesEnabled={subtitlesEnabled}
  onStyleChange={(s) => subtitleStyle = s}
  onSegmentsChange={(segs) => subtitleSegments = segs}
  onEnabledChange={(e) => subtitlesEnabled = e}
/>
```

No modifications to these components. They are fully self-contained.

### Canvas dimensions

Set `canvasWidth` and `canvasHeight` to match the uploaded video's native dimensions. This ensures export resolution matches the source video.

### Trim offset in renderFrame

When seeking the video element, always add `trimStart`:

```typescript
videoElement.currentTime = currentTime + trimStart;
```

This ensures the canvas preview shows the correct trimmed portion.

### Audio for export

If subtitles are enabled, use the extracted audio blob. If no subtitles, you may use silence or the original video's audio (depending on requirements). For now, assume extracted audio is always used.

---

## Critical Gotchas

1. **iOS `ctx.drawImage()` from video element** — Test immediately. If it fails, document in AGENTS.md and use cloud transcode fallback.
2. **Trim boundaries in playback** — Ensure playback stops at `trimEnd`, not at video duration.
3. **Audio extraction timing** — Wait for `loadedmetadata` before extracting audio.
4. **Canvas context reset** — Clear canvas before each frame render to avoid ghosting.
5. **Component prop binding** — SubtitlePanel and TitlePanel use callbacks, not two-way binding. Update state via `onXChange` callbacks.

---

## Reference Files

- **Subtitle engine:** `src/lib/utils/subtitles.ts` (already complete)
- **SubtitlePanel:** `src/lib/components/SubtitlePanel.svelte` (already complete, reuse unchanged)
- **TitlePanel:** `src/lib/components/TitlePanel.svelte` (already complete, reuse unchanged)
- **AudiogramPage pattern:** `src/lib/components/AudiogramPage.svelte` (reference for layout and state management)
- **Compositor:** `src/lib/utils/compositor.ts` (reference for title rendering logic)
- **Export pipeline:** `src/lib/utils/video-export.ts` (use `smartExportVideo()`)
- **Waveform trimmer pattern:** `src/lib/components/AudiogramPage.svelte` lines ~250-300 (adapt for video trim control)

---

## Success Criteria

✅ New "Subtitle video" tab appears in main navigation  
✅ Users can upload MP4, MOV, or WebM videos  
✅ Audio is extracted and passed to SubtitlePanel for transcription  
✅ Trim control allows in-point and out-point adjustment  
✅ Canvas preview renders video frame + title + subtitles during playback  
✅ Export button downloads trimmed video with subtitles and title burned in  
✅ iOS Safari `ctx.drawImage()` behavior documented in AGENTS.md  
✅ All tests pass before merge to main  

---

**Last Updated:** April 2026  
**Status:** Ready for implementation  
**Estimated effort:** 4-6 hours (Stages 1-4)
