# AudioFlam Architecture & Data Flow

**Purpose:** Visual and conceptual diagrams of how AudioFlam components interact  
**Status:** Current as of February 2026

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     AudioFlam Frontend                          │
│                                                                 │
│  ┌──────────────────────┐          ┌──────────────────────┐    │
│  │    TTS Module        │          │  Audiogram Module    │    │
│  ├──────────────────────┤          ├──────────────────────┤    │
│  │ • Text input         │          │ • Image upload       │    │
│  │ • Voice selection    │          │ • Audio import       │    │
│  │ • Generation         │          │ • Waveform display   │    │
│  │ • Audio playback     │          │ • Title/effects      │    │
│  └──────────────────────┘          │ • Canvas composition │    │
│           │                        │ • MP4 export         │    │
│           │ (preloadedTTSAudio)    └──────────────────────┘    │
│           └────────────────────────────┬──────────────────────┘  │
│                                        │                         │
│  ┌────────────────────────────────────▼────────────────────┐    │
│  │          Stores (Svelte stores)                         │    │
│  ├─────────────────────────────────────────────────────────┤    │
│  │ • selectedVoice, textInput, audioResult (TTS)           │    │
│  │ • preloadedTTSAudio (integration bridge)                │    │
│  │ • Audiogram state (image, audio, effects)               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
         │                                          │
         ▼                                          ▼
    ┌────────────┐  Cloudflare Pages          ┌─────────────┐
    │   Azure    │  Edge Workers              │  api.video  │
    │   Speech   │  ┌──────────────┐         │  (fallback) │
    │   API      │  │ /api/tts     │         └─────────────┘
    └────────────┘  │ /api/transcode│         
                    └──────────────┘         
    ┌────────────┐
    │  YarnGPT   │
    │   TTS      │
    │   API      │
    └────────────┘
```

---

## TTS Pipeline (Text → Audio)

```
User Input (Text + Voice)
         │
         ▼
┌─────────────────────────┐
│ +page.svelte            │  Validate text (<2000 chars)
│ handleGenerateAudio()   │  Get voice provider & name
└─────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ POST /api/tts                       │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ if provider === 'azure'         │ │
│ │   → Azure Speech REST API       │ │
│ │     (add Host header critical!) │ │
│ │   → Returns base64 MP3          │ │
│ │ else if provider === 'yarngpt'  │ │
│ │   → YarnGPT SSML API           │ │
│ │   → Returns base64 MP3          │ │
│ │ Both: XML-escape user text      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
         │
         ▼ {audioContent, format: 'mp3'}
┌─────────────────────────────────────┐
│ Browser: Decode base64              │
│ • atob() → byteString               │
│ • Direct Uint8Array allocation      │ ← CRITICAL: NOT double-convert
│ • Create audio/mp3 Blob             │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ Audio playback                      │
│ • Play via HTML5 <audio> element    │
│ • Or load into AudioContext         │
│ • For Audiogram: load to buffer     │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ (Optional) Store in                 │
│ preloadedTTSAudio store for         │
│ seamless Audiogram integration      │
└─────────────────────────────────────┘
```

---

## Audiogram Export Pipeline (Canvas → MP4)

```
User clicks "Download Audiogram"
         │
         ▼
┌──────────────────────────────────────┐
│ smartExportVideo()                   │
│ (video-export.ts)                    │
└──────────────────────────────────────┘
         │
         ├─────────────────────────────┐
         ▼                             ▼
    WebCodecs Available?          No WebCodecs?
         │                             │
    YES  │  NO                         │
         ▼                             ▼
    ┌────────────────────────┐   ┌──────────────────┐
    │ Tier 1: WebCodecs      │   │ Tier 2: Media    │
    │ + Mediabunny           │   │ Recorder         │
    │ (Android, Chrome Desk) │   │ (iOS, Firefox)   │
    └────────────────────────┘   └──────────────────┘
         │                             │
         ▼                             ▼
    ┌─────────────────────────────────────────────────────┐
    │ exportWithWebCodecs() OR exportCanvasVideoLegacy()  │
    ├─────────────────────────────────────────────────────┤
    │ • Create canvas stream via captureStream()          │
    │ • Start video encoder (H.264) + audio encoder (AAC) │
    │ • Render frames at 24fps with time sync             │
    │ • Mux to MP4 via Mediabunny (WebCodecs path)        │
    │ • Or record WebM via MediaRecorder (legacy path)    │
    └─────────────────────────────────────────────────────┘
         │
         ├─────────────────────────────────────────────┐
         ▼                                             ▼
    MP4 (direct download)              WebM (local) or cloud transcode?
         │                                             │
         └─────────────────────┬───────────────────────┘
                               │
                      Is WebM or forced cloud?
                               │
                               ▼
                    ┌────────────────────────────┐
                    │ Tier 3: Cloud Transcoding  │
                    │ api.video (via CF Worker)  │
                    └────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
            Upload WebM to API     Poll for MP4
                    │                    │
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │ Download MP4       │
                    │ Delete from cloud  │
                    └────────────────────┘
```

---

## Canvas Composition Layers

```
CompositionCanvas.svelte (Single <canvas> element)
         │
         ├─ Layer 1: Background (transparent or image)
         │
         ├─ Layer 2: Waveform animation
         │           (updateWaveformFrequency() or time-based)
         │
         ├─ Layer 3: Title text
         │           (draggable, resizable, font/style controlled)
         │
         ├─ Layer 4: Light effect (bokeh)
         │           (optional, opacity/speed controlled)
         │
         └─ Layer 5: UI elements (playback controls, handles)
                     (hidden during export)

Composition performed by: compositor.ts
  ├─ renderFrame(currentTime)
  │  │ • Called continuously during playback or export
  │  │ • Receives time for animation sync
  │  │ • Returns composite canvas state
  │  └─ Used by both preview and export pipelines
  │
  └─ Layer-specific renderers:
     ├─ renderImageLayer()
     ├─ renderWaveformLayer()
     ├─ renderTitleLayer()
     └─ renderLightEffectLayer()
```

---

## WebCodecs Export Flow (Detailed)

```
exportWithWebCodecs(config)
         │
         ├─ Load Mediabunny dynamically (lazy-load)
         │
         ├─ Create Output with Mp4OutputFormat
         │
         ├─ Add Video Track
         │  │ • Create OffscreenCanvas (even dimensions for H.264)
         │  │ • CanvasSource captures frames
         │  │ • H.264 codec: avc1.42001f (Baseline, level 3.1)
         │  │ • Bitrate: 2 Mbps
         │  │ • Keyframe every 2 seconds
         │  │ • FPS: 24
         │  └─ onEncodedPacket() callback tracks progress
         │
         ├─ Add Audio Track (if audio available)
         │  │ • Check if mono → convert to stereo (AAC compat)
         │  │ • AudioBufferSource encodes to AAC
         │  │ • Bitrate: 96 kbps
         │  │ • Sample rate: match audioBuffer
         │  └─ Trim audio to match video duration
         │
         ├─ Frame loop (0 to totalFrames)
         │  │ • Calculate currentTime = frameIndex / fps
         │  │ • Call renderFrame(currentTime) for animation sync
         │  │ • Copy canvas to OffscreenCanvas
         │  │ • Add frame to CanvasSource with timestamp
         │  │ • Pace encoding to real-time (sleep if needed)
         │  └─ No audio playback (CPU intensive, causes stutter)
         │
         ├─ Close video source (no more frames)
         │
         ├─ Add audio buffer if encoding supported
         │
         ├─ Finalize output
         │
         └─ Return { blob: MP4, mimeType: 'video/mp4' }
```

---

## MediaRecorder Fallback Flow (Detailed)

```
exportCanvasVideoLegacy(canvas, audioElement, duration)
         │
         ├─ Create canvas stream via captureStream(30fps)
         │
         ├─ Create audio stream from audioElement
         │  │ • audioElement.captureStream()
         │  │ • Validate audio track state ('live')
         │  │ • Add to mixed stream
         │  └─ Skip if audio invalid (video-only fallback)
         │
         ├─ Select codec
         │  │ • Desktop: try H.264 (mp4, h264, avc1)
         │  │ • Mobile: prefer WebM (WebM-VP8, WebM-VP9)
         │  └─ Fallback order ensures compatibility
         │
         ├─ Create MediaRecorder with selected codec
         │
         ├─ Render initial frame
         │
         ├─ Start MediaRecorder
         │
         ├─ Start internal RAF loop
         │  │ • Continuous renderFrame() calls
         │  │ • Runs for entire video duration
         │  └─ Ensures frames captured during recording
         │
         ├─ Start audio playback (unlike WebCodecs)
         │  └─ Sync audio to rendering
         │
         ├─ Track progress every 200ms
         │
         ├─ After duration elapsed:
         │  │ • Stop RAF loop
         │  │ • Stop audio playback
         │  │ • Stop MediaRecorder
         │  │ • Stop all tracks
         │  └─ Cleanup audio context if used
         │
         ├─ Wait for onstop event or 2s timeout
         │
         └─ Return { blob: MP4|WebM, mimeType: detected }
```

---

## Cloud Transcoding Flow (Detailed)

```
transcodeInCloud(webmBlob)
         │
         ├─ Upload via XMLHttpRequest to /api/transcode
         │  │ • FormData with video file
         │  │ • Track upload progress
         │  └─ 180s timeout total
         │
         ├─ Server: /api/transcode/+server.ts
         │  │ • Receives WebM blob
         │  │ • Creates api.video video object
         │  │ • Uploads to api.video
         │  │ • Waits for transcoding
         │  │ • Returns MP4 URL + videoId
         │  └─ (details in separate API doc)
         │
         ├─ Client waits for response
         │
         ├─ Download transcoded MP4 with retries
         │  │ • Try up to 5 times
         │  │ • 2s delay between retries
         │  │ • Handles 404 (not ready yet)
         │  └─ Timeout after all retries
         │
         ├─ Fire-and-forget delete request to clean up
         │  └─ /api/transcode with DELETE + videoId
         │
         └─ Return { blob: MP4, mimeType: 'video/mp4' }
```

---

## State Management

### Svelte Stores (`src/lib/stores.ts`)

```
TTS State:
├─ selectedVoice: VoiceOption | null
├─ textInput: string (max 2000 chars)
├─ isGenerating: boolean
├─ audioResult: string | null (base64 or blob URL)
└─ preloadedTTSAudio: { buffer: AudioBuffer, voiceName: string } | null
                      ↑ Bridge to Audiogram

Audiogram State: (managed in AudiogramPage.svelte)
├─ imageData: { original: Blob, cropped: Blob | null }
├─ audioBuffer: AudioBuffer | null
├─ waveformStyle: WaveformConfig (color, style, amplitude)
├─ titleConfig: TitleConfig (text, font, style, position)
├─ lightEffectConfig: EffectConfig (opacity, speed)
├─ isPlaying: boolean
├─ currentTime: number
└─ compositionCanvas: HTMLCanvasElement | null
```

---

## Key Data Transformations

```
Text (user input)
    ↓ [TTS API]
Base64 MP3
    ↓ [atob + Uint8Array]
Binary MP3 data
    ↓ [Blob creation]
Blob(type: 'audio/mp3')
    ↓ [Object URL]
blob: URL
    ↓ [HTML5 Audio element OR Web Audio decode]
    ├─ Playback (Audio element route)
    └─ AudioBuffer (Web Audio route)
        ↓ [Canvas animation sync]
        ├─ Waveform visualization
        └─ MP4 export (encoded as AAC)
```

---

## Error Handling Strategy

```
TTS Generation Error
    │
    ├─ API request fails
    │  └─ Show: "Failed to generate audio. Check your text and try again."
    │
    └─ Audio playback fails
       └─ Show: "Could not play audio. Try refreshing."

Export Error (WebCodecs)
    │
    ├─ WebCodecs unavailable
    │  └─ Fall back to MediaRecorder
    │
    ├─ Canvas stream fails
    │  └─ Cannot recover, show error
    │
    ├─ Audio encoding fails
    │  └─ Export video-only (audio optional)
    │
    └─ Mediabunny fails
       └─ Fall back to MediaRecorder

Export Error (MediaRecorder)
    │
    ├─ Codec not supported
    │  └─ Try next codec in preference list
    │
    ├─ Recording fails
    │  └─ Show error, offer retry
    │
    └─ Chunks not captured
       └─ Fallback timeout finalization

Export Error (Cloud Transcoding)
    │
    ├─ Upload fails
    │  └─ Retry up to 3x, then error
    │
    ├─ Transcoding timeout
    │  └─ Error: "Transcoding took too long"
    │
    └─ MP4 download fails
       └─ Retry 5x with delays
```

---

## Performance Considerations

### WebCodecs Path
- **Prep time:** 100-500ms (Mediabunny load)
- **Encoding time:** 10-40s for 60s video
- **Bottleneck:** CPU encoding (GPU limited on mobile)
- **Optimization:** Time-paced frame loop avoids over-queueing

### MediaRecorder Path
- **Prep time:** 50-200ms
- **Recording time:** Similar to source duration (~60s)
- **Bottleneck:** Browser implementation (varies by device)
- **Optimization:** Internal RAF loop ensures continuous capture

### Cloud Transcoding Path
- **Upload time:** 5-20s (depends on network)
- **Transcoding time:** 10-30s on api.video servers
- **Download time:** 2-10s
- **Total overhead:** +10-30s over local export
- **Optimization:** Polling every 2s, retry logic, background deletion

---

## Browser Compatibility Matrix

| Feature | Chrome Android | Chrome Desktop | Safari iOS | Firefox |
|---------|---|---|---|---|
| WebCodecs VideoEncoder | ✅ | ✅ | ⚠️ Partial | ❌ |
| MediaRecorder | ✅ | ✅ | ✅ | ✅ |
| H.264 via MediaRecorder | 🔴 Claims but fails | ✅ | ❌ | ❌ |
| WebM via MediaRecorder | ✅ | ✅ | ⚠️ Limited | ✅ |
| Web Audio API | ✅ | ✅ | ✅ | ✅ |
| Canvas API | ✅ | ✅ | ✅ | ✅ |
| OffscreenCanvas | ✅ | ✅ | ⚠️ Limited | ✅ |

**Result:** WebCodecs handles 85% (Android), MediaRecorder handles rest, cloud transcode fills iOS gap.

---

**Last Updated:** February 2026
