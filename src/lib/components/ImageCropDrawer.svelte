<script lang="ts">
  type AspectRatio = 'none' | '9:16' | '1:1' | '16:9';

  interface Props {
    imageUrl: string;
    currentRatio: AspectRatio;
    onDone: (ratio: AspectRatio, cropData: CropData | null) => void;
    onClose: () => void;
  }

  interface CropData {
    x: number;
    y: number;
    width: number;
    height: number;
    scale: number;
  }

  let { imageUrl, currentRatio, onDone, onClose }: Props = $props();

  let selectedRatio = $state<AspectRatio>('none');
  
  $effect(() => {
    selectedRatio = currentRatio;
  });
  let imageEl = $state<HTMLImageElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  
  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  
  let imageNaturalWidth = $state(0);
  let imageNaturalHeight = $state(0);
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  let isPinching = $state(false);
  let isDragging = $state(false);
  let lastTouchDistance = $state(0);
  let lastTouchX = $state(0);
  let lastTouchY = $state(0);

  const ratioOptions: { value: AspectRatio; label: string; icon: string }[] = [
    { value: 'none', label: 'None', icon: '/icons/icon-none.svg' },
    { value: '9:16', label: '9:16', icon: '/icons/icon-vertical.svg' },
    { value: '1:1', label: '1:1', icon: '/icons/icon-square.svg' },
    { value: '16:9', label: '16:9', icon: '/icons/icon-horizontal.svg' }
  ];

  function handleImageLoad(e: Event) {
    const img = e.target as HTMLImageElement;
    imageNaturalWidth = img.naturalWidth;
    imageNaturalHeight = img.naturalHeight;
    resetTransform();
  }

  function resetTransform() {
    scale = 1;
    translateX = 0;
    translateY = 0;
  }

  function handleRatioSelect(ratio: AspectRatio) {
    selectedRatio = ratio;
    resetTransform();
  }

  function handleDone() {
    if (selectedRatio === 'none') {
      onDone('none', null);
    } else {
      const cropData = calculateCropData();
      onDone(selectedRatio, cropData);
    }
    onClose();
  }

  function calculateCropData(): CropData | null {
    if (!imageEl || !containerEl) return null;
    
    const displayedWidth = containerWidth;
    const displayedHeight = containerWidth * (imageNaturalHeight / imageNaturalWidth);
    
    const cropBox = getCropBoxDimensions();
    if (!cropBox) return null;

    const scaleRatio = imageNaturalWidth / displayedWidth;
    
    const cropCenterX = containerWidth / 2;
    const cropCenterY = displayedHeight / 2;
    
    const imageCenterX = containerWidth / 2 + translateX;
    const imageCenterY = displayedHeight / 2 + translateY;
    
    const offsetX = (cropCenterX - imageCenterX) / scale;
    const offsetY = (cropCenterY - imageCenterY) / scale;
    
    const cropX = (displayedWidth / 2 + offsetX - cropBox.width / (2 * scale)) * scaleRatio;
    const cropY = (displayedHeight / 2 + offsetY - cropBox.height / (2 * scale)) * scaleRatio;
    const cropWidth = (cropBox.width / scale) * scaleRatio;
    const cropHeight = (cropBox.height / scale) * scaleRatio;

    return {
      x: Math.max(0, cropX),
      y: Math.max(0, cropY),
      width: Math.min(cropWidth, imageNaturalWidth),
      height: Math.min(cropHeight, imageNaturalHeight),
      scale
    };
  }

  function getCropBoxDimensions(): { width: number; height: number } | null {
    if (selectedRatio === 'none' || !containerEl) return null;
    
    const displayedHeight = containerWidth * (imageNaturalHeight / imageNaturalWidth);
    
    let targetRatio: number;
    if (selectedRatio === '9:16') targetRatio = 9 / 16;
    else if (selectedRatio === '1:1') targetRatio = 1;
    else targetRatio = 16 / 9;

    let cropWidth: number;
    let cropHeight: number;

    if (containerWidth / displayedHeight > targetRatio) {
      cropHeight = displayedHeight;
      cropWidth = cropHeight * targetRatio;
    } else {
      cropWidth = containerWidth;
      cropHeight = cropWidth / targetRatio;
    }

    return { width: cropWidth, height: cropHeight };
  }

  function getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchCenter(touches: TouchList): { x: number; y: number } {
    if (touches.length < 2) {
      return { x: touches[0].clientX, y: touches[0].clientY };
    }
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 2) {
      isPinching = true;
      isDragging = false;
      lastTouchDistance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      lastTouchX = center.x;
      lastTouchY = center.y;
    } else if (e.touches.length === 1) {
      isDragging = true;
      isPinching = false;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (isPinching && e.touches.length === 2) {
      const newDistance = getTouchDistance(e.touches);
      const rawScaleChange = newDistance / lastTouchDistance;
      const dampening = 0.3;
      const scaleChange = 1 + (rawScaleChange - 1) * dampening;
      const newScale = Math.max(0.5, Math.min(3, scale * scaleChange));
      scale = newScale;
      lastTouchDistance = newDistance;

      const center = getTouchCenter(e.touches);
      const dx = center.x - lastTouchX;
      const dy = center.y - lastTouchY;
      translateX += dx;
      translateY += dy;
      lastTouchX = center.x;
      lastTouchY = center.y;
    } else if (isDragging && e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastTouchX;
      const dy = e.touches[0].clientY - lastTouchY;
      translateX += dx;
      translateY += dy;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.touches.length === 0) {
      isPinching = false;
      isDragging = false;
    } else if (e.touches.length === 1) {
      isPinching = false;
      isDragging = true;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    }
  }

  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    isDragging = true;
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const dx = e.clientX - lastTouchX;
    const dy = e.clientY - lastTouchY;
    translateX += dx;
    translateY += dy;
    lastTouchX = e.clientX;
    lastTouchY = e.clientY;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const scaleChange = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.5, Math.min(3, scale * scaleChange));
  }

  $effect(() => {
    if (containerEl) {
      const rect = containerEl.getBoundingClientRect();
      containerWidth = rect.width;
      containerHeight = rect.height;
    }
  });
</script>

<svelte:window 
  onmousemove={handleMouseMove} 
  onmouseup={handleMouseUp}
/>

<div class="crop-drawer-overlay">
  <div class="crop-drawer">
    <header class="drawer-header">
      <div class="header-spacer"></div>
      <button type="button" class="done-btn" onclick={handleDone}>
        Done
      </button>
    </header>

    <div class="crop-content">
      <div
        class="image-container"
        bind:this={containerEl}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
        onmousedown={handleMouseDown}
        onwheel={handleWheel}
        role="application"
        aria-label="Crop area - drag to pan, pinch to zoom"
      >
        <div
          class="image-wrapper"
          style="transform: translate({translateX}px, {translateY}px) scale({scale});"
        >
          <img
            bind:this={imageEl}
            src={imageUrl}
            alt="Crop preview"
            class="crop-image"
            onload={handleImageLoad}
            draggable="false"
          />
        </div>

        {#if selectedRatio !== 'none' && imageNaturalWidth > 0}
          {@const cropBox = getCropBoxDimensions()}
          {#if cropBox}
            {@const displayedHeight = containerWidth * (imageNaturalHeight / imageNaturalWidth)}
            <div class="crop-overlay">
              <div 
                class="crop-mask-top" 
                style="height: calc(50% - {cropBox.height / 2}px);"
              ></div>
              <div class="crop-mask-middle" style="height: {cropBox.height}px;">
                <div 
                  class="crop-mask-left" 
                  style="width: calc(50% - {cropBox.width / 2}px);"
                ></div>
                <div 
                  class="crop-window" 
                  style="width: {cropBox.width}px; height: {cropBox.height}px;"
                ></div>
                <div 
                  class="crop-mask-right" 
                  style="width: calc(50% - {cropBox.width / 2}px);"
                ></div>
              </div>
              <div 
                class="crop-mask-bottom" 
                style="height: calc(50% - {cropBox.height / 2}px);"
              ></div>
            </div>
          {/if}
        {/if}
      </div>

      <div class="ratio-buttons">
        {#each ratioOptions as option}
          <button
            type="button"
            class="ratio-btn"
            class:selected={selectedRatio === option.value}
            onclick={() => handleRatioSelect(option.value)}
            aria-pressed={selectedRatio === option.value}
          >
            <div class="ratio-icon-container">
              <img 
                src={option.icon} 
                alt="" 
                class="ratio-icon"
              />
            </div>
            <span class="ratio-label">{option.label}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .crop-drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    animation: fadeIn var(--transition-fast);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .crop-drawer {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 480px;
    height: 100%;
    max-height: 100vh;
    display: flex;
    flex-direction: column;
    animation: slideUp var(--transition-normal);
    overflow: hidden;
  }

  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .header-spacer {
    width: 60px;
  }

  .done-btn {
    background: none;
    border: none;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-secondary);
    cursor: pointer;
    padding: var(--spacing-xs) var(--spacing-sm);
    transition: color var(--transition-fast);
  }

  .done-btn:hover {
    color: var(--color-primary);
  }

  .crop-content {
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .image-container {
    position: relative;
    width: 100%;
    aspect-ratio: auto;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--bg-main);
    touch-action: none;
    cursor: grab;
    user-select: none;
  }

  .image-container:active {
    cursor: grabbing;
  }

  .image-wrapper {
    transform-origin: center center;
    will-change: transform;
  }

  .crop-image {
    width: 100%;
    height: auto;
    display: block;
    pointer-events: none;
  }

  .crop-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    pointer-events: none;
  }

  .crop-mask-top,
  .crop-mask-bottom {
    width: 100%;
    background: rgba(0, 0, 0, 0.5);
  }

  .crop-mask-middle {
    display: flex;
    width: 100%;
  }

  .crop-mask-left,
  .crop-mask-right {
    background: rgba(0, 0, 0, 0.5);
  }

  .crop-window {
    border: 2px solid white;
    box-sizing: border-box;
  }

  .ratio-buttons {
    display: flex;
    gap: var(--spacing-md);
    justify-content: center;
  }

  .ratio-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .ratio-icon-container {
    width: 45px;
    height: 45px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    background: var(--bg-white);
    border: 1px solid var(--color-border);
    transition: all var(--transition-fast);
  }

  .ratio-btn.selected .ratio-icon-container {
    background: #555555;
    border-color: #555555;
  }

  .ratio-icon {
    width: 24px;
    height: 24px;
    filter: invert(46%) sepia(0%) saturate(0%) brightness(97%) contrast(89%);
    transition: filter var(--transition-fast);
  }

  .ratio-btn.selected .ratio-icon {
    filter: brightness(0) invert(1);
  }

  .ratio-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
  }
</style>
