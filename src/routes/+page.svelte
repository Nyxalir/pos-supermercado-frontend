<script>
	// src/routes/+page.svelte
	// Terminal POS Principal - Ocupa el 100% de la pantalla (sin header superior)
	// Columna izquierda 65% (Carrito) | Columna derecha 35% (Factura)
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { carrito, totalesCarrito } from '#lib/stores/carrito.js';
	import { clienteDocumento } from '#lib/stores/cliente.js';
	import { auth } from '#lib/stores/auth.js';
	import { buscarProductos, buscarProductoPorCodigo } from '#lib/api.js';
	import FacturaTicket from '#lib/components/FacturaTicket.svelte';
	import ModalPago from '#lib/components/ModalPago.svelte';

	// Estado del Buscador Flotante (Spotlight centrado arriba)
	let buscadorFlotanteAbierto = $state(false);
	let queryBusqueda = $state('');
	let resultadosBusqueda = $state([]);
	let buscando = $state(false);
	let errorBusqueda = $state('');
	let inputBusquedaRef = $state(null);
	let mensajeScanRapido = $state('');
	let solicitudBusqueda = 0;

	// Estado del Modal de Pago
	let modalPagoAbierto = $state(false);

	// Formateador de moneda
	const formatCurrency = (val) => {
		return new Intl.NumberFormat('es-CO', {
			style: 'currency',
			currency: 'COP',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(val || 0);
	};

	// Abrir buscador flotante
	function abrirBuscador() {
		buscadorFlotanteAbierto = true;
		queryBusqueda = '';
		resultadosBusqueda = [];
		errorBusqueda = '';
		mensajeScanRapido = '';
		setTimeout(() => {
			if (inputBusquedaRef) inputBusquedaRef.focus();
		}, 60);
	}

	function cerrarBuscador() {
		buscadorFlotanteAbierto = false;
		queryBusqueda = '';
		resultadosBusqueda = [];
		errorBusqueda = '';
	}

	// Búsqueda reactiva al escribir
	async function handleInputBusqueda() {
		const q = queryBusqueda.trim();
		if (!q) {
			solicitudBusqueda++;
			buscando = false;
			resultadosBusqueda = [];
			errorBusqueda = '';
			return;
		}

		const idSolicitud = ++solicitudBusqueda;
		buscando = true;
		errorBusqueda = '';

		try {
			const prods = await buscarProductos(q);
			if (idSolicitud !== solicitudBusqueda || q !== queryBusqueda.trim()) return;

			resultadosBusqueda = Array.isArray(prods) ? prods : [];
			if (resultadosBusqueda.length === 0 && !/^\d+$/.test(q)) {
				errorBusqueda = 'No se encontraron productos con ese nombre';
			}
		} catch (err) {
			if (idSolicitud !== solicitudBusqueda || q !== queryBusqueda.trim()) return;
			console.error('Error consultando productos:', err);
			resultadosBusqueda = [];
			errorBusqueda = `No se pudo consultar el catálogo: ${err.message || 'error de conexión con el servidor'}`;
		} finally {
			if (idSolicitud === solicitudBusqueda) buscando = false;
		}
	}

	// Manejo de Enter para pistolas de código de barras
	async function handleKeyDownBusqueda(e) {
		if (e.key === 'Escape') {
			cerrarBuscador();
			return;
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			const q = queryBusqueda.trim();
			if (!q) return;

			const idSolicitud = ++solicitudBusqueda;
			buscando = true;
			errorBusqueda = '';

			try {
				// Intentar búsqueda directa por código de barras
				const prodCodigo = await buscarProductoPorCodigo(q);
				if (idSolicitud !== solicitudBusqueda || q !== queryBusqueda.trim()) return;

				if (prodCodigo) {
					carrito.agregarProducto(prodCodigo, 1);
					mensajeScanRapido = `¡${prodCodigo.nombre} agregado!`;
					queryBusqueda = '';
					resultadosBusqueda = [];
					setTimeout(() => {
						mensajeScanRapido = '';
					}, 2000);
					return;
				}
			} catch {
				if (idSolicitud !== solicitudBusqueda || q !== queryBusqueda.trim()) return;

				// Si no es por código exacto, verificar si hay un resultado único
				try {
					const prods = await buscarProductos(q);
					if (idSolicitud !== solicitudBusqueda || q !== queryBusqueda.trim()) return;

					if (Array.isArray(prods) && prods.length === 1) {
						carrito.agregarProducto(prods[0], 1);
						mensajeScanRapido = `¡${prods[0].nombre} agregado!`;
						queryBusqueda = '';
						resultadosBusqueda = [];
						setTimeout(() => {
							mensajeScanRapido = '';
						}, 2000);
						return;
					} else if (Array.isArray(prods) && prods.length > 0) {
						resultadosBusqueda = prods;
						return;
					}
					errorBusqueda = 'Código o producto no encontrado';
				} catch (err) {
					if (idSolicitud !== solicitudBusqueda) return;
					console.error('Error consultando productos:', err);
					errorBusqueda = `No se pudo consultar el catálogo: ${err.message || 'error de conexión con el servidor'}`;
				}
			} finally {
				if (idSolicitud === solicitudBusqueda) buscando = false;
			}
		}
	}

	// Seleccionar un producto de la lista
	function agregarProductoYContinuar(prod) {
		carrito.agregarProducto(prod, 1);
		mensajeScanRapido = `¡${prod.nombre} agregado!`;
		queryBusqueda = '';
		resultadosBusqueda = [];
		if (inputBusquedaRef) inputBusquedaRef.focus();
		setTimeout(() => {
			mensajeScanRapido = '';
		}, 1500);
	}

	// Manejo del botón de basura (vaciar o eliminar seleccionados)
	function handleBotonBasura() {
		if ($carrito.items.length === 0) return;

		if ($totalesCarrito.haySeleccionados) {
			carrito.eliminarSeleccionados();
		} else {
			if (confirm('¿Deseas vaciar todos los productos del carrito actual?')) {
				carrito.vaciar();
			}
		}
	}

	// Atajos globales de teclado (Ctrl+K o F2 para buscar)
	function handleGlobalKeyDown(e) {
		if ((e.ctrlKey && e.key.toLowerCase() === 'k') || e.key === 'F2') {
			e.preventDefault();
			if (buscadorFlotanteAbierto) {
				cerrarBuscador();
			} else {
				abrirBuscador();
			}
		}
	}

	// Al montar: si ya hay un cliente identificado o una sesión de admin, se queda en el POS;
	// solo redirige al login si no hay nada de eso.
	onMount(() => {
		if (!$clienteDocumento && !$auth.isAuthenticated) {
			goto('/login');
		}
	});
</script>

<svelte:window onkeydown={handleGlobalKeyDown} />

<svelte:head>
	<title>POS Supermercado</title>
</svelte:head>

<!-- CONTENEDOR PRINCIPAL: OCUPA EL 100% DEL ALTO Y ANCHO DE LA PANTALLA (SIN HEADER SUPERIOR) -->
<div class="h-screen w-screen overflow-hidden bg-gray-100 flex p-3 gap-3 font-sans select-none">
	
	<!-- ======================================================= -->
	<!-- COLUMNA IZQUIERDA: CARRITO DE COMPRAS (65% DEL ANCHO)  -->
	<!-- ======================================================= -->
	<section class="w-full h-full bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
		
		<!-- BARRA SUPERIOR DEL CARRITO -->
		<div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50/80 shrink-0">
			
			<!-- Botón 🗑️ (Vaciar o eliminar seleccionados) -->
			<div class="flex items-center space-x-2">
				<button
					type="button"
					onclick={handleBotonBasura}
					disabled={$carrito.items.length === 0}
					class="p-2.5 rounded-xl border border-gray-300 text-gray-700 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition disabled:opacity-35 disabled:cursor-not-allowed flex items-center space-x-1.5 shadow-2xs"
					title={$totalesCarrito.haySeleccionados ? 'Eliminar seleccionados' : 'Vaciar todo el carrito'}
					aria-label="Vaciar o eliminar productos seleccionados"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
					{#if $totalesCarrito.haySeleccionados}
						<span class="text-xs font-bold text-red-600">Eliminar ({$carrito.items.filter(i => i.seleccionado).length})</span>
					{/if}
				</button>

				{#if $clienteDocumento}
					<div class="hidden sm:flex items-center text-xs font-medium text-gray-500 bg-white px-2.5 py-1 rounded-lg border border-gray-200">
						<span>Cliente: <strong class="text-gray-800">{$clienteDocumento}</strong></span>
					</div>
				{/if}
			</div>

			<!-- Enlaces discretos y Botón Negro "Agregar" -->
			<div class="flex items-center space-x-3">
				
				<!-- Botón Negro "Agregar" que abre el Buscador Flotante Centrado -->
				<button
					type="button"
					onclick={abrirBuscador}
					class="py-2.5 px-5 rounded-xl bg-black hover:bg-gray-800 text-white font-extrabold text-xs uppercase tracking-wider transition shadow-sm flex items-center space-x-2"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
					<span>Agregar</span>
				</button>

			</div>

		</div>

		<!-- TABLA CENTRAL DE PRODUCTOS: [Checkbox] | Producto | Precio | Cantidad | Total -->
		<div class="flex-1 overflow-y-auto">
			<table class="w-full text-left border-collapse text-xs">
				<thead class="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-xs border-b border-gray-200">
					<tr class="text-gray-500 uppercase tracking-wider text-[11px] font-bold">
						<th class="py-3 px-4 w-10 text-center">
							<input
								type="checkbox"
								checked={$totalesCarrito.todosSeleccionados}
								onchange={(e) => carrito.toggleTodos(e.currentTarget.checked)}
								class="rounded border-gray-300 text-black focus:ring-black w-4 h-4 cursor-pointer"
								title="Seleccionar todos"
							/>
						</th>
						<th class="py-3 px-4">Producto</th>
						<th class="py-3 px-4 text-right">Precio</th>
						<th class="py-3 px-4 text-center w-36">Cantidad</th>
						<th class="py-3 px-4 text-right">Total</th>
						<th class="py-3 px-3 text-center w-10"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#if $carrito.items.length === 0}
						<tr>
							<td colspan="6" class="py-24 text-center text-gray-400">
								<div class="max-w-sm mx-auto space-y-2">
									<div class="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto text-gray-400">
										<svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
										</svg>
									</div>
									<p class="font-extrabold text-sm text-gray-700">El carrito está vacío</p>
									<p class="text-xs text-gray-400">
										Presiona el botón negro <strong>"Agregar"</strong> para buscar o escanear productos.
									</p>
								</div>
							</td>
						</tr>
					{:else}
						{#each $carrito.items as item (item.id)}
							<tr class="hover:bg-gray-50/80 transition {item.seleccionado ? 'bg-gray-50' : ''}">
								<!-- Checkbox -->
								<td class="py-3 px-4 text-center">
									<input
										type="checkbox"
										checked={item.seleccionado}
										onchange={() => carrito.toggleSeleccion(item.id)}
										class="rounded border-gray-300 text-black focus:ring-black w-4 h-4 cursor-pointer"
									/>
								</td>

								<!-- Producto -->
								<td class="py-3 px-4">
									<div class="font-bold text-gray-900 text-sm leading-tight">{item.nombre}</div>
									{#if item.codigoBarras}
										<div class="text-[10px] font-mono text-gray-400">{item.codigoBarras}</div>
									{/if}
								</td>

								<!-- Precio Unitario -->
								<td class="py-3 px-4 text-right font-medium text-gray-700 text-xs">
									{formatCurrency(item.precio)}
								</td>

								<!-- Stepper [<] número [>] -->
								<td class="py-3 px-4">
									<div class="flex items-center justify-center space-x-1.5">
										<button
											type="button"
											onclick={() => carrito.actualizarCantidad(item.id, -1)}
											disabled={item.cantidad <= 1}
											class="w-7 h-7 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-white text-gray-800 font-bold text-sm flex items-center justify-center transition shadow-2xs"
											title="Disminuir"
										>
											&minus;
										</button>

										<input
											type="number"
											min="1"
											value={item.cantidad}
											onchange={(e) => carrito.setCantidad(item.id, parseInt(e.currentTarget.value) || 1)}
											class="w-12 h-7 text-center font-bold text-xs bg-gray-50 border border-gray-300 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
										/>

										<button
											type="button"
											onclick={() => carrito.actualizarCantidad(item.id, 1)}
											class="w-7 h-7 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 text-gray-800 font-bold text-sm flex items-center justify-center transition shadow-2xs"
											title="Aumentar"
										>
											+
										</button>
									</div>
								</td>

								<!-- Total Línea -->
								<td class="py-3 px-4 text-right font-bold text-gray-900 text-sm">
									{formatCurrency(item.totalLinea)}
								</td>

								<!-- Eliminar individual -->
								<td class="py-3 px-2 text-center">
									<button
										type="button"
										onclick={() => carrito.eliminarProducto(item.id)}
										class="text-gray-300 hover:text-red-600 transition p-1"
										title="Quitar"
									>
										<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<!-- PIE DEL CARRITO: Contador "X Elementos" a la izquierda y Botón "Pagar $ Total" a la derecha -->
		<div class="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
			<div class="text-xs font-bold text-gray-600">
				<span>{$totalesCarrito.elementos} Elementos</span>
				<span class="text-gray-400 font-normal">({$totalesCarrito.totalItems} unidades)</span>
			</div>

			<div class="flex items-center space-x-2.5">
				<button
					type="button"
					onclick={() => {
						carrito.vaciar();
						clienteDocumento.clear();
						goto('/login');
					}}
					disabled={false}
					class="py-3 px-7 text-black font-bold text-sm rounded-xl transition flex items-center space-x-2.5"
				>
					<span>Cancelar</span>
				</button>

				<button
					type="button"
					onclick={() => modalPagoAbierto = true}
					disabled={$carrito.items.length === 0}
					class="py-3 px-7 bg-black hover:bg-gray-800 disabled:opacity-35 disabled:cursor-not-allowed text-white font-extrabold text-sm rounded-xl transition shadow-md flex items-center space-x-2.5"
				>
					<span>Pagar</span>
					<span class="text-base tracking-wide">{formatCurrency($totalesCarrito.total)}</span>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
					</svg>
				</button>
			</div>

		</div>

	</section>

	<!-- ======================================================= -->
	<!-- COLUMNA DERECHA: FACTURA (35% DEL ANCHO)               -->
	<!-- ======================================================= -->
	<section class="w-[35%] h-full flex flex-col justify-start overflow-y-auto">
		<FacturaTicket />
	</section>

</div>

<!-- ======================================================= -->
<!-- BUSCADOR FLOTANTE CON POSICIÓN ABSOLUTA / SPOTLIGHT      -->
<!-- RENDERIZADO EN MEDIO DE LA PANTALLA (UN POCO MÁS ARRIBA)-->
<!-- ======================================================= -->
{#if buscadorFlotanteAbierto}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 bg-black/45 backdrop-blur-xs transition-opacity"
		onclick={(e) => { if (e.target === e.currentTarget) cerrarBuscador(); }}
	>
		<div class="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl mx-4 overflow-hidden flex flex-col max-h-[70vh]">
			
			<!-- Input principal de búsqueda rápida -->
			<div class="relative p-4 border-b border-gray-200 bg-gray-50/50 flex items-center space-x-3">
				<span class="text-gray-400">
					{#if buscando}
						<svg class="animate-spin h-5 w-5 text-black" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
						</svg>
					{:else}
						<svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
						</svg>
					{/if}
				</span>

				<input
					bind:this={inputBusquedaRef}
					type="text"
					bind:value={queryBusqueda}
					oninput={handleInputBusqueda}
					onkeydown={handleKeyDownBusqueda}
					placeholder="Escanear código de barras o escribir producto..."
					class="w-full text-base font-medium text-gray-900 bg-transparent focus:outline-none placeholder-gray-400"
				/>

				<button
					type="button"
					onclick={cerrarBuscador}
					class="text-gray-400 hover:text-gray-700 p-1 rounded-lg"
					aria-label="Cerrar buscador"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<!-- Mensaje de Scan Exitoso -->
			{#if mensajeScanRapido}
				<div class="bg-emerald-50 px-4 py-2 border-b border-emerald-100 text-emerald-800 text-xs font-bold flex items-center space-x-1.5">
					<svg class="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
					</svg>
					<span>{mensajeScanRapido}</span>
				</div>
			{/if}

			<!-- Resultados de Búsqueda -->
			<div class="overflow-y-auto flex-1 divide-y divide-gray-100 max-h-[50vh]">
				{#if errorBusqueda}
					<div class="p-6 text-center text-xs text-red-600 font-semibold">
						{errorBusqueda}
					</div>
				{:else if resultadosBusqueda.length > 0}
					{#each resultadosBusqueda as prod (prod.id)}
						<button
							type="button"
							onclick={() => agregarProductoYContinuar(prod)}
							class="w-full text-left px-5 py-3 hover:bg-gray-50 flex items-center justify-between transition group"
						>
							<div>
								<span class="font-extrabold text-gray-900 text-xs block group-hover:text-black">{prod.nombre}</span>
								<span class="text-[11px] text-gray-400 font-mono">
									{prod.codigoBarras} • Stock: {prod.stock ?? 'N/D'}
								</span>
							</div>
							<div class="text-right">
								<span class="font-bold text-sm text-black block">{formatCurrency(prod.precio)}</span>
								<span class="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">+ Agregar</span>
							</div>
						</button>
					{/each}
				{:else if !queryBusqueda}
					<div class="py-8 px-6 text-center text-gray-400 text-xs">
						<svg class="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
						</svg>
						<p class="font-bold text-gray-600">Listo para escanear o escribir</p>
						<p class="text-[11px] text-gray-400 mt-0.5">Usa el lector de código de barras o escribe el nombre del producto.</p>
					</div>
				{/if}
			</div>

			<!-- Footer con atajos -->
			<div class="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-[11px] text-gray-400">
				<span>Presiona <kbd class="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono text-[10px] text-gray-700">Enter</kbd> para agregar con lector</span>
				<span><kbd class="px-1.5 py-0.5 bg-white border border-gray-300 rounded font-mono text-[10px] text-gray-700">ESC</kbd> para cerrar</span>
			</div>

		</div>
	</div>
{/if}

<!-- MODAL DE PAGO (CHECKOUT DINÁMICO) -->
<ModalPago
	abierto={modalPagoAbierto}
	alCerrar={() => modalPagoAbierto = false}
	alVentaExitosa={() => {
		// La venta fue finalizada y se muestra la factura fidedigna para imprimir
	}}
/>
