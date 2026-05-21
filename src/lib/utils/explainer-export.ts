/**
 * Explainer video export — canvas compositor + smartExportExplainer()
 *
 * Accepts audioBlob (not HTMLAudioElement) and a panels array.
 * Three-tier strategy: WebCodecs → MediaRecorder → cloud transcode.
 *
 * Ken Burns: zoom-in, zoom-out, none (pure canvas, no library).
 * Transitions: none, zoom-in, zoom-out.
 * Hold-last-frame: last panel image held until audio ends.
 */

import { checkWebCodecsSupport } from './webcodecs-export';
import type { ExportProgress, ProgressCallback, ExportResult } from './video-export';
import type { VideoPanel, AspectRatio, KenBurnsPreset, TransitionPreset } from '$lib/stores/videoProject';
import { CANVAS_DIMENSIONS } from '$lib/stores/videoProject';
import {
  easeInOut,
  drawKenBurnsFrame,
  drawTransitionFrame,
  transitionDuration,
  getTransitionState,
} from './explainer-renderer';

// Types for Mediabunny (loaded dynamically)
type MediabunnyModule = typeof import('mediabunny');
let mediabunnyModule: MediabunnyModule | null = null;

async function loadMediabunny(): Promise<MediabunnyModule> {
  if (!mediabunnyModule) {
    mediabunnyModule = await import('mediabunny');
  }
  return mediabunnyModule;
}

export interface ExplainerExportOptions {
  panels: VideoPanel[];
  audioBlob: Blob;
  aspectRatio: AspectRatio;
  kenBurns: KenBurnsPreset;
  kenBurnsSpeed: number;
  transition: TransitionPreset;
  transitionSpeed: number;
  onProgress?: ProgressCallback;
}

const FPS = 25;

// ─── Rendering functions imported from explainer-renderer.ts ──────────────────

// ─── Build ImageBitmap array ──────────────────────────────────────────────────

async function loadPanelBitmaps(
  panels: VideoPanel[],
  canvasWidth: number,
  canvasHeight: number
): Promise<(ImageBitmap | null)[]> {
  return Promise.all(
    panels.map(async (panel) => {
      if (!panel.imageBlob) return null;
      try {
        return await createImageBitmap(panel.imageBlob, {
          resizeWidth: canvasWidth,
          resizeHeight: canvasHeight,
          resizeQuality: 'high',
        });
      } catch {
        return null;
      }
    })
  );
}

// ─── Transition window helpers imported from explainer-renderer.ts ────────────

// ─── WebCodecs path ───────────────────────────────────────────────────────────

async function exportExplainerWithWebCodecs(
  options: ExplainerExportOptions,
  audioDuration: number,
  audioBuffer: AudioBuffer
): Promise<ExportResult> {
  const { panels, aspectRatio, kenBurns, kenBurnsSpeed, transition, transitionSpeed, onProgress } = options;
  const { width: canvasWidth, height: canvasHeight } = CANVAS_DIMENSIONS[aspectRatio];

  // H.264 requires even dimensions
  const videoWidth = canvasWidth % 2 === 0 ? canvasWidth : canvasWidth + 1;
  const videoHeight = canvasHeight % 2 === 0 ? canvasHeight : canvasHeight + 1;

  onProgress?.({ phase: 'preparing', progress: 0.05, message: 'Loading encoder...' });

  const mb = await loadMediabunny();
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource } = mb;

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const exportCanvas = new OffscreenCanvas(videoWidth, videoHeight);
  const exportCtx = exportCanvas.getContext('2d')!;

  const totalFrames = Math.ceil(audioDuration * FPS);
  let encodedFrames = 0;

  const videoSource = new CanvasSource(exportCanvas, {
    codec: 'avc',
    bitrate: 2_000_000,
    keyFrameInterval: 2,
    onEncodedPacket: () => {
      encodedFrames++;
      const progress = 0.1 + Math.min(encodedFrames / totalFrames, 0.8);
      onProgress?.({
        phase: 'recording',
        progress,
        message: `Encoding: ${Math.round((encodedFrames / totalFrames) * 100)}%`,
      });
    },
  });

  output.addVideoTrack(videoSource, { frameRate: FPS });

  // Audio: mono → stereo conversion (gotcha #2)
  let processedAudioBuffer = audioBuffer;
  if (audioBuffer.numberOfChannels === 1) {
    try {
      const ac = new AudioContext();
      const stereo = ac.createBuffer(2, audioBuffer.length, audioBuffer.sampleRate);
      const mono = audioBuffer.getChannelData(0);
      stereo.getChannelData(0).set(mono);
      stereo.getChannelData(1).set(mono);
      processedAudioBuffer = stereo;
      ac.close();
    } catch {
      // keep mono if conversion fails
    }
  }

  let audioSource: InstanceType<typeof AudioBufferSource> | null = null;
  try {
    const audioConfig: AudioEncoderConfig = {
      codec: 'mp4a.40.2',
      sampleRate: processedAudioBuffer.sampleRate,
      numberOfChannels: processedAudioBuffer.numberOfChannels,
      bitrate: 96000,
    };
    const support = await AudioEncoder.isConfigSupported(audioConfig);
    if (support.supported) {
      audioSource = new AudioBufferSource({ codec: 'aac', bitrate: 96000 });
      output.addAudioTrack(audioSource);
    }
  } catch {
    // continue without audio
  }

  await output.start();

  onProgress?.({ phase: 'recording', progress: 0.1, message: 'Rendering frames...' });

  // Pre-load bitmaps
  const bitmaps = await loadPanelBitmaps(panels, canvasWidth, canvasHeight);

  // Find last panel with an image for hold-last-frame
  let lastBitmapIndex = -1;
  for (let i = bitmaps.length - 1; i >= 0; i--) {
    if (bitmaps[i]) { lastBitmapIndex = i; break; }
  }

  const frameDurationSec = 1 / FPS;

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    const currentTime = frameIndex / FPS;

    // Find which panel is active at currentTime
    let activePanelIndex = -1;
    for (let i = 0; i < panels.length; i++) {
      if (currentTime >= panels[i].startTime && currentTime < panels[i].endTime) {
        activePanelIndex = i;
        break;
      }
    }

    // Hold-last-frame: after last panel ends, use last available bitmap
    if (activePanelIndex === -1 && currentTime >= (panels[panels.length - 1]?.endTime ?? 0)) {
      activePanelIndex = lastBitmapIndex;
    }

    exportCtx.clearRect(0, 0, videoWidth, videoHeight);
    exportCtx.fillStyle = '#000000';
    exportCtx.fillRect(0, 0, videoWidth, videoHeight);

    // Check if we're in a transition window
    const ts = getTransitionState(panels, currentTime, transition, transitionSpeed);

    if (ts.inTransition) {
      drawTransitionFrame(
        exportCtx,
        bitmaps[ts.outgoingIndex],
        bitmaps[ts.incomingIndex],
        videoWidth,
        videoHeight,
        transition,
        ts.progress
      );
    } else if (activePanelIndex >= 0 && bitmaps[activePanelIndex]) {
      const panel = panels[activePanelIndex];
      const panelDuration = panel.endTime - panel.startTime;
      const panelProgress = panelDuration > 0
        ? Math.min((currentTime - panel.startTime) / panelDuration, 1)
        : 1;

      drawKenBurnsFrame(
        exportCtx,
        bitmaps[activePanelIndex]!,
        videoWidth,
        videoHeight,
        kenBurns,
        kenBurnsSpeed,
        panelProgress
      );
    }

    await videoSource.add(currentTime, frameDurationSec);
  }

  videoSource.close();

  // Encode audio
  if (audioSource) {
    onProgress?.({ phase: 'processing', progress: 0.9, message: 'Encoding audio...' });
    try {
      // Trim audio to video duration if needed
      if (processedAudioBuffer.duration > audioDuration) {
        const ac = new AudioContext();
        const trimLen = Math.floor(audioDuration * processedAudioBuffer.sampleRate);
        const trimmed = ac.createBuffer(
          processedAudioBuffer.numberOfChannels,
          trimLen,
          processedAudioBuffer.sampleRate
        );
        for (let ch = 0; ch < processedAudioBuffer.numberOfChannels; ch++) {
          trimmed.getChannelData(ch).set(
            processedAudioBuffer.getChannelData(ch).subarray(0, trimLen)
          );
        }
        await audioSource.add(trimmed);
        ac.close();
      } else {
        await audioSource.add(processedAudioBuffer);
      }
      audioSource.close();
    } catch (e) {
      console.warn('[ExplainerExport] Audio encoding failed:', e);
    }
  }

  onProgress?.({ phase: 'processing', progress: 0.95, message: 'Finalizing...' });
  await output.finalize();

  // Clean up bitmaps
  bitmaps.forEach(b => b?.close());

  const target = output.target as InstanceType<typeof BufferTarget>;
  if (!target.buffer) throw new Error('Export failed: no data produced');

  const blob = new Blob([target.buffer], { type: 'video/mp4' });

  onProgress?.({ phase: 'complete', progress: 1, message: 'Complete' });
  return { blob, mimeType: 'video/mp4' };
}

// ─── MediaRecorder path ───────────────────────────────────────────────────────

async function exportExplainerWithMediaRecorder(
  options: ExplainerExportOptions,
  audioDuration: number
): Promise<ExportResult> {
  const { panels, aspectRatio, kenBurns, kenBurnsSpeed, transition, transitionSpeed, onProgress } = options;
  const { width: canvasWidth, height: canvasHeight } = CANVAS_DIMENSIONS[aspectRatio];

  onProgress?.({ phase: 'preparing', progress: 0, message: 'Preparing export...' });

  // Pre-load bitmaps
  const bitmaps = await loadPanelBitmaps(panels, canvasWidth, canvasHeight);

  let lastBitmapIndex = -1;
  for (let i = bitmaps.length - 1; i >= 0; i--) {
    if (bitmaps[i]) { lastBitmapIndex = i; break; }
  }

  // Render canvas
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // Create temp audio element for MediaRecorder capture
  const audioUrl = URL.createObjectURL(options.audioBlob);
  const audioEl = new Audio(audioUrl);
  audioEl.preload = 'auto';

  await new Promise<void>((resolve) => {
    audioEl.oncanplaythrough = () => resolve();
    audioEl.load();
    setTimeout(resolve, 3000); // fallback
  });

  return new Promise<ExportResult>((resolve, reject) => {
    const canvasStream = canvas.captureStream(FPS);

    // Capture audio from the temp element
    try {
      if (typeof (audioEl as any).captureStream === 'function') {
        const audioStream = (audioEl as any).captureStream() as MediaStream;
        audioStream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
      }
    } catch {
      // continue without audio capture
    }

    const webmTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    let mimeType = '';
    for (const t of webmTypes) {
      if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
    }
    if (!mimeType) {
      reject(new Error('No supported video format found'));
      return;
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(canvasStream, { mimeType });

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      URL.revokeObjectURL(audioUrl);
      bitmaps.forEach(b => b?.close());
      const blob = new Blob(chunks, { type: mimeType });
      onProgress?.({ phase: 'complete', progress: 1, message: 'Complete' });
      resolve({ blob, mimeType });
    };
    recorder.onerror = (e) => reject(new Error(`Recording failed: ${e}`));

    // Render loop
    const startTime = performance.now();
    let rafId: number;

    function renderLoop() {
      const elapsed = (performance.now() - startTime) / 1000;
      if (elapsed >= audioDuration) return;

      const currentTime = elapsed;
      let activePanelIndex = -1;
      for (let i = 0; i < panels.length; i++) {
        if (currentTime >= panels[i].startTime && currentTime < panels[i].endTime) {
          activePanelIndex = i;
          break;
        }
      }
      if (activePanelIndex === -1 && currentTime >= (panels[panels.length - 1]?.endTime ?? 0)) {
        activePanelIndex = lastBitmapIndex;
      }

      // Check transition window
      const ts = getTransitionState(panels, currentTime, transition, transitionSpeed);

      if (ts.inTransition) {
        drawTransitionFrame(
          ctx,
          bitmaps[ts.outgoingIndex],
          bitmaps[ts.incomingIndex],
          canvasWidth,
          canvasHeight,
          transition,
          ts.progress
        );
      } else {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        if (activePanelIndex >= 0 && bitmaps[activePanelIndex]) {
          const panel = panels[activePanelIndex];
          const panelDuration = panel.endTime - panel.startTime;
          const panelProgress = panelDuration > 0
            ? Math.min((currentTime - panel.startTime) / panelDuration, 1)
            : 1;
          drawKenBurnsFrame(ctx, bitmaps[activePanelIndex]!, canvasWidth, canvasHeight, kenBurns, kenBurnsSpeed, panelProgress);
        }
      }

      const progress = Math.min(elapsed / audioDuration, 0.9);
      onProgress?.({ phase: 'recording', progress, message: `Recording: ${Math.round(elapsed)}s / ${Math.round(audioDuration)}s` });

      rafId = requestAnimationFrame(renderLoop);
    }

    recorder.start(100);
    audioEl.play().catch(() => {});
    rafId = requestAnimationFrame(renderLoop);

    setTimeout(() => {
      cancelAnimationFrame(rafId);
      audioEl.pause();
      canvasStream.getTracks().forEach(t => t.stop());
      if (recorder.state !== 'inactive') recorder.stop();
    }, (audioDuration + 0.5) * 1000);
  });
}

// ─── Cloud transcode (reuse existing endpoint) ────────────────────────────────

async function transcodeInCloud(webmBlob: Blob, onProgress?: ProgressCallback): Promise<ExportResult> {
  onProgress?.({ phase: 'uploading', progress: 0, message: 'Sending to cloud...' });

  const formData = new FormData();
  formData.append('video', webmBlob, 'video.webm');

  const { mp4Url, videoId } = await new Promise<{ mp4Url: string; videoId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.timeout = 180000;

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress?.({ phase: 'uploading', progress: (e.loaded / e.total) * 0.3, message: `Uploading: ${Math.round((e.loaded / e.total) * 100)}%` });
      }
    });

    let interval: ReturnType<typeof setInterval> | null = null;
    let transcodingProgress = 0.3;

    xhr.addEventListener('load', () => {
      if (interval) clearInterval(interval);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const r = JSON.parse(xhr.responseText);
          if (r.error) reject(new Error(r.error));
          else resolve({ mp4Url: r.mp4Url, videoId: r.videoId });
        } catch { reject(new Error('Invalid response from transcoding service')); }
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => { if (interval) clearInterval(interval); reject(new Error('Network error during upload')); });
    xhr.addEventListener('timeout', () => { if (interval) clearInterval(interval); reject(new Error('Upload timed out')); });

    xhr.open('POST', '/api/transcode');
    xhr.send(formData);

    interval = setInterval(() => {
      if (xhr.readyState === XMLHttpRequest.DONE) { clearInterval(interval!); return; }
      transcodingProgress = Math.min(transcodingProgress + 0.02, 0.9);
      onProgress?.({ phase: 'transcoding', progress: transcodingProgress, message: 'Converting in the cloud...' });
    }, 2000);
  });

  onProgress?.({ phase: 'processing', progress: 0.95, message: 'Downloading MP4...' });

  let mp4Blob: Blob | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
    const res = await fetch(mp4Url);
    if (res.ok) { mp4Blob = await res.blob(); break; }
    if (res.status !== 404 || attempt === 4) throw new Error(`Failed to download MP4: ${res.status}`);
  }
  if (!mp4Blob) throw new Error('Failed to download transcoded MP4 after retries');

  fetch('/api/transcode', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId }),
  }).catch(() => {});

  onProgress?.({ phase: 'complete', progress: 1, message: 'Complete' });
  return { blob: mp4Blob, mimeType: 'video/mp4' };
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * smartExportExplainer — three-tier export strategy for the Explainer tab.
 * Accepts audioBlob (not HTMLAudioElement) unlike smartExportVideo().
 */
export async function smartExportExplainer(options: ExplainerExportOptions): Promise<ExportResult> {
  const { audioBlob, onProgress } = options;

  // Decode audio blob to AudioBuffer for WebCodecs path
  let audioBuffer: AudioBuffer | null = null;
  let audioDuration = 0;

  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const ac = new AudioContext();
    audioBuffer = await ac.decodeAudioData(arrayBuffer);
    audioDuration = audioBuffer.duration;
    ac.close();
  } catch (e) {
    console.warn('[ExplainerExport] Could not decode audio:', e);
    // Fallback: estimate duration from blob (rough)
    audioDuration = options.panels.length > 0
      ? options.panels[options.panels.length - 1].endTime + 0.5
      : 30;
  }

  console.log('[ExplainerExport] Audio duration:', audioDuration);

  // Tier 1: WebCodecs
  const support = await checkWebCodecsSupport();
  if (support.supported && support.hasH264 && audioBuffer) {
    console.log('[ExplainerExport] Using WebCodecs path');
    try {
      return await exportExplainerWithWebCodecs(options, audioDuration, audioBuffer);
    } catch (err) {
      console.error('[ExplainerExport] WebCodecs failed, falling back to MediaRecorder:', err);
    }
  }

  // Tier 2: MediaRecorder → WebM
  console.log('[ExplainerExport] Using MediaRecorder path');
  const localResult = await exportExplainerWithMediaRecorder(options, audioDuration);

  // If we got MP4 locally, done
  if (localResult.mimeType.includes('mp4')) {
    return localResult;
  }

  // Tier 3: Cloud transcode WebM → MP4
  console.log('[ExplainerExport] Sending WebM to cloud for MP4 transcode');
  return transcodeInCloud(localResult.blob, onProgress);
}
