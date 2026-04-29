<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
</svelte:head>

<div class="app-viewport">
	{@render children()}
</div>

<style>
	:global(body) {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		min-height: 100vh;
		padding: 0;
		background: var(--color-background);
	}

	.app-viewport {
		width: 100%;
		max-width: 480px;
		min-height: 100vh;
		background: var(--color-surface);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05), var(--shadow-lg);
		overflow: hidden;
	}

	/* Mobile: full viewport, no shadow needed */
	@media (max-width: 480px) {
		:global(body) {
			padding: 0;
			align-items: stretch;
		}

		.app-viewport {
			max-width: none;
			border-radius: 0;
			box-shadow: none;
			min-height: 100vh;
		}
	}
</style>
