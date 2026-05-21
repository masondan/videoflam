/**
 * Explainer video renderer — shared frame composition functions
 * Used by both preview (ExplainerPage.svelte) and export (explainer-export.ts)
 *
 * Pure functions for Ken Burns and transition rendering.
 *
 * Ken Burns Fix:
 * - Animation runs for the full panel duration (not capped at 5 seconds)
 * - Zoom rate is consistent across different clip lengths (1%, 2%, or 3% per second)
 * - Short clips get less total zoom, long clips get more (capped at 10 seconds)
 * - This ensures the visual effect feels the same speed regardless of clip duration
 *
 * Transitions (May 2026):
 * - Four dramatic transitions: zoom-in, zoom-out, push-left, push-up
 * - Ghost-frame motion blur simulated via semi-transparent offset copies
 * - Speed: 'slower' (0.55s) | 'normal' (0.38s) | 'faster' (0.22s)
 */

import type { VideoPanel, KenBurnsPreset, TransitionPreset, KenBurnsSpeed, TransitionSpeed } from '$lib/stores/videoProject';

// ─── Ken Burns zoom rate constants ────────────────────────────────────────────

export const KEN_BURNS_ZOOM_RATES: Record<KenBurnsSpeed, number> = {
  'slow': 0.01,    // 1% per second → 10% max over 10s
  'medium': 0.02,  // 2% per second → 20% max over 10s
  'fast': 0.03,    // 3% per second → 30% max over 10s
};

// ─── Transition duration constants ────────────────────────────────────────────

export const TRANSITION_DURATION: Record<TransitionSpeed, number> = {
  slower: 0.55,
  normal: 0.38,
  faster: 0.22,
};

const BLUR_SCALE: Record<TransitionSpeed, number> = {
  slower: 0.7,
  normal: 1.0,
  faster: 1.3,
};

// ─── Easing ──────────────────────────────────────────────────────────────────

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ─── Ghost-frame motion blur helper ──────────────────────────────────────────

/**
 * Draws N ghost frames of a draw function along a 2D axis,
 * simulating motion blur. Call before drawing the sharp final frame.
 */
function drawMotionBlur(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  drawFn: () => void,
  blurX: number,
  blurY: number,
  passes = 8,
  baseAlpha = 0.14
) {
  for (let i = 0; i < passes; i++) {
    const frac = (i / (passes - 1)) - 0.5; // -0.5 → +0.5
    const falloff = 1 - Math.abs(frac) * 0.5;
    ctx.save();
    ctx.globalAlpha = baseAlpha * falloff;
    ctx.translate(frac * blurX, frac * blurY);
    drawFn();
    ctx.restore();
  }
}

// ─── Ken Burns frame renderer ─────────────────────────────────────────────────

/**
 * Draw a single Ken Burns frame onto ctx.
 */
export function drawKenBurnsFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  kenBurns: KenBurnsPreset,
  kenBurnsSpeed: KenBurnsSpeed,
  progress: number,
  panelDuration: number
): void {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  ctx.save();
  ctx.translate(cx, cy);

  let scale = 1;

  if (kenBurns !== 'none') {
    const effectiveDuration = Math.min(panelDuration, 10);
    const zoomRate = KEN_BURNS_ZOOM_RATES[kenBurnsSpeed];
    const maxZoom = effectiveDuration * zoomRate;
    const eased = easeInOut(progress);

    if (kenBurns === 'zoom-in') {
      scale = 1 + maxZoom * eased;
    } else if (kenBurns === 'zoom-out') {
      scale = 1 + maxZoom * (1 - eased);
    }
  }

  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
  ctx.restore();
}

// ─── Individual transition renderers ─────────────────────────────────────────

function renderPushLeft(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  outgoing: ImageBitmap,
  incoming: ImageBitmap,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  // Clamp progress to [0, 1] to prevent blur from extending past transition end
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  
  const offset = easeInOut(clampedProgress) * W;
  const blurX  = Math.sin(Math.PI * clampedProgress) * 35 * blurScale;
  const blurAmount = Math.sin(Math.PI * clampedProgress) * 8 * blurScale;

  drawMotionBlur(ctx, () => {
    ctx.drawImage(outgoing, -offset, 0, W, H);
    ctx.drawImage(incoming, W - offset, 0, W, H);
  }, blurX, 0);

  // Sharp frames with motion blur filter
  ctx.save();
  ctx.filter = `blur(${blurAmount}px)`;
  ctx.drawImage(outgoing, -offset, 0, W, H);
  ctx.drawImage(incoming, W - offset, 0, W, H);
  ctx.restore();
}

function renderPushUp(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  outgoing: ImageBitmap,
  incoming: ImageBitmap,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  // Clamp progress to [0, 1] to prevent blur from extending past transition end
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  
  const offset = easeInOut(clampedProgress) * H;
  const blurY  = Math.sin(Math.PI * clampedProgress) * 35 * blurScale;
  const blurAmount = Math.sin(Math.PI * clampedProgress) * 8 * blurScale;

  drawMotionBlur(ctx, () => {
    ctx.drawImage(outgoing, 0, -offset, W, H);
    ctx.drawImage(incoming, 0, H - offset, W, H);
  }, 0, blurY);

  // Sharp frames with motion blur filter
  ctx.save();
  ctx.filter = `blur(${blurAmount}px)`;
  ctx.drawImage(outgoing, 0, -offset, W, H);
  ctx.drawImage(incoming, 0, H - offset, W, H);
  ctx.restore();
}

function renderZoomIn(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  outgoing: ImageBitmap,
  incoming: ImageBitmap,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  // Clamp progress to [0, 1] to prevent blur/brightness from extending past transition end
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  
  const scaleA     = 1.0 + easeInCubic(clampedProgress) * 0.6;
  const scaleB     = 0.55 + easeOutCubic(clampedProgress) * 0.45;
  const alphaA     = 1 - easeInCubic(clampedProgress);
  const alphaB     = Math.min(1, easeOutCubic(clampedProgress) * 1.4);
  const blurSpread = Math.sin(Math.PI * clampedProgress) * 0.10 * blurScale;
  
  // Motion blur on the images themselves — peaks at progress = 0.5 (mid-transition, max velocity)
  // Clamped progress ensures blur is exactly 0 at transition end (no jitter)
  const blurAmount = Math.sin(Math.PI * clampedProgress) * 10 * blurScale;
  
  // Optional: brief brightness flash at the cut point for dramatic effect
  const brightness = 1 + Math.sin(Math.PI * clampedProgress) * 0.15;
  
  const passes     = 8;
  const ghostAlpha = 0.12;

  function drawCentred(clip: ImageBitmap, scale: number, alpha: number, blur: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = `blur(${blur}px) brightness(${brightness})`;
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(clip, -W / 2, -H / 2, W, H);
    ctx.restore();
  }

  // Blur ghosts — B first (further back)
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(incoming, scaleB + spread, ghostAlpha, blurAmount);
  }

  // Blur ghosts — A on top
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(outgoing, scaleA + spread, ghostAlpha * alphaA, blurAmount);
  }

  // Sharp frames (with motion blur filter applied)
  drawCentred(outgoing, scaleA, alphaA, blurAmount);
  drawCentred(incoming, scaleB, alphaB, blurAmount);
}

function renderZoomOut(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  outgoing: ImageBitmap,
  incoming: ImageBitmap,
  progress: number,
  W: number,
  H: number,
  blurScale: number
) {
  // Clamp progress to [0, 1] to prevent blur from extending past transition end
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  
  const scaleA     = 1.0 - easeInCubic(clampedProgress) * 0.6;
  const scaleB     = 1.6 - easeOutCubic(clampedProgress) * 0.6; // always >= 1.0
  const alphaA     = 1 - easeOutCubic(clampedProgress);
  const blurSpread = Math.sin(Math.PI * clampedProgress) * 0.10 * blurScale;
  
  // Motion blur on the images themselves — peaks at progress = 0.5 (mid-transition, max velocity)
  const blurAmount = Math.sin(Math.PI * clampedProgress) * 10 * blurScale;
  
  // Optional: brief brightness flash at the cut point for dramatic effect
  const brightness = 1 + Math.sin(Math.PI * clampedProgress) * 0.15;
  
  const passes     = 8;
  const ghostAlpha = 0.12;

  function drawCentred(clip: ImageBitmap, scale: number, alpha: number, blur: number) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = `blur(${blur}px) brightness(${brightness})`;
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.drawImage(clip, -W / 2, -H / 2, W, H);
    ctx.restore();
  }

  // Clip B ghosts — background layer
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(incoming, scaleB + spread, ghostAlpha, blurAmount);
  }

  // Sharp clip B
  drawCentred(incoming, scaleB, 1, blurAmount);

  // Clip A ghosts on top
  for (let i = 0; i < passes; i++) {
    const spread = ((i / (passes - 1)) - 0.5) * blurSpread;
    drawCentred(outgoing, scaleA + spread, ghostAlpha * alphaA, blurAmount);
  }

  // Sharp clip A fading out
  drawCentred(outgoing, scaleA, alphaA, blurAmount);
}

// ─── Transition renderer (public) ─────────────────────────────────────────────

/**
 * Draw a dramatic transition frame between two panels.
 * transitionProgress: 0 = fully outgoing, 1 = fully incoming.
 */
export function drawTransitionFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  outgoing: ImageBitmap | null,
  incoming: ImageBitmap | null,
  canvasWidth: number,
  canvasHeight: number,
  transition: TransitionPreset,
  transitionProgress: number,
  transitionSpeed: TransitionSpeed = 'normal'
): void {
  const W = canvasWidth;
  const H = canvasHeight;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  if (transition === 'none' || (!outgoing && !incoming)) {
    if (incoming) ctx.drawImage(incoming, 0, 0, W, H);
    return;
  }

  // If one clip is missing, just show whichever exists
  if (!outgoing) {
    if (incoming) ctx.drawImage(incoming, 0, 0, W, H);
    return;
  }
  if (!incoming) {
    ctx.drawImage(outgoing, 0, 0, W, H);
    return;
  }

  const bScale = BLUR_SCALE[transitionSpeed];

  switch (transition) {
    case 'push-left':
      renderPushLeft(ctx, outgoing, incoming, transitionProgress, W, H, bScale);
      break;
    case 'push-up':
      renderPushUp(ctx, outgoing, incoming, transitionProgress, W, H, bScale);
      break;
    case 'zoom-in':
      renderZoomIn(ctx, outgoing, incoming, transitionProgress, W, H, bScale);
      break;
    case 'zoom-out':
      renderZoomOut(ctx, outgoing, incoming, transitionProgress, W, H, bScale);
      break;
  }

  ctx.globalAlpha = 1;
}

// ─── Transition window helpers ────────────────────────────────────────────────

/**
 * Returns the transition duration in seconds for a given TransitionSpeed.
 */
export function transitionDuration(speed: TransitionSpeed): number {
  return TRANSITION_DURATION[speed];
}

/**
 * For a given currentTime, determine if we are in a transition window between
 * panel[i] and panel[i+1]. Returns { inTransition, outgoingIndex, incomingIndex, progress }
 */
export function getTransitionState(
  panels: VideoPanel[],
  currentTime: number,
  transition: TransitionPreset,
  transitionSpeed: TransitionSpeed
): { inTransition: boolean; outgoingIndex: number; incomingIndex: number; progress: number } {
  const noTransition = { inTransition: false, outgoingIndex: -1, incomingIndex: -1, progress: 0 };

  if (transition === 'none' || panels.length < 2) return noTransition;

  const halfDur = transitionDuration(transitionSpeed) / 2;

  for (let i = 0; i < panels.length - 1; i++) {
    // Anchor transition to where panel display ends (next panel's audio start)
    // This respects frame-holding: panel i displays from its audio start
    // through the silence gap until panel i+1's audio begins.
    const boundary = panels[i + 1].startTime;
    const windowStart = boundary - halfDur;
    const windowEnd = boundary + halfDur;

    if (currentTime >= windowStart && currentTime < windowEnd) {
      const progress = (currentTime - windowStart) / (windowEnd - windowStart);
      return { inTransition: true, outgoingIndex: i, incomingIndex: i + 1, progress };
    }
  }

  return noTransition;
}
