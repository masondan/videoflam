<script lang="ts">
  import VideoSubtitlePage from '$lib/components/VideoSubtitlePage.svelte';
</script>

<div class="app-container">
  <header class="app-header">
    <div class="header-left">
      <flam-nav current="subflam"></flam-nav>
      <img src="/icons/logo-subflam-logotype.png" alt="SubFlam" class="logotype" />
    </div>
  </header>

  <main class="main-content">
    <VideoSubtitlePage />
  </main>
</div>

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-main);
  }

  .app-header {
    padding: var(--spacing-md) var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    background: var(--bg-white);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .logotype {
    height: 26px;
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }
</style>
