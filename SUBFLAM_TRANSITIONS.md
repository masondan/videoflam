# SubFlam — Dramatic Transitions Reference

**Purpose:** Implementation guide for motion-blur canvas transitions in SubFlam's `renderFrame()` pipeline  
**Style target:** Smooth but dramatic — not aggressive. Think broadcast sport replay, not TikTok hard-cut.  
**Updated:** May 2026

---

## Overview

All transitions share the same architecture:

- Implemented inside `renderFrame(currentTime)` in `VideoSubtitlePage.svelte`
- Canvas-based: `ctx.drawImage()` with clipping, transforms, and ghost-frame motion blur
- Motion blur is **simulated** via ghost frame accumulation — 8 semi-transparent copies of each clip offset along the travel axis, drawn under the sharp final frame
- Clip A = outgoing video, Clip B = incoming video
- `progress` = a 0→1 value computed from elapsed time and transition duration
- **No blank canvas is ever visible**: push transitions keep both clips filling the canvas end-to-end; zoom transitions keep one clip oversized at all times

---

## Speed Settings

Three speeds map to transition duration. Apply to all four transitions identically.

| Setting | Duration | Character |
|---------|----------|-----------|
| `slower` | `0.55s` | Still fast, perceptibly smooth — blur reads clearly |
| `normal` | `0.38s` | Default — punchy but not jarring |
| `faster` | `0.22s` | Split-second, finger-snap cut |

```typescript
// In VideoSubtitlePage.svelte — transition duration lookup
const TRANSITION_DURATION: Record<'slower' | 'normal' | 'faster', number> = {
  slower: 0.55,
  normal: 0.38,
  faster: 0.22,
};

// Retrieve from user's speed setting (matches existing slider pattern)
const transitionDuration = TRANSITION_DURATION[transitionSpeed]; // 'slower' | 'normal' | 'faster'

// progress computation (call this each renderFrame tick during a transition)
const elapsed = currentTime - transitionStartTime;
const progress = Math.min(elapsed / transitionDuration, 1); // clamp 0→1
```

### Easing note

All four transitions use **easeInOut** for travel (smooth acceleration and deceleration) and **easeInCubic / easeOutCubic** for zoom scale. At `faster` speed the easing is still applied — the curve is just compressed — which keeps the motion smooth even at 0.22s.

```typescript
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeInCubic(t: number) { return t * t * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
```

---

## Ghost Frame Motion Blur — Shared Helper

Extract this once and call it from all four transitions.

```typescript
/**
 * Draws N ghost frames of a draw function along a 2D axis,
 * simulating motion blur. Call before drawing the sharp final frame.
 *
 * @param ctx       Canvas 2D context
 * @param drawFn    Function that draws one clip (no transform, no alpha)
 * @param blurX     Total horizontal spread in px (0 for vertical-only transitions)
 * @param blurY     Total vertical spread in px (0 for horizontal-only transitions)
 * @param passes    Number of ghost frames (6–10; 8 is the sweet spot)
 * @param baseAlpha Alpha per ghost frame (lower = subtler blur)
 */
function drawMotionBlur(
  ctx: CanvasRenderingContext2D,
  drawFn: () => void,
  blurX: number,
  blurY: number,
  passes = 8,
  baseAlpha = 0.14
) {
  for (let i = 0; i < passes; i++) {
    const frac = (i / (passes - 1)) - 0.5; // -0.5 → +0.5
    const falloff = 1 - Math.abs(frac) * 0.5; // ghosts near centre are brighter
    ctx.save();
    ctx.globalAlpha = baseAlpha * falloff;
    ctx.translate(frac * blurX, frac * blurY);
    drawFn();
    ctx.restore();
  }
}
```

**Blur intensity is speed-modulated** — scale `blurX` / `blurY` / `blurSpread` by the factor below so faster transitions feel proportionally snappier and slower ones feel buttery:

```typescript
const BLUR_SCALE: Record<'slower' | 'normal' | 'faster', number> = {
  slower: 0.7,   // softer smear — you can see the blur clearly
  normal: 1.0,   // reference values used in each transition below
  faster: 1.3,   // slightly more intense — compensates for short duration
};
const blurScale = BLUR_SCALE[transitionSpeed];
```

---

## Transition 1 — Push Left

**Effect:** Both clips slide left together. A exits left, B enters from right. Horizontal motion blur smear peaks at mid-transition where apparent speed is highest.

### Claude prompt

> Add a **push-left transition** to SubFlam's `renderFrame(currentTime)`.
>
> Both clips slide left together: clip A exits left, clip B enters from the right. Use `easeInOut` on `progress`. Add horizontal motion blur using the `drawMotionBlur` helper — `blurX = Math.sin(Math.PI * progress) * 35 * blurScale`, `blurY = 0`. The blur peaks at `progress = 0.5` (highest apparent velocity) and tapers to zero at the start and end.
>
> Draw order:
> 1. Motion blur ghost passes for both clips together (one `drawFn` that draws A and B at their translated positions)
> 2. Sharp final frame: clip A at `x = -offset`, clip B at `x = W - offset`
>
> `offset = easeInOut(progress) * canvas.width`. Duration from `TRANSITION_DURATION[transitionSpeed]`.

### Canvas logic

```typescript
function renderPushLeft(
  ctx: CanvasRenderingContext2D,
  videoA: HTMLVideoElement,
  videoB: HTMLVideoElement,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  const offset = easeInOut(progress) * W;
  const blurX  = Math.sin(Math.PI * progress) * 35 * blurScale;

  // Ghost blur passes (A and B drawn together so they smear as one unit)
  drawMotionBlur(ctx, () => {
    ctx.drawImage(videoA, -offset, 0, W, H);
    ctx.drawImage(videoB, W - offset, 0, W, H);
  }, blurX, 0);

  // Sharp final frame
  ctx.drawImage(videoA, -offset, 0, W, H);
  ctx.drawImage(videoB, W - offset, 0, W, H);
}
```

**Tuning:** Increase `35` → more dramatic smear. Reduce passes in `drawMotionBlur` (e.g. 6) for a crisper, more stylised look.

---

## Transition 2 — Push Up

**Effect:** Both clips slide upward. A exits top, B enters from bottom. Vertical motion blur. Feels like a hard swipe up on a phone.

### Claude prompt

> Add a **push-up transition** to SubFlam's `renderFrame(currentTime)`.
>
> Clip A slides up and out of frame; clip B enters from below. Use `easeInOut` on `progress`. Add vertical motion blur via `drawMotionBlur` — `blurX = 0`, `blurY = Math.sin(Math.PI * progress) * 35 * blurScale`. Draw both clips in the same `drawFn` so they blur as one unit.
>
> Draw order:
> 1. Ghost blur passes for A at `y = -offset`, B at `y = H - offset`
> 2. Sharp frames at the same positions
>
> `offset = easeInOut(progress) * canvas.height`. Duration from `TRANSITION_DURATION[transitionSpeed]`.

### Canvas logic

```typescript
function renderPushUp(
  ctx: CanvasRenderingContext2D,
  videoA: HTMLVideoElement,
  videoB: HTMLVideoElement,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  const offset = easeInOut(progress) * H;
  const blurY  = Math.sin(Math.PI * progress) * 35 * blurScale;

  drawMotionBlur(ctx, () => {
    ctx.drawImage(videoA, 0, -offset, W, H);
    ctx.drawImage(videoB, 0, H - offset, W, H);
  }, 0, blurY);

  ctx.drawImage(videoA, 0, -offset, W, H);
  ctx.drawImage(videoB, 0, H - offset, W, H);
}
```

---

## Transition 3 — Zoom In (Burst)

**Effect:** Clip A zooms toward the viewer and fades, while clip B zooms up from behind to fill the canvas. Radial/zoom blur is simulated by ghost frames at slightly varying scales. No blank canvas: A stays oversized (scales to 1.6×) until B covers the frame.

### Claude prompt

> Add a **zoom-in burst transition** to SubFlam's `renderFrame(currentTime)`.
>
> - Clip A (outgoing): scales from `1.0` → `1.6` using `easeInCubic`. Alpha fades from `1` → `0` using `easeInCubic`. It always overshoots 1.0 so no blank edge is visible.
> - Clip B (incoming): scales from `0.55` → `1.0` using `easeOutCubic`. Alpha ramps from `0` → `1`.
> - Radial blur: draw 8 ghost frames of each clip at scales `± blurSpread` around their true scale. `blurSpread = Math.sin(Math.PI * progress) * 0.10 * blurScale`. Each ghost at `globalAlpha` ~0.12, centred on the canvas.
>
> Draw order (back to front):
> 1. Blur ghosts for clip B
> 2. Blur ghosts for clip A
> 3. Sharp clip A (fading out)
> 4. Sharp clip B (fading in)
>
> All draws are centred: `ctx.translate(W/2, H/2); ctx.scale(s, s); ctx.drawImage(clip, -W/2, -H/2, W, H)`.  
> Duration from `TRANSITION_DURATION[transitionSpeed]`.

### Canvas logic

```typescript
function renderZoomIn(
  ctx: CanvasRenderingContext2D,
  videoA: HTMLVideoElement,
  videoB: HTMLVideoElement,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  const scaleA      = 1.0 + easeInCubic(progress) * 0.6;
  const scaleB      = 0.55 + easeOutCubic(progress) * 0.45;
  const alphaA      = 1 - easeInCubic(progress);
  const alphaB      = Math.min(1, easeOutCubic(progress) * 1.4);
  const blurSpread  = Math.sin(Math.PI * progress) * 0.10 * blurScale;
  const passes      = 8;
  const ghostAlpha  = 0.12;

  function drawCentred(clip: HTMLVideoElement, scale: number, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(clip, -W / 2, -H / 2, W, H);
    ctx.restore();
  }

  // Blur ghosts — B first (further back)
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(videoB, scaleB + spread, ghostAlpha);
  }

  // Blur ghosts — A on top
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(videoA, scaleA + spread, ghostAlpha * alphaA);
  }

  // Sharp frames
  drawCentred(videoA, scaleA, alphaA);
  drawCentred(videoB, scaleB, alphaB);
}
```

**Why no blank canvas:** `scaleA` starts at 1.0 and grows — it always fills or overfills the canvas. `scaleB` starts at 0.55 but the ghost blur frames at nearby scales fill the centre, and by the time A fades, B is large enough to cover.

---

## Transition 4 — Zoom Out (Pull Back)

**Effect:** Clip B starts oversized (1.6×) and zooms down to fill the canvas, while clip A shrinks away and fades. Gives the sensation of being pulled back from the scene. Ghost frames radiate outward (slightly larger scales) to simulate inward motion blur.

### Claude prompt

> Add a **zoom-out pull-back transition** to SubFlam's `renderFrame(currentTime)`.
>
> - Clip B (incoming): starts at `1.6×` scale, zooms down to `1.0` using `easeOutCubic`. Always `>= 1.0` so it always fills the canvas — **draw B first** as the background.
> - Clip A (outgoing): scales from `1.0` → `0.4` using `easeInCubic`. Alpha fades from `1` → `0`.
> - Radial blur: ghost frames at `± blurSpread` around true scale. `blurSpread = Math.sin(Math.PI * progress) * 0.10 * blurScale`. For the pull-back feel, bias ghost offsets to the larger-scale side (the direction of apparent motion).
>
> Draw order (back to front):
> 1. Blur ghosts for clip B
> 2. Sharp clip B
> 3. Blur ghosts for clip A
> 4. Sharp clip A (fading out)
>
> Duration from `TRANSITION_DURATION[transitionSpeed]`.

### Canvas logic

```typescript
function renderZoomOut(
  ctx: CanvasRenderingContext2D,
  videoA: HTMLVideoElement,
  videoB: HTMLVideoElement,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  const scaleA      = 1.0 - easeInCubic(progress) * 0.6;
  const scaleB      = 1.6 - easeOutCubic(progress) * 0.6; // always >= 1.0
  const alphaA      = 1 - easeOutCubic(progress);
  const blurSpread  = Math.sin(Math.PI * progress) * 0.10 * blurScale;
  const passes      = 8;
  const ghostAlpha  = 0.12;

  function drawCentred(clip: HTMLVideoElement, scale: number, alpha: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(clip, -W / 2, -H / 2, W, H);
    ctx.restore();
  }

  // Clip B ghosts — background layer
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(videoB, scaleB + spread, ghostAlpha);
  }

  // Sharp clip B
  drawCentred(videoB, scaleB, 1);

  // Clip A ghosts on top
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(videoA, scaleA + spread, ghostAlpha * alphaA);
  }

  // Sharp clip A fading out
  drawCentred(videoA, scaleA, alphaA);
}
```

---

## Integration Pattern

```typescript
// In VideoSubtitlePage.svelte — inside renderFrame()

type TransitionType = 'push-left' | 'push-up' | 'zoom-in' | 'zoom-out' | 'none';
type TransitionSpeed = 'slower' | 'normal' | 'faster';

const TRANSITION_DURATION: Record<TransitionSpeed, number> = {
  slower: 0.55,
  normal: 0.38,
  faster: 0.22,
};

const BLUR_SCALE: Record<TransitionSpeed, number> = {
  slower: 0.7,
  normal: 1.0,
  faster: 1.3,
};

function renderFrame(currentTime: number) {
  // ... existing video/title/subtitle draw calls ...

  if (isTransitioning) {
    const elapsed  = currentTime - transitionStartTime;
    const duration = TRANSITION_DURATION[transitionSpeed];
    const progress = Math.min(elapsed / duration, 1);
    const bScale   = BLUR_SCALE[transitionSpeed];

    switch (activeTransition) {
      case 'push-left': renderPushLeft(ctx, videoA, videoB, progress, W, H, bScale); break;
      case 'push-up':   renderPushUp(ctx, videoA, videoB, progress, W, H, bScale);   break;
      case 'zoom-in':   renderZoomIn(ctx, videoA, videoB, progress, W, H, bScale);   break;
      case 'zoom-out':  renderZoomOut(ctx, videoA, videoB, progress, W, H, bScale);  break;
    }

    if (progress >= 1) isTransitioning = false;
  }
}
```

---

## Tuning Quick Reference

| Want | Change |
|------|--------|
| More dramatic smear on push | Increase `35` → `50` in `blurX/blurY` |
| More dramatic radial blur on zoom | Increase `0.10` → `0.15` in `blurSpread` |
| More ghost passes (smoother blur) | `passes = 10` or `12` |
| Subtler ghosts | `ghostAlpha = 0.08` |
| Zoom A exits faster | Increase `0.6` multiplier on `scaleA` |
| Zoom B arrives earlier | Increase starting scale from `0.55` → `0.65` |
| Slower feel without changing duration | Use `easeInOutQuart` instead of `easeInOut` |

---

*Add this file path to your Cline/Claude Code session context at the start of any transition-related task.*
