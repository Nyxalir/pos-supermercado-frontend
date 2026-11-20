<script>
	// src/routes/admin/+layout.svelte
	// Layout protector para todas las rutas administrativas (/admin/**)
	import { goto } from '$app/navigation';
	import { auth } from '#lib/stores/auth.js';
	import { onMount } from 'svelte';

	let { children } = $props();
	let autenticado = $state(false);

	onMount(() => {
		if (!auth.checkAuth()) {
			// Si no hay sesión válida en localStorage / store, expulsa a la pantalla de login ("/login")
			goto('/login');
		} else {
			autenticado = true;
		}
	});
</script>

{#if autenticado && $auth.isAuthenticated}
	{@render children()}
{:else}
	<div class="h-screen w-screen flex flex-col items-center justify-center bg-gray-100 font-sans">
		<div class="bg-white p-8 rounded-2xl shadow-md border border-gray-200 text-center space-y-3 max-w-sm w-full mx-4">
			<div class="w-10 h-10 border-3 border-black border-t-transparent rounded-full animate-spin mx-auto"></div>
			<h2 class="text-sm font-bold text-gray-900">Verificando acceso administrativo...</h2>
			<p class="text-xs text-gray-500">Se requiere inicio de sesión para acceder al panel.</p>
		</div>
	</div>
{/if}
