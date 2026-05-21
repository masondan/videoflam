<script lang="ts">
  import type { KenBurnsPreset } from '$lib/stores/videoProject';

  interface Props {
    preset: KenBurnsPreset;
    active?: boolean;
  }

  let { preset, active = false }: Props = $props();
</script>

<div class="kb-preview" class:kb-preview--active={active} aria-hidden="true">
  <div class="kb-frame">
    <div class="kb-img-wrap" class:kb-zoom-in={preset === 'zoom-in'} class:kb-zoom-out={preset === 'zoom-out'}>
      <!-- Placeholder image: simple gradient representing a news photo -->
      <div class="kb-placeholder">
        <div class="kb-placeholder-sky"></div>
        <div class="kb-placeholder-ground"></div>
        <div class="kb-placeholder-figure"></div>
      </div>
    </div>
  </div>
  <span class="kb-label">
    {#if preset === 'none'}None{:else if preset === 'zoom-in'}Zoom In{:else}Zoom Out{/if}
  </span>
</div>

<style>
  .kb-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    padding: var(--spacing-xs);
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    transition: border-color 0.15s;
  }

  .kb-preview--active {
    border-color: var(--color-primary);
  }

  .kb-frame {
    width: 64px;
    height: 64px;
    border-radius: var(--radius-sm);
    overflow: hidden;
    background: #1a1a2e;
    position: relative;
  }

  .kb-img-wrap {
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
    transform-origin: center center;
  }

  /* Zoom In: scale 1.0 → 1.15 */
  .kb-zoom-in {
    animation: kb-anim-zoom-in 2.5s ease-in-out infinite alternate;
  }

  @keyframes kb-anim-zoom-in {
    from { transform: scale(1.0); }
    to   { transform: scale(1.15); }
  }

  /* Zoom Out: scale 1.15 → 1.0 */
  .kb-zoom-out {
    animation: kb-anim-zoom-out 2.5s ease-in-out infinite alternate;
  }

  @keyframes kb-anim-zoom-out {
    from { transform: scale(1.15); }
    to   { transform: scale(1.0); }
  }

  /* Placeholder "photo" made of CSS shapes */
  .kb-placeholder {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .kb-placeholder-sky {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 55%;
    background: linear-gradient(180deg, #4a90d9 0%, #87ceeb 100%);
  }

  .kb-placeholder-ground {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 45%;
    background: linear-gradient(180deg, #5a8a3c 0%, #3d6b28 100%);
  }

  .kb-placeholder-figure {
    position: absolute;
    bottom: 30%;
    left: 50%;
    transform: translateX(-50%);
    width: 18px;
    height: 28px;
    background: #2c3e50;
    border-radius: 3px 3px 0 0;
  }

  .kb-label {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
  }

  .kb-preview--active .kb-label {
    color: var(--color-primary);
    font-weight: var(--font-weight-semibold);
  }
</style>
