# 3D Ken Burns — Implementation Plan for VideoFlam

**Scope:** Add depth-map-driven 3D parallax zoom (zoom-in / zoom-out) as a global Ken Burns option, alongside the existing flat zoom-in / zoom-out presets. Transitions continue to work unchanged.

**Files changed:** 4 existing files modified, 1 new file created.

---

## Overview of the approach

When the user selects "3D Zoom In" or "3D Zoom Out":

1. On image upload, a depth map is generated for that image using **Depth Anything V2 Small** (ONNX, runs entirely in the browser via `@huggingface/transformers`). The depth map is cached per-panel.
2. During preview and export, `drawKenBurnsFrame()` is called as normal — but for 3D presets it delegates to a new `draw3DParallaxFrame()` function which uses the depth map to displace pixels on a canvas, creating the parallax effect.
3. The existing export pipeline (WebCodecs / MediaRecorder) captures the canvas output unchanged — no export changes needed.
4. Transitions operate on canvas output and are unaffected.

**Cost:** Zero. Everything runs client-side. No new API calls.

---

## Step 1 — Install the ONNX depth estimation library

```bash
npm install @huggingface/transformers
```

This package (~200KB JS, downloads the 26MB quantised model on first use) enables in-browser depth estimation. The model is cached by the browser after first download.

---

## Step 2 — Create `src/lib/utils/depth-estimator.ts` (new file)

This module handles all depth estimation logic. It is lazy-loaded so it does not affect initial page load.

```typescript
// src/lib/utils/depth-estimator.ts
// Depth Anything V2 Small — in-browser depth estimation via ONNX

import { pipeline, env } from '@huggingface/transformers';

// Use CDN delivery — no local model files needed
env.allowLocalModels = false;

type DepthPipeline = Awaited<ReturnType<typeof pipeline>>;
let depthPipeline: DepthPipeline | null = null;
let loadingPromise: Promise<DepthPipeline> | null = null;

/**
 * Lazily loads the depth estimation model (once only).
 * The 26MB quantised model is cached by the browser after first download.
 */
async function getDepthPipeline(): Promise<DepthPipeline> {
  if (depthPipeline) return depthPipeline;
  if (loadingPromise) return loadingPromise;

  loadingPromise = pipeline(
    'depth-estimation',
    'onnx-community/depth-anything-v2-small',
    { device: 'webgpu', dtype: 'fp16' }  // falls back to wasm automatically
  ).then((p) => {
    depthPipeline = p;
    return p;
  });

  return loadingPromise;
}

/**
 * Generates a greyscale depth map for the given image blob.
 * Returns an ImageData (same dimensions as the source image).
 * Bright pixels = close to camera. Dark pixels = far away.
 *
 * Call once per image at upload time. Cache the result in panel state.
 * Typical time: 3–8s on mid-range Android (WebGPU), 10–20s (WASM fallback).
 */
export async function generateDepthMap(imageBlob: Blob): Promise<ImageData> {
  const pipe = await getDepthPipeline();
  const url = URL.createObjectURL(imageBlob);

  try {
    const result = await pipe(url) as { depth: { data: Float32Array; width: number; height: number } };
    const { data, width, height } = result.depth;

    // Normalise float depth values (0–1) to greyscale RGBA ImageData
    const imageData = new ImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      const v = Math.round(data[i] * 255);
      imageData.data[i * 4]     = v; // R
      imageData.data[i * 4 + 1] = v; // G
      imageData.data[i * 4 + 2] = v; // B
      imageData.data[i * 4 + 3] = 255; // A
    }

    return imageData;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Draws one frame of the 3D parallax Ken Burns effect to the canvas.
 *
 * @param ctx        - 2D canvas context to draw into
 * @param image      - The source ImageBitmap (cropped panel image)
 * @param depthMap   - ImageData from generateDepthMap()
 * @param canvasW    - Output canvas width
 * @param canvasH    - Output canvas height
 * @param progress   - Animation progress 0→1 over the panel duration
 * @param direction  - 'zoom-in' pushes camera forward; 'zoom-out' pulls back
 */
export function draw3DParallaxFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: ImageBitmap,
  depthMap: ImageData,
  canvasW: number,
  canvasH: number,
  progress: number,       // 0 → 1 over panel duration
  direction: 'zoom-in' | 'zoom-out'
): void {
  // --- Parameters ---
  const MAX_SHIFT = 18;         // Max pixel displacement from depth (tune if needed)
  const ZOOM_RANGE = 0.06;      // Zoom travels 6% of image size over full duration
  const eased = easeInOut(direction === 'zoom-in' ? progress : 1 - progress);

  // --- Off-screen work canvas for pixel displacement ---
  const srcW = depthMap.width;
  const srcH = depthMap.height;

  // Draw source image to a temp canvas to read its pixels
  const srcCanvas = new OffscreenCanvas(srcW, srcH);
  const srcCtx = srcCanvas.getContext('2d')!;
  srcCtx.drawImage(image, 0, 0, srcW, srcH);
  const srcPixels = srcCtx.getImageData(0, 0, srcW, srcH);

  // Output pixel buffer
  const outData = new ImageData(srcW, srcH);
  const depth = depthMap.data;
  const src   = srcPixels.data;
  const out   = outData.data;

  // Shift each pixel horizontally based on its depth value
  // Deeper pixels shift less (parallax foreground > background)
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const di = (y * srcW + x) * 4;
      const depthVal = depth[di] / 255;             // 0 (far) → 1 (near)
      const shift = Math.round(depthVal * MAX_SHIFT * eased * (direction === 'zoom-in' ? 1 : -1));
      const srcX = Math.min(srcW - 1, Math.max(0, x - shift));
      const si = (y * srcW + srcX) * 4;
      out[di]     = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }

  // Write displaced pixels to a temp canvas
  const outCanvas = new OffscreenCanvas(srcW, srcH);
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.putImageData(outData, 0, 0);

  // Apply Ken Burns zoom on top
  const scale = 1 + ZOOM_RANGE * eased;
  const drawW = canvasW * scale;
  const drawH = canvasH * scale;
  const offsetX = (canvasW - drawW) / 2;
  const offsetY = (canvasH - drawH) / 2;

  ctx.drawImage(outCanvas, offsetX, offsetY, drawW, drawH);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
```

> **Note for agent:** The pixel-loop approach above is the safe cross-browser baseline. If you want a faster WebGL implementation (recommended for long explainers on low-end devices), replace `draw3DParallaxFrame` with a WebGL shader approach after the baseline is working and tested.

---

## Step 3 — Update types in `src/lib/stores/videoProject.ts`

### 3a. Extend `KenBurnsPreset`

Find the existing type (likely `type KenBurnsPreset = 'none' | 'zoom-in' | 'zoom-out'`) and add the two new values:

```typescript
// BEFORE
export type KenBurnsPreset = 'none' | 'zoom-in' | 'zoom-out';

// AFTER
export type KenBurnsPreset = 'none' | 'zoom-in' | 'zoom-out' | '3d-zoom-in' | '3d-zoom-out';
```

### 3b. Add `depthMap` field to `VideoPanel`

Find the `VideoPanel` type/interface and add an optional depth map field:

```typescript
export interface VideoPanel {
  // ... existing fields unchanged ...
  depthMap?: ImageData | null;   // ADD — generated at image upload time, null until ready
}
```

---

## Step 4 — Update `src/lib/utils/explainer-renderer.ts`

### 4a. Import the new 3D function

Add at the top of the file:

```typescript
import { draw3DParallaxFrame } from './depth-estimator';
```

### 4b. Update `drawKenBurnsFrame()`

Find the existing `drawKenBurnsFrame()` function and add a branch for the two new presets. The function signature is **unchanged** — no callers need updating.

```typescript
export function drawKenBurnsFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  imageBitmap: ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  panelDuration: number,
  elapsedTime: number,
  preset: KenBurnsPreset,
  speed: KenBurnsSpeed,
  depthMap?: ImageData | null   // ADD this optional parameter
): void {

  // ADD — handle 3D presets before the existing switch/if
  if ((preset === '3d-zoom-in' || preset === '3d-zoom-out') && depthMap) {
    const progress = Math.min(1, elapsedTime / panelDuration);
    draw3DParallaxFrame(
      ctx, imageBitmap, depthMap,
      canvasWidth, canvasHeight,
      progress,
      preset === '3d-zoom-in' ? 'zoom-in' : 'zoom-out'
    );
    return;
  }

  // FALLBACK — if 3D preset selected but no depth map yet, use flat zoom-in
  if (preset === '3d-zoom-in' || preset === '3d-zoom-out') {
    // depth map still generating — fall back to flat equivalent
    const flatPreset = preset === '3d-zoom-in' ? 'zoom-in' : 'zoom-out';
    // ... call existing flat Ken Burns logic with flatPreset ...
    // (replace 'preset' with flatPreset in the existing code below this point)
  }

  // ... existing Ken Burns logic unchanged below ...
}
```

---

## Step 5 — Update `src/lib/components/ExplainerPage.svelte`

This is where depth maps are generated (at image upload) and where `depthMap` is passed through to rendering and export.

### 5a. Import depth estimator

```typescript
import { generateDepthMap } from '$lib/utils/depth-estimator';
```

### 5b. Add depth generation state

```typescript
// Track which panels have depth maps being generated
let depthMapLoading = $state<Record<number, boolean>>({});
```

### 5c. Trigger depth generation at image upload

Find the function where `panel.imageBlob` is set after a crop/upload (likely inside `uploadImage()` or the image-assign callback from `VoiceoverImagesDrawer`). After saving the image blob, add:

```typescript
// Generate depth map in background if a 3D preset might be used
// (Generate eagerly — cheap to discard if user never picks 3D)
async function generateDepthForPanel(panelIndex: number, imageBlob: Blob) {
  depthMapLoading[panelIndex] = true;
  try {
    const depthMap = await generateDepthMap(imageBlob);
    project.panels[panelIndex].depthMap = depthMap;
  } catch (e) {
    console.warn('Depth estimation failed for panel', panelIndex, e);
    project.panels[panelIndex].depthMap = null;
  } finally {
    depthMapLoading[panelIndex] = false;
  }
}

// Call this after assigning imageBlob to a panel:
generateDepthForPanel(panelIndex, imageBlob);
```

> **Note for agent:** Run this eagerly on every image upload regardless of which Ken Burns preset is selected. Depth estimation is cheap to discard, and this avoids a delay if the user later switches to a 3D preset. Run in background — do not await it in the upload handler.

### 5d. Pass `depthMap` into `renderFrame()`

Find `renderFrame(currentTime)` and locate where it calls `drawKenBurnsFrame()`. Add the `depthMap` argument:

```typescript
drawKenBurnsFrame(
  ctx,
  imageBitmap,
  canvasWidth,
  canvasHeight,
  panelDuration,
  elapsedTime,
  project.kenBurns,        // existing
  project.kenBurnsSpeed,   // existing
  currentPanel.depthMap    // ADD
);
```

### 5e. Pass `depthMap` into export

Find where `smartExportExplainer()` is called and update the options object. The `ExplainerExportOptions` interface will need to carry depth maps — see Step 6.

---

## Step 6 — Update `src/lib/utils/explainer-export.ts`

### 6a. Extend `ExplainerExportOptions`

The panels array already carries `depthMap` (added to `VideoPanel` in Step 3b), so no extra field is needed in options — the panels themselves carry the depth data. Confirm the existing `panels: VideoPanel[]` field is in `ExplainerExportOptions` and that's sufficient.

### 6b. Pass `depthMap` to `drawKenBurnsFrame()` during export render loop

Find where `drawKenBurnsFrame()` is called inside the export render loop and add the panel's `depthMap`:

```typescript
drawKenBurnsFrame(
  ctx,
  imageBitmap,
  canvasWidth,
  canvasHeight,
  panelDuration,
  elapsedTime,
  kenBurns,
  kenBurnsSpeed,
  panel.depthMap    // ADD
);
```

---

## Step 7 — Update the UI in `src/lib/components/ExplainerPage.svelte` (Pan & Zoom panel)

Find the Pan & Zoom section (the `TogglePanel` containing the Ken Burns buttons). Replace the current three-button row with the new layout:

**Target UI:**
```
[ None ]  [ Zoom In ▾ ]  [ 3D Zoom In ▾ ]
```

Where "Zoom In ▾" and "3D Zoom In ▾" are dropdowns (using the existing `Dropdown` component) offering:
- **Zoom In/Out dropdown:** `Zoom In` / `Zoom Out`
- **3D Zoom In/Out dropdown:** `3D Zoom In` / `3D Zoom Out`

```svelte
<!-- None button -->
<button
  class="kb-btn"
  class:active={project.kenBurns === 'none'}
  onclick={() => project.kenBurns = 'none'}
>
  None
</button>

<!-- Flat Ken Burns dropdown -->
<Dropdown
  label={project.kenBurns === 'zoom-out' ? 'Zoom Out' : 'Zoom In'}
  active={project.kenBurns === 'zoom-in' || project.kenBurns === 'zoom-out'}
  options={[
    { label: 'Zoom In',  value: 'zoom-in' },
    { label: 'Zoom Out', value: 'zoom-out' }
  ]}
  onSelect={(value) => project.kenBurns = value}
/>

<!-- 3D Ken Burns dropdown -->
<Dropdown
  label={project.kenBurns === '3d-zoom-out' ? '3D Zoom Out' : '3D Zoom In'}
  active={project.kenBurns === '3d-zoom-in' || project.kenBurns === '3d-zoom-out'}
  options={[
    { label: '3D Zoom In',  value: '3d-zoom-in' },
    { label: '3D Zoom Out', value: '3d-zoom-out' }
  ]}
  onSelect={(value) => project.kenBurns = value}
/>
```

### 7b. Add a loading indicator (optional but recommended)

When a 3D preset is active and any panel's depth map is still generating, show a small inline notice:

```svelte
{#if (project.kenBurns === '3d-zoom-in' || project.kenBurns === '3d-zoom-out')
     && Object.values(depthMapLoading).some(Boolean)}
  <p class="depth-loading">Analysing image depth…</p>
{/if}
```

Style `.depth-loading` with the existing muted text colour from `app.css`.

---

## Step 8 — Update `src/lib/stores/videoProject.ts` (project serialisation)

`depthMap` is an `ImageData` object which **cannot be serialised to JSON** for `localStorage`. The depth maps must be excluded from project saves and regenerated when a project is loaded.

Find the project serialisation logic in `projectStorage.ts` (or wherever `JSON.stringify` is called on the project) and strip depth maps before saving:

```typescript
// When saving:
const projectToSave = {
  ...project,
  panels: project.panels.map(p => ({ ...p, depthMap: undefined }))
};
```

When a project is loaded and images are restored from IndexedDB, call `generateDepthForPanel()` for each panel that has an `imageBlob`, just as you would on a fresh upload.

---

## Testing checklist

- [ ] Flat zoom-in and zoom-out still work correctly (no regression)
- [ ] Transitions (all presets) still work with 3D Ken Burns active
- [ ] 3D Zoom In: parallax effect visible in preview
- [ ] 3D Zoom Out: parallax effect visible in preview
- [ ] Speed slider still affects 3D presets (passed through to `draw3DParallaxFrame` via `progress` timing)
- [ ] Depth map generates automatically on image upload (no manual step)
- [ ] While depth map is generating, preview falls back to flat zoom gracefully
- [ ] Export (WebCodecs path) renders 3D effect correctly
- [ ] Export (MediaRecorder path) renders 3D effect correctly
- [ ] Project save/load: depth maps regenerate correctly on load
- [ ] Low-end device (WASM fallback): effect still works, just slower to initialise
- [ ] No console errors on panels without images assigned

---

## Notes for the agent

- **Do not touch** `drawTransitionFrame()`, `getTransitionState()`, or any transition logic. Transitions are unaffected.
- **Do not touch** `smartExportVideo()` (VideoFlam tab). This change is Explainer-only.
- The `Dropdown` component already exists — use it exactly as used for transition preset selection.
- The pixel-loop in `draw3DParallaxFrame` is intentionally simple for reliability. On first working build, test performance on a real Android device. If frame rate drops during preview, flag it — a WebGL shader replacement can be dropped in for `draw3DParallaxFrame` without touching any other file.
- The `@huggingface/transformers` package uses dynamic imports internally — Vite/SvelteKit may need `optimizeDeps` config if you see build warnings. Add to `vite.config.ts` if needed:
  ```typescript
  optimizeDeps: { exclude: ['@huggingface/transformers'] }
  ```
