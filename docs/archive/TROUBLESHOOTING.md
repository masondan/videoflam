# AudioFlam Troubleshooting Guide

**Purpose:** Common issues and fixes for development and production  
**Status:** Current as of February 2026

---

## TTS Pipeline Issues

### Audio doesn't play after generation

**Symptoms:**
- Button says "Generate" but nothing happens
- Console shows no errors
- Audio element shows duration as 0

**Root causes & fixes:**

1. **Base64 decoding failed silently**
   - Check: `atob()` succeeded but Uint8Array conversion lost data
   - Fix: Use direct allocation: `new Uint8Array(byteString.length)`
   - Don't: Create intermediate Array, then convert
   - File: `src/routes/+page.svelte` (lines 554-560)

2. **MIME type mismatch**
   - Check: Response has `format: 'mp3'` field
   - Fix: Both Azure and YarnGPT must return `{ audioContent, format: 'mp3' }`
   - YarnGPT was missing format field historically
   - File: `src/routes/api/tts/+server.ts`

3. **Audio context not initialized**
   - Check: AudioContext state is "suspended" on iOS
   - Fix: Resume context on first user interaction
   - Wrap playback in: `audioContext.resume()`
   - Applies to Safari and iOS browsers

4. **Event listener cleanup missing**
   - Check: 10+ audio generations → memory pressure
   - Fix: Named handler functions + cleanup on element replace
   - Don't: Use anonymous arrow functions in addEventListener
   - File: Check for `audioElement.removeEventListener()` calls

**Debug steps:**
```javascript
// In browser console:
1. const audio = document.querySelector('audio');
2. console.log(audio.duration); // Should be > 0
3. console.log(audio.src); // Should be blob: URL
4. audio.play(); // Should work without errors
5. audio.currentTime = 5; audio.play(); // Test seek
```

---

### TTS API returns 500 error

**Symptoms:**
- POST `/api/tts` returns 500
- Console shows "Failed to generate audio"

**Root causes & fixes:**

1. **Missing environment variables**
   - Check: Cloudflare Pages → Settings → Environment variables
   - Required: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `YARNGPT_API_KEY`
   - Fix: Add them and redeploy (env vars not live without deploy)
   - Affects: Production only (local uses .env)

2. **Azure Speech API auth failed**
   - Check: API key incorrect or expired
   - Symptom: 401 from Azure endpoint
   - Fix: Verify key in Cloudflare dashboard
   - Note: Host header must be explicit in Cloudflare Workers

3. **YarnGPT API timeout**
   - Check: YarnGPT endpoint slow (30s generation)
   - Symptom: Gateway timeout after 30s
   - Fix: YarnGPT is designed for slow generation (native quality)
   - For users: Show message "Nigerian voices take longer..."

4. **Text escaping injection**
   - Check: User text contains XML special chars
   - Symptom: SSML parsing fails
   - Fix: Always use `escapeXml()` before embedding in SSML
   - File: Check `src/routes/api/tts/+server.ts` for escaping

5. **Text exceeds 2000 character limit**
   - Check: Frontend validation should prevent, but double-check server
   - Symptom: API rejects with "text too long"
   - Fix: Enforce `text.length <= 2000` before submit
   - File: UI should block, API should validate

**Debug steps:**
```bash
# Test Azure directly:
curl -X POST "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1" \
  -H "Ocp-Apim-Subscription-Key: YOUR_KEY" \
  -H "Content-Type: application/ssml+xml" \
  -H "X-Microsoft-OutputFormat: audio-16-32000-32bit-mono-pcm" \
  -d '<speak>Hello</speak>'

# Test YarnGPT:
curl -X POST "https://yarngpt.ai/api/v1.1/tts" \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","voice":"Tayo"}'
```

---

## Audiogram Export Issues

### Export produces black/empty video

**Symptoms:**
- Download succeeds
- Video plays but is completely black or shows no waveform
- Audio is present and plays

**Root causes & fixes:**

1. **Canvas not rendering during export**
   - Check: `renderFrame` callback not being called
   - Fix: Ensure RAF loop is running during MediaRecorder capture
   - Critical: Loop must start AFTER `mediaRecorder.start()`
   - File: `src/lib/utils/video-export.ts` (lines 543-555)

2. **WebCodecs frame capture skipped**
   - Check: `videoSource.add()` called without rendering
   - Symptom: OffscreenCanvas context not set up
   - Fix: Copy from source canvas to OffscreenCanvas before add
   - File: `src/lib/utils/webcodecs-export.ts` (line 370)

3. **Canvas dimensions incorrect**
   - Check: H.264 requires even dimensions
   - Symptom: Export fails silently or produces artifact
   - Fix: Round up to nearest even: `width % 2 === 0 ? width : width + 1`
   - File: `src/lib/utils/webcodecs-export.ts` (lines 194-196)

4. **Image not loaded before export**
   - Check: `imageData.cropped` is null or undefined
   - Fix: Load image and decode before export button enabled
   - File: ImageUpload or AudiogramPage component

5. **Waveform rendering disabled**
   - Check: Waveform visibility toggle off
   - Fix: Check `waveformConfig.visible` or equivalent
   - Verify: `renderWaveformLayer()` is called in compositor

**Debug steps:**
```javascript
// In CompositionCanvas component:
1. Add console log to renderFrame():
   console.log('renderFrame called at', currentTime);
2. Check canvas for visible content:
   const ctx = canvas.getContext('2d');
   console.log(ctx.fillStyle, ctx.strokeStyle); // Should be set
3. Export small video (5s) for faster iteration
4. Check browser DevTools → Canvas recording → Capture frame
```

---

### Export hangs/timeout

**Symptoms:**
- Export progress bar stuck at 50%
- Browser tab becomes unresponsive
- Export doesn't complete after 2+ minutes

**Root causes & fixes:**

1. **WebCodecs encoding too slow**
   - Check: Mobile device with limited CPU
   - Symptom: 40+ seconds to encode 60s video
   - Fix: This is normal on low-end devices
   - Mitigation: Show timeout warning after 2 min, allow abort

2. **RAF loop blocking main thread**
   - Check: Heavy animation in waveform rendering
   - Symptom: Smooth export but then hangs after
   - Fix: Reduce waveform quality or use OffscreenCanvas
   - File: `src/lib/utils/compositor.ts` (waveform rendering)

3. **Audio encoding stuck**
   - Check: AAC encoder not closing properly
   - Symptom: Audio processing hangs
   - Fix: Ensure `audioSource.close()` called after `add()`
   - File: `src/lib/utils/webcodecs-export.ts` (lines 388-432)

4. **API transcode timeout**
   - Check: Cloud transcoding 180s timeout
   - Symptom: "Upload timed out" after 3min
   - Fix: Acceptable for slow networks (unavoidable)
   - Mitigation: Show progress messages, allow retry

5. **Memory exhaustion**
   - Check: Multiple rapid exports → memory pressure
   - Symptom: Browser tab crashes or freezes
   - Fix: Add blob/canvas cleanup between exports
   - File: Ensure `URL.revokeObjectURL()` called

**Debug steps:**
```javascript
// Monitor encoding progress:
1. Check WebCodecs logs: grep for "[WebCodecs]"
2. Open DevTools → Performance tab → Record during export
3. Check frame rate: should be ~24fps
4. Monitor memory: DevTools → Memory → Take heap snapshot

// Force timeout:
setTimeout(() => {
  console.log('Export took > 90s, aborting');
  // Implement abort handler
}, 90000);
```

---

### WebCodecs not detected on Android

**Symptoms:**
- Falls back to MediaRecorder on Chrome Android
- `checkWebCodecsSupport()` returns `supported: false`
- Console shows "VideoEncoder not in window"

**Root causes & fixes:**

1. **WebCodecs API not available**
   - Check: Browser is not Chrome
   - Symptom: Firefox, Samsung Internet may not support
   - Fix: This is correct behavior—fallback to MediaRecorder

2. **H.264 not supported despite API presence**
   - Check: Device claims VideoEncoder but rejects H.264
   - Symptom: `VideoEncoder.isConfigSupported()` returns false
   - Common on: Some Android devices, older Chrome versions
   - Fix: Test multiple codec strings (avc1.42001f, avc1.42E01E, etc.)
   - File: `src/lib/utils/webcodecs-export.ts` (lines 77-102)

3. **AudioEncoder not available**
   - Check: Rare, but some devices may lack audio encoding
   - Symptom: Video encodes, audio skipped
   - Fix: Export video-only (audio is optional)
   - File: Code handles this gracefully (line 328-334)

**Debug steps:**
```javascript
// In browser console on Android:
1. console.log('VideoEncoder' in window); // true or false
2. console.log('AudioEncoder' in window); // true or false
3. Call checkWebCodecsSupport() and log output
4. Try alternate codec:
   const config = { codec: 'avc1.4d001f', width: 640, height: 480, bitrate: 1000000, framerate: 15 };
   VideoEncoder.isConfigSupported(config).then(r => console.log(r));
```

---

### MediaRecorder produces WebM instead of MP4

**Symptoms:**
- Export successful on iOS/Firefox
- Video has .webm extension or plays only in specific browsers
- MP4 requested but not delivered

**Root causes & fixes:**

1. **H.264 not supported on device**
   - Check: iOS Safari, Firefox don't support H.264 in MediaRecorder
   - Symptom: Correct behavior
   - Fix: This is expected; WebM is acceptable fallback
   - User guidance: "We're converting to MP4 via cloud..." (future)

2. **Device claims H.264 support but doesn't work**
   - Check: `MediaRecorder.isTypeSupported('video/mp4')` returns true
   - Symptom: But encoding fails or produces artifact
   - This was the original 85% Android problem
   - Fix: Use WebCodecs instead, MediaRecorder is unreliable
   - File: `src/lib/utils/video-export.ts` (smartExportVideo prefers WebCodecs)

3. **Cloud transcode not triggered**
   - Check: User on iOS, WebM produced, cloud transcode not called
   - Symptom: WebM downloaded instead of MP4
   - Fix: Future Phase 2—transcode all non-MP4 outputs
   - Note: Currently WebM is acceptable on iOS

**Debug steps:**
```javascript
// Check supported types:
['video/mp4', 'video/mp4;codecs="avc1"', 'video/webm'].forEach(type => {
  console.log(type, MediaRecorder.isTypeSupported(type));
});

// Monitor export path:
// Check console for "[SmartExport]" and "[VideoExport]" logs
```

---

## Canvas & Rendering Issues

### Waveform not visible

**Symptoms:**
- Audio imported successfully
- No waveform bars show in preview
- Play button works, but no visual feedback

**Root causes & fixes:**

1. **Audio not decoded**
   - Check: `AudioContext.decodeAudioData()` failed silently
   - Fix: Wrap in try-catch, log errors
   - File: Audio import component

2. **Waveform extraction failed**
   - Check: `extractAmplitude()` returns empty array
   - Symptom: `waveform.ts` might not have audio data
   - Fix: Verify audio buffer has channels
   - Debug: `console.log(audioBuffer.numberOfChannels, audioBuffer.length)`

3. **Canvas not visible**
   - Check: Canvas element has zero dimensions
   - Symptom: Container div has no height
   - Fix: Set explicit container height in CSS
   - File: Check CompositionCanvas.svelte styles

4. **Waveform toggle off**
   - Check: `waveformConfig.visible === false`
   - Fix: Enable waveform in panel
   - Note: Should default to visible

5. **Canvas clearing between frames**
   - Check: `ctx.clearRect()` called without redrawing
   - Symptom: Flashing or blank canvas
   - Fix: Ensure full-frame render every frame
   - File: `src/lib/utils/compositor.ts`

**Debug steps:**
```javascript
// Check waveform data:
1. const buffer = await decodeAudioData(blob);
2. const amplitude = extractAmplitude(buffer);
3. console.log(amplitude.length, amplitude.slice(0, 10));

// Check canvas:
4. const canvas = document.querySelector('canvas');
5. console.log(canvas.width, canvas.height); // Should be > 0
6. const ctx = canvas.getContext('2d');
7. console.log(ctx.fillStyle); // Should be set color
```

---

### Image not displaying after upload

**Symptoms:**
- Image file picked successfully
- No image appears in canvas
- No errors in console

**Root causes & fixes:**

1. **Image not decoded to canvas**
   - Check: FileReader.readAsDataURL() succeeded
   - Symptom: But drawImage() not called
   - Fix: Ensure onload handler calls canvas drawing
   - File: ImageUpload component

2. **Image dimensions too large**
   - Check: Image > 1920px width/height
   - Symptom: Memory error or silent failure
   - Fix: Resize image server-side or in worker
   - Limit: Max 1920x1920 for mobile performance

3. **CORS error (unlikely)**
   - Check: Image loaded from external domain
   - Symptom: Cross-origin error
   - Fix: Add `crossOrigin="anonymous"` to img element
   - Note: Static images shouldn't have this issue

4. **Canvas context not available**
   - Check: `getContext('2d')` returns null
   - Symptom: Rare, but check canvas element creation
   - Fix: Ensure canvas element in DOM before drawing
   - File: CompositionCanvas.svelte

**Debug steps:**
```javascript
// Check image:
1. const img = new Image();
2. img.src = 'blob:...'; // or data URL
3. img.onload = () => {
4.   console.log('Image loaded', img.width, img.height);
5.   canvas.getContext('2d').drawImage(img, 0, 0);
6. };
7. img.onerror = () => console.error('Failed to load image');
```

---

## API & Network Issues

### Cloud transcode fails with 404

**Symptoms:**
- WebM uploads successfully
- api.video returns 404 when MP4 requested
- Retry eventually succeeds (or times out)

**Root causes:**

1. **api.video transcoding not complete**
   - Check: api.video needs 10-30s to transcode
   - Symptom: MP4 not ready immediately after upload
   - Fix: Retry with exponential backoff
   - Already implemented: 5 retries with 2s delay (lines 208-224 video-export.ts)

2. **Incorrect MP4 URL**
   - Check: api.video response has correct mp4 URL
   - Symptom: URL path syntax error
   - Fix: Log response and verify URL format
   - File: `src/routes/api/transcode/+server.ts`

3. **api.video API key invalid or expired**
   - Check: API key in Cloudflare environment variable
   - Symptom: 401 Unauthorized from api.video
   - Fix: Verify key and redeploy
   - Note: This affects all users globally

**Fix:**
```javascript
// Increase retry attempts or delay:
for (let attempt = 0; attempt < 10; attempt++) { // 10 instead of 5
  await new Promise(r => setTimeout(r, 3000)); // 3s instead of 2s
  // ... fetch MP4
}
```

---

### Upload to cloud fails with network error

**Symptoms:**
- Export fails during upload phase
- "Network error during upload" message
- Works sometimes, fails other times

**Root causes:**

1. **Network timeout (3min limit)**
   - Check: Upload + transcode exceeds 180s
   - Symptom: Especially on slow mobile networks
   - Fix: This is architectural limit
   - Mitigation: Compress WebM before upload

2. **Intermittent network**
   - Check: Mobile user switching networks
   - Symptom: Upload interrupted mid-stream
   - Fix: Implement retry logic (currently doesn't retry upload)
   - TODO: Add upload retry handler

3. **CORS error**
   - Check: Cloudflare Worker not properly configured
   - Symptom: Browser blocks request from POST /api/transcode
   - Fix: Verify Cloudflare Worker has CORS headers
   - File: `src/routes/api/transcode/+server.ts`

**Debug steps:**
```javascript
// Monitor network:
1. DevTools → Network tab → filter to transcode
2. Check response headers: Content-Type, Access-Control-Allow-Origin
3. Monitor upload size: should be < 50MB for typical 60s video
4. Check connection: DevTools → Network → throttle to Slow 3G
```

---

## Performance Issues

### Export takes 60+ seconds for 30-second video

**Symptoms:**
- WebCodecs export slower than expected
- Mobile device gets very hot
- Other apps become unresponsive

**Root causes & fixes:**

1. **Low-end device CPU bound**
   - Check: Device is 3+ years old or budget model
   - Symptom: This is expected behavior
   - Fix: Reduce frame rate: 24fps → 15fps
   - File: `src/lib/utils/video-export.ts` (fps parameter)

2. **Canvas too large**
   - Check: Export resolution > 1280x1280
   - Symptom: Overkill for mobile viewing
   - Fix: Cap export to 1080p max
   - File: `src/lib/components/AudiogramPage.svelte`

3. **Waveform rendering too complex**
   - Check: Waveform draws thousands of small bars
   - Symptom: Heavy computation per frame
   - Fix: Aggregate waveform data or use lower frequency bins
   - File: `src/lib/utils/waveform.ts`

4. **Light effect animation expensive**
   - Check: Bokeh effect with many gradient layers
   - Symptom: CPU spike during light effect frames
   - Fix: Reduce particle count or update frequency
   - File: `src/lib/utils/compositor.ts`

**Optimization checklist:**
- [ ] Reduce frame rate if export > 30s
- [ ] Lower canvas resolution if export > 40s
- [ ] Disable light effect if export > 50s
- [ ] Profile with Chrome DevTools Performance tab

---

## Mobile-Specific Issues

### iOS Safari: Audio plays but export fails

**Symptoms:**
- Audio plays in preview
- Export button tapped, progress bar appears
- Export hangs or fails at 50%

**Root causes:**

1. **Web Audio API different on iOS**
   - Check: AudioContext state is "suspended"
   - Symptom: Audio operations fail until user interaction
   - Fix: Resume context before operations
   - File: Add context.resume() before encode

2. **MediaRecorder fallback only option**
   - Check: WebCodecs not available on Safari
   - Symptom: Always uses MediaRecorder fallback
   - This is correct behavior (WebM output acceptable)

3. **Audio capture from element not working**
   - Check: audioElement.captureStream() returns invalid stream
   - Symptom: Audio track empty in combined stream
   - Fix: Use Web Audio API route instead
   - Fallback: Video-only export

**Fix:**
```javascript
// In WebCodecs audio setup:
try {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume(); // Critical for iOS
  // ... rest of audio setup
} catch (e) {
  console.warn('AudioContext setup failed:', e);
  // Continue without audio
}
```

---

### Android: Sporadic export failures

**Symptoms:**
- Export works 80% of the time
- Sometimes fails mid-way through
- Error varies (black screen, WebM instead of MP4)

**Root causes:**

1. **Memory pressure from garbage collector**
   - Check: Device has < 2GB free RAM
   - Symptom: GC pause during frame encoding causes frame drop
   - Fix: Unload heavy resources before export
   - Mitigation: Show "Clearing cache..." message

2. **CPU throttling (thermal)** 
   - Check: Device too hot (encoder generates heat)
   - Symptom: Encoding speed varies wildly
   - Fix: Automatic—device throttles itself
   - Mitigation: Don't stress device before export

3. **Intermittent codec issue**
   - Check: WebCodecs support inconsistent across reboots
   - Symptom: Sometimes H.264 available, sometimes not
   - Fix: Fall back to MediaRecorder reliably
   - File: Smart fallback already implemented

**Debug steps:**
```javascript
// Log device specs:
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl');
const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
console.log('GPU:', gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
console.log('RAM:', navigator.deviceMemory); // May be undefined
console.log('Cores:', navigator.hardwareConcurrency);
```

---

## Development & Testing

### Changes not appearing in dev build

**Symptoms:**
- Code changed, but browser shows old version
- Hot reload not triggering
- `npm run dev` running but stale

**Fixes:**

1. **SvelteKit cache issue**
   ```bash
   rm -rf .svelte-kit
   npm run dev
   ```

2. **Vite cache issue**
   ```bash
   rm -rf node_modules/.vite
   npm run dev
   ```

3. **Browser cache**
   - DevTools → Network tab → Disable cache
   - Or: Hard refresh (Cmd+Shift+R on Mac)

4. **Watch mode not detecting changes**
   - Check: File saved? (editor might buffer)
   - Fix: Manual reload in browser

---

### TypeScript errors but code works

**Symptoms:**
- `npm run check` shows errors
- But `npm run dev` works fine
- Build succeeds

**Root causes:**

1. **Type mismatch in generic**
   - Check: Type assertion without guard
   - Example: `const x = output.target as SomeType;`
   - Fix: Add runtime check before assertion
   - File: `src/lib/utils/webcodecs-export.ts:445`

2. **Svelte component type unknown**
   - Check: Component not exported properly
   - Fix: Ensure `export let prop: Type;` is declared
   - File: Check component definitions

3. **Missing @types package**
   - Check: npm install hasn't completed
   - Fix: `npm install` and wait for completion

---

## Deployment Issues

### Production export fails but dev works

**Symptoms:**
- Works locally with `npm run dev`
- Fails when deployed to production
- Often related to environment or Cloudflare

**Root causes:**

1. **Environment variables not set**
   - Check: Cloudflare Pages → Settings → Environment variables
   - Fix: Add `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `YARNGPT_API_KEY`
   - Important: Redeploy after setting variables

2. **Cloudflare Worker function timeout**
   - Check: TTS endpoint takes > 30s on slow API
   - Symptom: 504 Gateway timeout
   - Fix: YarnGPT ~30s is expected but can timeout
   - Mitigation: Increase timeout in Cloudflare settings (if possible)

3. **CORS issue in production**
   - Check: API origin mismatch
   - Symptom: Browser blocks request
   - Fix: Cloudflare Pages auto-includes origin headers
   - If manual: Verify `Access-Control-Allow-Origin` headers

**Debug:**
```bash
# Test endpoint directly:
curl -X POST "https://audioflam.pages.dev/api/tts" \
  -H "Content-Type: application/json" \
  -d '{"text":"test","voiceName":"en-NG-AbeoNeural","provider":"azure"}'
```

---

## Performance Monitoring

### How to profile export performance

```javascript
// Add to exportWithWebCodecs or exportCanvasVideoLegacy:
const startTime = performance.now();

// ... export code ...

const endTime = performance.now();
console.log(`Export took ${(endTime - startTime) / 1000}s`);
console.log(`Expected: ~${duration}s for ${fps}fps + overhead`);
console.log(`Actual FPS: ${totalFrames / ((endTime - startTime) / 1000)}`);
```

### Browser DevTools recommendations

1. **Performance tab:**
   - Record during export
   - Look for long tasks (yellow blocks)
   - Check main thread blocks

2. **Memory tab:**
   - Take heap snapshot before export
   - Take heap snapshot after export
   - Compare: memory should be freed

3. **Network tab:**
   - Monitor `/api/transcode` requests
   - Check upload/download sizes
   - Watch for retries

---

**Last Updated:** February 2026
