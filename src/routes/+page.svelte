<script lang="ts">
  import VideoSubtitlePage from '$lib/components/VideoSubtitlePage.svelte';
  import ExplainerPage from '$lib/components/ExplainerPage.svelte';
  import { activeTabStore } from '$lib/stores/activeTab';

  type Tab = 'subtitle' | 'explainer';
  let activeTab = $state<Tab>('subtitle');

  // Keep local state in sync with the store (ExplainerPage writes to it)
  activeTabStore.subscribe((tab) => {
    if (tab) {
      activeTab = tab;
      activeTabStore.set(null); // clear after consuming
    }
  });
</script>

<div class="app-container">
  <header class="app-header">
    <div class="header-left">
      <flam-nav current="videoflam"></flam-nav>
      <img src="/logos/logo-videoflam-logotype.png" alt="VideoFlam" class="logotype" />
    </div>
    
    <nav class="header-nav" aria-label="App sections">
      <button
        type="button"
        class="nav-btn"
        class:nav-btn--active={activeTab === 'explainer'}
        onclick={() => (activeTab = 'explainer')}
        aria-label="Explainer tab"
      >
        <img src="/icons/icon-explainer.svg" alt="" class="nav-icon" />
      </button>
      
      <button
        type="button"
        class="nav-btn"
        class:nav-btn--active={activeTab === 'subtitle'}
        onclick={() => (activeTab = 'subtitle')}
        aria-label="Subtitle tab"
      >
        <img src="/icons/icon-subtitle.svg" alt="" class="nav-icon" />
      </button>
    </nav>
  </header>

  <main class="main-content">
    {#if activeTab === 'subtitle'}
      <VideoSubtitlePage />
    {:else}
      <ExplainerPage />
    {/if}
  </main>
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-white);
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--bg-white);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logotype {
    height: 26px;
    width: auto;
  }

  .header-nav {
    display: flex;
    gap: 10px;
  }

  .nav-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: none;
    background-color: #f0f0f0;
    cursor: pointer;
    transition: background-color 0.15s;
  }

  .nav-btn:hover:not(.nav-btn--active) {
    background-color: #e4e4e4;
  }

  .nav-btn--active {
    background-color: #5422b0;
  }

  .nav-icon {
    width: 22px;
    height: 22px;
  }

  .nav-btn:not(.nav-btn--active) .nav-icon {
    filter: brightness(0) saturate(100%) invert(25%) sepia(0%) saturate(0%) brightness(100%) contrast(90%);
  }

  .nav-btn.nav-btn--active .nav-icon {
    filter: brightness(0) invert(1);
  }

  /* Adjust subtitle icon size (2nd button - adjust width/height value to match explainer) */
  .nav-btn:nth-child(2) .nav-icon {
    width: 19px;
    height: 19px;
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }
</style>
