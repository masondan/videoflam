<script lang="ts">
  import VoiceoverImagesDrawer from './explainer/VoiceoverImagesDrawer.svelte';
  import ScriptDrawer from './explainer/ScriptDrawer.svelte';
  import KenBurnsPreview from './explainer/KenBurnsPreview.svelte';
  import ArchivePage from './explainer/ArchivePage.svelte';
  import {
    createDefaultProject,
    CANVAS_DIMENSIONS,
    type VideoProject,
    type AspectRatio,
    type KenBurnsPreset,
    type TransitionPreset,
  } from '$lib/stores/videoProject';
  import { smartExportExplainer } from '$lib/utils/explainer-export';
  import { downloadBlob } from '$lib/utils/video-export';
  import type { ExportProgress } from '$lib/utils/video-export';
  import { saveProject } from '$lib/utils/projectStorage';

  // ── Project state ────────────────────────────────────────────────────────────
  let project = $state<VideoProject>(createDefaultProject());

  // ── UI state ─────────────────────────────────────────────────────────────────
  let showVoiceoverDrawer = $state(false);
  let showScriptDrawer = $state(false);
  let showArchive = $state(false);
  let isExporting = $state(false);
  let exportProgress = $state<ExportProgress | null>(null);
  let exportError = $state<string | null>(null);
  let showIncompleteModal = $state(false);

  // Preview playback
  let previewEl = $state<HTMLCanvasElement | null>(null);
  let previewAudioEl = $state<HTMLAudioElement | null>(null);
  let previewAudioUrl = $state<string | null>(null);
  let isPreviewPlaying = $state(false);
  let previewTime = $state(0);
  let previewDuration = $state(0);
  let previewRafId: number | null = null;

  // Pre-loaded bitmaps keyed by panel id — loaded once, drawn synchronously in RAF
  let previewBitmaps = $state<Map<string, ImageBitmap>>(new Map());

  // ── Derived ──────────────────────────────────────────────────────────────────
  let assignedCount = $derived(project.panels.filter(p => p.imageBlob !== null).length);
  let totalPanels = $derived(project.panels.length);
  let hasAudio = $derived(project.audio !== null);
  let hasAnyImage = $derived(assignedCount > 0);
  let allImagesAssigned = $derived(totalPanels > 0 && assignedCount === totalPanels);
  let showPreview = $derived(hasAudio && hasAnyImage);
  let canvasWidth = $derived(CANVAS_DIMENSIONS[project.aspectRatio].width);
  let canvasHeight = $derived(CANVAS_DIMENSIONS[project.aspectRatio].height);

  // ── Aspect ratio ─────────────────────────────────────────────────────────────
  function setAspectRatio(ratio: AspectRatio) {
    project = { ...project, aspectRatio: ratio, panels: project.panels.map(p => ({ ...p, imageBlob: null })) };
  }

  // ── Ken Burns ─────────────────────────────────────────────────────────────────
  function setKenBurns(preset: KenBurnsPreset) {
    project = { ...project, kenBurns: preset };
  }

  // ── Script drawer ─────────────────────────────────────────────────────────────
  function handleScriptAddToNotes(script: string) {
    project = { ...project, script };
  }

  // ── Voiceover drawer ─────────────────────────────────────────────────────────
  async function handleVoiceoverSave(updates: Partial<VideoProject>) {
    project = { ...project, ...updates };

    // Rebuild preview audio URL
    if (project.audio?.blob) {
      if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
      previewAudioUrl = URL.createObjectURL(project.audio.blob);
      previewDuration = project.audio.duration;
    }

    // Pre-load all panel bitmaps so the RAF loop can draw synchronously
    await loadPreviewBitmaps();
  }

  async function loadPreviewBitmaps() {
    // Close any existing bitmaps
    previewBitmaps.forEach(bmp => bmp.close());
    const newMap = new Map<string, ImageBitmap>();

    for (const panel of project.panels) {
      if (panel.imageBlob) {
        try {
          const bmp = await createImageBitmap(panel.imageBlob);
          newMap.set(panel.id, bmp);
        } catch {
          // skip panels with broken blobs
        }
      }
    }
    previewBitmaps = newMap;
  }

  // ── Preview playback ─────────────────────────────────────────────────────────
  function togglePreview() {
    if (!previewAudioEl || !previewEl) return;
    if (isPreviewPlaying) {
      previewAudioEl.pause();
      isPreviewPlaying = false;
      if (previewRafId !== null) { cancelAnimationFrame(previewRafId); previewRafId = null; }
    } else {
      previewAudioEl.play();
      isPreviewPlaying = true;
      renderPreviewLoop();
    }
  }

  function renderPreviewLoop() {
    if (!previewAudioEl || !previewEl) return;
    previewTime = previewAudioEl.currentTime;

    const ctx = previewEl.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      // Find active panel at current time
      let activePanel = project.panels.find(
        p => previewTime >= p.startTime && previewTime < p.endTime
      ) ?? null;

      // Hold-last-frame: after last panel ends, use last panel that has an image
      if (!activePanel && previewTime >= (project.panels[project.panels.length - 1]?.endTime ?? 0)) {
        for (let i = project.panels.length - 1; i >= 0; i--) {
          if (project.panels[i].imageBlob) { activePanel = project.panels[i]; break; }
        }
      }

      // Draw synchronously from pre-loaded bitmap map
      if (activePanel) {
        const bmp = previewBitmaps.get(activePanel.id);
        if (bmp) {
          ctx.drawImage(bmp, 0, 0, canvasWidth, canvasHeight);
        }
      }
    }

    if (isPreviewPlaying) {
      previewRafId = requestAnimationFrame(renderPreviewLoop);
    }
  }

  function handlePreviewEnded() {
    isPreviewPlaying = false;
    if (previewRafId !== null) { cancelAnimationFrame(previewRafId); previewRafId = null; }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  // ── Export ───────────────────────────────────────────────────────────────────
  function handleDownloadTap() {
    if (!hasAudio) return;
    if (!allImagesAssigned && totalPanels > 0) {
      showIncompleteModal = true;
    } else {
      startExport();
    }
  }

  async function startExport() {
    showIncompleteModal = false;
    if (!project.audio) return;

    isExporting = true;
    exportError = null;
    exportProgress = null;

    try {
      const result = await smartExportExplainer({
        panels: project.panels,
        audioBlob: project.audio.blob,
        aspectRatio: project.aspectRatio,
        kenBurns: project.kenBurns,
        kenBurnsSpeed: project.kenBurnsSpeed,
        transition: project.transition,
        transitionSpeed: project.transitionSpeed,
        onProgress: (p) => { exportProgress = p; },
      });

      const ext = result.mimeType.includes('mp4') ? 'mp4' : 'webm';
      downloadBlob(result.blob, `explainer-${Date.now()}.${ext}`);

      // Auto-save to archive after successful export
      try {
        currentProjectId = await saveProject(project, currentProjectId);
      } catch (e) {
        console.warn('[ExplainerPage] Auto-save failed:', e);
      }
    } catch (err) {
      exportError = err instanceof Error ? err.message : 'Export failed';
      console.error('[ExplainerPage] Export error:', err);
    } finally {
      isExporting = false;
      exportProgress = null;
    }
  }

  // ── Archive ───────────────────────────────────────────────────────────────────
  /** Current project ID — set after first save so subsequent saves update the same record */
  let currentProjectId = $state<string | undefined>(undefined);

  async function handleLoadFromArchive(loaded: VideoProject, projectId: string) {
    showArchive = false;

    // Tear down existing preview
    if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
    previewAudioUrl = null;
    previewTime = 0;
    previewDuration = 0;
    isPreviewPlaying = false;
    if (previewRafId !== null) { cancelAnimationFrame(previewRafId); previewRafId = null; }

    project = loaded;
    currentProjectId = projectId;

    if (project.audio?.blob) {
      previewAudioUrl = URL.createObjectURL(project.audio.blob);
      previewDuration = project.audio.duration;
    }

    await loadPreviewBitmaps();
  }

  // ── New project ───────────────────────────────────────────────────────────────
  function handleNewProject() {
    if (previewAudioUrl) URL.revokeObjectURL(previewAudioUrl);
    previewAudioUrl = null;
    previewTime = 0;
    previewDuration = 0;
    isPreviewPlaying = false;
    currentProjectId = undefined;
    project = createDefaultProject();
  }
</script>

<div class="explainer-page">

  <!-- Aspect ratio + archive row -->
  <div class="ratio-row">
    {#each (['9:16', '1:1', '16:9'] as AspectRatio[]) as ratio}
      <button
        type="button"
        class="ratio-btn"
        class:ratio-btn--active={project.aspectRatio === ratio}
        onclick={() => setAspectRatio(ratio)}
        aria-pressed={project.aspectRatio === ratio}
      >
        {ratio}
      </button>
    {/each}
    <!-- Archive button -->
    <button
      type="button"
      class="archive-btn"
      aria-label="Saved projects"
      onclick={() => (showArchive = true)}
    >
      <img src="/icons/icon-edit.svg" alt="" class="archive-icon" />
    </button>
  </div>

  <!-- Script generator text button -->
  <div class="script-row">
    <button
      type="button"
      class="script-link-btn"
      onclick={() => (showScriptDrawer = true)}
    >
      Need a script? Start here →
    </button>
  </div>

  <!-- Voiceover & Images CTA -->
  <div class="cta-section">
    <button
      type="button"
      class="voiceover-btn"
      class:voiceover-btn--done={hasAudio && allImagesAssigned}
      onclick={() => (showVoiceoverDrawer = true)}
    >
      <img src="/icons/icon-mic-fill.svg" alt="" class="voiceover-icon" />
      <span class="voiceover-label">Voiceover &amp; Images</span>
      {#if hasAudio}
        <span class="completion-badge">
          {#if allImagesAssigned}
            <img src="/icons/icon-check-fill.svg" alt="Complete" class="check-icon" />
          {:else if totalPanels > 0}
            <span class="image-count">{assignedCount} / {totalPanels}</span>
          {:else}
            <img src="/icons/icon-check-fill.svg" alt="Audio ready" class="check-icon" />
          {/if}
        </span>
      {/if}
    </button>
  </div>

  <!-- Pan & Zoom (Ken Burns) -->
  <div class="setting-block">
    <span class="setting-block-label">Pan &amp; Zoom</span>
    <div class="kb-options">
      {#each (['none', 'zoom-in', 'zoom-out'] as KenBurnsPreset[]) as preset}
        <button
          type="button"
          class="kb-option-btn"
          onclick={() => setKenBurns(preset)}
          aria-pressed={project.kenBurns === preset}
        >
          <KenBurnsPreview {preset} active={project.kenBurns === preset} />
        </button>
      {/each}
    </div>
    {#if project.kenBurns !== 'none'}
      <div class="speed-row">
        <label class="speed-label" for="kb-speed-slider">
          Speed
          <span class="speed-value">{project.kenBurnsSpeed === 0.5 ? 'Slow' : project.kenBurnsSpeed === 2.0 ? 'Fast' : 'Medium'}</span>
        </label>
        <input
          id="kb-speed-slider"
          type="range"
          class="speed-slider"
          min="0.5"
          max="2.0"
          step="0.25"
          value={project.kenBurnsSpeed}
          oninput={(e) => { project = { ...project, kenBurnsSpeed: parseFloat((e.target as HTMLInputElement).value) }; }}
        />
      </div>
    {/if}
  </div>

  <!-- Transitions -->
  <div class="setting-block">
    <span class="setting-block-label">Transitions</span>
    <div class="transition-options">
      {#each ([
        { value: 'none', label: 'None' },
        { value: 'zoom-in', label: 'Zoom In' },
        { value: 'zoom-out', label: 'Zoom Out' },
      ] as { value: TransitionPreset; label: string }[]) as opt}
        <button
          type="button"
          class="transition-option-btn"
          class:transition-option-btn--active={project.transition === opt.value}
          onclick={() => { project = { ...project, transition: opt.value }; }}
          aria-pressed={project.transition === opt.value}
        >
          {opt.label}
        </button>
      {/each}
    </div>
    {#if project.transition !== 'none'}
      <div class="speed-row">
        <label class="speed-label" for="transition-speed-slider">
          Speed
          <span class="speed-value">{project.transitionSpeed === 0.5 ? 'Slow' : project.transitionSpeed === 2.0 ? 'Fast' : 'Medium'}</span>
        </label>
        <input
          id="transition-speed-slider"
          type="range"
          class="speed-slider"
          min="0.5"
          max="2.0"
          step="0.25"
          value={project.transitionSpeed}
          oninput={(e) => { project = { ...project, transitionSpeed: parseFloat((e.target as HTMLInputElement).value) }; }}
        />
      </div>
    {/if}
  </div>

  <!-- Preview window -->
  {#if showPreview}
    <div class="preview-section">
      <div
        class="preview-canvas-wrapper"
        style="aspect-ratio: {canvasWidth} / {canvasHeight};"
      >
        <canvas
          bind:this={previewEl}
          width={canvasWidth}
          height={canvasHeight}
          class="preview-canvas"
        ></canvas>
        <!-- svelte-ignore a11y_media_has_caption -->
        <audio
          bind:this={previewAudioEl}
          src={previewAudioUrl}
          onended={handlePreviewEnded}
          preload="metadata"
          style="display:none"
        ></audio>
      </div>

      <!-- Preview controls -->
      <div class="preview-controls">
        <button
          type="button"
          class="preview-play-btn"
          onclick={togglePreview}
          aria-label={isPreviewPlaying ? 'Pause preview' : 'Play preview'}
        >
          <img
            src={isPreviewPlaying ? '/icons/icon-pause-fill.svg' : '/icons/icon-play-fill.svg'}
            alt={isPreviewPlaying ? 'Pause' : 'Play'}
            class="preview-play-icon"
          />
        </button>
        <div class="preview-progress-track">
          <div
            class="preview-progress-fill"
            style="width: {previewDuration > 0 ? (previewTime / previewDuration) * 100 : 0}%"
          ></div>
        </div>
        <span class="preview-time">{formatTime(previewTime)}</span>
      </div>
    </div>
  {/if}

  <!-- Export progress -->
  {#if isExporting && exportProgress}
    <div class="export-progress">
      <div class="export-progress-bar">
        <div class="export-progress-fill" style="width: {exportProgress.progress * 100}%"></div>
      </div>
      <span class="export-progress-label">{exportProgress.message}</span>
    </div>
  {/if}

  {#if exportError}
    <div class="error-banner">{exportError}</div>
  {/if}

  <!-- Download button -->
  <div class="action-row">
    <button
      type="button"
      class="download-btn"
      onclick={handleDownloadTap}
      disabled={!hasAudio || isExporting}
    >
      {#if isExporting}
        <span class="spinner" aria-hidden="true"></span>
        Exporting…
      {:else}
        <img src="/icons/icon-download.svg" alt="" class="btn-icon" />
        Download
      {/if}
    </button>
  </div>

  <!-- New project -->
  <div class="new-project-row">
    <button type="button" class="new-project-btn" onclick={handleNewProject}>
      New project
    </button>
  </div>

</div>

<!-- Voiceover & Images drawer -->
{#if showVoiceoverDrawer}
  <VoiceoverImagesDrawer
    {project}
    onSave={handleVoiceoverSave}
    onClose={() => (showVoiceoverDrawer = false)}
  />
{/if}

<!-- Script drawer -->
{#if showScriptDrawer}
  <ScriptDrawer
    onAddToNotes={handleScriptAddToNotes}
    onClose={() => (showScriptDrawer = false)}
  />
{/if}

<!-- Archive -->
{#if showArchive}
  <ArchivePage
    onLoad={handleLoadFromArchive}
    onClose={() => (showArchive = false)}
  />
{/if}

<!-- Incomplete images modal -->
{#if showIncompleteModal}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <p class="modal-text">
        <strong>Heads up:</strong> You have {assignedCount} of {totalPanels} images assigned.
        Add more, or download anyway — missing panels will be black.
      </p>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn--secondary" onclick={() => (showIncompleteModal = false)}>
          Cancel
        </button>
        <button type="button" class="modal-btn modal-btn--primary" onclick={startExport}>
          Download anyway
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .explainer-page {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    max-width: 480px;
    margin: 0 auto;
    padding-bottom: var(--spacing-xl);
  }

  /* Script link */
  .script-row {
    display: flex;
    justify-content: flex-start;
  }

  .script-link-btn {
    background: none;
    border: none;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color 0.15s;
  }

  .script-link-btn:hover {
    color: var(--color-primary);
  }

  /* Ratio row */
  .ratio-row {
    display: flex;
    gap: var(--spacing-sm);
    align-items: center;
  }

  .ratio-btn {
    flex: 1;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--bg-white);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .ratio-btn--active {
    background: var(--bg-toggle-active);
    border-color: var(--bg-toggle-active);
    color: #fff;
  }

  .archive-btn {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s;
  }

  .archive-btn:hover {
    background: var(--bg-main);
    border-color: var(--color-border-active);
  }

  .archive-icon {
    width: 18px;
    height: 18px;
    opacity: 0.6;
  }

  /* Voiceover CTA */
  .cta-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .voiceover-btn {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md) var(--spacing-lg);
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .voiceover-btn:hover { opacity: 0.88; }

  .voiceover-btn--done {
    background: #2d6a3f;
  }

  .voiceover-icon {
    width: 20px;
    height: 20px;
    filter: brightness(0) invert(1);
    flex-shrink: 0;
  }

  .voiceover-label {
    flex: 1;
    text-align: left;
  }

  .completion-badge {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .check-icon {
    width: 18px;
    height: 18px;
    filter: brightness(0) invert(1);
  }

  .image-count {
    font-size: var(--font-size-xs);
    background: rgba(255,255,255,0.25);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
  }

  /* Settings blocks */
  .setting-block {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    background: var(--bg-main);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
  }

  .setting-block-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  /* Ken Burns options */
  .kb-options {
    display: flex;
    gap: var(--spacing-sm);
  }

  .kb-option-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    flex: 1;
    display: flex;
    justify-content: center;
  }

  /* Transition options */
  .transition-options {
    display: flex;
    gap: var(--spacing-sm);
  }

  .transition-option-btn {
    flex: 1;
    padding: var(--spacing-xs) var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--bg-white);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .transition-option-btn--active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }

  /* Speed slider */
  .speed-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .speed-label {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .speed-value {
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }

  .speed-slider {
    width: 100%;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  /* Preview */
  .preview-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    background: var(--bg-main);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm);
  }

  .preview-canvas-wrapper {
    width: 100%;
    max-height: 320px;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .preview-controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .preview-play-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }

  .preview-play-icon {
    width: 28px;
    height: 28px;
  }

  .preview-progress-track {
    flex: 1;
    height: 4px;
    background: var(--color-border);
    border-radius: 2px;
    overflow: hidden;
  }

  .preview-progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 2px;
    transition: width 0.1s linear;
  }

  .preview-time {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* Export progress */
  .export-progress {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .export-progress-bar {
    height: 6px;
    background: var(--color-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .export-progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .export-progress-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    text-align: center;
  }

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: #b91c1c;
  }

  /* Actions */
  .action-row {
    display: flex;
    gap: var(--spacing-sm);
  }

  .download-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-md);
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .download-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .download-btn:not(:disabled):hover { opacity: 0.88; }

  .btn-icon {
    width: 18px;
    height: 18px;
    filter: brightness(0) invert(1);
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .new-project-row {
    display: flex;
    justify-content: center;
  }

  .new-project-btn {
    background: none;
    border: none;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    cursor: pointer;
    padding: var(--spacing-xs) var(--spacing-sm);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  /* Modal */
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
