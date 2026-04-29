<script lang="ts">
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import { SUPPORTED_LANGUAGES } from '$lib/utils/transcription';
  import {
    type SubtitleStyle,
    type SubtitleSegment,
    type SubtitleTemplate,
    type FontSize,
    type MaxLines,
    type FontName,
    DEFAULT_SUBTITLE_STYLE,
    mergeSegments,
    splitSegmentAtWord,
    reflow,
    rebuildAllWords,
  } from '$lib/utils/subtitles';

  interface Props {
    // Audio blob to transcribe (audiogram: loaded audio; video: extracted audio)
    audioBlob: Blob | null;
    // Canvas dimensions for reflow calculations
    canvasWidth: number;
    canvasHeight: number;
    // Current subtitle state — two-way binding via callbacks
    style: SubtitleStyle;
    segments: SubtitleSegment[];
    subtitlesEnabled: boolean;
    onStyleChange: (style: SubtitleStyle) => void;
    onSegmentsChange: (segments: SubtitleSegment[]) => void;
    onEnabledChange: (enabled: boolean) => void;
  }

  let {
    audioBlob,
    canvasWidth,
    canvasHeight,
    style,
    segments,
    subtitlesEnabled,
    onStyleChange,
    onSegmentsChange,
    onEnabledChange,
  }: Props = $props();

  // Generation state
  let generating = $state(false);
  let generateError = $state<string | null>(null);
  let generateStage = $state('');

  // Language selection state
  let selectedLanguage = $state('auto');
  let languageDropdownOpen = $state(false);

  // Font dropdown state
  let fontDropdownOpen = $state(false);

  // Edit drawer state
  let editDrawerOpen = $state(false);
  let splitPickerSegmentIdx = $state<number | null>(null);

  // Reset confirmation state
  let showResetConfirm = $state(false);

  // Color picker state
  let colorPickerTarget = $state<'text' | 'spotlight' | 'outline' | 'shadow' | null>(null);

  // Local reactive copy of segments — ensures edits are captured before reflow
  let localSegments = $state<SubtitleSegment[]>([]);

  // Sync prop changes into local state ONLY when drawer is closed
  // This prevents the effect from overwriting edits while the drawer is open
  $effect(() => {
    if (!editDrawerOpen) {
      localSegments = segments;
    }
  });

  const hasSegments = $derived(segments.length > 0);

  // --- Auto-clear subtitles when audio is deleted ---
  // If audioBlob becomes null (user deleted audio), clear subtitles and disable panel
  $effect(() => {
    if (audioBlob === null && hasSegments) {
      onSegmentsChange([]);
      onEnabledChange(false);
    }
  });

  // --- Close font dropdown on click outside ---
  $effect(() => {
    if (!fontDropdownOpen) return;

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const wrapper = document.querySelector('.font-dropdown-wrapper');
      if (wrapper && !wrapper.contains(target)) {
        fontDropdownOpen = false;
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });

  // --- Style helpers ---

  function updateStyle(patch: Partial<SubtitleStyle>) {
    onStyleChange({ ...style, ...patch });
  }

  function setTemplate(t: SubtitleTemplate) {
    updateStyle({ template: t });
  }

  function setFontSize(s: FontSize) {
    updateStyle({ fontSize: s });
  }

  function setMaxLines(m: MaxLines) {
    updateStyle({ maxLines: m });
  }

  function setFont(fontName: FontName) {
    updateStyle({ fontFamily: fontName });
  }

  // --- Generate subtitles via Deepgram API ---

  async function handleGenerate() {
    if (!audioBlob) {
      generateError = 'No audio loaded. Add audio first.';
      return;
    }

    generating = true;
    generateError = null;
    generateStage = 'Generating…';

    try {
      const formData = new FormData();
      // Use the blob's actual MIME type (e.g., audio/webm from MediaRecorder)
      // Don't force it to MP3 — Deepgram needs the real format to decode correctly
      const audioFile = new File([audioBlob], 'audio', { type: audioBlob.type || 'audio/mpeg' });
      formData.append('audio', audioFile);
      formData.append('language', selectedLanguage);

      const response = await fetch('/api/transcribe-deepgram', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Transcription failed (${response.status})`);
      }

      const data = await response.json();
      const subtitleSegs: SubtitleSegment[] = (data.segments ?? []).map((seg: any) => {
        const words = (seg.words ?? []).map((w: any) => ({
          word: w.word,
          start: w.start,
          end: w.end,
        }));
        // Reconstruct text from words to preserve original capitalization
        const text = words.map((w: typeof words[0]) => w.word).join(' ');
        return {
          start: seg.start,
          end: seg.end,
          text,
          words,
        };
      });

      if (subtitleSegs.length === 0) {
        throw new Error('No subtitles generated. Is there speech in the audio?');
      }

      onSegmentsChange(subtitleSegs);
      onEnabledChange(true);
      generateStage = '';
    } catch (err) {
      generateError = err instanceof Error ? err.message : 'Transcription failed';
      generateStage = '';
    } finally {
      generating = false;
    }
  }

  // --- Reset ---

  function handleResetRequest() {
    showResetConfirm = true;
  }

  function confirmReset() {
    onSegmentsChange([]);
    onEnabledChange(false);
    showResetConfirm = false;
    editDrawerOpen = false;
  }

  function cancelReset() {
    showResetConfirm = false;
  }

  // --- Edit drawer ---

  function openEditDrawer() {
    editDrawerOpen = true;
  }

  function closeEditDrawer() {
    editDrawerOpen = false;
    splitPickerSegmentIdx = null;
    // Reflow all segments on close (using localSegments to capture any edits)
    if (localSegments.length > 0) {
      // CRITICAL: Rebuild words array from edited text before reflow
      // This ensures the rendering engine uses the correct edited words, not the original ones
      const withRebuiltWords = rebuildAllWords(localSegments);
      const reflowed = reflow(withRebuiltWords, style, canvasWidth, canvasHeight);
      console.log('[SubtitlePanel] closeEditDrawer: rebuilt words and reflowed segments');
      onSegmentsChange(reflowed);
    }
  }

  function handleSegmentTextEdit(idx: number, newText: string) {
    const updated = localSegments.map((seg, i) =>
      i === idx ? { ...seg, text: newText } : seg
    );
    localSegments = updated;
    console.log('[SubtitlePanel] handleSegmentTextEdit:', { idx, newText, updatedText: updated[idx]?.text });
  }

  function handleMerge(idxA: number) {
    const idxB = idxA + 1;
    if (idxB >= localSegments.length) return;
    const merged = mergeSegments(localSegments[idxA], localSegments[idxB]);
    const updated = [
      ...localSegments.slice(0, idxA),
      merged,
      ...localSegments.slice(idxB + 1),
    ];
    localSegments = updated;
    if (splitPickerSegmentIdx !== null && splitPickerSegmentIdx >= idxA) {
      splitPickerSegmentIdx = null;
    }
  }

  function handleSplit(segIdx: number, wordIdx: number) {
    const [segA, segB] = splitSegmentAtWord(localSegments[segIdx], wordIdx);
    const updated = [
      ...localSegments.slice(0, segIdx),
      segA,
      segB,
      ...localSegments.slice(segIdx + 1),
    ];
    localSegments = updated;
    splitPickerSegmentIdx = null;
  }

  function toggleSplitPicker(idx: number) {
    splitPickerSegmentIdx = splitPickerSegmentIdx === idx ? null : idx;
  }

  function formatTime(s: number): string {
    return s.toFixed(1) + 's';
  }
</script>

<div class="subtitle-panel">

  <!-- Template picker -->
  <div class="panel-row">
    <span class="row-label">Template</span>
    <div class="template-toggle">
      <button
        type="button"
        class="template-btn"
        class:active={style.template === 'focus'}
        onclick={() => setTemplate('focus')}
      >Focus</button>
      <button
        type="button"
        class="template-btn"
        class:active={style.template === 'flow'}
        onclick={() => setTemplate('flow')}
      >Flow</button>
    </div>
  </div>

  <!-- Text size -->
  <div class="panel-row">
    <span class="row-label">Text size</span>
    <div class="three-stop">
      {#each (['small', 'medium', 'large'] as FontSize[]) as size}
        <button
          type="button"
          class="stop-btn"
          class:active={style.fontSize === size}
          onclick={() => setFontSize(size)}
        >{size.charAt(0).toUpperCase() + size.slice(1)}</button>
      {/each}
    </div>
  </div>

  <!-- Max lines -->
  <div class="panel-row">
    <span class="row-label">Max lines</span>
    <div class="two-stop">
      <button
        type="button"
        class="stop-btn"
        class:active={style.maxLines === 1}
        onclick={() => setMaxLines(1)}
      >1 line</button>
      <button
        type="button"
        class="stop-btn"
        class:active={style.maxLines === 2}
        onclick={() => setMaxLines(2)}
      >2 lines</button>
    </div>
  </div>

  <!-- Style row: alignment + bold + all caps -->
  <div class="panel-row">
    <span class="row-label">Style</span>
    <div class="style-controls">
      <!-- Alignment buttons -->
      <div class="align-group">
        <button
          type="button"
          class="icon-btn"
          class:active={style.textAlign === 'left'}
          onclick={() => updateStyle({ textAlign: 'left' })}
          aria-label="Align left"
          title="Align left"
        >
          <img src="/icons/icon-align-left.svg" alt="" />
        </button>
        <button
          type="button"
          class="icon-btn"
          class:active={style.textAlign === 'center'}
          onclick={() => updateStyle({ textAlign: 'center' })}
          aria-label="Align center"
          title="Align center"
        >
          <img src="/icons/icon-align-center.svg" alt="" />
        </button>
        <button
          type="button"
          class="icon-btn"
          class:active={style.textAlign === 'right'}
          onclick={() => updateStyle({ textAlign: 'right' })}
          aria-label="Align right"
          title="Align right"
        >
          <img src="/icons/icon-align-right.svg" alt="" />
        </button>
      </div>

      <!-- Bold button (square) -->
      <button
        type="button"
        class="bold-btn"
        class:active={style.boldEnabled}
        onclick={() => updateStyle({ boldEnabled: !style.boldEnabled })}
        aria-label="Toggle bold"
        title="Toggle bold"
      >
        <img src="/icons/icon-bold.svg" alt="" />
      </button>

      <!-- All caps button (expands to fill) -->
      <button
        type="button"
        class="caps-btn"
        class:active={style.uppercaseEnabled}
        onclick={() => updateStyle({ uppercaseEnabled: !style.uppercaseEnabled })}
        aria-label="Toggle all caps"
        title="Toggle all caps"
      >
        All caps
      </button>
    </div>
  </div>

  <!-- Font dropdown -->
  <div class="panel-row">
    <span class="row-label">Font</span>
    <div class="font-dropdown-wrapper">
      <button
        type="button"
        class="font-dropdown-trigger"
        class:open={fontDropdownOpen}
        onclick={() => fontDropdownOpen = !fontDropdownOpen}
        aria-expanded={fontDropdownOpen}
      >
        <span class="font-dropdown-value" style="font-family: {style.fontFamily}">
          {style.fontFamily}
        </span>
        <img
          src={fontDropdownOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
          alt=""
          class="font-dropdown-icon"
        />
      </button>
      
      {#if fontDropdownOpen}
        <ul class="font-dropdown-menu">
          {#each ['Inter', 'Roboto Slab', 'Oswald', 'Saira'] as fontName, i}
            <li>
              <button
                type="button"
                class="font-dropdown-option"
                class:selected={style.fontFamily === fontName}
                style="font-family: {fontName}; font-weight: {fontName === 'Inter' || fontName === 'Oswald' ? '600' : fontName === 'Roboto Slab' ? '900' : fontName === 'Saira' ? '600' : '400'}; font-stretch: {fontName === 'Saira' ? 'condensed' : 'normal'}"
                onclick={() => {
                  setFont(fontName as FontName);
                  fontDropdownOpen = false;
                }}
              >
                {fontName}
              </button>
            </li>
            {#if i < 3}
              <li class="font-dropdown-separator"></li>
            {/if}
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <!-- Vertical position -->
  <div class="panel-row vertical">
    <span class="row-label">Position</span>
    <input
      type="range"
      class="position-slider"
      min="0.15"
      max="0.85"
      step="0.01"
      value={style.verticalPosition}
      oninput={(e) => updateStyle({ verticalPosition: parseFloat((e.target as HTMLInputElement).value) })}
    />
  </div>

  <!-- Style options -->
  <div class="style-options">
    <!-- Text colour -->
    <div class="style-row">
      <span class="style-label">Text</span>
      <button
        type="button"
        class="color-swatch"
        style="background: {style.textColor}"
        onclick={() => colorPickerTarget = 'text'}
        aria-label="Text colour"
      ></button>
    </div>

    <!-- Spotlight -->
    <div class="style-row">
      <span class="style-label">Spotlight</span>
      <button
        type="button"
        class="toggle-switch"
        class:active={style.spotlightEnabled}
        onclick={() => updateStyle({ spotlightEnabled: !style.spotlightEnabled })}
        aria-pressed={style.spotlightEnabled}
        aria-label="Toggle spotlight"
      ><span class="toggle-thumb"></span></button>
      <button
        type="button"
        class="color-swatch"
        style="background: {style.spotlightColor}"
        onclick={() => colorPickerTarget = 'spotlight'}
        aria-label="Spotlight colour"
      ></button>
    </div>

    <!-- Outline -->
    <div class="style-row">
      <span class="style-label">Outline</span>
      <button
        type="button"
        class="toggle-switch"
        class:active={style.outlineEnabled}
        onclick={() => updateStyle({ outlineEnabled: !style.outlineEnabled })}
        aria-pressed={style.outlineEnabled}
        aria-label="Toggle outline"
      ><span class="toggle-thumb"></span></button>
      <button
        type="button"
        class="color-swatch"
        style="background: {style.outlineColor}"
        onclick={() => colorPickerTarget = 'outline'}
        aria-label="Outline colour"
      ></button>
    </div>

    <!-- Shadow -->
    <div class="style-group" class:expanded={style.shadowEnabled}>
      <div class="style-row">
        <span class="style-label">Shadow</span>
        <button
          type="button"
          class="toggle-switch"
          class:active={style.shadowEnabled}
          onclick={() => updateStyle({ shadowEnabled: !style.shadowEnabled })}
          aria-pressed={style.shadowEnabled}
          aria-label="Toggle shadow"
        ><span class="toggle-thumb"></span></button>
        <button
          type="button"
          class="color-swatch"
          style="background: {style.shadowColor}"
          onclick={() => colorPickerTarget = 'shadow'}
          aria-label="Shadow colour"
        ></button>
      </div>
      {#if style.shadowEnabled}
        <div class="shadow-opacity-row">
          <span class="row-label">Opacity</span>
          <input
            type="range"
            class="position-slider"
            min="0"
            max="1"
            step="0.01"
            value={style.shadowOpacity ?? 0.5}
            oninput={(e) => updateStyle({ shadowOpacity: parseFloat((e.target as HTMLInputElement).value) })}
            aria-label="Shadow opacity"
          />
        </div>
      {/if}
    </div>
  </div>

  <!-- Generate / Reset / Edit buttons -->
  <div class="action-buttons">
    {#if !hasSegments}
      <button
        type="button"
        class="generate-btn"
        class:loading={generating}
        onclick={handleGenerate}
        disabled={generating || !audioBlob}
      >
        {#if generating}
          <span class="btn-spinner"></span>
          {generateStage || 'Generating…'}
        {:else}
          Generate subtitles
        {/if}
      </button>
    {:else}
      <div class="has-segments-row">
        <button
          type="button"
          class="edit-btn"
          onclick={openEditDrawer}
        >Edit</button>
        <button
          type="button"
          class="reset-btn"
          onclick={handleResetRequest}
        >Reset</button>
      </div>
    {/if}

    {#if generateError}
      <p class="generate-error">{generateError}</p>
    {/if}

    <!-- Language selector dropdown -->
    <div class="language-selector">
      <button
        type="button"
        class="language-btn"
        class:active={selectedLanguage !== 'auto'}
        onclick={() => languageDropdownOpen = !languageDropdownOpen}
      >
        Language: {SUPPORTED_LANGUAGES[selectedLanguage] || 'Auto detect'}
        <svg class="chevron" class:open={languageDropdownOpen} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>

      {#if languageDropdownOpen}
        <div class="language-dropdown">
          {#each Object.entries(SUPPORTED_LANGUAGES) as [code, name]}
            <button
              type="button"
              class="language-option"
              class:selected={selectedLanguage === code}
              onclick={() => {
                selectedLanguage = code;
                languageDropdownOpen = false;
              }}
            >
              {name}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<!-- Color pickers -->
{#if colorPickerTarget === 'text'}
  <ColorPicker
    color={style.textColor}
    onColorChange={(c) => updateStyle({ textColor: c })}
    onClose={() => colorPickerTarget = null}
  />
{:else if colorPickerTarget === 'spotlight'}
  <ColorPicker
    color={style.spotlightColor}
    onColorChange={(c) => updateStyle({ spotlightColor: c })}
    onClose={() => colorPickerTarget = null}
  />
{:else if colorPickerTarget === 'outline'}
  <ColorPicker
    color={style.outlineColor}
    onColorChange={(c) => updateStyle({ outlineColor: c })}
    onClose={() => colorPickerTarget = null}
  />
{:else if colorPickerTarget === 'shadow'}
  <ColorPicker
    color={style.shadowColor}
    onColorChange={(c) => updateStyle({ shadowColor: c })}
    onClose={() => colorPickerTarget = null}
  />
{/if}

<!-- Reset confirmation -->
{#if showResetConfirm}
  <div
    class="modal-overlay"
    role="presentation"
    onclick={cancelReset}
    onkeydown={(e) => e.key === 'Escape' && cancelReset()}
  >
    <div
      class="modal-content"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <p class="modal-text">Clear all subtitles? This cannot be undone.</p>
      <div class="modal-actions">
        <button type="button" class="modal-btn cancel" onclick={cancelReset}>Cancel</button>
        <button type="button" class="modal-btn confirm" onclick={confirmReset}>Clear</button>
      </div>
    </div>
  </div>
{/if}

<!-- Edit drawer -->
{#if editDrawerOpen}
  <div class="drawer-overlay" role="presentation" onclick={closeEditDrawer} onkeydown={(e) => e.key === 'Escape' && closeEditDrawer()}>
    <div
      class="edit-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Edit subtitles"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="drawer-header">
        <span class="drawer-title">Edit subtitles</span>
        <button type="button" class="drawer-done-btn" onclick={closeEditDrawer}>Done</button>
      </div>

      <div class="drawer-segments">
        {#each localSegments as seg, idx}
          <!-- Segment -->
          <div class="segment-card">
            <div class="segment-meta">
              <span class="segment-time">{formatTime(seg.start)} – {formatTime(seg.end)}</span>
              <button
                type="button"
                class="split-btn"
                class:active={splitPickerSegmentIdx === idx}
                onclick={() => toggleSplitPicker(idx)}
                title="Split segment"
                aria-label="Split segment"
              >SPLIT</button>
            </div>

            <textarea
              class="segment-text-input"
              value={seg.text}
              rows={2}
              oninput={(e) => handleSegmentTextEdit(idx, (e.target as HTMLTextAreaElement).value)}
            ></textarea>

            <!-- Split word picker -->
            {#if splitPickerSegmentIdx === idx}
              <div class="word-chips">
                {#each seg.words as w, wi}
                  {#if wi < seg.words.length - 1}
                    <button
                      type="button"
                      class="word-chip"
                      onclick={() => handleSplit(idx, wi)}
                      title="Split after this word"
                    >{w.word}</button>
                  {:else}
                    <span class="word-chip last">{w.word}</span>
                  {/if}
                {/each}
                <p class="word-chips-hint">Tap a word to split after it</p>
              </div>
            {/if}
          </div>

          <!-- Merge button between segments -->
          {#if idx < localSegments.length - 1}
            <button
              type="button"
              class="merge-btn"
              onclick={() => handleMerge(idx)}
              aria-label="Merge with next segment"
            >+</button>
          {/if}
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .subtitle-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .panel-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .panel-row.vertical {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }

  .row-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
    min-width: 72px;
  }

  /* Template / stop toggles */
  .template-toggle,
  .three-stop,
  .two-stop {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    flex: 1;
  }

  .template-btn,
  .stop-btn {
    flex: 1;
    padding: 6px var(--spacing-sm);
    border: none;
    background: var(--bg-white);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: background var(--transition-normal), color var(--transition-normal);
  }

  .template-btn.active,
  .stop-btn.active {
    background: #555555;
    color: #fff;
  }

  /* Position slider */
  .position-slider {
    width: 100%;
    height: 6px;
    border-radius: var(--radius-round);
    background: var(--color-border);
    outline: none;
    -webkit-appearance: none;
    appearance: none;
    cursor: pointer;
  }

  .position-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-primary);
    cursor: pointer;
    border: none;
  }

  /* Style options */
  .style-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
  }

  .style-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .style-label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
    min-width: 64px;
  }

  .color-swatch {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    cursor: pointer;
    flex-shrink: 0;
    margin-left: auto;
  }

  /* Toggle switch (reuse audiogram pattern) */
  .toggle-switch {
    width: 44px;
    height: 24px;
    background: #999;
    border: none;
    border-radius: var(--radius-round);
    cursor: pointer;
    position: relative;
    transition: background var(--transition-normal);
    padding: 0;
    flex-shrink: 0;
  }

  .toggle-switch.active {
    background: var(--color-primary);
  }

  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: 50%;
    transition: transform var(--transition-normal);
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(20px);
  }

  /* Action buttons */
  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .generate-btn {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: #555555;
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    transition: background var(--transition-normal);
  }

  .generate-btn:disabled {
    background: var(--color-border);
    color: var(--text-secondary);
    cursor: not-allowed;
  }

  .generate-btn.loading {
    background: #555555;
    opacity: 0.8;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .has-segments-row {
    display: flex;
    gap: var(--spacing-sm);
  }

  .edit-btn {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    background: #555555;
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background var(--transition-normal);
  }

  .edit-btn:hover {
    background: #444444;
  }

  .reset-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--bg-white);
    color: var(--text-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: border-color var(--transition-normal);
  }

  .reset-btn:hover {
    border-color: var(--color-border-active);
  }

  .generate-error {
    font-size: var(--font-size-sm);
    color: #dc2626;
    text-align: center;
    margin: 0;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
    padding: var(--spacing-md);
  }

  .modal-content {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    width: 100%;
    max-width: 300px;
  }

  .modal-text {
    font-size: var(--font-size-base);
    color: var(--text-primary);
    text-align: center;
    margin: 0 0 var(--spacing-lg) 0;
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .modal-btn {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background var(--transition-normal);
  }

  .modal-btn.cancel {
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    color: var(--text-primary);
  }

  .modal-btn.cancel:hover {
    background: var(--bg-main);
  }

  .modal-btn.confirm {
    background: #dc2626;
    border: none;
    color: #fff;
  }

  .modal-btn.confirm:hover {
    background: #b91c1c;
  }

  /* Edit drawer */
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 1100;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .edit-drawer {
    background: var(--bg-white);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    width: 100%;
    max-width: 480px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .drawer-done-btn {
    padding: var(--spacing-xs) var(--spacing-md);
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
  }

  .drawer-segments {
    overflow-y: auto;
    padding: var(--spacing-md) var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .segment-card {
    border: none;
    border-radius: 0;
    padding: var(--spacing-xs) 0;
    background: transparent;
  }

  .segment-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-xs);
  }

  .segment-time {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
  }

  .split-btn {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transition: color var(--transition-normal);
  }

  .split-btn:hover {
    color: var(--color-primary);
  }

  .split-btn.active {
    color: var(--color-primary);
  }

  .segment-text-input {
    width: 100%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-base);
    line-height: var(--line-height-normal);
    resize: none;
    outline: none;
    box-sizing: border-box;
  }

  .segment-text-input:focus {
    border-color: var(--color-border-active);
  }

  .word-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
    margin-top: var(--spacing-sm);
    padding: var(--spacing-xs);
    background: var(--bg-main);
    border-radius: var(--radius-sm);
  }

  .word-chip {
    padding: 4px var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-round);
    background: var(--bg-white);
    font-size: var(--font-size-xs);
    cursor: pointer;
    transition: background var(--transition-normal), border-color var(--transition-normal);
  }

  .word-chip:hover {
    background: var(--color-highlight);
    border-color: var(--color-primary);
  }

  .word-chip.last {
    cursor: default;
    opacity: 0.5;
  }

  .word-chips-hint {
    width: 100%;
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    margin: 0;
  }

  .merge-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    margin: 0 auto;
    border: 1px solid var(--color-border);
    border-radius: 50%;
    background: var(--bg-white);
    color: var(--text-secondary);
    font-size: var(--font-size-base);
    cursor: pointer;
    transition: border-color var(--transition-normal), color var(--transition-normal);
    flex-shrink: 0;
  }

  .merge-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  /* Shadow group — expands to show opacity slider when shadow is on */
  .style-group {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .shadow-opacity-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
    padding-top: var(--spacing-sm);
  }

  .shadow-opacity-row .row-label {
    min-width: unset;
  }

  .shadow-opacity-row .position-slider {
    width: 100%;
  }

  /* Style controls row */
  .style-controls {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
  }

  .align-group {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: var(--bg-white);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-normal), color var(--transition-normal);
    flex-shrink: 0;
  }

  .icon-btn img {
    width: 16px;
    height: 16px;
    display: block;
  }

  .icon-btn:hover {
    background: var(--color-highlight);
  }

  .icon-btn.active {
    background: #555555;
  }

  .icon-btn.active img {
    filter: brightness(0) invert(1);
  }

  .bold-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--bg-white);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-normal), color var(--transition-normal);
    flex-shrink: 0;
  }

  .bold-btn img {
    width: 16px;
    height: 16px;
    display: block;
  }

  .bold-btn:hover {
    border-color: var(--color-border-active);
    background: var(--color-highlight);
  }

  .bold-btn.active {
    background: #555555;
    color: #fff;
    border-color: #555555;
  }

  .bold-btn.active img {
    filter: brightness(0) invert(1);
  }

  .caps-btn {
    flex: 1;
    padding: 6px var(--spacing-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--bg-white);
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background var(--transition-normal), color var(--transition-normal);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .caps-btn:hover {
    border-color: var(--color-border-active);
    background: var(--color-highlight);
  }

  .caps-btn.active {
    background: #555555;
    color: #fff;
    border-color: #555555;
  }

  /* Language selector */
  .language-selector {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: calc(-1 * var(--spacing-sm));
  }

  .language-btn {
    background: none;
    border: none;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    transition: color var(--transition-normal);
  }

  .language-btn:hover {
    color: var(--color-primary);
  }

  .language-btn.active {
    color: var(--color-primary);
  }

  .chevron {
    width: 16px;
    height: 16px;
    transition: transform var(--transition-normal);
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .language-dropdown {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    min-width: 200px;
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: var(--spacing-xs);
  }

  .language-option {
    display: block;
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: none;
    border: none;
    text-align: left;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    cursor: pointer;
    transition: background-color var(--transition-normal);
  }

  .language-option:hover {
    background-color: var(--color-highlight);
  }

  .language-option.selected {
    background-color: var(--color-highlight);
    color: var(--color-primary);
    font-weight: var(--font-weight-semibold);
  }

  /* Font dropdown */
  .font-dropdown-wrapper {
    position: relative;
    width: 100%;
  }

  .font-dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px var(--spacing-sm);
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color var(--transition-normal);
  }

  .font-dropdown-trigger:hover {
    border-color: var(--text-secondary);
  }

  .font-dropdown-trigger.open {
    border-color: var(--color-primary);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .font-dropdown-value {
    text-align: left;
  }

  .font-dropdown-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .font-dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-white);
    border: 1px solid var(--color-primary);
    border-top: none;
    border-bottom-left-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
    list-style: none;
    margin: 0;
    padding: 0;
    z-index: 100;
    animation: slideDown var(--transition-normal);
  }

  .font-dropdown-option {
    width: 100%;
    display: block;
    padding: 6px var(--spacing-sm);
    background: none;
    border: none;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-normal);
  }

  .font-dropdown-option:hover {
    background-color: var(--color-highlight);
  }

  .font-dropdown-option.selected {
    color: var(--color-primary);
    font-weight: var(--font-weight-medium);
  }

  .font-dropdown-separator {
    height: 1px;
    background-color: var(--color-border);
    margin: 0 var(--spacing-md);
  }
</style>
