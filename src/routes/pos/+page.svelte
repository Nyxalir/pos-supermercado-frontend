<script>
	// src/routes/pos/+page.svelte
	// Redirección o renderizado transparente al POS principal
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/');
	});
</script>

<div class="h-screen w-screen flex items-center justify-center bg-gray-100">
	<p class="text-xs text-gray-500">Cargando Terminal POS...</p>
</div>
