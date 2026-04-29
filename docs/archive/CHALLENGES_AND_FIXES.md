# AudioFlam: Persistent Challenges & Fixes

**Purpose:** Consolidated reference for known issues, root causes, and fixes applied  
**Status:** Current as of February 2026  
**Scope:** Audio pipeline performance, video export reliability, mobile compatibility

---

## Quick Index

| Issue | Category | Impact | Status |
|-------|----------|--------|--------|
| Base64 double-conversion | TTS/Audio | 10-15ms latency per generation | ✅ FIXED |
| MIME type inconsistency | TTS/Audio | Silent codec failure | ✅ FIXED |
| Event listener cleanup missing | TTS/Audio | Memory leak after 10+ generations | ✅ FIXED |
| MediaRecorder black screen | Export | Video export fails on mobile | ✅ FIXED |
| RAF loop timing gaps | Export | Frame delivery drops during export | ✅ FIXED |
| H.264 codec failure on Android | Export | Falls back to WebM unnecessarily | ✅ MITIGATED |

---

## TTS & Audio Pipeline

### Base64 Decoding Double-Conversion Bug

**Problem:**
```typescript
// ❌ BEFORE: Creates intermediate Array, then copies to Uint8Array
const byteCharacters = atob(data.audioContent);
const byteNumbers = new Array(byteCharacters.length);
for (let i = 0; i < byteCharacters.length; i++) {
  byteNumbers[i] = byteCharacters.charCodeAt(i);
}
const byteArray = new Uint8Array(byteNumbers);  // Second conversion
```

**Impact:**
- 10-15ms added latency per TTS generation
- Unnecessary memory allocation for intermediate Array
- Risk of byte precision loss during double conversion

**Fix:**
```typescript
// ✅ AFTER: Direct Uint8Array allocation
const byteCharacters = atob(data.audioContent);
const byteArray = new Uint8Array(byteCharacters.length);
for (let i = 0; i < byteCharacters.length; i++) {
  byteArray[i] = byteCharacters.charCodeAt(i);  // Direct write
}
```

**File:** `src/routes/+page.svelte` (lines 554-560)

**Why it matters:** Reduces perceived playback startup delay. TTS users notice faster response time.

---

### MIME Type Inconsistency Between Providers

**Problem:**
- Azure handler returns: `{ audioContent: base64, format: 'mp3' }`
- YarnGPT handler returned: `{ audioContent: base64 }` (missing format field)
- Frontend logic checked `data.format === 'wav'` but app only generates MP3

**Impact:**
- Inconsistent response structure between providers
- Frontend fallback assumes MP3 without validation
- If YarnGPT response ever changes, audio could fail silently

**Fix:**
- Both providers now return: `{ audioContent: base64Audio, format: 'mp3' }`
- Frontend validates format field explicitly

**File:** `src/routes/api/tts/+server.ts`

**Why it matters:** Guarantees all TTS responses have consistent structure. No silent failures from format mismatches.

---

### Event Listener Memory Leaks

**Problem:**
```typescript
// ❌ BEFORE: Listeners added but never removed
audioElement.addEventListener('loadedmetadata', () => { /* ... */ });
audioElement.addEventListener('ended', () => { /* ... */ });
// When audio element is replaced, old listeners remain
```

**Impact:**
- After 10+ TTS generations, event handlers accumulate
- Stale closures reference old audio elements
- Noticeable memory pressure after extended sessions

**Fix:**
- Named handler functions instead of anonymous arrows
- Cleanup listeners before replacing audio element
- Added error event handler for graceful failure

**File:** `src/routes/+page.svelte` (lines 567-572)

**Why it matters:** Maintains consistent memory footprint for users who generate many clips in one session.

---

### Unused Dependencies Bloating Bundle

**Problem:**
- `lamejs` (MP3 encoder) - Not needed, TTS providers return MP3
- `microsoft-cognitiveservices-speech-sdk` - Replaced with fetch API
- `node-fetch` - Node 18+ has native fetch

**Impact:**
- Bundle size ~2.5MB larger than necessary
- Slower `npm install` and builds
- Dead code in dependency tree

**Fix:**
- Removed all three dependencies from `package.json`
- No functional change—app still works identically

**Why it matters:** Faster build times and smaller deployment package.

---

## Video Export

### MediaRecorder Black Screen on Mobile

**Problem:**
MediaRecorder on mobile devices returns 0-byte blobs or black video because:
- Canvas stream appears valid but frames aren't being captured
- Audio track state may be invalid
- Codec claims support but fails in practice (Android H.264 specifically)
- RAF loop scheduling gaps between MediaRecorder start and frame delivery

**Root cause:** Loose timing between MediaRecorder initialization and frame delivery.

**Initial diagnostic approach:**
Added detailed logging to identify failure point:
- Canvas stream validation (check video track state)
- Audio track validation (check readyState = 'live')
- MIME type detection (mobile-first codec preference)
- MediaRecorder state monitoring

**File:** `src/lib/utils/video-export.ts`

**Key diagnostic logs to watch for:**
```
[VideoExport] Device: Mobile
[VideoExport] Canvas stream created: { videoTracks: 1, trackState: 'live' }
[VideoExport] Audio stream tracks: 1
[VideoExport] Selected mime type: video/webm;codecs=vp8
[VideoExport] MediaRecorder created, state: recording
[VideoExport] Rendering initial frame
[VideoExport] MediaRecorder started, state: recording
```

---

### RAF Loop Timing Gaps (Black Screen Root Cause)

**Problem:**
Original implementation used external callbacks to manage rendering:
- `startExportRendering()` callback started RAF loop in CompositionCanvas
- `stopExportRendering()` callback stopped the loop
- Timing was loose, especially on mobile with tight event loop scheduling
- MediaRecorder could start before RAF loop began, causing frame delivery gaps

**Symptom:**
- Export completes successfully
- Downloaded video is completely black
- Audio is present and synced

**Fix: Decoupled Rendering Loop Integration**

Moved RAF loop **inside** `exportCanvasVideo()` to guarantee tight coupling:

**Before:**
```typescript
// ❌ LOOSE: RAF loop runs separately from MediaRecorder
mediaRecorder.start();
// ... possible scheduling delay ...
startExportRendering();  // RAF loop starts later
```

**After:**
```typescript
// ✅ TIGHT: RAF loop runs synchronously with MediaRecorder
mediaRecorder.start();
// Immediately start RAF loop in same execution context
const startTime = performance.now();
const renderLoop = () => {
  const elapsed = performance.now() - startTime;
  if (elapsed < duration) {
    renderFrame(elapsed);  // Frame is guaranteed to be captured
    requestAnimationFrame(renderLoop);
  }
};
renderLoop();
```

**Files Modified:**
- `src/lib/utils/video-export.ts` - RAF loop now internal, not callback-driven
- `src/lib/components/CompositionCanvas.svelte` - Exported `renderFrame()` function
- `src/lib/components/AudiogramPage.svelte` - Simplified export flow

**Why this fixes it:**
- Render loop guaranteed to run during MediaRecorder recording
- No scheduling delays between start and frame delivery
- Canvas is actively redrawn while frames are being captured
- Single RAF scope ensures all rendering is coordinated

---

### H.264 Codec Failure on Android (Mitigation)

**Problem:**
Android Chrome claims H.264 support but fails when actually encoding:
- `VideoEncoder.isConfigSupported()` returns true
- Actual encoding attempt fails silently or produces black frames
- Affects ~85% of Android users

**Why it happens:**
- Browser reports codec support based on claimed capability
- Actual hardware encoder may not support specific profile/level
- Device-specific encoder implementation bugs

**Fix: Three-Tier Fallback Strategy**

```
Export Button
├─ Tier 1: WebCodecs + Mediabunny (attempt H.264 locally)
│  └─ If succeeds: MP4 direct download ✅
│  └─ If fails: Fallback to Tier 2
├─ Tier 2: MediaRecorder (WebM locally, no cloud needed)
│  └─ If succeeds: WebM direct download ⚠️
│  └─ If fails: Fallback to Tier 3
└─ Tier 3: Cloud transcoding (api.video WebM→MP4)
   └─ Upload WebM, get MP4 back → Download ✅
```

**Files:**
- `src/lib/utils/video-export.ts` - Smart codec selection
- `src/lib/utils/webcodecs-export.ts` - H.264 attempt with fallback
- `src/routes/api/transcode/+server.ts` - Cloud transcoding proxy

**Why this works:**
- WebCodecs bypasses MediaRecorder's browser implementation bugs
- MediaRecorder fallback ensures WebM export always succeeds
- Cloud transcoding converts WebM to MP4 if browser can't encode directly
- Users get MP4 95% of the time, WebM acceptable when MP4 unavailable

---

## Canvas Rendering Issues

### Canvas Dimension Correction for H.264

**Problem:**
H.264 codec requires even dimensions (width % 2 === 0). If canvas is odd-sized, encoding fails silently.

**Fix:**
```typescript
// In webcodecs-export.ts, round up to even:
let width = sourceCanvas.width;
let height = sourceCanvas.height;
if (width % 2 !== 0) width += 1;
if (height % 2 !== 0) height += 1;
```

**File:** `src/lib/utils/webcodecs-export.ts` (lines 194-196)

---

### Audio Mono→Stereo Conversion

**Problem:**
Many mobile AAC encoders reject mono audio. If TTS generates mono, WebCodecs encoding fails.

**Fix:**
Automatically convert mono→stereo when detected:

```typescript
if (sourceBuffer.numberOfChannels === 1) {
  // Duplicate mono channel to stereo
  const stereoData = audioContext.createBuffer(2, sourceBuffer.length, sourceBuffer.sampleRate);
  const sourceCopy = sourceBuffer.getChannelData(0);
  stereoData.getChannelData(0).set(sourceCopy);
  stereoData.getChannelData(1).set(sourceCopy);
  // Use stereoData for encoding
}
```

**File:** `src/lib/utils/webcodecs-export.ts` (lines 277-294)

---

## Common Debugging Scenarios

### Export Produces Black Video

**Checklist:**
1. Verify `renderFrame` callback is being called (check console logs)
2. Ensure RAF loop starts AFTER `mediaRecorder.start()` (check timing in video-export.ts)
3. Test with WebCodecs support disabled (force MediaRecorder)
4. Check canvas preview renders correctly in UI
5. Verify image and waveform are loaded before export

**Key logs to check:**
- `[VideoExport] Canvas stream created` - If missing, canvas.captureStream() failed
- `[VideoExport] MediaRecorder created` - If missing, codec not supported
- `[VideoExport] Rendering initial frame` - If missing, RAF loop didn't start

---

### Audio Not Playing After TTS Generation

**Checklist:**
1. Audio element duration is 0 → blob creation failed
2. Audio element has no src → base64 decoding failed
3. Base64 decoding succeeded but audio doesn't play → AudioContext suspended (iOS)
4. Audio plays for first clip but not subsequent → Memory leak from event listeners

**Debug in browser console:**
```javascript
const audio = document.querySelector('audio');
console.log(audio.duration);  // Should be > 0
console.log(audio.src);       // Should be blob: URL
audio.play();                 // Should work
```

---

### Export Hangs at 50%

**Common causes:**
1. **Low-end device:** CPU-bound encoding is slow (normal, expected 30-40s on budget phones)
2. **Memory exhaustion:** Multiple rapid exports → garbage collection pauses
3. **Audio encoding stuck:** AAC encoder not closing properly
4. **Cloud transcode timeout:** Slow network upload > 180s timeout

**Solution:**
- For #1: Show user message "This takes longer on older devices"
- For #2: Add cleanup between exports, show "Clearing cache..." message
- For #3: Verify `audioSource.close()` called after `add()`
- For #4: Show progress messages, allow retry

---

## Performance Notes

### Export Speed by Device

| Device Type | Method | Speed |
|-------------|--------|-------|
| Desktop Chrome | WebCodecs H.264 | 10-20s for 60s video |
| Android Chrome (flagship) | WebCodecs H.264 | 15-30s for 60s video |
| Android Chrome (budget) | WebCodecs H.264 | 30-40s for 60s video |
| iOS Safari | MediaRecorder WebM | 20-35s for 60s video |
| Firefox | MediaRecorder WebM | 20-35s for 60s video |

All times include frame rendering + audio encoding + container muxing.

---

## Testing Checklist for Export

- [ ] Desktop Chrome: MP4 exports via WebCodecs
- [ ] Android Chrome: MP4 exports via WebCodecs (or WebM fallback)
- [ ] iOS Safari: WebM exports (acceptable fallback)
- [ ] Firefox: WebM exports (acceptable fallback)
- [ ] Very long audio (5+ min): Export completes without timeout
- [ ] Rapid successive exports: No frame drops or memory leaks
- [ ] Slow network: Cloud transcode retries on timeout
- [ ] Black screen test: Enable detailed logs, verify frame delivery

---

## Testing Checklist for Audio

- [ ] Azure voice: 3s generation, clear quality
- [ ] YarnGPT voice: 30s generation, natural Nigerian accent
- [ ] 50+ generations in sequence: Memory remains stable
- [ ] Invalid API key: Helpful error message (not generic "error")
- [ ] 2000 char limit: Enforced UI-side, rejected server-side
- [ ] XML special chars in text: No SSML injection possible

---

## References

For more context on why these fixes were made, see:
- `docs/archive/AUDIT_REPORT.md` - Performance audit that found audio pipeline issues
- `docs/archive/MOBILE_EXPORT_FIX.md` - Diagnostic approach for black screen
- `docs/archive/EXPORT_FIX_IMPLEMENTATION.md` - How the RAF loop fix was implemented
- `docs/TROUBLESHOOTING.md` - Quick reference for common issues

---

**Last Updated:** February 2026  
**Maintainer Notes:** When adding fixes, document root cause + solution here. Move old diagnostics to archive. Keep testing checklists up to date.
