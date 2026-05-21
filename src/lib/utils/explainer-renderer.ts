/**
 * Explainer video renderer — shared frame composition functions
 * Used by both preview (ExplainerPage.svelte) and export (explainer-export.ts)
 *
 * Pure functions for Ken Burns and transition rendering.
 */

import type { VideoPanel, KenBurnsPreset, TransitionPreset } from '$lib/stores/videoProject';

// ─── Easing ──────────────────────────────────────────────────────────────────

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ─── Ken Burns frame renderer ─────────────────────────────────────────────────

/**
 * Draw a single Ken Burns frame onto ctx.
 * Scale origin is canvas centre (gotcha #7 in AGENTS.md).
 */
export function drawKenBurnsFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: ImageBitmap,
  canvasWidth: number,
  canvasHeight: number,
  kenBurns: KenBurnsPreset,
  kenBurnsSpeed: number,
  progress: number // 0 → 1 within this panel
): void {
  const eased = easeInOut(progress) * kenBurnsSpeed;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  ctx.save();
  ctx.translate(cx, cy);

  let scale = 1;
  if (kenBurns === 'zoom-in') {
    scale = 1 + 0.15 * Math.min(eased, 1);
  } else if (kenBurns === 'zoom-out') {
    scale = 1.15 - 0.15 * Math.min(eased, 1);
  }

  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
  ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
  ctx.restore();
}

// ─── Transition renderer ──────────────────────────────────────────────────────

/**
 * Draw a cross-fade transition frame between two panels.
 * transitionProgress: 0 = fully outgoing, 1 = fully incoming.
 *
 * zoom-in:  outgoing scales up + fades out; incoming scales down into place + fades in.
 * zoom-out: outgoing scales down + fades out; incoming scales up into place + fades in.
 */
export function drawTransitionFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  outgoing: ImageBitmap | null,
  incoming: ImageBitmap | null,
  canvasWidth: number,
  canvasHeight: number,
  transition: TransitionPreset,
  transitionProgress: number // 0 → 1
): void {
  const t = transitionProgress;
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (transition === 'none' || (!outgoing && !incoming)) {
    // No transition — just draw incoming
    if (incoming) ctx.drawImage(incoming, 0, 0, canvasWidth, canvasHeight);
    return;
  }

  // Draw outgoing layer
  if (outgoing) {
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.translate(cx, cy);
    let outScale = 1;
    if (transition === 'zoom-in')  outScale = 1 + 0.15 * t;   // scales up as it fades out
    if (transition === 'zoom-out') outScale = 1 - 0.1 * t;    // shrinks as it fades out
    ctx.scale(outScale, outScale);
    ctx.translate(-cx, -cy);
    ctx.drawImage(outgoing, 0, 0, canvasWidth, canvasHeight);
    ctx.restore();
  }

  // Draw incoming layer
  if (incoming) {
    ctx.save();
    ctx.globalAlpha = t;
    ctx.translate(cx, cy);
    let inScale = 1;
    if (transition === 'zoom-in')  inScale = 1.15 - 0.15 * t; // starts large, settles to 1.0
    if (transition === 'zoom-out') inScale = 1 + 0.1 * (1 - t); // starts slightly large, settles
    ctx.scale(inScale, inScale);
    ctx.translate(-cx, -cy);
    ctx.drawImage(incoming, 0, 0, canvasWidth, canvasHeight);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
}

// ─── Transition window helpers ────────────────────────────────────────────────

/**
 * Returns the transition duration in seconds for a given transitionSpeed.
 * transitionSpeed 0.5 → 0.25s, 1.0 → 0.5s, 2.0 → 1.0s
 */
export function transitionDuration(transitionSpeed: number): number {
  return 0.5 * transitionSpeed;
}

/**
 * For a given currentTime, determine if we are in a transition window between
 * panel[i] and panel[i+1]. Returns { inTransition, outgoingIndex, incomingIndex, progress }
 */
export function getTransitionState(
  panels: VideoPanel[],
  currentTime: number,
  transition: TransitionPreset,
  transitionSpeed: number
): { inTransition: boolean; outgoingIndex: number; incomingIndex: number; progress: number } {
  const noTransition = { inTransition: false, outgoingIndex: -1, incomingIndex: -1, progress: 0 };

  if (transition === 'none' || panels.length < 2) return noTransition;

  const halfDur = transitionDuration(transitionSpeed) / 2;

  for (let i = 0; i < panels.length - 1; i++) {
    const boundary = panels[i].endTime;
    const windowStart = boundary - halfDur;
    const windowEnd = boundary + halfDur;

    if (currentTime >= windowStart && currentTime < windowEnd) {
      const progress = (currentTime - windowStart) / (windowEnd - windowStart);
      return { inTransition: true, outgoingIndex: i, incomingIndex: i + 1, progress };
    }
  }

  return noTransition;
}
