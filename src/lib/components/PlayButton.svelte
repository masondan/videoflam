<script lang="ts">
  export let state: 'inactive' | 'active' | 'loading' | 'playing' = 'inactive';
  export let disabled: boolean = false;
  export let onclick: (() => void) | undefined = undefined;
  export let ariaLabel: string = 'Play';
  export let countdownNumber: number | null = null;

  // Determine which icon to show based on state
  let iconSrc: string;
  let iconAlt: string;

  $: {
    if (state === 'loading') {
      iconSrc = '/icons/icon-square-new.svg';
      iconAlt = 'Stop';
    } else if (state === 'playing') {
      iconSrc = '/icons/icon-pause-new.svg';
      iconAlt = 'Pause';
    } else {
      iconSrc = '/icons/icon-play-new.svg';
      iconAlt = 'Play';
    }
  }
</script>

<button
  type="button"
  class="play-button"
  class:inactive={state === 'inactive'}
  class:active={state === 'active'}
  class:loading={state === 'loading'}
  class:playing={state === 'playing'}
  {disabled}
  {onclick}
  aria-label={ariaLabel}
>
  {#if countdownNumber !== null}
    <span class="countdown-number-text">{countdownNumber}</span>
  {:else}
    <img src={iconSrc} alt={iconAlt} class="play-button-icon" />
  {/if}
</button>

<style>
  .play-button {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #999999;
    border: 2px solid #999999;
    border-radius: var(--radius-round);
    cursor: pointer;
    transition: border-color var(--transition-normal), background-color var(--transition-normal);
    flex-shrink: 0;
    position: relative;
    overflow: visible;
    -webkit-appearance: none;
    appearance: none;
    padding: 0;
  }

  /* Inactive state (grey) */
  .play-button.inactive {
    background: #999999;
    border-color: #999999;
  }

  /* Active state (purple, ready to click) */
  .play-button.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  /* Loading state: solid purple circle with outer spinning ring */
  .play-button.loading {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  /* Outer spinning ring (visible during loading) */
  .play-button.loading::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: var(--radius-round);
    background: conic-gradient(from 0deg, var(--color-highlight), var(--color-primary), var(--color-highlight));
    animation: spinner-rotate 1s linear infinite;
    z-index: 1;
    pointer-events: none;
  }

  /* Playing state */
  .play-button.playing {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  /* Countdown number styling */
  .countdown-number-text {
    font-size: 1.5rem;
    font-weight: var(--font-weight-bold);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 2;
    line-height: 1;
  }

  /* Icon styling */
  .play-button-icon {
    width: 32px;
    height: 32px;
    filter: brightness(0) invert(1);
    position: relative;
    z-index: 2;
  }

  /* Stop icon (smaller) - scale down when loading */
  .play-button.loading .play-button-icon {
    width: 24px;
    height: 24px;
    filter: brightness(0) invert(1);
  }

  /* Inactive icon (grey, inverted to white on grey) */
  .play-button.inactive .play-button-icon {
    filter: brightness(0) invert(1);
  }

  /* Active/loading/playing icons (white on purple) */
  .play-button.active .play-button-icon,
  .play-button.loading .play-button-icon,
  .play-button.playing .play-button-icon {
    filter: brightness(0) invert(1);
  }

  /* Disabled state */
  .play-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  @keyframes spinner-rotate {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
