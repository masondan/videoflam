<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    isActive: boolean;
    isOpen: boolean;
    onToggle: (active: boolean) => void;
    onOpenChange: (open: boolean) => void;
    children?: Snippet;
  }

  let { label, isActive, isOpen, onToggle, onOpenChange, children }: Props = $props();

  function handleChevronClick() {
    if (!isActive) return;
    onOpenChange(!isOpen);
  }

  function handleToggleClick() {
    const newActive = !isActive;
    onToggle(newActive);
    if (newActive && !isOpen) {
      onOpenChange(true);
    } else if (!newActive && isOpen) {
      onOpenChange(false);
    }
  }
</script>

<div class="toggle-panel" class:open={isOpen} class:active={isActive}>
  <div class="panel-header">
    <button
      type="button"
      class="chevron-btn"
      class:disabled={!isActive}
      onclick={handleChevronClick}
      aria-expanded={isOpen}
      aria-label={isOpen ? 'Collapse panel' : 'Expand panel'}
      aria-disabled={!isActive}
    >
      <img
        src={isOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
        alt=""
        class="chevron-icon"
      />
    </button>
    <span class="panel-label">{label}</span>
    <button
      type="button"
      class="toggle-switch"
      class:active={isActive}
      onclick={handleToggleClick}
      aria-pressed={isActive}
      aria-label={`Toggle ${label}`}
    >
      <span class="toggle-thumb"></span>
    </button>
  </div>
  {#if isOpen}
    <div class="panel-content">
      {#if children}
        {@render children()}
      {/if}
    </div>
  {/if}
</div>

<style>
  .toggle-panel {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }

  .toggle-panel.active {
    border-color: var(--color-border-active);
  }

  .panel-header {
    display: flex;
    align-items: center;
    padding: 12px var(--spacing-md);
    gap: var(--spacing-sm);
  }

  .chevron-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: opacity var(--transition-fast);
  }

  .chevron-btn.disabled {
    cursor: default;
    opacity: 0.4;
  }

  .chevron-icon {
    width: 16px;
    height: 16px;
    filter: invert(0.43);
    transition: transform var(--transition-fast);
  }

  .panel-label {
    flex: 1;
    font-size: var(--font-size-base);
    color: #777777;
    font-weight: var(--font-weight-medium);
    transition: color var(--transition-fast);
  }

  .toggle-panel.active .panel-label {
    color: #1f1f1f;
  }

  .toggle-switch {
    width: 44px;
    height: 24px;
    background: #999999;
    border: none;
    border-radius: var(--radius-round);
    cursor: pointer;
    position: relative;
    transition: background var(--transition-fast);
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
    background: var(--bg-white);
    border-radius: 50%;
    transition: transform var(--transition-fast);
  }

  .toggle-switch.active .toggle-thumb {
    transform: translateX(20px);
  }

  .panel-content {
    padding: var(--spacing-md) var(--spacing-md) var(--spacing-md);
    animation: slideDown var(--transition-fast);
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
