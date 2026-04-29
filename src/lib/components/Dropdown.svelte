<script lang="ts">
  interface DropdownOption {
    value: string;
    label: string;
  }

  interface Props {
    label: string;
    options: DropdownOption[];
    value: string;
    onchange: (value: string) => void;
  }

  let { label, options, value, onchange }: Props = $props();
  
  let isOpen = $state(false);
  let dropdownRef: HTMLDivElement;

  function toggle() {
    isOpen = !isOpen;
  }

  function select(optionValue: string) {
    onchange(optionValue);
    isOpen = false;
  }

  function handleClickOutside(event: MouseEvent) {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  const selectedLabel = $derived(options.find(o => o.value === value)?.label || '');
</script>

<div class="dropdown" bind:this={dropdownRef}>
  <span class="dropdown-label" id="dropdown-{label.toLowerCase().replace(/\s/g, '-')}">{label}</span>
  <button 
    type="button" 
    class="dropdown-trigger" 
    class:open={isOpen}
    onclick={toggle}
    aria-expanded={isOpen}
    aria-haspopup="listbox"
  >
    <span class="dropdown-value">{selectedLabel}</span>
    <img 
      src={isOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'} 
      alt="" 
      class="dropdown-icon"
    />
  </button>
  
  {#if isOpen}
    <ul class="dropdown-menu" role="listbox">
      {#each options as option, i}
        <li>
          <button
            type="button"
            class="dropdown-option"
            class:selected={option.value === value}
            onclick={() => select(option.value)}
            role="option"
            aria-selected={option.value === value}
          >
            <span>{option.label}</span>
          </button>
        </li>
        {#if i < options.length - 1}
          <li class="dropdown-separator" role="separator"></li>
        {/if}
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
    width: 100%;
  }

  .dropdown-label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-xs);
  }

  .dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-md);
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    cursor: pointer;
    transition: border-color var(--transition-fast);
  }

  .dropdown-trigger:hover {
    border-color: var(--text-secondary);
  }

  .dropdown-trigger.open {
    border-color: var(--color-primary);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }

  .dropdown-value {
    text-align: left;
  }

  .dropdown-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .dropdown-menu {
    position: relative;
    width: 100%;
    background: var(--bg-white);
    border: 1px solid var(--color-primary);
    border-top: none;
    border-bottom-left-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
    list-style: none;
    margin: 0;
    padding: 0;
    z-index: 100;
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

  .dropdown-option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-md);
    background: none;
    border: none;
    font-size: var(--font-size-base);
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .dropdown-option:hover {
    background-color: var(--color-highlight);
  }

  .dropdown-option.selected {
    color: var(--color-primary);
    font-weight: var(--font-weight-medium);
  }

  .dropdown-option:last-child {
    border-bottom-left-radius: var(--radius-md);
    border-bottom-right-radius: var(--radius-md);
  }

  .dropdown-separator {
    height: 1px;
    background-color: var(--color-border);
    margin: 0 var(--spacing-md);
  }
</style>
