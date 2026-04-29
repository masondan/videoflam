<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    color: string;
    onColorChange: (color: string) => void;
    onClose: () => void;
  }

  let { color, onColorChange, onClose }: Props = $props();

  let hue = $state(0);
  let saturation = $state(100);
  let brightness = $state(100);
  
  let sbFieldRef = $state<HTMLDivElement | null>(null);
  let hueSliderRef = $state<HTMLDivElement | null>(null);
  let isDraggingSB = $state(false);
  let isDraggingHue = $state(false);

  function hexToHsb(hex: string): { h: number; s: number; b: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : Math.round((delta / max) * 100);
    const brightness = Math.round(max * 100);

    return { h, s, b: brightness };
  }

  function hsbToHex(h: number, s: number, b: number): string {
    const sNorm = s / 100;
    const bNorm = b / 100;
    const c = bNorm * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = bNorm - c;

    let r = 0, g = 0, bl = 0;
    if (h < 60) { r = c; g = x; bl = 0; }
    else if (h < 120) { r = x; g = c; bl = 0; }
    else if (h < 180) { r = 0; g = c; bl = x; }
    else if (h < 240) { r = 0; g = x; bl = c; }
    else if (h < 300) { r = x; g = 0; bl = c; }
    else { r = c; g = 0; bl = x; }

    const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
  }

  function updateColor() {
    const hex = hsbToHex(hue, saturation, brightness);
    onColorChange(hex);
  }

  function handleSBPointerDown(e: PointerEvent) {
    isDraggingSB = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateSBFromEvent(e);
  }

  function handleSBPointerMove(e: PointerEvent) {
    if (!isDraggingSB) return;
    updateSBFromEvent(e);
  }

  function handleSBPointerUp() {
    isDraggingSB = false;
  }

  function updateSBFromEvent(e: PointerEvent) {
    if (!sbFieldRef) return;
    const rect = sbFieldRef.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    saturation = Math.round((x / rect.width) * 100);
    brightness = Math.round((1 - y / rect.height) * 100);
    updateColor();
  }

  function handleHuePointerDown(e: PointerEvent) {
    isDraggingHue = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateHueFromEvent(e);
  }

  function handleHuePointerMove(e: PointerEvent) {
    if (!isDraggingHue) return;
    updateHueFromEvent(e);
  }

  function handleHuePointerUp() {
    isDraggingHue = false;
  }

  function updateHueFromEvent(e: PointerEvent) {
    if (!hueSliderRef) return;
    const rect = hueSliderRef.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    hue = Math.round((x / rect.width) * 360);
    updateColor();
  }

  onMount(() => {
    if (color && color.startsWith('#') && color.length === 7) {
      const hsb = hexToHsb(color);
      hue = hsb.h;
      saturation = hsb.s;
      brightness = hsb.b;
    }
  });

  let hueColor = $derived(hsbToHex(hue, 100, 100));
  let selectedColor = $derived(hsbToHex(hue, saturation, brightness));
</script>

<div 
  class="color-picker-overlay" 
  onclick={onClose} 
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="-1"
  aria-label="Close color picker"
>
  <div class="color-picker" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-label="Color picker" tabindex="0">
    <div
      class="sb-field"
      bind:this={sbFieldRef}
      style="background: linear-gradient(to right, #fff, {hueColor})"
      onpointerdown={handleSBPointerDown}
      onpointermove={handleSBPointerMove}
      onpointerup={handleSBPointerUp}
      role="slider"
      aria-label="Saturation and brightness"
      aria-valuenow={saturation}
      tabindex="0"
    >
      <div class="sb-brightness-overlay"></div>
      <div
        class="sb-selector"
        style="left: {saturation}%; top: {100 - brightness}%"
      ></div>
    </div>

    <div
      class="hue-slider"
      bind:this={hueSliderRef}
      onpointerdown={handleHuePointerDown}
      onpointermove={handleHuePointerMove}
      onpointerup={handleHuePointerUp}
      role="slider"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={hue}
      tabindex="0"
    >
      <div
        class="hue-selector"
        style="left: {(hue / 360) * 100}%"
      ></div>
    </div>

    <div class="color-preview-row">
      <div class="color-preview" style="background: {selectedColor}"></div>
      <button type="button" class="done-btn" onclick={onClose}>Done</button>
    </div>
  </div>
</div>

<style>
  .color-picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--spacing-md);
  }

  .color-picker {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
    width: 100%;
    max-width: 300px;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .sb-field {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    cursor: crosshair;
    touch-action: none;
  }

  .sb-brightness-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent, #000);
    border-radius: var(--radius-md);
    pointer-events: none;
  }

  .sb-selector {
    position: absolute;
    width: 20px;
    height: 20px;
    border: 3px solid white;
    border-radius: var(--radius-round);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .hue-slider {
    position: relative;
    width: 100%;
    height: 24px;
    border-radius: var(--radius-round);
    background: linear-gradient(
      to right,
      #ff0000,
      #ffff00,
      #00ff00,
      #00ffff,
      #0000ff,
      #ff00ff,
      #ff0000
    );
    cursor: pointer;
    touch-action: none;
  }

  .hue-selector {
    position: absolute;
    top: 50%;
    width: 20px;
    height: 20px;
    background: white;
    border: 2px solid white;
    border-radius: var(--radius-round);
    box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .color-preview-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .color-preview {
    flex: 1;
    height: 40px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
  }

  .done-btn {
    padding: var(--spacing-sm) var(--spacing-lg);
    background: var(--color-primary);
    color: white;
    border: none;
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .done-btn:hover {
    background: #4a1d9e;
  }
</style>
