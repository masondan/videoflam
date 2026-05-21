<script lang="ts">
  interface Props {
    suggestions: string[];
    onClose: () => void;
  }

  let { suggestions, onClose }: Props = $props();

  let copyIndex = $state<number | null>(null);

  async function handleCopy(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      copyIndex = index;
      setTimeout(() => { copyIndex = null; }, 2000);
    } catch {
      // clipboard not available
    }
  }
</script>

<div class="drawer-overlay">
  <div class="drawer">
    <!-- Header -->
    <header class="drawer-header">
      <button type="button" class="close-btn" onclick={onClose} aria-label="Close">✕</button>
      <span class="drawer-title">Image ideas</span>
      <button type="button" class="done-btn" onclick={onClose}>Done</button>
    </header>

    <div class="drawer-body">
      {#if suggestions.length === 0}
        <p class="empty-hint">No image suggestions yet. Generate a script first.</p>
      {:else}
        <p class="intro-text">One image idea per visual beat, in script order.</p>
        <ul class="suggestions-list">
          {#each suggestions as suggestion, i}
            <li class="suggestion-item">
              <span class="suggestion-number">{i + 1}</span>
              <span class="suggestion-text">{suggestion}</span>
              <button
                type="button"
                class="copy-btn"
                onclick={() => handleCopy(suggestion, i)}
                aria-label="Copy image idea"
              >
                {#if copyIndex === i}
                  ✓
                {:else}
                  <img src="/icons/icon-copy.svg" alt="Copy" class="copy-icon" />
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 160;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .drawer {
    background: var(--bg-white);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    animation: slideUp 0.25s ease-out;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
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

  .done-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary);
    padding: var(--spacing-xs) var(--spacing-sm);
  }

  .drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md) var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding-bottom: var(--spacing-xl);
  }

  .intro-text {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .suggestions-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .suggestion-item {
    display: flex;
    gap: var(--spacing-sm);
    align-items: flex-start;
    background: var(--bg-main);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
  }

  .suggestion-number {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    color: var(--color-primary);
    min-width: 16px;
    padding-top: 2px;
    flex-shrink: 0;
  }

  .suggestion-text {
    flex: 1;
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
  }

  .copy-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px var(--spacing-xs);
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .copy-btn:hover { opacity: 1; }

  .copy-icon {
    width: 14px;
    height: 14px;
    opacity: 0.6;
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    text-align: center;
    padding: var(--spacing-xl) 0;
    margin: 0;
  }
</style>
