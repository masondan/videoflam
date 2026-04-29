import { checkWebCodecsSupport, exportWithWebCodecs } from './webcodecs-export';

export interface ExportProgress {
  phase: 'preparing' | 'recording' | 'processing' | 'uploading' | 'transcoding' | 'complete';
  progress: number;
  message: string;
}

export type ProgressCallback = (progress: ExportProgress) => void;

export interface ExportResult {
  blob: Blob;
  mimeType: string;
}

/**
 * Smart export function that chooses the best method:
 * 1. WebCodecs + Mediabunny (for reliable MP4 on Android)
 * 2. MediaRecorder fallback → Cloud transcoding if WebM produced
 * 
 * Cloud transcoding via api.video:
 * - Free encoding, ~$0/year if videos deleted after download
 * - Cloudflare Worker acts as proxy to avoid CORS and protect API key
 */
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
): Promise<ExportResult> {
  // Check WebCodecs support
  const support = await checkWebCodecsSupport();
  
  console.log('[SmartExport] WebCodecs support:', support);
  
  if (support.supported && support.hasH264 && !forceCloudTranscode) {
    console.log('[SmartExport] Using WebCodecs (Mediabunny) for MP4 export');
    
    try {
      return await exportWithWebCodecs({
        canvas,
        audioBuffer,
        audioElement,
        duration,
        fps: 24, // 24fps for smooth waveform animation
        videoBitrate: 2_000_000,
        audioBitrate: 48000, // 48 kbps - matches app audio settings
        onProgress,
        renderFrame,
        startAudioPlayback,
        stopAudioPlayback,
      });
    } catch (err) {
      console.error('[SmartExport] WebCodecs export failed, falling back to MediaRecorder:', err);
      // Fall through to MediaRecorder
    }
  }
  
  console.log('[SmartExport] Using MediaRecorder fallback');
  
  // Pass through the renderFrame function with its currentTime parameter
  // (no need for a wrapper - exportCanvasVideoLegacy now accepts currentTime parameter)
  
  // When forceCloudTranscode is true, use WebM to avoid Android H.264 encoding errors
  const localResult = await exportCanvasVideoLegacy(
    canvas,
    audioElement,
    duration,
    onProgress,
    renderFrame,
    startAudioPlayback,
    stopAudioPlayback,
    forceCloudTranscode // Pass as forceWebM
  );

  // If we got MP4 locally, we're done
  if (localResult.mimeType.includes('mp4') && !forceCloudTranscode) {
    console.log('[SmartExport] Got MP4 from MediaRecorder, no cloud transcode needed');
    return localResult;
  }

  // Need cloud transcoding (either WebM or forced cloud mode)
  console.log('[SmartExport] Sending to cloud for MP4 transcoding...', { mimeType: localResult.mimeType, forceCloud: forceCloudTranscode });
  
  return transcodeInCloud(localResult.blob, onProgress);
}

/**
 * Upload WebM to api.video via our Cloudflare Worker and get back MP4
 */
async function transcodeInCloud(
  webmBlob: Blob,
  onProgress?: ProgressCallback
): Promise<ExportResult> {
  onProgress?.({
    phase: 'uploading',
    progress: 0,
    message: 'Sending to cloud...'
  });

  const formData = new FormData();
  formData.append('video', webmBlob, 'video.webm');

  console.log('[CloudTranscode] Starting upload, blob size:', webmBlob.size, 'bytes');

  // Upload with progress tracking via XMLHttpRequest
  const { mp4Url, videoId } = await new Promise<{ mp4Url: string; videoId: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let transcodingInterval: ReturnType<typeof setInterval> | null = null;
    
    // 3 minute timeout for the entire operation (upload + transcoding)
    xhr.timeout = 180000;
    
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const uploadProgress = e.loaded / e.total;
        console.log('[CloudTranscode] Upload progress:', Math.round(uploadProgress * 100) + '%');
        onProgress?.({
          phase: 'uploading',
          progress: uploadProgress * 0.3, // Upload is 30% of cloud process
          message: `Uploading: ${Math.round(uploadProgress * 100)}%`
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (transcodingInterval) clearInterval(transcodingInterval);
      console.log('[CloudTranscode] XHR load, status:', xhr.status);
      
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.error) {
            console.error('[CloudTranscode] Server error:', response.error);
            reject(new Error(response.error));
          } else {
            console.log('[CloudTranscode] Success, MP4 URL:', response.mp4Url);
            resolve({ mp4Url: response.mp4Url, videoId: response.videoId });
          }
        } catch (e) {
          console.error('[CloudTranscode] Parse error:', e, 'Response:', xhr.responseText);
          reject(new Error('Invalid response from transcoding service'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          console.error('[CloudTranscode] HTTP error:', xhr.status, error);
          reject(new Error(error.error || `Upload failed: ${xhr.status}`));
        } catch {
          console.error('[CloudTranscode] HTTP error:', xhr.status, xhr.responseText);
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', (e) => {
      if (transcodingInterval) clearInterval(transcodingInterval);
      console.error('[CloudTranscode] Network error:', e);
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('timeout', () => {
      if (transcodingInterval) clearInterval(transcodingInterval);
      console.error('[CloudTranscode] Request timed out');
      reject(new Error('Upload timed out - please try again'));
    });

    xhr.addEventListener('abort', () => {
      if (transcodingInterval) clearInterval(transcodingInterval);
      console.log('[CloudTranscode] Request aborted');
      reject(new Error('Upload cancelled'));
    });

    xhr.open('POST', '/api/transcode');
    console.log('[CloudTranscode] Sending request...');
    xhr.send(formData);

    // Show transcoding progress while waiting
    let transcodingProgress = 0.3;
    transcodingInterval = setInterval(() => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        clearInterval(transcodingInterval!);
        return;
      }
      // Slowly increment progress while transcoding (max 90%)
      transcodingProgress = Math.min(transcodingProgress + 0.02, 0.9);
      onProgress?.({
        phase: 'transcoding',
        progress: transcodingProgress,
        message: 'Converting in the cloud...'
      });
    }, 2000);
  });

  onProgress?.({
    phase: 'processing',
    progress: 0.95,
    message: 'Downloading MP4...'
  });

  // Fetch the MP4 file with retry (api.video sometimes needs a moment after reporting ready)
  let mp4Blob: Blob | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      console.log(`[SmartExport] MP4 download retry ${attempt + 1}/5...`);
      await new Promise(r => setTimeout(r, 2000)); // Wait 2s between retries
    }
    
    const mp4Response = await fetch(mp4Url);
    if (mp4Response.ok) {
      mp4Blob = await mp4Response.blob();
      break;
    } else if (mp4Response.status === 404 && attempt < 4) {
      console.log('[SmartExport] MP4 not ready yet, retrying...');
      continue;
    } else {
      throw new Error(`Failed to download transcoded MP4: ${mp4Response.status}`);
    }
  }

  if (!mp4Blob) {
    throw new Error('Failed to download transcoded MP4 after retries');
  }

  // Clean up: delete the video from api.video (fire and forget)
  fetch('/api/transcode', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId })
  }).catch(e => console.warn('[SmartExport] Failed to delete cloud video:', e));

  onProgress?.({
    phase: 'complete',
    progress: 1,
    message: 'Complete'
  });

  return {
    blob: mp4Blob,
    mimeType: 'video/mp4'
  };
}

/**
 * Legacy MediaRecorder-based export (fallback for browsers without WebCodecs)
 * This may produce WebM on mobile instead of MP4.
 */
export async function exportCanvasVideoLegacy(
   canvas: HTMLCanvasElement,
   audioElement: HTMLAudioElement,
   duration: number,
   onProgress?: ProgressCallback,
   renderFrame?: (currentTime: number) => void,
   startAudioPlayback?: () => void,
   stopAudioPlayback?: () => void,
   forceWebM?: boolean // Skip H.264 attempts, go straight to WebM (for cloud transcode testing)
): Promise<ExportResult> {
   return new Promise((resolve, reject) => {
     onProgress?.({
       phase: 'preparing',
       progress: 0,
       message: 'Preparing export...'
     });

     // Detect mobile device for framerate optimization
     const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
     const captureFramerate = isMobile ? 15 : 30; // 15fps for mobile (lower encoding load), 30fps for desktop
     console.log('[VideoExport] Device type:', isMobile ? 'Mobile' : 'Desktop', `- using ${captureFramerate}fps`);
     
     // Get canvas stream at adaptive framerate
     let canvasStream: MediaStream;
     try {
       canvasStream = canvas.captureStream(captureFramerate);
     } catch (err) {
       console.error('[VideoExport] captureStream failed:', err);
       reject(new Error(`Failed to capture canvas: ${err}`));
       return;
     }

     // Verify the stream has valid video tracks
     if (!canvasStream || canvasStream.getVideoTracks().length === 0) {
       reject(new Error('Canvas stream has no video tracks'));
       return;
     }
     
     const videoTracks = canvasStream.getVideoTracks();
     console.log('[VideoExport] Canvas stream created:', {
       videoTracks: videoTracks.length,
       trackState: videoTracks[0]?.readyState,
       trackEnabled: videoTracks[0]?.enabled
     });
     
     // Ensure video track is enabled
     if (videoTracks[0] && !videoTracks[0].enabled) {
       videoTracks[0].enabled = true;
       console.log('[VideoExport] Enabled disabled video track');
     }
    
    // Capture audio stream - try multiple methods for browser compatibility
    // Safari doesn't support captureStream() on audio elements, so we use Web Audio API
    let audioContextForExport: AudioContext | null = null;
    let mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
    let audioSource: MediaElementAudioSourceNode | null = null;
    
    try {
      // Check if captureStream is available (Chrome, Firefox)
      if (typeof (audioElement as any).captureStream === 'function') {
        const audioStream = (audioElement as HTMLMediaElement & { captureStream(): MediaStream }).captureStream();
        const audioTracks = audioStream.getAudioTracks();
        console.log('[VideoExport] Audio stream tracks (captureStream):', audioTracks.length);
        
        if (audioTracks.length > 0) {
          const audioTrack = audioTracks[0];
          console.log('[VideoExport] Audio track state:', { 
            readyState: audioTrack.readyState,
            enabled: audioTrack.enabled 
          });
          
          if (audioTrack.readyState === 'live') {
            canvasStream.addTrack(audioTrack);
            console.log('[VideoExport] Audio track added successfully (captureStream)');
          } else {
            console.warn('[VideoExport] Audio track not live, skipping audio');
          }
        }
      } else {
        // Safari fallback: Use Web Audio API to route audio to MediaStreamDestination
        // We need a fresh audio element because createMediaElementSource can only be called once per element
        console.log('[VideoExport] captureStream not available, using Web Audio API fallback');
        
        // Create a clone of the audio element to avoid "already associated" error
        const audioClone = new Audio(audioElement.src);
        audioClone.crossOrigin = 'anonymous';
        audioClone.currentTime = audioElement.currentTime;
        audioClone.load();
        
        audioContextForExport = new (window.AudioContext || (window as any).webkitAudioContext)();
        mediaStreamDestination = audioContextForExport.createMediaStreamDestination();
        
        // Create a source from the cloned audio element
        audioSource = audioContextForExport.createMediaElementSource(audioClone);
        
        // Connect to both destination (for export) and speakers (so we hear it during export)
        audioSource.connect(mediaStreamDestination);
        audioSource.connect(audioContextForExport.destination);
        
        const audioTracks = mediaStreamDestination.stream.getAudioTracks();
        console.log('[VideoExport] Audio stream tracks (Web Audio API):', audioTracks.length);
        
        if (audioTracks.length > 0) {
          canvasStream.addTrack(audioTracks[0]);
          console.log('[VideoExport] Audio track added successfully (Web Audio API)');
          
          // Start the cloned audio when recording starts (sync with main audio)
          // We'll start it when startAudioPlayback is called
          const originalStartAudioPlayback = startAudioPlayback;
          startAudioPlayback = () => {
            originalStartAudioPlayback?.();
            audioClone.currentTime = audioElement.currentTime;
            audioClone.play().catch(e => console.warn('[VideoExport] Could not play audio clone:', e));
          };
          
          const originalStopAudioPlayback = stopAudioPlayback;
          stopAudioPlayback = () => {
            originalStopAudioPlayback?.();
            audioClone.pause();
          };
        }
      }
    } catch (err) {
      console.warn('[VideoExport] Could not capture audio, exporting video only:', err);
    }
    
    // Log canvas stream tracks for debugging
    console.log('[VideoExport] Final canvas stream:', {
      videoTracks: canvasStream.getVideoTracks().length,
      audioTracks: canvasStream.getAudioTracks().length
    });

    // Determine best supported codec
    // Priority: H.264/MP4 (best sharing compatibility), then WebM
    // Note: H.264 may fail at encoding time if bitrate is unsupported, so we'll try WebM fallback
    const h264Types = [
      'video/mp4;codecs=h264',
      'video/mp4;codecs=avc1',
      'video/mp4'
    ];
    
    const webmTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    
    let mimeType = '';
    
    // Try H.264 first (unless forceWebM is true - used for cloud transcode testing)
    if (!forceWebM) {
      for (const type of h264Types) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log('[VideoExport] Selected mime type (H.264):', mimeType);
          break;
        }
      }
    } else {
      console.log('[VideoExport] forceWebM enabled, skipping H.264');
    }
    
    // If H.264 not supported (or forceWebM), try WebM
    if (!mimeType) {
      for (const type of webmTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log('[VideoExport] Using WebM:', mimeType);
          break;
        }
      }
    }
    
    if (!mimeType) {
      reject(new Error('No supported video format found on this device'));
      return;
    }

    const isH264 = mimeType.includes('mp4') || mimeType.includes('h264') || mimeType.includes('avc1');
    console.log(`[VideoExport] Using codec: ${mimeType} (${isH264 ? 'H.264/MP4' : 'WebM'})`)

    const chunks: Blob[] = [];
    
    let mediaRecorder: MediaRecorder;
    const recorderConfig: any = { mimeType };
    
    // Only set bitrate for desktop H.264, or use lower bitrate for mobile
    if (isH264) {
      if (isMobile) {
        // Mobile: use no bitrate constraint (let browser choose, usually more conservative)
        console.log('[VideoExport] Mobile H.264: using browser-managed bitrate');
      } else {
        // Desktop: use high bitrate for better quality
        recorderConfig.videoBitsPerSecond = 3500000; // 3.5 Mbps
        console.log('[VideoExport] Desktop H.264: using 3.5Mbps bitrate');
      }
    }
    
    try {
      mediaRecorder = new MediaRecorder(canvasStream, recorderConfig);
      console.log('[VideoExport] MediaRecorder created with config:', recorderConfig);
    } catch (err) {
      console.error('[VideoExport] Failed to create MediaRecorder:', err);
      reject(new Error(`Failed to create recorder: ${err}`));
      return;
    }
    
    console.log('[VideoExport] MediaRecorder state:', mediaRecorder.state);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
        console.log(`[VideoExport] Data available, chunk size: ${e.data.size}, total chunks: ${chunks.length}`);
      }
    };

    let hasResolved = false;
    let renderAnimationId: number | null = null;

    function finalizeRecording() {
      if (hasResolved) return;
      hasResolved = true;
      
      console.log('[VideoExport] Finalizing, chunks:', chunks.length);
      
      onProgress?.({
        phase: 'processing',
        progress: 0.95,
        message: 'Finalizing video...'
      });

      const blob = new Blob(chunks, { type: mimeType });
      console.log('[VideoExport] Blob created, size:', blob.size);
      
      onProgress?.({
        phase: 'complete',
        progress: 1,
        message: 'Complete'
      });

      resolve({ blob, mimeType });
    }

    mediaRecorder.onstop = () => {
      console.log('[VideoExport] onstop fired');
      finalizeRecording();
    };

    mediaRecorder.onerror = (e) => {
      const errorDetail = {
        type: e.type,
        message: (e as any).message || 'Unknown',
        error: e.error?.name || (e.error ? String(e.error) : 'No error object')
      };
      console.error('[VideoExport] MediaRecorder error:', errorDetail);
      
      // If it's an encoding error, we need to stop and reject
      if (errorDetail.error?.includes('EncodingError') || errorDetail.message?.includes('encoder')) {
        console.error('[VideoExport] Encoder configuration not supported - falling back to WebM not possible mid-recording');
      }
      
      reject(new Error(`Recording failed: ${errorDetail.message || e}`));
    };

    // Ensure canvas is rendered at least once before recording starts
    if (renderFrame) {
      console.log('[VideoExport] Rendering initial frame');
      renderFrame(0); // Initial frame at time 0
    }

    // Small delay to ensure tracks are settled (critical for mobile)
    setTimeout(() => {
      // Start recording
      try {
        mediaRecorder.start(100); // Collect data every 100ms
        console.log('[VideoExport] MediaRecorder started, state:', mediaRecorder.state);
      } catch (err) {
        console.error('[VideoExport] Error starting recorder:', err);
        reject(new Error(`Failed to start recorder: ${err}`));
        return;
      }
    
      onProgress?.({
        phase: 'recording',
        progress: 0,
        message: 'Recording video...'
      });

      // Start internal rendering loop - this ensures continuous frame delivery to captureStream
      if (renderFrame) {
        const startRenderTime = Date.now();
        function renderLoop() {
          const elapsed = (Date.now() - startRenderTime) / 1000;
          if (elapsed < duration && renderFrame) {
            renderFrame(elapsed); // Pass current time to renderFrame for waveform animation
            renderAnimationId = requestAnimationFrame(renderLoop);
          }
        }
        renderAnimationId = requestAnimationFrame(renderLoop);
        console.log('[VideoExport] Render loop started');
      }

      // Start audio playback
      startAudioPlayback?.();

      // Track progress during recording
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        const progress = Math.min(elapsed / duration, 0.9);
        
        onProgress?.({
          phase: 'recording',
          progress,
          message: `Processing: ${Math.round(elapsed)}s / ${Math.round(duration)}s`
        });
      }, 200);

      // Stop recording when duration is reached
      setTimeout(() => {
        console.log('[VideoExport] Duration reached, stopping recorder');
        clearInterval(progressInterval);
        
        // Stop rendering loop
        if (renderAnimationId !== null) {
          cancelAnimationFrame(renderAnimationId);
          console.log('[VideoExport] Render loop stopped');
        }
        
        // Stop audio playback
        stopAudioPlayback?.();
        
        try {
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        } catch (err) {
          console.error('[VideoExport] Error stopping recorder:', err);
        }
        
        // Stop all tracks
        canvasStream.getTracks().forEach(track => track.stop());
        
        // Clean up Web Audio API resources if used (Safari fallback)
        if (audioContextForExport) {
          audioContextForExport.close().catch(() => {});
          console.log('[VideoExport] Closed audio context for export');
        }
        
        // Fallback: if onstop doesn't fire within 2 seconds, finalize anyway
        setTimeout(() => {
          if (!hasResolved && chunks.length > 0) {
            console.warn('[VideoExport] onstop did not fire, using fallback');
            finalizeRecording();
          }
        }, 2000);
      }, duration * 1000 + 500); // Add 500ms buffer
    }, 50); // 50ms delay for track settlement
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getExtensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('h264') || mimeType.includes('avc1')) {
    return 'mp4';
  }
  return 'webm';
}

export function generateFilename(mimeType: string = 'video/webm'): string {
  const extension = getExtensionFromMimeType(mimeType);
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `audiogram-${day}${month}${year}-${hours}${minutes}.${extension}`;
}

export function generateSubtitleFilename(mimeType: string = 'video/webm'): string {
  const extension = getExtensionFromMimeType(mimeType);
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).slice(-2);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `subtitles-${day}${month}${year}-${hours}${minutes}.${extension}`;
}

/**
 * @deprecated Use smartExportVideo instead for WebCodecs support
 * Kept for backwards compatibility
 */
export const exportCanvasVideo = exportCanvasVideoLegacy;
