# MP4 Export Fix - Option B Implementation

## Overview
Implemented **Option B: Decoupled Rendering Loop Integration** to fix the MediaRecorder black screen/hang issue on mobile devices.

## Problem
The previous implementation used external callbacks to manage canvas rendering during export:
- `startExportRendering()` callback started a RAF loop in CompositionCanvas
- `stopExportRendering()` callback stopped the loop
- This timing was loose and fragile, especially on mobile where:
  - MediaRecorder initialization happens before the render loop starts
  - Event loop scheduling is tighter, causing frame delivery gaps
  - Browsers may not capture frames if they aren't being actively rendered when MediaRecorder starts

**Root cause:** MediaRecorder wasn't seeing continuous canvas frames because the RAF loop wasn't guaranteed to run immediately after `mediaRecorder.start()`.

## Solution
Moved the RAF rendering loop **inside** `exportCanvasVideo()` to create a tight coupling:

### 1. video-export.ts Changes
- **Changed signature:** Replaced `startPlayback`/`stopPlayback` with `renderFrame`/`startAudioPlayback`/`stopAudioPlayback`
- **New render loop:** Manages its own RAF loop internally (lines 135-146)
  - Starts immediately after `mediaRecorder.start()`
  - Calls `renderFrame()` continuously during the export duration
  - Stops cleanly when duration is reached
- **Better diagnostics:** Added console logging for render loop start/stop and chunk capture

**Key improvement:** The render loop now runs synchronously with MediaRecorder, ensuring frames are being captured.

### 2. CompositionCanvas.svelte Changes
- **Exported `renderFrame()`:** New exported function that calls the internal `render()` method
- **Renamed import:** Changed imported `renderFrame` from compositor to `renderFrameCanvasLayers` to avoid naming conflict
- **Removed unused functions:** Deleted `startExportRendering()` and `stopExportRendering()` (no longer needed)

### 3. AudiogramPage.svelte Changes
- **Updated export flow:** Simplified callback handling
  - `renderFrame` callback: Calls `compositionCanvasRef?.renderFrame()`
  - `startAudioPlayback`: Sets `isPlaying = true`, plays audio, starts waveform animation
  - `stopAudioPlayback`: Sets `isPlaying = false`, pauses audio, stops waveform animation
- **Removed direct rendering control:** No more external start/stop rendering calls

## How It Works
```
1. User clicks Download
2. handleDownload() calls exportCanvasVideo() with:
   - canvas, audio element, duration
   - renderFrame callback (to render canvas)
   - startAudioPlayback/stopAudioPlayback callbacks (to sync audio)
3. exportCanvasVideo():
   - Captures canvas stream (passively monitoring)
   - Starts MediaRecorder
   - Starts internal RAF loop that calls renderFrame() repeatedly
   - Starts audio playback (triggers animations)
   - When duration reached: stops render loop, stops audio, stops MediaRecorder
4. MediaRecorder captures frames from continuously-redrawn canvas
5. Blob is finalized and returned
```

## Why This Fixes Mobile
- **Tight synchronization:** Render loop is guaranteed to run during MediaRecorder recording
- **No timing gaps:** No external callback overhead or scheduling delays
- **Predictable frame delivery:** Canvas is actively being redrawn while MediaRecorder is capturing
- **Single RAF scope:** All rendering happens in one coordinated loop, not competing event loop threads

## Testing Recommendations
1. **Desktop Chrome:** Verify existing functionality still works
2. **Android Chrome:** Test MP4 export - video should appear (not black)
3. **iOS Safari:** Test if available
4. **Progress bar:** Should show smooth progress without hanging
5. **Audio sync:** Audio and waveform animation should be synchronized

## Files Modified
- `src/lib/utils/video-export.ts` - Core export logic
- `src/lib/components/CompositionCanvas.svelte` - Canvas rendering export
- `src/lib/components/AudiogramPage.svelte` - Export flow integration
