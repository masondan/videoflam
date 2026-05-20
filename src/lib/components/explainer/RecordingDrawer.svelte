<script lang="ts">
  interface Props {
    script: string | null;
    onScriptChange?: (script: string) => void;
    onSave: (blob: Blob) => void;
    onClose: () => void;
  }

  let { script, onScriptChange, onSave, onClose }: Props = $props();

  let scriptText = $state(script || '');

  function handleScriptInput(e: Event) {
    const target = e.currentTarget as HTMLDivElement;
    scriptText = target.textContent || '';
    onScriptChange?.(scriptText);
  }

  function handleScriptPaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  }

  // ── Text size preference ──────────────────────────────────────────────────────
  const TEXT_SIZE_KEY = 'explainer-recording-text-size';
  const MIN_SIZE = 16;
  const MAX_SIZE = 28;

  function loadTextSize(): number {
    try {
      const v = localStorage.getItem(TEXT_SIZE_KEY);
      if (v) return Math.max(MIN_SIZE, Math.min(MAX_SIZE, parseInt(v, 10)));
    } catch { /* ignore */ }
    return 18;
  }

  let textSize = $state(loadTextSize());

  function changeTextSize(delta: number) {
    textSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, textSize + delta));
    try { localStorage.setItem(TEXT_SIZE_KEY, String(textSize)); } catch { /* ignore */ }
  }

  // ── Recording state ───────────────────────────────────────────────────────────
  type RecordingState = 'idle' | 'recording' | 'review';

  let recordingState = $state<RecordingState>('idle');
  let elapsedSeconds = $state(0);
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let recordedBlob = $state<Blob | null>(null);
  let recordedUrl = $state<string | null>(null);
  let reviewAudioEl = $state<HTMLAudioElement | null>(null);
  let isReviewPlaying = $state(false);

  let permissionError = $state<string | null>(null);

  // ── Waveform animation ────────────────────────────────────────────────────────
  // Simple animated bars driven by a CSS animation — no Web Audio API needed
  let waveformBars = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.45, 0.75, 0.55, 0.85];

  // ── Timer ─────────────────────────────────────────────────────────────────────
  function startTimer() {
    elapsedSeconds = 0;
    timerInterval = setInterval(() => { elapsedSeconds++; }, 1000);
  }

  function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ── Recording ─────────────────────────────────────────────────────────────────
  async function startRecording() {
    permissionError = null;
    recordedChunks = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      permissionError = 'Microphone access denied. Please allow microphone access and try again.';
      return;
    }

    // Pick best supported MIME type
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    let mimeType = '';
    for (const t of mimeTypes) {
      if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
    }

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: mimeType || 'audio/webm' });
      recordedBlob = blob;
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      recordedUrl = URL.createObjectURL(blob);
      recordingState = 'review';
    };

    mediaRecorder.start(100);
    recordingState = 'recording';
    startTimer();
  }

  function stopRecording() {
    stopTimer();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  // ── Review playback ───────────────────────────────────────────────────────────
  function toggleReviewPlayback() {
    if (!reviewAudioEl) return;
    if (isReviewPlaying) {
      reviewAudioEl.pause();
      isReviewPlaying = false;
    } else {
      reviewAudioEl.play();
      isReviewPlaying = true;
    }
  }

  function handleReviewEnded() {
    isReviewPlaying = false;
  }

  // ── Save / discard ────────────────────────────────────────────────────────────
  function handleSave() {
    if (!recordedBlob) return;
    onSave(recordedBlob);
    cleanup();
    onClose();
  }

  function handleReRecord() {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    recordedUrl = null;
    recordedBlob = null;
    isReviewPlaying = false;
    recordingState = 'idle';
  }

  function cleanup() {
    stopTimer();
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }
</script>

<div class="drawer-overlay">
  <div class="drawer">
    <!-- Header -->
    <header class="drawer-header">
      <button type="button" class="close-btn" onclick={() => { cleanup(); onClose(); }} aria-label="Close">✕</button>
      <span class="drawer-title">Read & Record</span>
      <div class="header-spacer"></div>
    </header>

    <div class="drawer-body">
      <!-- Script display -->
      <div class="script-section">
        <div class="text-size-row">
          <img src="/icons/icon-text-size.svg" alt="" class="text-size-icon" />
          <button
            type="button"
            class="size-btn"
            onclick={() => changeTextSize(-2)}
            disabled={textSize <= MIN_SIZE}
            aria-label="Decrease text size"
          >−</button>
          <button
            type="button"
            class="size-btn"
            onclick={() => changeTextSize(2)}
            disabled={textSize >= MAX_SIZE}
            aria-label="Increase text size"
          >+</button>
        </div>
        <div
          class="script-text"
          style="font-size: {textSize}px;"
          contenteditable="true"
          oninput={handleScriptInput}
          onpaste={handleScriptPaste}
          role="textbox"
          aria-label="Script text editor"
        >
          {#if scriptText}
            {scriptText}
          {:else}
            <span class="script-placeholder">Paste script here or use the script generator and tap 'Read & Record'</span>
          {/if}
        </div>
      </div>

      <!-- Permission error -->
      {#if permissionError}
        <div class="error-banner">{permissionError}</div>
      {/if}
    </div>

    <!-- Recording controls (pinned to bottom) -->
    <div class="recording-controls">
      {#if recordingState === 'idle'}
        <button
          type="button"
          class="ctrl-btn"
          onclick={startRecording}
          aria-label="Start recording"
        >
          <img src="/icons/icon-mic.svg" alt="Record" class="ctrl-icon" />
        </button>
        <span class="record-hint">Tap to record</span>

      {:else if recordingState === 'recording'}
        <button
          type="button"
          class="ctrl-btn"
          onclick={stopRecording}
          aria-label="Stop recording"
        >
          <img src="/icons/icon-square-new.svg" alt="Stop" class="ctrl-icon" />
        </button>
        <!-- Waveform bars -->
        <div class="waveform" aria-hidden="true">
          {#each waveformBars as height, i}
            <div
              class="waveform-bar"
              style="animation-delay: {i * 0.1}s;"
            ></div>
          {/each}
        </div>
        <span class="timer">{formatTime(elapsedSeconds)}</span>

      {:else if recordingState === 'review'}
        <!-- Review player -->
        <!-- svelte-ignore a11y_media_has_caption -->
        <audio
          bind:this={reviewAudioEl}
          src={recordedUrl}
          onended={handleReviewEnded}
          preload="auto"
          style="display:none"
        ></audio>
        <button
          type="button"
          class="ctrl-btn"
          onclick={toggleReviewPlayback}
          aria-label={isReviewPlaying ? 'Pause' : 'Play recording'}
        >
          <img
            src={isReviewPlaying ? '/icons/icon-pause-new.svg' : '/icons/icon-play-new.svg'}
            alt={isReviewPlaying ? 'Pause' : 'Play'}
            class="ctrl-icon"
          />
        </button>
        <div class="waveform waveform--static" aria-hidden="true">
          {#each waveformBars as _, i}
            <div class="waveform-bar waveform-bar--static"></div>
          {/each}
        </div>
        <div class="review-actions">
          <button type="button" class="re-record-btn" onclick={handleReRecord}>
            Re-record
          </button>
          <button type="button" class="save-btn" onclick={handleSave}>
            Use this
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
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

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-lg);
    color: var(--text-secondary);
    padding: var(--spacing-xs);
  }

  .header-spacer {
    width: 32px;
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md) var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  /* Script section */
  .script-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    flex: 1;
  }

  .text-size-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--spacing-sm);
  }

  .text-size-icon {
    width: 18px;
    height: 18px;
    color: #aaaaaa;
    margin-right: 0;
  }

  .size-btn {
    background: var(--bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    width: 28px;
    height: 28px;
    font-size: 18px;
    font-weight: var(--font-weight-bold);
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }

  .size-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .size-btn:not(:disabled):hover {
    background: var(--color-highlight);
  }

  .script-text {
    line-height: var(--line-height-relaxed);
    color: var(--text-primary);
    white-space: pre-wrap;
    overflow-y: auto;
    flex: 1;
    min-height: 200px;
    padding-top: var(--spacing-xl);
    padding: var(--spacing-md);
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    outline: none;
    word-wrap: break-word;
  }

  .script-text:focus {
    border-color: var(--color-primary);
    background-color: #fafafa;
  }

  .script-placeholder {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    text-align: center;
    display: block;
  }

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: #b91c1c;
  }

  /* Recording controls */
  .recording-controls {
    flex-shrink: 0;
    border-top: 1px solid var(--color-border);
    padding: var(--spacing-md) var(--spacing-lg);
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    min-height: 80px;
  }

  /* Consistent control button — all three states */
  .ctrl-btn {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-round);
    border: none;
    background: var(--color-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform 0.15s, opacity 0.15s;
  }

  .ctrl-btn:active { transform: scale(0.93); }

  .ctrl-icon {
    width: 22px;
    height: 22px;
    filter: brightness(0) invert(1);
  }

  .record-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  /* Waveform */
  .waveform {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 32px;
    flex: 1;
  }

  .waveform-bar {
    flex: 1;
    background: var(--color-primary);
    border-radius: 2px;
    animation: waveform-pulse 0.8s ease-in-out infinite alternate;
    min-height: 4px;
  }

  .waveform--static .waveform-bar--static {
    animation: none;
    height: 40%;
    opacity: 0.3;
  }

  @keyframes waveform-pulse {
    from { height: 20%; }
    to   { height: 90%; }
  }

  .timer {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Review */
  .review-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .re-record-btn {
    background: var(--bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    cursor: pointer;
  }

  .save-btn {
    background: var(--color-primary);
    border: none;
    border-radius: var(--radius-md);
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: #fff;
    cursor: pointer;
  }
</style>
