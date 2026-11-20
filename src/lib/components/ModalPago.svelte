<script>
	// src/lib/components/ModalPago.svelte
	// Modal de checkout dinámico con validación de cupón, cédula prellenada y soporte para Efectivo, Tarjeta y QR
	import { goto } from '$app/navigation';
	import { carrito, totalesCarrito } from '#lib/stores/carrito.js';
	import { clienteDocumento } from '#lib/stores/cliente.js';
	import { validarCupon, procesarVenta } from '#lib/api.js';
	import FacturaTicket from '#lib/components/FacturaTicket.svelte';

	// Props con Svelte 5 runes
	let { abierto = false, alCerrar = () => {}, alVentaExitosa = () => {} } = $props();

	// Estado local del modal
	let documentoCliente = $state('');
	let metodoPago = $state('EFECTIVO'); // 'EFECTIVO' | 'TARJETA' | 'QR'
	let montoRecibido = $state('');
	let codigoCuponInput = $state('');

	let validandoCupon = $state(false);
	let mensajeCupon = $state(null); // { tipo: 'exito' | 'error', texto: string } | null

	let procesando = $state(false);
	let errorProceso = $state(null);
	let ventaFinalizada = $state(null);

	// Prellenar con la cédula del cliente si viene desde el acceso inicial y aún no se ha digitado
	$effect(() => {
		if (abierto && !documentoCliente && $clienteDocumento) {
			documentoCliente = $clienteDocumento;
		}
	});

	// Formateador de moneda
	const formatCurrency = (val) => {
		return new Intl.NumberFormat('es-CO', {
			style: 'currency',
			currency: 'COP',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(val || 0);
	};

	// Cálculo reactivo de cambio / vueltas para pago en efectivo
	let cambio = $derived(() => {
		if (metodoPago !== 'EFECTIVO') return 0;
		const recibidoNum = parseFloat(montoRecibido) || 0;
		const total = $totalesCarrito.total;
		return Math.max(0, recibidoNum - total);
	});

	let faltaDinero = $derived(() => {
		if (metodoPago !== 'EFECTIVO') return false;
		const recibidoNum = parseFloat(montoRecibido) || 0;
		return recibidoNum > 0 && recibidoNum < $totalesCarrito.total;
	});

	let faltante = $derived(() => {
		if (metodoPago !== 'EFECTIVO') return 0;
		const recibidoNum = parseFloat(montoRecibido) || 0;
		return Math.max(0, $totalesCarrito.total - recibidoNum);
	});

	// Botones de monto rápido para efectivo
	function setMontoRapido(monto) {
		montoRecibido = monto.toString();
	}

	function setMontoExacto() {
		montoRecibido = Math.ceil($totalesCarrito.total).toString();
	}

	// Validación de cupón
	async function handleValidarCupon() {
		if (!codigoCuponInput.trim()) {
			mensajeCupon = { tipo: 'error', texto: 'Ingresa un código de cupón' };
			return;
		}

		validandoCupon = true;
		mensajeCupon = null;

		try {
			const res = await validarCupon(codigoCuponInput.trim());
			if (res && res.activo && res.descuentoPorcentaje) {
				carrito.aplicarCupon({
					codigo: res.codigo,
					descuentoPorcentaje: Number(res.descuentoPorcentaje)
				});
				mensajeCupon = {
					tipo: 'exito',
					texto: `¡Cupón válido! Descuento del ${res.descuentoPorcentaje}% aplicado.`
				};
			} else {
				mensajeCupon = { tipo: 'error', texto: 'El cupón no está activo o es inválido' };
			}
		} catch (err) {
			mensajeCupon = {
				tipo: 'error',
				texto: err.message || 'Cupón inválido o expirado'
			};
		} finally {
			validandoCupon = false;
		}
	}

	function handleRemoverCupon() {
		carrito.removerCupon();
		codigoCuponInput = '';
		mensajeCupon = null;
	}

	// Procesar compra
	async function handleProcesarCompra() {
		if (!documentoCliente.trim()) {
			errorProceso = 'Por favor ingresa la cédula o documento del cliente';
			return;
		}

		if ($carrito.items.length === 0) {
			errorProceso = 'El carrito está vacío';
			return;
		}

		const total = $totalesCarrito.total;
		const recibidoNum = parseFloat(montoRecibido) || 0;

		if (metodoPago === 'EFECTIVO' && recibidoNum < total) {
			errorProceso = `El monto recibido (${formatCurrency(recibidoNum)}) es menor al total a pagar (${formatCurrency(total)})`;
			return;
		}

		procesando = true;
		errorProceso = null;

		try {
			const itemsCompradosSnapshot = $carrito.items.map(item => ({
				id: item.id,
				nombre: item.nombre,
				precioUnitario: item.precio,
				ivaPorcentaje: item.ivaPorcentaje,
				cantidad: item.cantidad,
				totalLinea: item.totalLinea,
				codigoBarras: item.codigoBarras
			}));

			const payload = {
				documentoCliente: documentoCliente.trim(),
				codigoCupon: $totalesCarrito.cupon ? $totalesCarrito.cupon.codigo : null,
				items: itemsCompradosSnapshot.map(item => ({
					productoId: item.id,
					codigoBarras: item.codigoBarras,
					cantidad: item.cantidad
				})),
				pago: {
					metodo: metodoPago,
					recibido: metodoPago === 'EFECTIVO' ? recibidoNum : total,
					numeroTarjeta: metodoPago === 'TARJETA' ? '**** **** **** 8821' : null,
					titular: metodoPago === 'TARJETA' ? 'CLIENTE POS' : null,
					referenciaQR: metodoPago === 'QR' ? `QR-${Date.now().toString(36).toUpperCase()}` : null
				}
			};

			const resultado = await procesarVenta(payload);
			
			// Asegurar que detalles tenga los items reales para la impresión fidedigna
			if (!resultado.detalles || resultado.detalles.length === 0) {
				resultado.detalles = itemsCompradosSnapshot;
			}
			if (!resultado.pago) {
				resultado.pago = payload.pago;
			}

			ventaFinalizada = resultado;
			alVentaExitosa(resultado);
		} catch (err) {
			errorProceso = err.message || 'Error al procesar la venta en el backend';
		} finally {
			procesando = false;
		}
	}

	// Finalizar compra, limpiar estado y redirigir al login
	function handleCerrarVenta() {
		carrito.vaciar();
		clienteDocumento.clear();
		documentoCliente = '';
		montoRecibido = '';
		codigoCuponInput = '';
		mensajeCupon = null;
		errorProceso = null;
		ventaFinalizada = null;
		alCerrar();
		goto('/login');
	}

	// Imprimir factura real
	function imprimirFactura() {
		window.print();
	}
</script>

{#if abierto}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity print:p-0 print:bg-white">
		<div class="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh] print:max-w-none print:max-h-none print:shadow-none print:border-none">
			
			<!-- Encabezado del Modal (Se oculta al imprimir) -->
			<div class="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 bg-gray-50/80 print:hidden">
				<div class="flex items-center space-x-2">
					<div class="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">
						$
					</div>
					<div>
						<h3 class="text-base font-bold text-gray-900">
							{ventaFinalizada ? 'Factura Emitida con Éxito' : 'Finalizar Venta / Pago'}
						</h3>
						<p class="text-xs text-gray-500">
							{ventaFinalizada ? `Factura N° ${ventaFinalizada.numeroFactura}` : 'Completa los datos de pago del cliente'}
						</p>
					</div>
				</div>
				{#if !ventaFinalizada}
					<button
						onclick={alCerrar}
						class="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
						aria-label="Cerrar modal"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>

			<!-- Vista de Factura Exitosa con Ticket Fidedigno -->
			{#if ventaFinalizada}
				<div class="p-6 overflow-y-auto space-y-4 text-center print:p-0">
					
					<!-- Alerta de éxito (solo en pantalla) -->
					<div class="flex items-center justify-center space-x-2 text-emerald-700 bg-emerald-50 py-2 px-3 rounded-xl border border-emerald-200 print:hidden">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						<span class="font-bold text-xs uppercase tracking-wider">Transacción Aprobada • Factura {ventaFinalizada.numeroFactura}</span>
					</div>

					<!-- Visualización fiel del Ticket de Papel con los elementos reales comprados -->
					<div class="max-h-[50vh] overflow-y-auto p-1 print:max-h-none print:overflow-visible">
						<FacturaTicket factura={ventaFinalizada} />
					</div>

					<!-- Botones de Acción (Se ocultan al imprimir) -->
					<div class="flex space-x-3 pt-2 print:hidden">
						<button
							type="button"
							onclick={imprimirFactura}
							class="flex-1 py-3 px-4 rounded-xl border border-gray-300 hover:bg-gray-100 text-gray-800 font-semibold text-xs transition flex items-center justify-center space-x-2"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
							</svg>
							<span>Imprimir Factura</span>
						</button>
						<button
							type="button"
							onclick={handleCerrarVenta}
							class="flex-1 py-3 px-4 rounded-xl bg-black hover:bg-gray-800 text-white font-semibold text-xs transition flex items-center justify-center space-x-2 shadow-md"
						>
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
							<span>Cerrar</span>
						</button>
					</div>
				</div>

			<!-- Formulario de Checkout Dinámico -->
			{:else}
				<div class="p-6 overflow-y-auto space-y-4">
					
					<!-- 1. Input Cédula del Cliente (Prellenada y Corregible) -->
					<div>
						<div class="flex justify-between items-center mb-1">
							<label for="docCliente" class="block text-xs font-bold uppercase tracking-wider text-gray-700">
								Cédula / Documento del Cliente <span class="text-red-500">*</span>
							</label>
							{#if $clienteDocumento && documentoCliente === $clienteDocumento}
								<span class="text-[10px] text-gray-500 italic">Identificada al inicio</span>
							{/if}
						</div>
						<div class="relative">
							<span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
								<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
								</svg>
							</span>
							<input
								id="docCliente"
								type="text"
								bind:value={documentoCliente}
								placeholder="Digita o corrige la cédula del cliente"
								class="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-medium text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition"
							/>
						</div>
					</div>

					<!-- 2. Selector de Método de Pago -->
					<div>
						<span class="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
							Método de Pago
						</span>
						<div class="grid grid-cols-3 gap-2">
							<button
								type="button"
								onclick={() => metodoPago = 'EFECTIVO'}
								class="py-2.5 px-3 rounded-xl border text-xs font-bold uppercase tracking-wide flex flex-col items-center justify-center space-y-1 transition {metodoPago === 'EFECTIVO' ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
								</svg>
								<span>Efectivo</span>
							</button>

							<button
								type="button"
								onclick={() => metodoPago = 'TARJETA'}
								class="py-2.5 px-3 rounded-xl border text-xs font-bold uppercase tracking-wide flex flex-col items-center justify-center space-y-1 transition {metodoPago === 'TARJETA' ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
								</svg>
								<span>Tarjeta</span>
							</button>

							<button
								type="button"
								onclick={() => metodoPago = 'QR'}
								class="py-2.5 px-3 rounded-xl border text-xs font-bold uppercase tracking-wide flex flex-col items-center justify-center space-y-1 transition {metodoPago === 'QR' ? 'bg-black text-white border-black shadow-md' : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'}"
							>
								<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
								</svg>
								<span>Código QR</span>
							</button>
						</div>
					</div>

					<!-- 3. Contenido Dinámico según Método de Pago -->
					<div class="p-4 bg-gray-50 rounded-xl border border-gray-200 transition-all">
						
						<!-- FLUJO DINÁMICO 1: EFECTIVO -->
						{#if metodoPago === 'EFECTIVO'}
							<div class="space-y-3">
								<div class="flex justify-between items-center">
									<label for="montoRecibido" class="text-xs font-bold text-gray-700 uppercase">
										Monto Recibido
									</label>
									<button
										type="button"
										onclick={setMontoExacto}
										class="text-xs text-black font-semibold underline hover:text-gray-700"
									>
										Pagar Monto Exacto
									</button>
								</div>

								<div class="relative">
									<span class="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 font-bold">
										$
									</span>
									<input
										id="montoRecibido"
										type="number"
										min="0"
										step="100"
										bind:value={montoRecibido}
										placeholder="0"
										class="w-full pl-8 pr-4 py-2.5 bg-white border border-gray-300 rounded-xl text-base font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-black"
									/>
								</div>

								<!-- Botones de montos sugeridos -->
								<div class="flex flex-wrap gap-1.5 pt-1">
									<button
										type="button"
										onclick={() => setMontoRapido(20000)}
										class="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-100"
									>
										$20.000
									</button>
									<button
										type="button"
										onclick={() => setMontoRapido(50000)}
										class="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-100"
									>
										$50.000
									</button>
									<button
										type="button"
										onclick={() => setMontoRapido(100000)}
										class="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-100"
									>
										$100.000
									</button>
								</div>

								<!-- Cálculo Automático de Cambio/Vueltas -->
								<div class="mt-3 pt-3 border-t border-gray-200">
									{#if faltaDinero()}
										<div class="flex justify-between items-center text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
											<span>FALTA POR PAGAR:</span>
											<span>{formatCurrency(faltante())}</span>
										</div>
									{:else if parseFloat(montoRecibido) >= $totalesCarrito.total}
										<div class="flex justify-between items-center text-sm font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
											<span>CAMBIO / VUELTAS:</span>
											<span class="text-base">{formatCurrency(cambio())}</span>
										</div>
									{:else}
										<div class="text-xs text-gray-500 italic">
											Digita el monto en efectivo entregado por el cliente.
										</div>
									{/if}
								</div>
							</div>

						<!-- FLUJO DINÁMICO 2: TARJETA -->
						{:else if metodoPago === 'TARJETA'}
							<div class="text-center py-4 space-y-3">
								<div class="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center mx-auto text-gray-800">
									<svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
									</svg>
								</div>
								<div>
									<p class="text-sm font-bold text-gray-900">Siga las instrucciones en la terminal / datáfono</p>
									<p class="text-xs text-gray-500 mt-0.5">
										Acerque o inserte la tarjeta del cliente en el datáfono inalámbrico
									</p>
								</div>
								<div class="inline-flex items-center space-x-2 bg-white px-3 py-1.5 rounded-full border border-gray-200 text-xs font-medium text-gray-700">
									<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
									<span>Esperando lectura del datáfono</span>
								</div>
							</div>

						<!-- FLUJO DINÁMICO 3: QR -->
						{:else if metodoPago === 'QR'}
							<div class="text-center py-2 space-y-3">
								<p class="text-sm font-bold text-gray-900">Escanee el código QR desde su aplicación móvil</p>
								
								<!-- Gráfico QR Mock nítido en SVG -->
								<div class="bg-white p-3 rounded-xl border border-gray-300 inline-block shadow-xs">
									<svg class="w-32 h-32 mx-auto text-black" viewBox="0 0 100 100" fill="currentColor">
										<path d="M10 10h24v24h-24z M14 14h16v16h-16z M18 18h8v8h-8z" />
										<path d="M66 10h24v24h-24z M70 14h16v16h-16z M74 18h8v8h-8z" />
										<path d="M10 66h24v24h-24z M14 70h16v16h-16z M18 74h8v8h-8z" />
										<rect x="42" y="10" width="6" height="6" />
										<rect x="52" y="10" width="6" height="6" />
										<rect x="42" y="24" width="6" height="6" />
										<rect x="42" y="38" width="16" height="6" />
										<rect x="10" y="42" width="6" height="16" />
										<rect x="24" y="42" width="6" height="12" />
										<rect x="66" y="42" width="12" height="6" />
										<rect x="84" y="42" width="6" height="12" />
										<rect x="42" y="52" width="6" height="16" />
										<rect x="52" y="60" width="12" height="6" />
										<rect x="66" y="54" width="6" height="16" />
										<rect x="76" y="66" width="14" height="6" />
										<rect x="42" y="76" width="16" height="6" />
										<rect x="66" y="78" width="8" height="12" />
										<rect x="80" y="80" width="10" height="10" />
									</svg>
								</div>
								
								<p class="text-xs text-gray-500">
									Compatible con Bancolombia, Nequi, Daviplata, Dale y Redeban
								</p>
							</div>
						{/if}
					</div>

					<!-- 4. Sección Inferior: Validación de Cupón de Descuento -->
					<div class="border-t border-gray-200 pt-3">
						<label for="codigoCupon" class="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
							Código de Cupón
						</label>

						{#if $totalesCarrito.cupon}
							<div class="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl text-xs">
								<div class="flex items-center space-x-2 text-emerald-800 font-semibold">
									<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
									</svg>
									<span>Cupón: <strong>{$totalesCarrito.cupon.codigo}</strong> (-{$totalesCarrito.cupon.descuentoPorcentaje}%)</span>
								</div>
								<button
									type="button"
									onclick={handleRemoverCupon}
									class="text-xs text-red-600 font-bold hover:underline"
								>
									Remover
								</button>
							</div>
						{:else}
							<div class="flex space-x-2">
								<input
									id="codigoCupon"
									type="text"
									bind:value={codigoCuponInput}
									placeholder="Ej: BIENVENIDO10"
									class="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black uppercase"
								/>
								<button
									type="button"
									onclick={handleValidarCupon}
									disabled={validandoCupon || !codigoCuponInput.trim()}
									class="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition disabled:opacity-40"
								>
									{validandoCupon ? 'Validando...' : 'Validar'}
								</button>
							</div>

							{#if mensajeCupon}
								<p class="text-xs mt-1.5 font-medium {mensajeCupon.tipo === 'exito' ? 'text-emerald-700' : 'text-red-600'}">
									{mensajeCupon.texto}
								</p>
							{/if}
						{/if}
					</div>

					<!-- Resumen Final de Pago -->
					<div class="bg-gray-100 rounded-xl p-3 space-y-1.5 text-xs">
						<div class="flex justify-between text-gray-600">
							<span>Subtotal:</span>
							<span>{formatCurrency($totalesCarrito.subtotal)}</span>
						</div>
						{#if $totalesCarrito.descuento > 0}
							<div class="flex justify-between text-emerald-700 font-semibold">
								<span>Descuento aplicado:</span>
								<span>- {formatCurrency($totalesCarrito.descuento)}</span>
							</div>
						{/if}
						<div class="flex justify-between text-gray-600">
							<span>IVA:</span>
							<span>{formatCurrency($totalesCarrito.totalIva)}</span>
						</div>
						<div class="flex justify-between text-base font-extrabold text-black pt-1.5 border-t border-gray-300">
							<span>Total a Pagar:</span>
							<span class="text-lg">{formatCurrency($totalesCarrito.total)}</span>
						</div>
					</div>

					{#if errorProceso}
						<div class="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center space-x-2">
							<svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
							</svg>
							<span>{errorProceso}</span>
						</div>
					{/if}

					<!-- Botón Final Procesar Compra -->
					<button
						type="button"
						onclick={handleProcesarCompra}
						disabled={procesando || !documentoCliente.trim() || (metodoPago === 'EFECTIVO' && parseFloat(montoRecibido || '0') < $totalesCarrito.total)}
						class="w-full py-3.5 px-4 bg-black hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition shadow-lg flex items-center justify-center space-x-2"
					>
						{#if procesando}
							<svg class="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
							</svg>
							<span>Procesando Compra...</span>
						{:else}
							<span>Procesar Compra ({formatCurrency($totalesCarrito.total)})</span>
						{/if}
					</button>

				</div>
			{/if}

		</div>
	</div>
{/if}
