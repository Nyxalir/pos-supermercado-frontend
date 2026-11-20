<script>
	// src/lib/components/FacturaTicket.svelte
	// Componente de factura estilo ticket de papel con bordes en zigzag reactivo al carrito
	// y compatible con impresión física térmica de 80mm
	import { carrito, totalesCarrito } from '#lib/stores/carrito.js';

	// Props con Svelte 5 runes:
	// Si se pasa 'factura', muestra la factura final con datos reales del backend
	// Si no se pasa, muestra en tiempo real el borrador del carrito
	let { factura = null } = $props();

	// Formateador de moneda en pesos colombianos
	const formatCurrency = (val) => {
		return new Intl.NumberFormat('es-CO', {
			style: 'currency',
			currency: 'COP',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(val || 0);
	};

	// Fecha actual o fecha de la factura
	const getFecha = () => {
		const fechaIso = factura?.fechaHora;
		const d = fechaIso ? new Date(fechaIso) : new Date();
		return d.toLocaleDateString('es-CO', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	// Items reales a mostrar
	let itemsAMostrar = $derived(() => {
		if (factura && factura.detalles && factura.detalles.length > 0) {
			return factura.detalles.map(d => ({
				id: d.id || Math.random(),
				nombre: d.nombre,
				precio: Number(d.precioUnitario),
				cantidad: d.cantidad,
				totalLinea: Number(d.totalLinea),
				ivaPorcentaje: d.ivaPorcentaje || 0
			}));
		}
		return $carrito.items;
	});

	// Totales a mostrar
	let totales = $derived(() => {
		if (factura) {
			return {
				subtotal: Number(factura.subtotal) || 0,
				totalIva: Number(factura.totalIva) || 0,
				descuento: Number(factura.descuento) || 0,
				total: Number(factura.total) || 0,
				codigoCupon: factura.cupon?.codigo || null,
				numeroFactura: factura.numeroFactura || 'POS-0000',
				documentoCliente: factura.documentoCliente || null,
				pago: factura.pago || null
			};
		}
		return {
			subtotal: $totalesCarrito.subtotal,
			totalIva: $totalesCarrito.totalIva,
			descuento: $totalesCarrito.descuento,
			total: $totalesCarrito.total,
			codigoCupon: $totalesCarrito.cupon?.codigo || null,
			numeroFactura: 'BORRADOR',
			documentoCliente: null,
			pago: null
		};
	});
</script>

<aside id="factura-imprimible" class="flex flex-col select-none print:m-0 print:p-0 print:w-full">
	<div class="relative w-full max-w-sm mx-auto flex flex-col drop-shadow-md print:drop-shadow-none print:max-w-[80mm] print:w-[80mm]">
		
		<!-- Borde superior en zigzag (SVG) -->
		<div class="w-full overflow-hidden leading-none text-white print:text-black">
			<svg class="w-full h-3 fill-current block" viewBox="0 0 100 10" preserveAspectRatio="none">
				<polygon points="0,10 2.5,0 5,10 7.5,0 10,10 12.5,0 15,10 17.5,0 20,10 22.5,0 25,10 27.5,0 30,10 32.5,0 35,10 37.5,0 40,10 42.5,0 45,10 47.5,0 50,10 52.5,0 55,10 57.5,0 60,10 62.5,0 65,10 67.5,0 70,10 72.5,0 75,10 77.5,0 80,10 82.5,0 85,10 87.5,0 90,10 92.5,0 95,10 97.5,0 100,10" />
			</svg>
		</div>

		<!-- Cuerpo del ticket de papel -->
		<div class="bg-white px-5 py-4 text-gray-800 font-mono text-xs flex flex-col justify-between print:border-none print:px-2">
			
			<!-- Encabezado del Ticket -->
			<div class="text-center space-y-1">
				<div class="flex items-center justify-center space-x-1.5 text-black">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
					</svg>
					<span class="font-extrabold text-sm tracking-wider uppercase">SUPERMERCADO POS</span>
				</div>
				<p class="text-[11px] text-gray-600">NIT: 901.450.882-1</p>
				<p class="text-[10px] text-gray-500 uppercase">Régimen Común • IVA Incluido</p>
				<p class="text-[10px] text-gray-500">Calle Principal # 45 - 20</p>
				
				<div class="border-t border-dashed border-gray-400 my-2"></div>
				
				<div class="flex justify-between items-center text-[11px] text-gray-700 font-bold">
					<span>FACTURA:</span>
					<span class="text-black font-extrabold">{totales().numeroFactura}</span>
				</div>
				<div class="flex justify-between items-center text-[10px] text-gray-600">
					<span>FECHA:</span>
					<span>{getFecha()}</span>
				</div>
				{#if totales().documentoCliente}
					<div class="flex justify-between items-center text-[10px] text-gray-600">
						<span>CLIENTE CC:</span>
						<span class="font-bold text-black">{totales().documentoCliente}</span>
					</div>
				{/if}
				
				<div class="border-b border-dashed border-gray-400 my-2"></div>
			</div>

			<!-- Título de la factura -->
			<div class="my-1 text-center">
				<h2 class="text-xs font-bold tracking-widest uppercase border-b border-gray-900 pb-0.5 inline-block">
					{factura ? 'Factura de Venta POS' : 'Borrador de Factura'}
				</h2>
			</div>

			<!-- Desglose de Ítems Reales -->
			<div class="my-2 space-y-2 max-h-[340px] print:max-h-none overflow-y-auto pr-0.5">
				{#if itemsAMostrar().length === 0}
					<div class="py-6 text-center text-gray-400 italic">
						No hay productos en la factura
					</div>
				{:else}
					{#each itemsAMostrar() as item (item.id)}
						<div class="border-b border-gray-100 pb-1.5 last:border-b-0 print:border-gray-200">
							<div class="font-bold uppercase tracking-tight text-gray-900 flex justify-between">
								<span class="truncate pr-2">{item.nombre}</span>
								<span>{formatCurrency(item.totalLinea)}</span>
							</div>
							<div class="flex justify-between text-[11px] text-gray-500 pl-1 print:text-gray-700">
								<span>{item.cantidad} x {formatCurrency(item.precio)}</span>
								<span class="text-[10px]">IVA {item.ivaPorcentaje || 0}%</span>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Totales y Resumen -->
			<div class="space-y-1 pt-2 border-t-2 border-dashed border-gray-400">
				<div class="flex justify-between text-gray-600 print:text-black">
					<span>SUBTOTAL BASE:</span>
					<span>{formatCurrency(totales().subtotal)}</span>
				</div>
				<div class="flex justify-between text-gray-600 print:text-black">
					<span>IVA DISCRIMINADO:</span>
					<span>{formatCurrency(totales().totalIva)}</span>
				</div>

				{#if totales().descuento > 0}
					<div class="flex justify-between text-emerald-700 font-semibold bg-emerald-50 px-1 py-0.5 rounded print:text-black print:bg-transparent">
						<span>DESCUENTO {totales().codigoCupon ? `(${totales().codigoCupon})` : ''}:</span>
						<span>- {formatCurrency(totales().descuento)}</span>
					</div>
				{/if}

				<div class="border-t border-gray-900 my-1.5"></div>

				<div class="flex justify-between items-baseline text-sm font-extrabold text-black">
					<span class="tracking-wider">TOTAL PAGADO</span>
					<span class="text-base">{formatCurrency(totales().total)}</span>
				</div>

				{#if totales().pago}
					<div class="pt-1.5 border-t border-dotted border-gray-300 text-[11px] space-y-0.5">
						<div class="flex justify-between">
							<span class="text-gray-500">MÉTODO:</span>
							<span class="font-bold">{totales().pago.metodo || 'EFECTIVO'}</span>
						</div>
						{#if totales().pago.recibido && totales().pago.metodo === 'EFECTIVO'}
							<div class="flex justify-between">
								<span class="text-gray-500">RECIBIDO:</span>
								<span>{formatCurrency(totales().pago.recibido)}</span>
							</div>
							<div class="flex justify-between font-bold text-black">
								<span>CAMBIO / VUELTAS:</span>
								<span>{formatCurrency(Math.max(0, totales().pago.recibido - totales().total))}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Pie del Ticket / Código de Barras decorativo -->
			<div class="mt-3 pt-2 border-t border-dashed border-gray-300 text-center space-y-1.5">
				<!-- Representación visual de código de barras simulado -->
				<div class="flex justify-center items-center space-x-[2px] h-7 py-0.5 overflow-hidden opacity-90">
					<div class="w-[2px] h-full bg-black"></div>
					<div class="w-[1px] h-full bg-black"></div>
					<div class="w-[3px] h-full bg-black"></div>
					<div class="w-[1px] h-full bg-black"></div>
					<div class="w-[4px] h-full bg-black"></div>
					<div class="w-[2px] h-full bg-black"></div>
					<div class="w-[1px] h-full bg-black"></div>
					<div class="w-[3px] h-full bg-black"></div>
					<div class="w-[1px] h-full bg-black"></div>
					<div class="w-[4px] h-full bg-black"></div>
					<div class="w-[2px] h-full bg-black"></div>
					<div class="w-[1px] h-full bg-black"></div>
					<div class="w-[2px] h-full bg-black"></div>
					<div class="w-[3px] h-full bg-black"></div>
					<div class="w-[1px] h-full bg-black"></div>
					<div class="w-[2px] h-full bg-black"></div>
					<div class="w-[4px] h-full bg-black"></div>
					<div class="w-[1px] h-full bg-black"></div>
					<div class="w-[3px] h-full bg-black"></div>
					<div class="w-[2px] h-full bg-black"></div>
				</div>
				<p class="text-[9px] tracking-widest text-gray-500">* {totales().numeroFactura} *</p>
				<p class="text-[9px] text-gray-600 font-bold">¡GRACIAS POR SU COMPRA!</p>
			</div>
		</div>

		<!-- Borde inferior en zigzag (SVG) -->
		<div class="w-full overflow-hidden leading-none text-white print:text-black">
			<svg class="w-full h-3 fill-current block" viewBox="0 0 100 10" preserveAspectRatio="none">
				<polygon points="0,0 2.5,10 5,0 7.5,10 10,0 12.5,10 15,0 17.5,10 20,0 22.5,10 25,0 27.5,10 30,0 32.5,10 35,0 37.5,10 40,0 42.5,10 45,0 47.5,10 50,0 52.5,10 55,0 57.5,10 60,0 62.5,10 65,0 67.5,10 70,0 75,10 77.5,0 80,0 82.5,10 85,0 87.5,10 90,0 92.5,10 95,0 97.5,10 100,0" />
			</svg>
		</div>

	</div>
</aside>
