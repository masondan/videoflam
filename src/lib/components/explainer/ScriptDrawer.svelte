<script lang="ts">
  interface Props {
    audience: string;
    topic: string;
    url: string;
    duration: '30s' | '1min' | '2min';
    script: string;
    imageSuggestions: string[];
    onAudienceChange: (v: string) => void;
    onTopicChange: (v: string) => void;
    onUrlChange: (v: string) => void;
    onDurationChange: (v: '30s' | '1min' | '2min') => void;
    onScriptChange: (v: string) => void;
    onImageSuggestionsChange: (v: string[]) => void;
    onAddToNotes: (script: string) => void;
    onClear: () => void;
    onClose: () => void;
  }

  let {
    audience,
    topic,
    url,
    duration,
    script,
    imageSuggestions,
    onAudienceChange,
    onTopicChange,
    onUrlChange,
    onDurationChange,
    onScriptChange,
    onImageSuggestionsChange,
    onAddToNotes,
    onClear,
    onClose,
  }: Props = $props();

  // ── Local UI state ────────────────────────────────────────────────────────────
  let isGenerating = $state(false);
  let generateError = $state<string | null>(null);
  let showConfirmModal = $state(false);

  let wordCount = $derived(
    script.trim() ? script.trim().split(/\s+/).length : 0
  );

  let canClear = $derived(
    audience.trim() || topic.trim() || url.trim() || script.trim() || imageSuggestions.length > 0
  );

  // ── Generate ──────────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!topic.trim()) return;
    isGenerating = true;
    generateError = null;

    try {
      const res = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audience, topic, url, duration }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }

      onScriptChange(data.script ?? '');
      onImageSuggestionsChange(Array.isArray(data.imageSuggestions) ? data.imageSuggestions : []);
    } catch (err) {
      generateError = err instanceof Error ? err.message : 'Script generation failed';
      console.error('[ScriptDrawer] Generate error:', err);
    } finally {
      isGenerating = false;
    }
  }

  // ── Clear ─────────────────────────────────────────────────────────────────────
  function handleClear() {
    onClear();
    showConfirmModal = false;
  }

  // ── Copy ──────────────────────────────────────────────────────────────────────
  let copySuccess = $state(false);

  async function handleCopy() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch {
      // clipboard not available
    }
  }

  // ── Add to notes ──────────────────────────────────────────────────────────────
  function handleAddToNotes() {
    if (!script) return;
    onAddToNotes(script);
    onClose();
  }
</script>

<div class="drawer-overlay">
  <div class="drawer">
    <!-- Header -->
    <header class="drawer-header">
      <button type="button" class="close-btn" onclick={onClose} aria-label="Close">✕</button>
      <span class="drawer-title">Script Generator</span>
      <button
        type="button"
        class="done-btn"
        onclick={onClose}
      >Done</button>
    </header>

    <div class="drawer-body">
      <!-- Form -->
      <section class="form-section">
        <div class="field">
          <label class="field-label" for="audience-input">Audience</label>
          <input
            id="audience-input"
            type="text"
            class="field-input"
            placeholder="Who, where?"
            value={audience}
            oninput={(e) => onAudienceChange((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <label class="field-label" for="topic-input">Topic / Question</label>
          <input
            id="topic-input"
            type="text"
            class="field-input"
            placeholder="What's the story?"
            value={topic}
            oninput={(e) => onTopicChange((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <label class="field-label" for="url-input">Reference story <span class="field-label-optional">(Optional)</span></label>
          <input
            id="url-input"
            type="url"
            class="field-input"
            placeholder="Add the URL of a related article"
            value={url}
            oninput={(e) => onUrlChange((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <span class="field-label">Duration</span>
          <div class="duration-row">
            {#each (['30s', '1min', '2min'] as const) as d}
              <button
                type="button"
                class="duration-btn"
                class:duration-btn--active={duration === d}
                onclick={() => onDurationChange(d)}
              >
                {d === '30s' ? '30 sec' : d === '1min' ? '1 min' : '2 min'}
              </button>
            {/each}
          </div>
        </div>

        <button
          type="button"
          class="generate-btn"
          onclick={handleGenerate}
          disabled={!topic.trim() || isGenerating}
        >
          {#if isGenerating}
            <span class="spinner" aria-hidden="true"></span>
            Generating…
          {:else}
            Generate Script
          {/if}
        </button>

        {#if generateError}
          <div class="error-banner">{generateError}</div>
        {/if}
      </section>

      <!-- Script output -->
      <section class="script-section">
        <div class="script-header">
          <span class="script-section-label">Script</span>
          {#if wordCount > 0}
            <span class="word-count">{wordCount} words</span>
          {/if}
        </div>

        <div class="script-container">
          <textarea
            class="script-textarea"
            value={script}
            oninput={(e) => onScriptChange((e.target as HTMLTextAreaElement).value)}
            placeholder="Your script will appear here…"
            rows={10}
            aria-label="Generated script"
          ></textarea>

          {#if script}
            <div class="script-footer-buttons">
              <button
                type="button"
                class="icon-text-btn"
                onclick={handleCopy}
                aria-label="Copy script"
              >
                <img src="/icons/icon-copy.svg" alt="" class="icon-text-icon" />
                {copySuccess ? 'Copied!' : 'Copy'}
              </button>

              <button
                type="button"
                class="icon-text-btn"
                onclick={handleAddToNotes}
                aria-label="Read and record script"
              >
                <img src="/icons/icon-mic.svg" alt="" class="icon-text-icon" />
                Read & Record
              </button>
            </div>
          {/if}
        </div>
      </section>

      <!-- Image ideas -->
      <section class="image-ideas-section">
        <div class="script-header">
          <span class="script-section-label">Image ideas</span>
          {#if imageSuggestions.length > 0}
            <span class="word-count">{imageSuggestions.length} suggestions</span>
          {/if}
        </div>

        {#if imageSuggestions.length === 0}
          <p class="image-ideas-placeholder">Image suggestions will appear here</p>
        {:else}
          <ul class="suggestions-list">
            {#each imageSuggestions as suggestion, i}
              <li class="suggestion-item">
                <span class="suggestion-number">{i + 1}</span>
                <span class="suggestion-text">{suggestion}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Clear button -->
      <div class="clear-button-container">
        <button
          type="button"
          class="clear-btn"
          onclick={() => (showConfirmModal = true)}
          disabled={!canClear}
          aria-label="Clear and create new script"
        >
          Clear & create new script
        </button>
      </div>
    </div>
  </div>

  <!-- Confirmation modal -->
  {#if showConfirmModal}
    <div
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      onclick={() => (showConfirmModal = false)}
      onkeydown={(e) => e.key === 'Escape' && (showConfirmModal = false)}
    >
      <div class="modal" role="presentation" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title" id="modal-title">Start again?</span>
        </div>
        <div class="modal-actions">
          <button
            type="button"
            class="modal-btn modal-btn--cancel"
            onclick={() => (showConfirmModal = false)}
          >
            Cancel
          </button>
          <button
            type="button"
            class="modal-btn modal-btn--confirm"
            onclick={handleClear}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 150;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .drawer {
    background: var(--bg-white);
    border-radius: 0;
    width: 100%;
    max-width: 480px;
    height: 100%;
    margin: 0 auto;
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
    gap: var(--spacing-lg);
  }

  /* Form */
  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
  }

  .field-label-optional {
    font-weight: var(--font-weight-regular);
    color: var(--text-secondary);
  }

  .field-input {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: #f5f5f5;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }

  .field-input:focus {
    outline: none;
    border-color: var(--color-primary);
    background: #f5f5f5;
  }

  /* Remove autofill blue background */
  .field-input:-webkit-autofill,
  .field-input:-webkit-autofill:hover,
  .field-input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px #f5f5f5 inset !important;
    -webkit-text-fill-color: var(--text-primary) !important;
  }

  .duration-row {
    display: flex;
    gap: var(--spacing-sm);
  }

  .duration-btn {
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

  .duration-btn--active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }

  .generate-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs);
    width: 100%;
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

  .generate-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .generate-btn:not(:disabled):hover { opacity: 0.88; }

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

  @keyframes spin { to { transform: rotate(360deg); } }

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: #b91c1c;
  }

  /* Script section */
  .script-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .script-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .script-section-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .word-count {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  .script-container {
    position: relative;
  }

  .script-textarea {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) var(--spacing-md) 40px var(--spacing-md);
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    background: var(--bg-white);
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    line-height: var(--line-height-relaxed);
    font-family: inherit;
    transition: border-color 0.15s;
  }

  .script-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .script-footer-buttons {
    position: absolute;
    bottom: var(--spacing-lg);
    left: var(--spacing-md);
    right: var(--spacing-md);
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-sm);
    pointer-events: none;
  }

  .icon-text-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    cursor: pointer;
    transition: opacity 0.15s;
    pointer-events: all;
  }

  .icon-text-btn:hover {
    color: var(--color-primary);
  }

  .icon-text-btn:hover .icon-text-icon {
    opacity: 1;
  }

  .icon-text-icon {
    width: 14px;
    height: 14px;
    opacity: 0.7;
  }

  /* Image ideas section */
  .image-ideas-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding-bottom: 0;
  }

  .image-ideas-placeholder {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--bg-white);
    min-height: 120px;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .suggestions-list {
    list-style: none;
    margin: 0;
    padding: var(--spacing-sm) var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--bg-white);
  }

  .suggestion-item {
    display: flex;
    gap: var(--spacing-sm);
    align-items: flex-start;
    background: transparent;
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm) 0;
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
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
  }

  /* Clear button */
  .clear-button-container {
    display: flex;
    justify-content: center;
    padding: 0 var(--spacing-lg) var(--spacing-lg);
  }

  .clear-btn {
    background: none;
    border: none;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.15s;
    text-decoration: underline;
  }

  .clear-btn:not(:disabled):hover {
    color: var(--text-primary);
  }

  .clear-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .modal {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    max-width: 280px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: scaleIn 0.15s ease-out;
  }

  @keyframes scaleIn {
    from { transform: scale(0.95); opacity: 0; }
    to   { transform: scale(1); opacity: 1; }
  }

  .modal-header {
    text-align: center;
    margin-bottom: var(--spacing-lg);
  }

  .modal-title {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-md);
    justify-content: center;
  }

  .modal-btn {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--bg-white);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .modal-btn:hover {
    border-color: var(--color-border-active);
  }

  .modal-btn--confirm {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }

  .modal-btn--confirm:hover {
    opacity: 0.88;
  }
</style>
