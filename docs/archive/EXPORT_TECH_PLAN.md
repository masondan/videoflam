# AudioFlam Mobile Export - Technical Plan

**Document Status:** Planning  
**Created:** January 2026  
**Objective:** Enable reliable MP4 export on mobile devices (85% Android, 15% iOS)

---

## Executive Summary

Mobile MP4 export fails because MediaRecorder's H.264 encoder rejects canvas streams on mobile, despite claiming support. This plan outlines a two-phase approach:

1. **Phase 1:** WebCodecs + MP4Box.js (client-side, works on most Android)
2. **Phase 2:** Cloudinary/api.video fallback (server-side transcoding for iOS/failures)

---

## Phase 1: WebCodecs + MP4 Muxing

### How It Works

Instead of using MediaRecorder (which lies about H.264 support), we:

1. Capture canvas frames manually as `VideoFrame` objects
2. Encode frames using WebCodecs `VideoEncoder` (H.264)
3. Encode audio using WebCodecs `AudioEncoder` (AAC)
4. Mux encoded chunks into MP4 container using a JavaScript library

### Browser Support

| Browser | VideoEncoder H.264 | AudioEncoder AAC | Status |
|---------|-------------------|------------------|--------|
| Chrome Android | ✅ Supported | ✅ Supported | **Primary target** |
| Chrome Desktop | ✅ Supported | ✅ Supported | Works |
| Firefox | ❌ Limited | ❌ Limited | Fallback needed |
| Safari iOS | ⚠️ Partial | ⚠️ Partial | **Fallback needed** |

### Libraries Required

#### Option A: webm-muxer + mp4-muxer (Recommended)
- **Author:** Vanilagy (https://github.com/Vanilagy)
- **mp4-muxer:** https://github.com/Vanilagy/mp4-muxer
- **Size:** ~50KB minified
- **License:** MIT
- **Features:** Pure TypeScript, no WASM, video + audio support

```bash
npm install mp4-muxer
```

#### Option B: MP4Box.js
- **Source:** https://github.com/gpac/mp4box.js
- **Size:** ~200KB
- **Notes:** More complex API, but battle-tested

### Implementation Steps

#### Step 1: Feature Detection

```typescript
async function canUseWebCodecs(): Promise<{
  supported: boolean;
  hasH264: boolean;
  hasAAC: boolean;
}> {
  if (!('VideoEncoder' in window) || !('AudioEncoder' in window)) {
    return { supported: false, hasH264: false, hasAAC: false };
  }

  // Check H.264 encoding support
  const videoConfig = {
    codec: 'avc1.42E01E', // Baseline profile, level 3.0
    width: 1080,
    height: 1920,
    bitrate: 2_000_000,
    framerate: 15,
  };
  
  const videoSupport = await VideoEncoder.isConfigSupported(videoConfig);
  
  // Check AAC encoding support
  const audioConfig = {
    codec: 'mp4a.40.2', // AAC-LC
    sampleRate: 44100,
    numberOfChannels: 2,
    bitrate: 128000,
  };
  
  const audioSupport = await AudioEncoder.isConfigSupported(audioConfig);
  
  return {
    supported: true,
    hasH264: videoSupport.supported,
    hasAAC: audioSupport.supported,
  };
}
```

#### Step 2: Frame Capture Pipeline

```typescript
interface ExportConfig {
  canvas: HTMLCanvasElement;
  audioBuffer: AudioBuffer;
  duration: number;
  fps: number;
  onProgress: (progress: number) => void;
}

async function exportWithWebCodecs(config: ExportConfig): Promise<Blob> {
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
  
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: {
      codec: 'avc',
      width: config.canvas.width,
      height: config.canvas.height,
    },
    audio: {
      codec: 'aac',
      sampleRate: config.audioBuffer.sampleRate,
      numberOfChannels: config.audioBuffer.numberOfChannels,
    },
    fastStart: 'in-memory',
  });

  // Setup video encoder
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('Video encoder error:', e),
  });

  videoEncoder.configure({
    codec: 'avc1.42E01E',
    width: config.canvas.width,
    height: config.canvas.height,
    bitrate: 2_000_000,
    framerate: config.fps,
  });

  // Setup audio encoder
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => console.error('Audio encoder error:', e),
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2',
    sampleRate: config.audioBuffer.sampleRate,
    numberOfChannels: config.audioBuffer.numberOfChannels,
    bitrate: 128000,
  });

  // Encode frames
  const totalFrames = Math.ceil(config.duration * config.fps);
  const frameDuration = 1_000_000 / config.fps; // microseconds

  for (let i = 0; i < totalFrames; i++) {
    // Render frame to canvas (call your renderFrame function here)
    const timestamp = i * frameDuration;
    
    const frame = new VideoFrame(config.canvas, {
      timestamp,
      duration: frameDuration,
    });

    const isKeyFrame = i % 30 === 0; // Keyframe every 30 frames
    videoEncoder.encode(frame, { keyFrame: isKeyFrame });
    frame.close();

    config.onProgress(i / totalFrames * 0.8); // 80% for video
  }

  // Encode audio (simplified - needs AudioData conversion)
  // ... audio encoding logic ...

  await videoEncoder.flush();
  await audioEncoder.flush();
  
  videoEncoder.close();
  audioEncoder.close();
  
  muxer.finalize();

  config.onProgress(1);
  
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}
```

#### Step 3: Audio Encoding (Complex Part)

```typescript
async function encodeAudioBuffer(
  audioBuffer: AudioBuffer,
  encoder: AudioEncoder
): Promise<void> {
  const { sampleRate, numberOfChannels, length } = audioBuffer;
  
  // Get interleaved audio data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  // Process in chunks (1024 samples typical)
  const chunkSize = 1024;
  const totalChunks = Math.ceil(length / chunkSize);

  for (let chunk = 0; chunk < totalChunks; chunk++) {
    const offset = chunk * chunkSize;
    const size = Math.min(chunkSize, length - offset);
    
    // Create interleaved data
    const data = new Float32Array(size * numberOfChannels);
    for (let sample = 0; sample < size; sample++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        data[sample * numberOfChannels + channel] = channels[channel][offset + sample];
      }
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: size,
      numberOfChannels,
      timestamp: (offset / sampleRate) * 1_000_000, // microseconds
      data,
    });

    encoder.encode(audioData);
    audioData.close();
  }
}
```

### Estimated Effort: 2 days

---

## Phase 2: Server-Side Fallback

For devices where WebCodecs fails (iOS Safari, older Android), we offer a cloud-based fallback.

### Option A: Cloudinary (You Already Use This)

**Pricing:**
- Free tier: 25 credits/month
- Video transcoding: ~1 credit per 10 seconds of video
- Your use case (60s videos): ~6 credits per export

**API Flow:**
```
1. Export WebM locally (works everywhere)
2. Upload WebM to Cloudinary
3. Request MP4 transformation: f_mp4,vc_h264
4. Return MP4 URL to user
```

**Implementation:**
```typescript
async function transcodeViaCloudinary(webmBlob: Blob): Promise<string> {
  // Upload WebM
  const formData = new FormData();
  formData.append('file', webmBlob);
  formData.append('upload_preset', 'audioflam_videos');
  formData.append('resource_type', 'video');

  const uploadResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
    { method: 'POST', body: formData }
  );
  
  const { public_id } = await uploadResponse.json();

  // Generate MP4 URL (Cloudinary transcodes on-the-fly)
  const mp4Url = `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/f_mp4,vc_h264/${public_id}.mp4`;
  
  return mp4Url;
}
```

**Pros:**
- You already have Cloudinary
- Reliable transcoding
- CDN delivery included

**Cons:**
- Requires upload/download (uses user bandwidth)
- Credit-based pricing

---

### Option B: api.video (Alternative)

**Pricing:**
- Free encoding (they removed encoding fees!)
- Pay only for storage ($0.00285/min) and delivery ($0.0017/min)
- Your use case (60s video): ~$0.003 per export

**Features:**
- Free video encoding/transcoding
- HLS & MP4 output
- Built-in player

**API Flow:**
```typescript
async function transcodeViaApiVideo(webmBlob: Blob): Promise<string> {
  // 1. Create video object
  const createResponse = await fetch('https://ws.api.video/videos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: 'Audiogram Export' }),
  });
  
  const { videoId, assets } = await createResponse.json();

  // 2. Upload video
  const formData = new FormData();
  formData.append('file', webmBlob);
  
  await fetch(`https://ws.api.video/videos/${videoId}/source`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}` },
    body: formData,
  });

  // 3. Poll for transcoding completion
  // api.video automatically transcodes to MP4 + HLS
  
  // 4. Return MP4 URL
  return assets.mp4; // Direct MP4 download URL
}
```

**Pros:**
- Free encoding
- Very low cost overall
- Professional video infrastructure

**Cons:**
- New service to integrate
- Requires API key management

---

## Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Export Button Clicked                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                  ┌─────────────────────────┐
                  │   Check WebCodecs       │
                  │   Support               │
                  └─────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                   ▼
    ┌──────────────────┐              ┌──────────────────┐
    │  WebCodecs       │              │  WebCodecs       │
    │  SUPPORTED       │              │  NOT SUPPORTED   │
    │  (Most Android)  │              │  (iOS, Firefox)  │
    └──────────────────┘              └──────────────────┘
              │                                   │
              ▼                                   ▼
    ┌──────────────────┐              ┌──────────────────┐
    │  Encode H.264    │              │  Record WebM     │
    │  + AAC locally   │              │  (MediaRecorder) │
    │  via WebCodecs   │              │                  │
    └──────────────────┘              └──────────────────┘
              │                                   │
              ▼                                   ▼
    ┌──────────────────┐              ┌──────────────────┐
    │  Mux to MP4      │              │  Upload to       │
    │  (mp4-muxer)     │              │  Cloudinary      │
    └──────────────────┘              └──────────────────┘
              │                                   │
              ▼                                   ▼
    ┌──────────────────┐              ┌──────────────────┐
    │  Download        │              │  Get MP4 URL     │
    │  MP4 directly    │              │  & Download      │
    └──────────────────┘              └──────────────────┘
```

---

## Implementation Timeline

| Day | Task | Outcome |
|-----|------|---------|
| 1 | Install mp4-muxer, implement WebCodecs detection | Feature detection working |
| 2 | Build frame capture + video encoding pipeline | Video-only export working |
| 3 | Add audio encoding + sync | Full A/V export working |
| 4 | Integrate Cloudinary fallback | iOS/fallback working |
| 5 | Testing & polish | Production ready |

---

## Files to Create/Modify

### New Files
- `src/lib/utils/webcodecs-export.ts` - WebCodecs encoding logic
- `src/lib/utils/cloudinary-transcode.ts` - Cloudinary fallback

### Modified Files
- `src/lib/utils/video-export.ts` - Add export strategy selection
- `src/lib/components/AudiogramPage.svelte` - Update export button logic
- `package.json` - Add mp4-muxer dependency

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebCodecs fails on some Android | Medium | Medium | Cloudinary fallback |
| iOS Safari doesn't work | High | Low (15% users) | Cloudinary fallback |
| Audio sync issues | Medium | High | Careful timestamp handling |
| Cloudinary costs exceed budget | Low | Medium | Monitor usage, cap exports |

---

## Success Criteria

1. **Android Chrome:** MP4 exports successfully via WebCodecs (no server)
2. **iOS Safari:** MP4 exports via Cloudinary fallback
3. **Export time:** Under 30 seconds for 60-second video
4. **Audio sync:** Waveform animation matches audio within 100ms

---

## Next Steps

1. **Approve this plan** - Any concerns or changes needed?
2. **Choose fallback provider** - Cloudinary (familiar) or api.video (cheaper)?
3. **Begin Phase 1** - WebCodecs implementation

---

## References

- [WebCodecs API (Chrome Developers)](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs)
- [mp4-muxer library](https://github.com/Vanilagy/mp4-muxer)
- [Cloudinary Video Transformations](https://cloudinary.com/documentation/video_manipulation_and_delivery)
- [api.video Pricing](https://api.video/pricing/)
- [MP4Box.js WebCodecs example](https://github.com/gpac/mp4box.js/issues/243)
