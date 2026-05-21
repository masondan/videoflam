<script lang="ts">
  import type { VideoPanel, WordTimestamp } from '$lib/stores/videoProject';

  interface Props {
    panel: VideoPanel;
    index: number;           // 1-based display number
    isActive: boolean;       // highlighted during audio playback
    onAssignImage: (panelId: string) => void;
    onDeleteImage: (panelId: string) => void;
    onSplit: (panelId: string) => void;
    onMergeBelow: (panelId: string) => void; // merge this card with the one below
    showMergeButton: boolean; // false for last card
  }

  let {
    panel,
    index,
    isActive,
    onAssignImage,
    onDeleteImage,
    onSplit,
    onMergeBelow,
    showMergeButton,
  }: Props = $props();

  let showSplitModal = $state(false);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1);
    return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
  }

  function handleSplitWordTap(wordIndex: number) {
    if (wordIndex === 0) return; // can't split before first word
    showSplitModal = false;
    onSplit(panel.id + ':' + wordIndex);
  }
</script>

<div class="panel-card" class:active={isActive}>
  <!-- Header row: timestamps + SPLIT -->
  <div class="card-header">
    <span class="timestamp">{formatTime(panel.startTime)} – {formatTime(panel.endTime)}</span>
    {#if panel.words.length > 1}
      <button
        type="button"
        class="split-btn"
        onclick={() => (showSplitModal = true)}
        aria-label="Split panel"
      >
        SPLIT
      </button>
    {/if}
  </div>

  <!-- Transcript text -->
  <p class="panel-text">{panel.text}</p>

  <!-- Image bar -->
  {#if panel.imageBlob}
    <!-- Green bar: image assigned -->
    <div class="image-bar image-bar--assigned">
      <span class="image-number">{index}</span>
      <span class="image-label">Image assigned</span>
      <button
        type="button"
        class="delete-image-btn"
        onclick={() => onDeleteImage(panel.id)}
        aria-label="Remove image"
      >✕</button>
    </div>
  {:else}
    <!-- Dashed bar: no image -->
    <button
      type="button"
      class="image-bar image-bar--empty"
      onclick={() => onAssignImage(panel.id)}
      aria-label="Assign image to panel"
    >
      <img src="/icons/icon-upload.svg" alt="" class="image-icon" />
      <span>Add image</span>
    </button>
  {/if}
</div>

<!-- Merge button between cards -->
{#if showMergeButton}
  <button
    type="button"
    class="merge-btn"
    onclick={() => onMergeBelow(panel.id)}
    aria-label="Merge with next panel"
    title="Merge with next panel"
  >
    ⊕
  </button>
{/if}

<!-- Split word-tap modal -->
{#if showSplitModal}
  <div
    class="split-modal-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Choose split point"
  >
    <div class="split-modal">
      <div class="split-modal-header">
        <span class="split-modal-title">Tap word to split before it</span>
        <button
          type="button"
          class="split-modal-close"
          onclick={() => (showSplitModal = false)}
          aria-label="Cancel split"
        >✕</button>
      </div>
      <div class="split-words">
        {#each panel.words as word, i}
          <button
            type="button"
            class="word-btn"
            class:word-btn--first={i === 0}
            onclick={() => handleSplitWordTap(i)}
            disabled={i === 0}
            title={i === 0 ? 'Cannot split before first word' : `Split before "${word.word}"`}
          >
            {word.word}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .panel-card {
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .panel-card.active {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-highlight);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .timestamp {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .split-btn {
    background: none;
    border: none;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary);
    cursor: pointer;
    padding: 2px var(--spacing-xs);
    letter-spacing: 0.05em;
  }

  .split-btn:hover {
    text-decoration: underline;
  }

  .panel-text {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
    margin: 0;
  }

  /* Image bar — shared base */
  .image-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-xs);
    min-height: 32px;
  }

  /* Dashed empty state */
  .image-bar--empty {
    border: 1.5px dashed var(--color-border-active);
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    width: 100%;
    justify-content: center;
    transition: border-color 0.15s, color 0.15s;
  }

  .image-bar--empty:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .image-icon {
    width: 14px;
    height: 14px;
    opacity: 0.6;
  }

  /* Green assigned state */
  .image-bar--assigned {
    background: #e6f4ea;
    border: 1px solid #a8d5b0;
    color: #2d6a3f;
  }

  .image-number {
    font-weight: var(--font-weight-bold);
    min-width: 16px;
    text-align: center;
  }

  .image-label {
    flex: 1;
  }

  .delete-image-btn {
    background: none;
    border: none;
    color: #2d6a3f;
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: 0 2px;
    line-height: 1;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .delete-image-btn:hover {
    opacity: 1;
  }

  /* Merge button between cards */
  .merge-btn {
    display: block;
    margin: 0 auto;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-round);
    width: 28px;
    height: 28px;
    font-size: 16px;
    line-height: 1;
    color: var(--text-secondary);
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }

  .merge-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-highlight);
  }

  /* Split modal */
  .split-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: var(--spacing-md);
  }

  .split-modal {
    background: var(--bg-white);
    border-radius: var(--radius-lg) var(--radius-lg) var(--radius-md) var(--radius-md);
    width: 100%;
    max-width: 480px;
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    max-height: 60vh;
    overflow-y: auto;
  }

  .split-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .split-modal-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .split-modal-close {
    background: none;
    border: none;
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    cursor: pointer;
    padding: 4px;
  }

  .split-words {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-xs);
  }

  .word-btn {
    background: var(--bg-main);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .word-btn:hover:not(:disabled) {
    background: var(--color-highlight);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  .word-btn--first,
  .word-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
