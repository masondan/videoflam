<script lang="ts">
  import ColorPicker from './ColorPicker.svelte';

  export type TitleFont = 'Inter' | 'Lora' | 'Roboto Slab' | 'Saira' | 'Playfair Display' | 'Bebas Neue';
  export type TitleAlign = 'left' | 'center' | 'right';

  interface Props {
    text: string;
    selectedFont: TitleFont;
    selectedAlign: TitleAlign;
    isBold: boolean;
    lineHeight: number;
    letterSpacing: number;
    textColor: string;
    labelEnabled: boolean;
    labelOpacity: number;
    labelSpace: number;
    labelColor: string;
    onTextChange: (text: string) => void;
    onFontChange: (font: TitleFont) => void;
    onAlignChange: (align: TitleAlign) => void;
    onBoldChange: (bold: boolean) => void;
    onLineHeightChange: (value: number) => void;
    onLetterSpacingChange: (value: number) => void;
    onTextColorChange: (color: string) => void;
    onLabelEnabledChange: (enabled: boolean) => void;
    onLabelOpacityChange: (value: number) => void;
    onLabelSpaceChange: (value: number) => void;
    onLabelColorChange: (color: string) => void;
  }

  let { 
    text, 
    selectedFont, 
    selectedAlign,
    isBold,
    lineHeight,
    letterSpacing,
    textColor,
    labelEnabled,
    labelOpacity,
    labelSpace,
    labelColor,
    onTextChange, 
    onFontChange, 
    onAlignChange,
    onBoldChange,
    onLineHeightChange,
    onLetterSpacingChange,
    onTextColorChange,
    onLabelEnabledChange,
    onLabelOpacityChange,
    onLabelSpaceChange,
    onLabelColorChange
  }: Props = $props();

  type TabId = 'font' | 'style' | 'label';
  let activeTab = $state<TabId>('font');

  let showTextColorPicker = $state(false);
  let showLabelColorPicker = $state(false);
  let fontDropdownOpen = $state(false);
  
  let isTextWhite = $derived(textColor.toLowerCase() === '#ffffff');

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

  const fonts: { id: TitleFont; label: string; family: string }[] = [
    { id: 'Inter', label: 'Inter', family: "'Inter', sans-serif" },
    { id: 'Lora', label: 'Lora', family: "'Lora', serif" },
    { id: 'Roboto Slab', label: 'Roboto', family: "'Roboto Slab', serif" },
    { id: 'Saira', label: 'Saira', family: "'Saira', sans-serif" },
    { id: 'Playfair Display', label: 'Playfair', family: "'Playfair Display', serif" },
    { id: 'Bebas Neue', label: 'BEBAS', family: "'Bebas Neue', sans-serif" }
  ];

  function handleTextInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onTextChange(target.value);
    autoResize(target);
  }

  function autoResize(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    const lineHeightPx = 24;
    const maxHeight = lineHeightPx * 4 + 16;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  }

  function getFontWeight(font: TitleFont): number {
    if (font === 'Inter') {
      return isBold ? 700 : 400;
    }
    if (font === 'Bebas Neue') {
      return 400;
    }
    return isBold ? 700 : 400;
  }
</script>

<div class="title-panel">
  <textarea
    class="title-input"
    placeholder="Add title"
    value={text}
    oninput={handleTextInput}
    rows="1"
  ></textarea>

  <div class="tabs">
    <button
      type="button"
      class="tab"
      class:active={activeTab === 'font'}
      onclick={() => activeTab = 'font'}
    >Font</button>
    <button
      type="button"
      class="tab"
      class:active={activeTab === 'style'}
      onclick={() => activeTab = 'style'}
    >Style</button>
    <button
      type="button"
      class="tab"
      class:active={activeTab === 'label'}
      onclick={() => activeTab = 'label'}
    >Label</button>
  </div>

  <div class="tab-content">
    {#if activeTab === 'font'}
      <!-- Font dropdown -->
      <div class="font-dropdown-wrapper">
        <button
          type="button"
          class="font-dropdown-trigger"
          class:open={fontDropdownOpen}
          onclick={() => fontDropdownOpen = !fontDropdownOpen}
          aria-expanded={fontDropdownOpen}
        >
          <span class="font-dropdown-value" style="font-family: {selectedFont}">
            {selectedFont}
          </span>
          <img
            src={fontDropdownOpen ? '/icons/icon-collapse.svg' : '/icons/icon-expand.svg'}
            alt=""
            class="font-dropdown-icon"
          />
        </button>
        
        {#if fontDropdownOpen}
          <ul class="font-dropdown-menu">
            {#each ['Inter', 'Lora', 'Roboto Slab', 'Saira', 'Playfair Display', 'Bebas Neue'] as fontName, i}
              <li>
                <button
                  type="button"
                  class="font-dropdown-option"
                  class:selected={selectedFont === fontName}
                  style="font-family: {fontName}; font-weight: {fontName === 'Inter' ? '600' : fontName === 'Roboto Slab' ? '900' : fontName === 'Saira' ? '600' : fontName === 'Playfair Display' ? '600' : '400'}; font-stretch: {fontName === 'Saira' ? 'condensed' : 'normal'}"
                  onclick={() => {
                    onFontChange(fontName as TitleFont);
                    fontDropdownOpen = false;
                  }}
                >
                  {fontName}
                </button>
              </li>
              {#if i < 5}
                <li class="font-dropdown-separator"></li>
              {/if}
            {/each}
          </ul>
        {/if}
      </div>
    {:else if activeTab === 'style'}
      <div class="style-content">
        <div class="style-row">
          <span class="style-label">Alignment</span>
          <div class="align-buttons">
            <button
              type="button"
              class="align-btn"
              class:active={selectedAlign === 'left'}
              onclick={() => onAlignChange('left')}
              aria-label="Align left"
            >
              <img src="/icons/icon-align-left.svg" alt="" class="align-icon" />
            </button>
            <button
              type="button"
              class="align-btn"
              class:active={selectedAlign === 'center'}
              onclick={() => onAlignChange('center')}
              aria-label="Align center"
            >
              <img src="/icons/icon-align-center.svg" alt="" class="align-icon" />
            </button>
            <button
              type="button"
              class="align-btn"
              class:active={selectedAlign === 'right'}
              onclick={() => onAlignChange('right')}
              aria-label="Align right"
            >
              <img src="/icons/icon-align-right.svg" alt="" class="align-icon" />
            </button>
          </div>
          <div class="bold-button">
            <span class="bold-label">Bold</span>
            <button
              type="button"
              class="icon-btn"
              class:active={isBold}
              onclick={() => onBoldChange(!isBold)}
              aria-label="Toggle bold"
              aria-pressed={isBold}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" class="bold-icon">
                <path d="M8 11H12.5C13.8807 11 15 9.88071 15 8.5C15 7.11929 13.8807 6 12.5 6H8V11ZM18 15.5C18 17.9853 15.9853 20 13.5 20H6V4H12.5C14.9853 4 17 6.01472 17 8.5C17 9.70431 16.5269 10.7981 15.7564 11.6058C17.0979 12.3847 18 13.837 18 15.5ZM8 13V18H13.5C14.8807 18 16 16.8807 16 15.5C16 14.1193 14.8807 13 13.5 13H8Z"></path>
              </svg>
            </button>
          </div>
        </div>

        <div class="style-row">
          <span class="style-label">Line space</span>
          <input
            type="range"
            class="slider"
            min="0.9"
            max="1.5"
            step="0.05"
            value={lineHeight}
            oninput={(e) => onLineHeightChange(parseFloat((e.target as HTMLInputElement).value))}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Letter space</span>
          <input
            type="range"
            class="slider"
            min="-0.05"
            max="0.1"
            step="0.01"
            value={letterSpacing}
            oninput={(e) => onLetterSpacingChange(parseFloat((e.target as HTMLInputElement).value))}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Colour</span>
          <div class="color-buttons">
            <button
              type="button"
              class="color-btn"
              class:selected={isTextWhite}
              onclick={() => onTextColorChange('#ffffff')}
              aria-label="White color"
            >
              <span class="color-swatch white"></span>
            </button>
            <button
              type="button"
              class="color-btn"
              class:selected={!isTextWhite}
              onclick={() => showTextColorPicker = true}
              aria-label="Custom color"
              style={!isTextWhite ? `--selected-color: ${textColor}` : ''}
            >
              {#if !isTextWhite}
                <span class="color-swatch" style="background: {textColor}"></span>
              {:else}
                <span class="color-swatch rainbow"></span>
              {/if}
            </button>
          </div>
        </div>
      </div>
    {:else if activeTab === 'label'}
      <div class="label-content">
        <div class="style-row">
          <span class="style-label">Opacity</span>
          <input
            type="range"
            class="slider"
            min="0"
            max="1"
            step="0.05"
            value={labelOpacity}
            oninput={(e) => onLabelOpacityChange(parseFloat((e.target as HTMLInputElement).value))}
            disabled={!labelEnabled}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Space</span>
          <input
            type="range"
            class="slider"
            min="0"
            max="1"
            step="0.05"
            value={labelSpace}
            oninput={(e) => onLabelSpaceChange(parseFloat((e.target as HTMLInputElement).value))}
            disabled={!labelEnabled}
          />
        </div>

        <div class="style-row">
          <span class="style-label">Colour</span>
          <div class="color-buttons">
            <button
              type="button"
              class="color-btn none-btn"
              class:selected={!labelEnabled}
              onclick={() => onLabelEnabledChange(false)}
              aria-label="No label"
            >
              <img src="/icons/icon-none.svg" alt="" class="none-icon" />
            </button>
            <button
              type="button"
              class="color-btn"
              class:selected={labelEnabled}
              onclick={() => {
                onLabelEnabledChange(true);
                showLabelColorPicker = true;
              }}
              aria-label="Label color"
              style={labelEnabled ? `--selected-color: ${labelColor}` : ''}
            >
              {#if labelEnabled}
                <span class="color-swatch" style="background: {labelColor}"></span>
              {:else}
                <span class="color-swatch rainbow"></span>
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if showTextColorPicker}
  <ColorPicker
    color={textColor}
    onColorChange={(color) => onTextColorChange(color)}
    onClose={() => showTextColorPicker = false}
  />
{/if}

{#if showLabelColorPicker}
  <ColorPicker
    color={labelColor}
    onColorChange={(color) => onLabelColorChange(color)}
    onClose={() => showLabelColorPicker = false}
  />
{/if}

<style>
  .title-panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .title-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-family: var(--font-family-base);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    resize: vertical;
    overflow-y: auto;
    min-height: 40px;
    max-height: 120px;
    line-height: var(--line-height-tight);
  }

  .title-input::placeholder {
    color: var(--text-secondary);
  }

  .title-input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .tabs {
    display: flex;
    gap: var(--spacing-md);
    margin-top: 8px;
    margin-bottom: var(--spacing-sm);
  }

  .tab {
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: color var(--transition-fast), font-weight var(--transition-fast);
    font-weight: var(--font-weight-medium);
  }

  .tab.active {
    color: var(--color-primary);
    font-weight: var(--font-weight-bold);
  }

  /* Style Tab */
  .style-content,
  .label-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .style-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .style-label {
    font-size: var(--font-size-sm);
    color: #1f1f1f;
    min-width: 80px;
    flex-shrink: 0;
  }

  .align-buttons {
    display: flex;
    gap: var(--spacing-xs);
  }

  .align-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #999999;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .align-btn:hover {
    background: transparent;
  }

  .align-btn.active {
    background: #555555;
    border-color: #555555;
  }

  .align-btn .align-icon {
    width: 24px;
    height: 24px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(70%) contrast(89%);
    transition: filter var(--transition-fast);
  }

  .align-btn.active .align-icon {
    filter: invert(100%) brightness(100%);
  }

  .align-icon {
    width: 24px;
    height: 24px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(70%) contrast(89%);
    transition: filter var(--transition-fast);
  }

  .bold-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-left: auto;
  }

  .bold-label {
    font-size: var(--font-size-sm);
    color: #1f1f1f;
    white-space: nowrap;
  }

  .icon-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #999999;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    padding: 0;
  }

  .icon-btn:hover {
    background: transparent;
  }

  .icon-btn.active {
    background: #555555;
    border-color: #555555;
  }

  .bold-icon {
    width: 24px;
    height: 24px;
    fill: #777777;
    transition: fill var(--transition-fast);
  }

  .icon-btn.active .bold-icon {
    fill: #ffffff;
  }

  .slider {
    flex: 1;
    height: 4px;
    background: #e0e0e0;
    border-radius: var(--radius-round);
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 20px;
    height: 20px;
    background: var(--color-primary);
    border-radius: var(--radius-round);
    cursor: pointer;
  }

  .slider::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: var(--color-primary);
    border-radius: var(--radius-round);
    cursor: pointer;
    border: none;
  }

  .slider:disabled {
    opacity: 0.5;
  }

  .color-buttons {
    display: flex;
    gap: var(--spacing-sm);
  }

  .color-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1.5px solid #999999;
    border-radius: var(--radius-round);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color var(--transition-fast);
  }

  .color-btn.selected {
    border-color: var(--selected-color, #999999);
  }

  .color-btn.none-btn {
    border: 1.5px solid #999999;
  }

  .color-btn.none-btn.selected {
    border-color: var(--color-primary);
  }

  .none-icon {
    width: 28px;
    height: 28px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(70%) contrast(89%);
  }

  .color-swatch {
    width: 22px;
    height: 22px;
    border-radius: var(--radius-round);
  }

  .color-swatch.white {
    background: #ffffff;
    border: 1px solid #999999;
  }

  .color-swatch.rainbow {
    background: conic-gradient(
      #ff0000,
      #ffff00,
      #00ff00,
      #00ffff,
      #0000ff,
      #ff00ff,
      #ff0000
    );
    border: none;
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
