<script lang="ts">
  import VideoSubtitlePage from '$lib/components/VideoSubtitlePage.svelte';
</script>

<div class="app-container">
  <header class="app-header">
    <flam-nav current="subflam"></flam-nav>
    <div class="header-center">
      <img src="/icons/logo-subflam-logotype.png" alt="SubFlam" class="logotype" />
    </div>
    <div class="header-spacer"></div>
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

  .main-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }
</style>
