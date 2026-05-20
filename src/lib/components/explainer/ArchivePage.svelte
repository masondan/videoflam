<script lang="ts">
  import {
    listProjects,
    deleteProject,
    loadProject,
    formatProjectDate,
    formatDuration,
    type ProjectMeta,
  } from '$lib/utils/projectStorage';
  import type { VideoProject } from '$lib/stores/videoProject';

  interface Props {
    onLoad: (project: VideoProject, projectId: string) => void;
    onClose: () => void;
  }

  let { onLoad, onClose }: Props = $props();

  // ── State ─────────────────────────────────────────────────────────────────
  let projects = $state<ProjectMeta[]>(listProjects());
  let loadingId = $state<string | null>(null);
  let deletingId = $state<string | null>(null);
  let confirmDeleteId = $state<string | null>(null);
  let errorMsg = $state<string | null>(null);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleLoad(id: string) {
    loadingId = id;
    errorMsg = null;
    try {
      const project = await loadProject(id);
      if (!project) {
        errorMsg = 'Project not found — it may have been cleared from storage.';
        return;
      }
      onLoad(project, id);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Failed to load project.';
    } finally {
      loadingId = null;
    }
  }

  function requestDelete(id: string) {
    confirmDeleteId = id;
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    deletingId = confirmDeleteId;
    confirmDeleteId = null;
    try {
      await deleteProject(deletingId);
      projects = listProjects();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Failed to delete project.';
    } finally {
      deletingId = null;
    }
  }

  function cancelDelete() {
    confirmDeleteId = null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function aspectLabel(ratio: string): string {
    return ratio;
  }

  function imageCountLabel(meta: ProjectMeta): string {
    const assigned = meta.panels.filter(p => p.hasImage).length;
    const total = meta.panels.length;
    if (total === 0) return 'No panels';
    if (assigned === total) return `${total} image${total !== 1 ? 's' : ''}`;
    return `${assigned} / ${total} images`;
  }
</script>

<!-- Full-screen drawer -->
<div class="archive-overlay" role="dialog" aria-modal="true" aria-label="Saved projects">
  <div class="archive-drawer">

    <!-- Header -->
    <div class="archive-header">
      <button type="button" class="close-btn" onclick={onClose} aria-label="Close archive">
        <img src="/icons/icon-collapse.svg" alt="" class="close-icon" />
      </button>
      <h2 class="archive-title">Saved Projects</h2>
      <div class="header-spacer"></div>
    </div>

    <!-- Error banner -->
    {#if errorMsg}
      <div class="error-banner" role="alert">
        {errorMsg}
        <button type="button" class="error-dismiss" onclick={() => (errorMsg = null)}>✕</button>
      </div>
    {/if}

    <!-- Project list -->
    <div class="archive-list">
      {#if projects.length === 0}
        <div class="empty-state">
          <p class="empty-text">No saved projects yet.</p>
          <p class="empty-hint">Projects are saved automatically when you download a video.</p>
        </div>
      {:else}
        {#each projects as meta (meta.id)}
          <div class="project-card" class:project-card--loading={loadingId === meta.id}>

            <!-- Card body (tap to load) -->
            <button
              type="button"
              class="project-body"
              onclick={() => handleLoad(meta.id)}
              disabled={loadingId !== null || deletingId === meta.id}
              aria-label="Load project: {meta.label}"
            >
              {#if loadingId === meta.id}
                <span class="spinner" aria-hidden="true"></span>
              {:else}
                <!-- Thumbnail strip: show up to 3 aspect-ratio boxes -->
                <div class="thumb-strip">
                  {#each meta.panels.slice(0, 3) as panel}
                    <div
                      class="thumb-box"
                      class:thumb-box--has-image={panel.hasImage}
                      aria-hidden="true"
                    >
                      {#if !panel.hasImage}
                        <span class="thumb-empty">?</span>
                      {/if}
                    </div>
                  {/each}
                  {#if meta.panels.length > 3}
                    <div class="thumb-more">+{meta.panels.length - 3}</div>
                  {/if}
                </div>
              {/if}

              <div class="project-info">
                <p class="project-label">{meta.label}</p>
                <div class="project-meta-row">
                  <span class="meta-chip">{aspectLabel(meta.aspectRatio)}</span>
                  {#if meta.hasAudio}
                    <span class="meta-chip">{formatDuration(meta.audioDuration)}</span>
                  {/if}
                  <span class="meta-chip">{imageCountLabel(meta)}</span>
                </div>
                <p class="project-date">{formatProjectDate(meta.updatedAt)}</p>
              </div>
            </button>

            <!-- Delete button -->
            <button
              type="button"
              class="delete-btn"
              onclick={() => requestDelete(meta.id)}
              disabled={loadingId !== null || deletingId === meta.id}
              aria-label="Delete project"
            >
              {#if deletingId === meta.id}
                <span class="spinner spinner--sm" aria-hidden="true"></span>
              {:else}
                <img src="/icons/icon-trash.svg" alt="" class="delete-icon" />
              {/if}
            </button>

          </div>
        {/each}
      {/if}
    </div>

  </div>
</div>

<!-- Confirm delete modal -->
{#if confirmDeleteId}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <p class="modal-text">Delete this project? This cannot be undone.</p>
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn--secondary" onclick={cancelDelete}>
          Cancel
        </button>
        <button type="button" class="modal-btn modal-btn--danger" onclick={confirmDelete}>
          Delete
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Overlay */
  .archive-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg-white);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .archive-drawer {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
  }

  /* Header */
  .archive-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--spacing-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: var(--bg-main);
  }

  .close-icon {
    width: 20px;
    height: 20px;
  }

  .archive-title {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin: 0;
    flex: 1;
    text-align: center;
  }

  .header-spacer {
    width: 36px;
    flex-shrink: 0;
  }

  /* Error banner */
  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm);
    background: #fef2f2;
    border-bottom: 1px solid #fca5a5;
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    color: #b91c1c;
    flex-shrink: 0;
  }

  .error-dismiss {
    background: none;
    border: none;
    cursor: pointer;
    color: #b91c1c;
    font-size: var(--font-size-sm);
    padding: 0 4px;
    flex-shrink: 0;
  }

  /* List */
  .archive-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xl) var(--spacing-md);
    text-align: center;
  }

  .empty-text {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    margin: 0;
  }

  .empty-hint {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  /* Project card */
  .project-card {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--bg-white);
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .project-card:hover {
    border-color: var(--color-border-active);
  }

  .project-card--loading {
    opacity: 0.7;
  }

  /* Card body (clickable) */
  .project-body {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    min-width: 0;
  }

  .project-body:disabled {
    cursor: not-allowed;
  }

  /* Thumbnail strip */
  .thumb-strip {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    align-items: center;
  }

  .thumb-box {
    width: 28px;
    height: 40px;
    border-radius: 3px;
    background: var(--bg-main);
    border: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .thumb-box--has-image {
    background: var(--color-highlight);
    border-color: var(--color-primary);
  }

  .thumb-empty {
    font-size: 10px;
    color: var(--text-secondary);
  }

  .thumb-more {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  /* Project info */
  .project-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .project-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .meta-chip {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    background: var(--bg-main);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    white-space: nowrap;
  }

  .project-date {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    margin: 0;
  }

  /* Delete button */
  .delete-btn {
    background: none;
    border: none;
    border-left: 1px solid var(--color-border);
    cursor: pointer;
    padding: var(--spacing-sm) var(--spacing-md);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .delete-btn:hover:not(:disabled) {
    background: #fef2f2;
  }

  .delete-btn:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .delete-icon {
    width: 18px;
    height: 18px;
    opacity: 0.5;
  }

  /* Spinner */
  .spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  .spinner--sm {
    width: 14px;
    height: 14px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Confirm delete modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-md);
  }

  .modal {
    background: var(--bg-white);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    max-width: 320px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .modal-text {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    line-height: var(--line-height-normal);
    margin: 0;
  }

  .modal-actions {
    display: flex;
    gap: var(--spacing-sm);
    justify-content: flex-end;
  }

  .modal-btn {
    border: none;
    border-radius: var(--radius-md);
    padding: var(--spacing-sm) var(--spacing-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
  }

  .modal-btn--secondary {
    background: var(--bg-main);
    color: var(--text-primary);
  }

  .modal-btn--danger {
    background: #dc2626;
    color: #fff;
  }
</style>
