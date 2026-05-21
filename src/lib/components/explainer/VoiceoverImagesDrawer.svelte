<script lang="ts">
  import { untrack } from 'svelte';
  import PanelCard from './PanelCard.svelte';
  import RecordingDrawer from './RecordingDrawer.svelte';
  import ImageCropDrawer from '$lib/components/ImageCropDrawer.svelte';
  import {
    buildPanelsFromSegments,
    splitPanel,
    mergePanels,
    cropDataToBlob,
    CANVAS_DIMENSIONS,
    type VideoPanel,
    type VideoProject,
    type CropData,
    type AspectRatio,
  } from '$lib/stores/videoProject';

  interface Props {
    project: VideoProject;
    onSave: (updates: Partial<VideoProject>) => void;
    onClose: () => void;
  }

  let { project, onSave, onClose }: Props = $props();

  // ── Local state ──────────────────────────────────────────────────────────────
  // untrack() snapshots the prop value at mount without creating a reactive dependency
  let panels = $state<VideoPanel[]>(untrack(() => [...project.panels]));
  let audioBlob = $state<Blob | null>(untrack(() => project.audio?.blob ?? null));
  let audioDuration = $state<number>(untrack(() => project.audio?.duration ?? 0));
  let audioUrl = $state<string | null>(null);
  let audioEl = $state<HTMLAudioElement | null>(null);

  let isTranscribing = $state(false);
  let transcribeError = $state<string | null>(null);

  let isPlaying = $state(false);
  let currentTime = $state(0);
  let playbackInterval: ReturnType<typeof setInterval> | null = null;

  // Image crop state
  let cropPanelId = $state<string | null>(null);
  let cropImageUrl = $state<string | null>(null);
  let cropImageFile = $state<File | null>(null);

  // Recording drawer
  let showRecordingDrawer = $state(false);

  // Save modal
  let showSaveModal = $state(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  let assignedCount = $derived(panels.filter(p => p.imageBlob !== null).length);
  let activePanelId = $derived(
    panels.find(p => currentTime >= p.startTime && currentTime < p.endTime)?.id ?? null
  );

  // ── Audio upload ─────────────────────────────────────────────────────────────
  async function handleAudioUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Revoke previous URL
    if (audioUrl) URL.revokeObjectURL(audioUrl);

    audioBlob = file;
    audioUrl = URL.createObjectURL(file);
    transcribeError = null;

    // Get duration via audio element
    await new Promise<void>((resolve) => {
      const tmp = new Audio(audioUrl!);
      tmp.onloadedmetadata = () => {
        audioDuration = tmp.duration;
        resolve();
      };
      tmp.onerror = () => resolve();
      setTimeout(resolve, 3000);
    });

    await transcribeAudio(file);
  }

  // ── Recording ─────────────────────────────────────────────────────────────────
  async function handleRecordingSave(blob: Blob) {
    showRecordingDrawer = false;

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioBlob = blob;
    audioUrl = URL.createObjectURL(blob);
    transcribeError = null;

    await new Promise<void>((resolve) => {
      const tmp = new Audio(audioUrl!);
      tmp.onloadedmetadata = () => { audioDuration = tmp.duration; resolve(); };
      tmp.onerror = () => resolve();
      setTimeout(resolve, 3000);
    });

    await transcribeAudio(blob);
  }

  async function transcribeAudio(blob: Blob) {
    isTranscribing = true;
    transcribeError = null;
    panels = [];

    try {
      const formData = new FormData();
      formData.append('audio', blob, 'audio.mp3');
      formData.append('language', 'auto');

      const res = await fetch('/api/transcribe-deepgram', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `Transcription failed: ${res.status}`);
      }

      const data = await res.json();
      panels = buildPanelsFromSegments(data.segments ?? []);
    } catch (err) {
      transcribeError = err instanceof Error ? err.message : 'Transcription failed';
      console.error('[VoiceoverImagesDrawer] Transcription error:', err);
    } finally {
      isTranscribing = false;
    }
  }

  // ── Playback ─────────────────────────────────────────────────────────────────
  function togglePlayback() {
    if (!audioEl) return;
    if (isPlaying) {
      audioEl.pause();
      isPlaying = false;
      if (playbackInterval) { clearInterval(playbackInterval); playbackInterval = null; }
    } else {
      audioEl.play();
      isPlaying = true;
      playbackInterval = setInterval(() => {
        if (audioEl) currentTime = audioEl.currentTime;
      }, 100);
    }
  }

  function handleAudioEnded() {
    isPlaying = false;
    if (playbackInterval) { clearInterval(playbackInterval); playbackInterval = null; }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ── Panel operations ─────────────────────────────────────────────────────────
  function handleSplit(payload: string) {
    // payload = "panelId:wordIndex"
    const [panelId, wordIndexStr] = payload.split(':');
    const wordIndex = parseInt(wordIndexStr, 10);
    const idx = panels.findIndex(p => p.id === panelId);
    if (idx === -1) return;

    const [a, b] = splitPanel(panels[idx], wordIndex);
    panels = [...panels.slice(0, idx), a, b, ...panels.slice(idx + 1)];
  }

  function handleMergeBelow(panelId: string) {
    const idx = panels.findIndex(p => p.id === panelId);
    if (idx === -1 || idx >= panels.length - 1) return;
    const merged = mergePanels(panels[idx], panels[idx + 1]);
    panels = [...panels.slice(0, idx), merged, ...panels.slice(idx + 2)];
  }

  // ── Image assignment ─────────────────────────────────────────────────────────
  let fileInputEl = $state<HTMLInputElement | null>(null);

  function handleAssignImage(panelId: string) {
    cropPanelId = panelId;
    fileInputEl?.click();
  }

  function handleFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !cropPanelId) return;
    cropImageFile = file;
    cropImageUrl = URL.createObjectURL(file);
    // Reset input so same file can be re-selected
    input.value = '';
  }

  async function handleCropDone(ratio: AspectRatio | 'none', cropData: CropData | null) {
    // Capture synchronously — ImageCropDrawer calls onClose() immediately after onDone(),
    // which would clear cropPanelId/cropImageFile before the await resolves.
    const panelId = cropPanelId;
    const imageFile = cropImageFile;

    if (!cropData || !imageFile || !panelId) {
      return;
    }

    const dims = CANVAS_DIMENSIONS[project.aspectRatio];
    try {
      const blob = await cropDataToBlob(imageFile, cropData, dims.width, dims.height);
      panels = panels.map(p =>
        p.id === panelId ? { ...p, imageBlob: blob } : p
      );
    } catch (err) {
      console.error('[VoiceoverImagesDrawer] Crop failed:', err);
    }
  }

  function closeCrop() {
    if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
    cropImageUrl = null;
    cropImageFile = null;
    cropPanelId = null;
  }

  function handleDeleteImage(panelId: string) {
    panels = panels.map(p =>
      p.id === panelId ? { ...p, imageBlob: null } : p
    );
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  function handleSaveTap() {
    if (assignedCount < panels.length && panels.length > 0) {
      showSaveModal = true;
    } else {
      commitSave();
    }
  }

  function commitSave() {
    showSaveModal = false;
    onSave({
      panels,
      audio: audioBlob ? { blob: audioBlob, duration: audioDuration } : project.audio,
    });
    onClose();
  }
</script>

<!-- Hidden file inputs -->
<input
  bind:this={fileInputEl}
  type="file"
  accept="image/*"
  style="display:none"
  onchange={handleFileSelected}
/>

<!-- Drawer overlay -->
<div class="drawer-overlay">
  <div class="drawer">
    <!-- Header -->
    <header class="drawer-header">
      <button type="button" class="close-btn" onclick={onClose} aria-label="Close">✕</button>
      <span class="drawer-title">Voiceover &amp; Images</span>
      <button type="button" class="save-btn" onclick={handleSaveTap}>Save</button>
    </header>

    <div class="drawer-body">
      <!-- Audio upload / record -->
      <section class="upload-section">
        <label class="upload-btn" for="audio-upload-input">
          <img src="/icons/icon-upload.svg" alt="" class="btn-icon" />
          Upload audio
        </label>
        <input
          id="audio-upload-input"
          type="file"
          accept="audio/*,video/mp4"
          style="display:none"
          onchange={handleAudioUpload}
        />
        <button
          type="button"
          class="record-btn"
          onclick={() => (showRecordingDrawer = true)}
          aria-label="Record voiceover"
        >
          <img src="/icons/icon-mic-fill.svg" alt="" class="btn-icon" />
          Record
        </button>
      </section>

      <!-- Slim audio player -->
      {#if audioUrl}
        <div class="audio-player">
          <!-- svelte-ignore a11y_media_has_caption -->
          <audio
            bind:this={audioEl}
            src={audioUrl}
            onended={handleAudioEnded}
            preload="metadata"
          ></audio>
          <button
            type="button"
            class="play-pause-btn"
            onclick={togglePlayback}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <img
              src={isPlaying ? '/icons/icon-pause-new.svg' : '/icons/icon-play-new.svg'}
              alt={isPlaying ? 'Pause' : 'Play'}
              class="play-icon"
            />
          </button>
          <div class="progress-track">
            <div
              class="progress-fill"
              style="width: {audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0}%"
            ></div>
          </div>
          <span class="duration-label">{formatTime(currentTime)}</span>
        </div>
      {/if}

      <!-- Transcription spinner -->
      {#if isTranscribing}
        <div class="transcribing-row">
          <span class="spinner" aria-hidden="true"></span>
          <span>Transcribing…</span>
        </div>
      {/if}

      <!-- Transcription error -->
      {#if transcribeError}
        <div class="error-banner">{transcribeError}</div>
      {/if}

      <!-- Panel cards -->
      {#if panels.length > 0}
        <div class="panels-list">
          {#each panels as panel, i (panel.id)}
            <PanelCard
              {panel}
              index={i + 1}
              isActive={panel.id === activePanelId}
              onAssignImage={handleAssignImage}
              onDeleteImage={handleDeleteImage}
              onSplit={handleSplit}
              onMergeBelow={handleMergeBelow}
              showMergeButton={i < panels.length - 1}
            />
          {/each}
        </div>
      {:else if !isTranscribing && audioUrl}
        <p class="empty-hint">No transcript yet — upload audio to generate panels.</p>
      {:else if !audioUrl}
        <ul class="empty-hint-list">
          <li><strong>Upload</strong> a clear recording or <strong>record</strong> your own voiceover.</li>
          <li>Your audio is converted to text blocks. Adjust and add images.</li>
          <li>Save to preview your video, add effects and export.</li>
        </ul>
      {/if}
    </div>
  </div>
</div>

<!-- Recording drawer -->
{#if showRecordingDrawer}
  <RecordingDrawer
    script={project.script}
    onSave={handleRecordingSave}
    onClose={() => (showRecordingDrawer = false)}
  />
{/if}

<!-- Image crop drawer -->
{#if cropImageUrl && cropPanelId}
  <ImageCropDrawer
    imageUrl={cropImageUrl}
    currentRatio={project.aspectRatio}
    onDone={handleCropDone}
    onClose={closeCrop}
  />
{/if}

<!-- Save modal: incomplete images -->
{#if showSaveModal}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <p class="modal-text">
        <strong>Heads up:</strong> You have {assignedCount} of {panels.length} images assigned.
        Add more, or save anyway.
      </p>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn--secondary" onclick={() => (showSaveModal = false)}>
          Go back
        </button>
        <button type="button" class="modal-btn modal-btn--primary" onclick={commitSave}>
          Save anyway
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .drawer {
    background: var(--bg-white);
    border-radius: 0;
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    height: 100vh;
    display: flex;
    flex-direction: column;
    animation: none;
  }


  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .close-btn,
  .save-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-base);
    padding: var(--spacing-xs) var(--spacing-sm);
  }

  .close-btn {
    color: var(--text-secondary);
    font-size: var(--font-size-lg);
  }

  .save-btn {
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md) var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* Upload */
  .upload-section {
    display: flex;
    gap: var(--spacing-sm);
    flex-wrap: nowrap;
  }

  .upload-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .upload-btn:hover { opacity: 0.88; }

  .record-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    background: var(--bg-main);
    color: var(--text-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .record-btn:hover {
    background: var(--color-highlight);
    border-color: var(--color-primary);
  }

  .record-btn .btn-icon {
    filter: none;
    opacity: 0.7;
  }

  .btn-icon {
    width: 16px;
    height: 16px;
    filter: brightness(0) invert(1);
  }

  /* Audio player */
  .audio-player {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    background: var(--bg-main);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .play-pause-btn {
    width: 25px;
    height: 25px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }

  .play-pause-btn:hover {
    opacity: 0.85;
  }

  .play-icon {
    width: 18px;
    height: 18px;
    filter: brightness(0) invert(1);
  }

  .progress-track {
    flex: 1;
    height: 4px;
    background: var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: var(--radius-md);
    transition: width 0.1s linear;
  }

  .duration-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    min-width: 36px;
    text-align: right;
  }

  /* Transcribing */
  .transcribing-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: #b91c1c;
  }

  /* Panels */
  .panels-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    text-align: center;
    padding: var(--spacing-xl) 0;
    margin: 0;
  }

  .empty-hint-list {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    padding: var(--spacing-xl) var(--spacing-md);
    margin: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .empty-hint-list li {
    text-align: center;
    line-height: var(--line-height-normal);
    position: relative;
  }

  .empty-hint-list li:not(:last-child)::after {
    content: '';
    display: block;
    width: 40%;
    height: 1px;
    background: var(--color-border);
    margin-top: var(--spacing-md);
    margin-bottom: var(--spacing-xs);
    margin-left: auto;
    margin-right: auto;
  }

  /* Save modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-md);
  }

  .modal {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    max-width: 360px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .modal-text {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
    margin: 0;
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: flex-end;
  }

  .modal-btn {
    border: none;
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
  }

  .modal-btn--secondary {
    background: var(--bg-main);
    color: var(--text-primary);
  }

  .modal-btn--primary {
    background: var(--color-primary);
    color: #fff;
  }
</style>
