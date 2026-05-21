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
    <flam-nav current="subflam"></flam-nav>
    <div class="header-center">
      <img src="/icons/logo-subflam-logotype.png" alt="SubFlam" class="logotype" />
    </div>
    <div class="header-spacer"></div>
  </header>

  <!-- Tab bar -->
  <nav class="tab-bar" aria-label="App sections">
    <button
      type="button"
      class="tab-btn"
      class:tab-btn--active={activeTab === 'subtitle'}
      onclick={() => (activeTab = 'subtitle')}
      aria-selected={activeTab === 'subtitle'}
      role="tab"
    >
      Subtitle
    </button>
    <button
      type="button"
      class="tab-btn"
      class:tab-btn--active={activeTab === 'explainer'}
      onclick={() => (activeTab = 'explainer')}
      aria-selected={activeTab === 'explainer'}
      role="tab"
    >
      Explainer
    </button>
  </nav>

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
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--bg-white);
  }

  .header-center {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .header-spacer {
    width: 40px;
  }

  .logotype {
    height: 26px;
  }

  /* Tab bar */
  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--color-border);
    background: var(--bg-white);
    padding: 0 var(--spacing-lg);
  }

  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px; /* overlap container border */
  }

  .tab-btn--active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
    font-weight: var(--font-weight-semibold);
  }

  .tab-btn:hover:not(.tab-btn--active) {
    color: var(--text-primary);
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }
</style>
