# Mobile Export Black Screen Fix - Diagnostic Build

## Issue Summary
MediaRecorder on mobile devices encounters an error immediately after starting, resulting in 0 chunks and a 0-byte blob. The error logs show:
- `[VideoExport] MediaRecorder error: ErrorEvent { filename: '', colinfo: 0 }`
- `[VideoExport] chunks: 0`

## Root Cause Analysis
The issue appears to be one of the following:
1. `canvas.captureStream()` returns an invalid stream on mobile
2. Audio track from `audioElement.captureStream()` is in an invalid state
3. MediaRecorder codec isn't properly supported on this mobile device
4. Browser implementation bug with mixed video/audio streams

## Changes Made

### 1. **video-export.ts** - Enhanced Error Handling & Diagnostics

#### a) Canvas Stream Validation
- Added try-catch around `canvas.captureStream(30)`
- Verify video tracks are present before proceeding
- Check video track state (`readyState` and `enabled`)
- Explicitly enable disabled video tracks

**Output logs added:**
```
[VideoExport] Canvas stream created: {
  videoTracks: 1,
  trackState: 'live',
  trackEnabled: true
}
```

#### b) Codec Selection - Mobile-First
- Detect mobile devices (Android, iOS, etc.)
- On mobile: prioritize WebM codecs (more reliable) before H.264/MP4
- Log selected codec and reason
- Better error message listing supported types

**New logic:**
```javascript
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
// Mobile: [webm-vp8, webm-vp9, ...]
// Desktop: [mp4-h264, mp4-avc1, ...]
```

#### c) Audio Track Validation
- Detailed logging of audio stream and track states
- Check track `readyState` before adding (must be 'live')
- Skip audio gracefully if invalid instead of failing

**Output logs added:**
```
[VideoExport] Audio stream tracks: 1
[VideoExport] Audio track state: {
  readyState: 'live',
  enabled: true
}
```

#### d) MediaRecorder Creation
- Added try-catch around `new MediaRecorder()`
- Log recorder state immediately after creation
- Better error messages for failures

#### e) Recording Start Delay
- Added 50ms delay before calling `mediaRecorder.start()`
- Ensures video track is settled and ready
- Critical for mobile reliability

#### f) Improved Error Logging
- Enhanced `onerror` handler with detailed error info
- Log error type, message, and error object separately

### 2. **CompositionCanvas.svelte** - Render Error Handling

- Wrapped `renderFrame()` export function in try-catch
- Logs canvas rendering errors during export

### 3. **AudiogramPage.svelte** - Audio Element Preparation

- Added `crossOrigin = 'anonymous'` to audio element
- Added timeout (5s) for audio load failure detection
- Log audio metadata on successful load
- Better error handling for audio element failures

**Output logs added:**
```
[Export] Audio element loaded: {
  duration: 10.5,
  readyState: 4
}
```

## Debugging Steps (for testing)

1. **Open mobile Chrome DevTools** (ADB remote debugging)
2. **Look for these log messages in order:**
   ```
   [VideoExport] Device: Mobile
   [VideoExport] Canvas stream created: ...
   [VideoExport] Audio stream tracks: 1
   [VideoExport] Selected mime type: ...
   [VideoExport] MediaRecorder created, state: recording
   [VideoExport] Rendering initial frame
   [VideoExport] MediaRecorder started, state: recording
   ```

3. **If error appears, check which log is missing**
   - Missing "Canvas stream created" → `canvas.captureStream()` failed
   - Missing "Audio stream tracks" → Audio capture failed
   - Missing "MediaRecorder created" → Codec not supported or stream invalid
   - Missing "MediaRecorder started" → Error starting recording

## Expected Improvements

1. ✅ Better diagnostics to identify exact failure point
2. ✅ Mobile devices get WebM codec priority (more stable)
3. ✅ Audio track validation prevents invalid stream issues
4. ✅ Recording start delay ensures track settlement
5. ✅ Graceful audio-only fallback if video fails
6. ✅ All errors logged with full context

## Testing Checklist

- [ ] Test on Android Chrome
- [ ] Test on iOS Safari
- [ ] Verify logs show correct codec selected for device
- [ ] Confirm all "Created" and "Started" logs appear
- [ ] Check if MP4 or WebM export works
- [ ] Verify video has content (not black)
- [ ] Verify audio syncs with video

## Next Steps If Still Failing

If export still fails with these diagnostics:
1. Share the complete console logs (look for ERROR lines)
2. Note which MediaRecorder codec was selected
3. Check if tracks show as 'live' in the logs
4. Test on a different mobile device/browser
5. Consider fallback: audio-only export or client-side conversion
