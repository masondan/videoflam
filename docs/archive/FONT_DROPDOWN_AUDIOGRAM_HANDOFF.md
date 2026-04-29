# Font Dropdown Implementation for Audiogram Tab

**Status:** Ready for implementation  
**Reference Implementation:** `src/lib/components/SubtitlePanel.svelte` (completed April 2026)  
**Target:** `src/lib/components/TitlePanel.svelte` (font dropdown UI only)

---

## Overview

Add a font dropdown selector to the TitlePanel component (audiogram tab) that matches the SubtitlePanel implementation exactly. The dropdown allows users to select from 6 fonts with proper visual representation in both the dropdown menu and on the canvas.

---

## Key Changes Made to Support This (Already Completed)

### 1. CSS Font Registration (`src/app.css`)

All fonts are now properly registered with variable font support:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-VariableFont_opsz,wght.ttf') format('truetype-variations');
  font-display: swap;
  font-weight: 100 900;
}

@font-face {
  font-family: 'Lora';
  src: url('/fonts/lora.ttf') format('truetype');
  font-display: swap;
  font-weight: 400 700;
}

@font-face {
  font-family: 'Playfair Display';
  src: url('/fonts/playfair-display.ttf') format('truetype');
  font-display: swap;
  font-weight: 400 700;
}

@font-face {
  font-family: 'Roboto Slab';
  src: url('/fonts/roboto-slab.ttf') format('truetype');
  font-display: swap;
  font-weight: 400 700;
}

@font-face {
  font-family: 'Oswald';
  src: url('/fonts/Oswald-VariableFont_wght.ttf') format('truetype-variations');
  font-display: swap;
  font-weight: 200 700;
}

@font-face {
  font-family: 'Saira';
  src: url('/fonts/saira.ttf') format('truetype-variations');
  font-display: swap;
  font-weight: 100 900;
  font-stretch: 75% 100%;
}

@font-face {
  font-family: 'Bebas Neue';
  src: url('/fonts/bebas-neue.ttf') format('truetype');
  font-display: swap;
}
```

**Critical:** Saira includes `font-stretch: 75% 100%` to enable condensed width variants.

### 2. Canvas Font Rendering (`src/lib/utils/compositor.ts`)

The `renderTitleLayer()` function (line 443) already handles font rendering correctly:

```typescript
const fontFamilyMap: Record<string, string> = {
  'Inter': "'Inter', sans-serif",
  'Lora': "'Lora', serif",
  'Roboto Slab': "'Roboto Slab', serif",
  'Saira': "'Saira', sans-serif",
  'Playfair Display': "'Playfair Display', serif",
  'Bebas Neue': "'Bebas Neue', sans-serif"
};
const fontFamily = fontFamilyMap[font] || "'Inter', sans-serif";
const fontWeight = font === 'Bebas Neue' ? 400 : (bold ? (font === 'Inter' ? 800 : 700) : 400);
ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
```

**Note:** Compositor does NOT apply `font-stretch` to Saira. This is intentional—the canvas `ctx.font` property doesn't reliably support `font-stretch` in all browsers. The condensed effect is applied only in the dropdown preview (CSS) and in subtitle rendering (canvas shorthand).

### 3. Subtitle Canvas Rendering (`src/lib/utils/subtitles.ts`)

The `drawSubtitle()` function (line 318) applies `font-stretch: condensed` to Saira:

```typescript
const fontStretch = style.fontFamily === 'Saira' ? 'condensed' : 'normal';
ctx.font = `${fontStretch} ${fontWeight} ${fontPx}px '${style.fontFamily}', sans-serif`;
```

This ensures Saira renders condensed on the subtitle canvas. **Do NOT apply this to the title canvas** (compositor.ts) as it may cause rendering inconsistencies.

---

## Implementation Steps

### Step 1: Add Font Dropdown State to TitlePanel

In `src/lib/components/TitlePanel.svelte`, add state variable after line 58:

```typescript
let fontDropdownOpen = $state(false);
```

### Step 2: Add Click-Outside Handler

Add this `$effect` after the state declarations (around line 60):

```typescript
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
```

### Step 3: Add Font Dropdown UI

Insert this HTML after the existing font selection UI (find the font buttons section, around line 120-150):

```svelte
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
```

### Step 4: Add CSS Styles

Add these styles to the `<style>` block at the end of TitlePanel.svelte (copy from SubtitlePanel.svelte lines 1426–1510):

```css
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
```

---

## Font Weight & Stretch Reference

**Dropdown Display Weights (CSS):**
- **Inter**: 600 (semi-bold)
- **Lora**: 400 (regular)
- **Roboto Slab**: 900 (extra-bold, matches canvas bold=true default)
- **Saira**: 600 (semi-bold) + `font-stretch: condensed`
- **Playfair Display**: 600 (semi-bold)
- **Bebas Neue**: 400 (regular, only weight available)

**Canvas Rendering (compositor.ts):**
- **Bebas Neue**: always 400
- **Inter**: 800 (bold) or 400 (not bold)
- **All others**: 700 (bold) or 400 (not bold)

**Note:** Dropdown weights are chosen to visually represent how fonts appear on canvas with default bold=true. Saira includes `font-stretch: condensed` in dropdown only (CSS), not on canvas (compositor.ts).

---

## Testing Checklist

- [ ] Font dropdown appears in TitlePanel
- [ ] All 6 fonts render in dropdown using their actual typefaces
- [ ] Saira appears condensed in dropdown
- [ ] Roboto Slab displays at weight 900 (bold)
- [ ] Inter displays at weight 600 (semi-bold)
- [ ] Selecting a font updates the canvas title immediately
- [ ] Dropdown closes on selection
- [ ] Dropdown closes on click outside
- [ ] Font persists when switching between tabs
- [ ] No TypeScript errors

---

## Potential Issues & Mitigations

### Issue 1: Saira Not Condensed on Canvas
**Why:** Canvas `ctx.font` doesn't reliably support `font-stretch`. Applying it to title rendering may cause inconsistencies.  
**Solution:** Apply `font-stretch: condensed` only in the dropdown (CSS) and subtitle canvas (shorthand syntax). Do NOT add it to compositor.ts.

### Issue 2: Font Weight Mismatch Between Dropdown and Canvas
**Why:** Dropdown uses visual weights (600, 900) to match canvas appearance with bold=true. Canvas uses different weights (700, 800) based on bold toggle.  
**Solution:** This is intentional. Dropdown shows the "default" appearance (bold=true). Users can toggle bold independently.

### Issue 3: Oswald Not Appearing
**Why:** Oswald was missing from `@font-face` declarations.  
**Solution:** Already fixed in app.css. Oswald is now registered with variable font support (200–700).

### Issue 4: Roboto Slab Appearing as Plain Sans-Serif
**Why:** Font name mismatch. Code used 'Roboto' but CSS registered 'Roboto Slab'.  
**Solution:** Already fixed. All code now uses 'Roboto Slab' consistently.

---

## Files Modified (Reference)

1. **src/app.css** - Added Oswald @font-face, updated Saira to support width axis
2. **src/lib/utils/subtitles.ts** - Added `font-stretch: condensed` for Saira in subtitle canvas
3. **src/lib/components/SubtitlePanel.svelte** - Implemented font dropdown (reference)

## Files to Modify (This Task)

1. **src/lib/components/TitlePanel.svelte** - Add font dropdown UI, state, and styles

---

## No Changes Needed

- ✅ `src/lib/utils/compositor.ts` - Already handles fonts correctly
- ✅ `src/lib/components/AudiogramPage.svelte` - Already passes font to TitlePanel
- ✅ Font type definitions - Already aligned across all components

---

## Questions for Implementation

1. **Placement:** Should the font dropdown replace the existing font buttons, or appear alongside them?
   - **Recommendation:** Replace the existing font buttons (lines ~120-150 in TitlePanel.svelte) with the dropdown for consistency with SubtitlePanel.

2. **Styling:** Should the dropdown match the "Font" tab styling or the main panel styling?
   - **Recommendation:** Match the main panel styling (padding 6px, font-size-sm, radius-sm) as shown in SubtitlePanel.

---

## Success Criteria

- Font dropdown appears in TitlePanel with all 6 fonts
- Fonts display with correct weights and Saira appears condensed
- Selecting a font updates the canvas title immediately
- Dropdown behavior matches SubtitlePanel exactly
- No visual or functional differences between subtitle and audiogram font dropdowns
- All TypeScript checks pass

---

**Handoff Date:** April 28, 2026  
**Reference Implementation:** SubtitlePanel.svelte (completed)  
**Estimated Effort:** 30–45 minutes
