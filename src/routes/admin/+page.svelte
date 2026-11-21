<script>
	// src/routes/admin/+page.svelte
	// Panel Administrativo - Rediseño ligero basado en boceto Excalidraw
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '#lib/stores/auth.js';
	import {
		anularVenta,
		desactivarProducto,
		guardarProducto,
		listarCategorias,
		listarCupones,
		listarProductosAdmin,
		listarVentas,
		reactivarCupon,
		reactivarProducto,
		eliminarCupon,
		guardarCupon
	} from '#lib/api.js';

	let page = $state('dashboard');
	let ventas = $state([]);
	let productos = $state([]);
	let cupones = $state([]);
	let categorias = $state([]);
	let cargando = $state(true);
	let error = $state('');
	let ventaSeleccionada = $state(null);
	let anulandoId = $state(null);
	let filtroVentas = $state('');
	let estadoVentas = $state('TODAS');
	let filtroProductos = $state('');
	let estadoProductos = $state('ACTIVOS');
	let filtroCupones = $state('');
	let estadoCupones = $state('TODOS');
	let modalProducto = $state(false);
	let modalCupon = $state(false);
	let guardando = $state(false);
	let errorFormulario = $state('');
	let productoForm = $state(productoVacio());
	let cuponForm = $state(cuponVacio());

	function productoVacio() {
		return { id: null, codigoBarras: '', nombre: '', categoriaId: '', precio: '', ivaPorcentaje: 0, stock: 0, stockMinimo: 0 };
	}

	function cuponVacio() {
		return { id: null, codigo: '', descuentoPorcentaje: 10, fechaExpiracion: '', activo: true };
	}

	const formatCurrency = (value) => new Intl.NumberFormat('es-CO', {
		style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0
	}).format(Number(value) || 0);

	function formatFecha(value) {
		const fecha = new Date(value);
		if (!value || Number.isNaN(fecha.getTime())) return 'Sin fecha';
		return fecha.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function fechaClave(value) {
		const fecha = new Date(value);
		return Number.isNaN(fecha.getTime()) ? '' : `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
	}

	function cambiarPagina(nextPage) {
		page = nextPage;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// ---- DERIVADOS DASHBOARD ----
	let ventasPagadas = $derived.by(() => ventas.filter((venta) => venta.estado === 'PAGADA'));
	let ventasHoy = $derived.by(() => ventasPagadas.filter((venta) => fechaClave(venta.fechaHora) === fechaClave(new Date())));
	let ventasHoyTotal = $derived.by(() => ventasHoy.reduce((total, venta) => total + (Number(venta.total) || 0), 0));
	let ticketPromedio = $derived.by(() => ventasHoy.length ? ventasHoyTotal / ventasHoy.length : 0);
	let productosActivos = $derived.by(() => productos.filter((producto) => producto.activo));
	let productosBajoStock = $derived.by(() => productosActivos.filter((producto) => Number(producto.stock) <= Number(producto.stockMinimo)));
	let cuponesActivos = $derived.by(() => cupones.filter((c) => c.activo));
	let cuponesInactivos = $derived.by(() => cupones.filter((c) => !c.activo));
	let ventasRecientes = $derived.by(() => [...ventas].sort((a, b) => new Date(b.fechaHora) - new Date(a.fechaHora)).slice(0, 5));

	let ventasFiltradas = $derived.by(() => {
		const query = filtroVentas.trim().toLowerCase();
		return ventas.filter((venta) => (estadoVentas === 'TODAS' || venta.estado === estadoVentas) && (!query || String(venta.numeroFactura || '').toLowerCase().includes(query) || String(venta.documentoCliente || '').toLowerCase().includes(query)));
	});
	let productosFiltrados = $derived.by(() => {
		const query = filtroProductos.trim().toLowerCase();
		return productos.filter((producto) => (estadoProductos === 'TODOS' || (estadoProductos === 'ACTIVOS' ? producto.activo : !producto.activo)) && (!query || String(producto.nombre || '').toLowerCase().includes(query) || String(producto.codigoBarras || '').toLowerCase().includes(query)));
	});
	let cuponesFiltrados = $derived.by(() => {
		const query = filtroCupones.trim().toLowerCase();
		return cupones.filter((c) => (estadoCupones === 'TODOS' || (estadoCupones === 'ACTIVOS' ? c.activo : !c.activo)) && (!query || String(c.codigo || '').toLowerCase().includes(query)));
	});

	let errorProductos = $state('');
	let errorVentas = $state('');
	let cargandoVentas = $state(cargando);
	let serieVentas = $derived.by(() => {
		const dias = Array.from({ length: 7 }, (_, index) => {
			const fecha = new Date(); fecha.setHours(0, 0, 0, 0); fecha.setDate(fecha.getDate() - (6 - index));
			return { fecha, total: 0 };
		});
		for (const venta of ventasPagadas) {
			const index = dias.findIndex((dia) => fechaClave(dia.fecha) === fechaClave(venta.fechaHora));
			if (index >= 0) dias[index].total += Number(venta.total) || 0;
		}
		const max = Math.max(...dias.map((dia) => dia.total), 1);
		return dias.map((dia) => ({ ...dia, percent: Math.max(7, Math.round((dia.total / max) * 100)), label: dia.fecha.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '') }));
	});
	let categoriasVenta = $derived.by(() => {
		const totales = new Map();
		for (const venta of ventasPagadas) for (const detalle of venta.detalles || []) {
			const categoria = detalle.categoriaNombre || 'Sin categoría';
			totales.set(categoria, (totales.get(categoria) || 0) + (Number(detalle.totalLinea) || 0));
		}
		const total = [...totales.values()].reduce((sum, amount) => sum + amount, 0);
		return [...totales.entries()].map(([nombre, monto]) => ({ nombre, monto, percent: total ? Math.round((monto / total) * 100) : 0 })).sort((a, b) => b.monto - a.monto).slice(0, 4);
	});

	// ---- CARGA ----
	async function cargarTodo() {
		cargando = true; cargandoVentas = true; error = ''; errorProductos = '';
		try {
			const [ventasData, productosData, cuponesData, categoriasData] = await Promise.all([
				listarVentas(),
				listarProductosAdmin(),
				listarCupones(),
				listarCategorias()
			]);
			ventas = Array.isArray(ventasData) ? ventasData : [];
			productos = Array.isArray(productosData) ? productosData : [];
			cupones = Array.isArray(cuponesData) ? cuponesData : [];
			categorias = Array.isArray(categoriasData) ? categoriasData : [];
		} catch (err) {
			if (err?.status === 401 || err?.status === 403) { auth.logout(); goto('/login'); return; }
			error = err.message || 'No se pudieron cargar los datos.';
		}
		finally { cargando = false; cargandoVentas = false; }
	}

	// ---- PRODUCTOS ----
	function abrirNuevoProducto() { productoForm = productoVacio(); errorFormulario = ''; modalProducto = true; }
	function abrirEdicion(producto) {
		productoForm = { id: producto.id, codigoBarras: producto.codigoBarras || '', nombre: producto.nombre || '', categoriaId: String(producto.categoriaId || ''), precio: producto.precio ?? '', ivaPorcentaje: producto.ivaPorcentaje ?? 0, stock: producto.stock ?? 0, stockMinimo: producto.stockMinimo ?? 0 };
		errorFormulario = ''; modalProducto = true;
	}

	async function enviarProducto(event) {
		event.preventDefault(); guardando = true; errorFormulario = '';
		try {
			await guardarProducto({ ...(productoForm.id ? { id: productoForm.id } : {}), codigoBarras: productoForm.codigoBarras.trim(), nombre: productoForm.nombre.trim(), categoria: { id: Number(productoForm.categoriaId) }, precio: Number(productoForm.precio), ivaPorcentaje: Number(productoForm.ivaPorcentaje), stock: Number(productoForm.stock), stockMinimo: Number(productoForm.stockMinimo), activo: true });
			modalProducto = false; await cargarTodo();
		} catch (err) { errorFormulario = err.message || 'No se pudo guardar el producto.'; }
		finally { guardando = false; }
	}

	async function alternarProducto(producto) {
		try {
			if (producto.activo) { if (!confirm(`¿Desactivar “${producto.nombre}”?`)) return; await desactivarProducto(producto.id); }
			else await reactivarProducto(producto.id);
			await cargarTodo();
		} catch (err) { alert(`No se pudo actualizar el producto: ${err.message}`); }
	}

	// ---- CUPONES ----
	function abrirNuevoCupon() { cuponForm = cuponVacio(); errorFormulario = ''; modalCupon = true; }
	function abrirEdicionCupon(cupon) {
		cuponForm = { id: cupon.id, codigo: cupon.codigo || '', descuentoPorcentaje: Number(cupon.descuentoPorcentaje) || 0, fechaExpiracion: cupon.fechaExpiracion ? new Date(cupon.fechaExpiracion).toISOString().slice(0, 16) : '', activo: cupon.activo };
		errorFormulario = ''; modalCupon = true;
	}

	async function enviarCupon(event) {
		event.preventDefault(); guardando = true; errorFormulario = '';
		try {
			await guardarCupon({ ...(cuponForm.id ? { id: cuponForm.id } : {}), codigo: cuponForm.codigo.trim().toUpperCase(), descuentoPorcentaje: Number(cuponForm.descuentoPorcentaje), fechaExpiracion: cuponForm.fechaExpiracion || null, activo: cuponForm.activo !== false });
			modalCupon = false; await cargarTodo();
		} catch (err) { errorFormulario = err.message || 'No se pudo guardar el cupón.'; }
		finally { guardando = false; }
	}

	async function alternarCupon(cupon) {
		try {
			if (cupon.activo) { await desactivarCupon(cupon.id); }
			else await reactivarCupon(cupon.id);
			await cargarTodo();
		} catch (err) { alert(`No se pudo actualizar el cupón: ${err.message}`); }
	}

	async function borrarCupon(cupon) {
		if (!confirm(`¿Eliminar el cupón “${cupon.codigo}”?`)) return;
		try {
			await eliminarCupon(cupon.id);
			await cargarTodo();
		} catch (err) { alert(`No se pudo eliminar el cupón: ${err.message}`); }
	}

	// ---- VENTAS ----
	async function anular(venta) {
		if (venta.estado === 'ANULADA' || !confirm(`¿Anular la venta ${venta.numeroFactura}? El stock será repuesto.`)) return;
		anulandoId = venta.id;
		try { await anularVenta(venta.id); if (ventaSeleccionada?.id === venta.id) ventaSeleccionada = null; await cargarTodo(); }
		catch (err) { alert(`No fue posible anular la venta: ${err.message}`); }
		finally { anulandoId = null; }
	}

	function salir() { auth.logout(); goto('/login'); }

	onMount(() => {
		if (!auth.checkAuth()) { goto('/login'); return; }
		cargarTodo();
	});
</script>

<svelte:head><title>Administración | Mercado POS</title></svelte:head>

<div class="admin">
	<aside class="sidebar">
		<div class="brand"><span class="mark">AP</span><span class="name">Admin<span class="light">Panel</span></span></div>
		<nav aria-label="Navegación administrativa">
			<button class:active={page === 'dashboard'} type="button" onclick={() => cambiarPagina('dashboard')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
				<span>Dashboard</span>
			</button>
			<button class:active={page === 'productos'} type="button" onclick={() => cambiarPagina('productos')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></svg>
				<span>Productos</span>
			</button>
			<button class:active={page === 'cupones'} type="button" onclick={() => cambiarPagina('cupones')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
				<span>Cupones</span>
			</button>
			<button class:active={page === 'ventas'} type="button" onclick={() => cambiarPagina('ventas')}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg>
				<span>Ventas</span>
			</button>
		</nav>
		<div class="user">
			<div class="avatar">{($auth.user || 'A').slice(0, 1).toUpperCase()}</div>
			<div class="info"><strong>{$auth.user || 'Administrador'}</strong><small>{$auth.rol || 'ADMIN'}</small></div>
		</div>
		<button class="logout" type="button" onclick={salir}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M15 4h3a3 3 0 013 3v10a3 3 0 01-3 3h-3"/></svg>
			<span>Salir</span>
		</button>
	</aside>

	<main class="wrap">
		<div class="stage">

		{#if error}<div class="alert alert-error">{error} <button type="button" onclick={cargarTodo} class="retry">Reintentar</button></div>{/if}

		{#if page === 'dashboard'}
			<section class="kpis">
				<article class="kpi"><span class="label">Ventas hoy</span><strong class="value">{formatCurrency(ventasHoyTotal)}</strong><small>{ventasHoy.length} transacciones</small></article>
				<article class="kpi"><span class="label">Ticket promedio</span><strong class="value">{formatCurrency(ticketPromedio)}</strong><small>Por compra hoy</small></article>
				<article class="kpi"><span class="label">Productos activos</span><strong class="value">{productosActivos.length}</strong><small>Disponibles en caja</small></article>
				<article class="kpi"><span class="label">Cupones activos</span><strong class="value">{cuponesActivos.length}</strong><small>{cuponesInactivos.length} inactivos</small></article>
			</section>

			<section class="grid">
				<article class="panel chart-panel">
					<div class="panel-head"><h2>Comportamiento de ventas</h2><p>Facturación diaria, últimos 7 días</p></div>
					<div class="chart">
						{#each serieVentas as dia}<div class="col"><small class="monto">{formatCurrency(dia.total)}</small><div class="track"><i style="height: {dia.percent}%"></i></div><small class="dia">{dia.label}</small></div>{/each}
					</div>
				</article>
				<article class="panel cats-panel">
					<div class="panel-head"><h2>Categorías destacadas</h2><p>Participación en ventas pagadas</p></div>
					<div class="category-list">
						{#each categoriasVenta as cat}<div class="cat-row"><span class="dot"></span><b>{cat.nombre}</b><strong>{cat.percent}%</strong></div>{/each}
					</div>
				</article>
			</section>

			<section class="panel recent-panel">
				<div class="panel-head"><h2>Últimas ventas</h2><p>Las cinco operaciones más recientes</p></div>
				<div class="table-wrap">
					<table>
						<thead><tr><th>Factura</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead>
						<tbody>
							{#each ventasRecientes as v}<tr><td class="inv">{v.numeroFactura}</td><td>{v.documentoCliente}</td><td>{formatFecha(v.fechaHora)}</td><td class="money">{formatCurrency(v.total)}</td><td><span class:paid={v.estado === 'PAGADA'} class:cancelled={v.estado === 'ANULADA'} class="pill">{v.estado}</span></td></tr>{/each}
						</tbody>
					</table>
				</div>
			</section>

		{:else if page === 'productos'}
			<section class="panel manager-panel">
				<div class="panel-head"><h2>Inventario</h2><p>Crea, edita, desactiva y reactiva productos.</p></div>
				<div class="toolbar"><label class="search"><span>🔍</span><input bind:value={filtroProductos} placeholder="Buscar por nombre o código" /></label><select bind:value={estadoProductos}><option value="ACTIVOS">Activos</option><option value="INACTIVOS">Inactivos</option><option value="TODOS">Todos</option></select><button type="button" onclick={cargarTodo} class="btn refresh">Actualizar</button><button type="button" class="btn primary" onclick={abrirNuevoProducto}>+ Nuevo producto</button></div>
				{#if errorProductos}<p class="inline">{errorProductos}</p>{/if}
				<div class="table-wrap"><table class="mt">
					<thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th class="right">Acciones</th></tr></thead>
					<tbody>
						{#if cargando}<tr><td colspan="6" class="empty">Cargando catálogo…</td></tr>
						{:else if productosFiltrados.length === 0}<tr><td colspan="6" class="empty">No hay productos para mostrar.</td></tr>
						{:else}{#each productosFiltrados as p (p.id)}<tr>
							<td><b class="title">{p.nombre}</b><small class="code">{p.codigoBarras}</small></td>
							<td>{p.categoriaNombre || 'Sin categoría'}</td>
							<td class="money">{formatCurrency(p.precio)}</td>
							<td><b class:low={p.stock <= p.stockMinimo}>{p.stock}</b><small>/ mín. {p.stockMinimo}</small></td>
							<td><span class:paid={p.activo} class:muted={!p.activo} class="pill">{p.activo ? 'Activo' : 'Inactivo'}</span></td>
							<td class="right"><button type="button" class="btn icon" onclick={() => abrirEdicion(p)}>Editar</button><button class:danger={p.activo} type="button" class="btn icon" onclick={() => alternarProducto(p)}>{p.activo ? 'Desactivar' : 'Reactivar'}</button></td>
						</tr>{/each}
						{/if}
					</tbody>
				</table></div>
			</section>

		{:else if page === 'cupones'}
			<section class="panel manager-panel">
				<div class="panel-head"><h2>Cupones de descuento</h2><p>Crea, edita, activa y desactiva cupones para el POS.</p></div>
				<div class="toolbar"><label class="search"><span>🏷️</span><input bind:value={filtroCupones} placeholder="Buscar por código" /></label><select bind:value={estadoCupones}><option value="TODOS">Todos</option><option value="ACTIVOS">Activos</option><option value="INACTIVOS">Inactivos</option></select><button type="button" onclick={cargarTodo} class="btn refresh">Actualizar</button><button type="button" class="btn primary" onclick={abrirNuevoCupon}>+ Nuevo cupón</button></div>
				{#if error}<p class="inline">{error}</p>{/if}
				<div class="table-wrap"><table class="mt">
					<thead><tr><th>Código</th><th>Descuento</th><th>Vencimiento</th><th>Estado</th><th class="right">Acciones</th></tr></thead>
					<tbody>
						{#if cargando}<tr><td colspan="5" class="empty">Cargando cupones…</td></tr>
						{:else if cuponesFiltrados.length === 0}<tr><td colspan="5" class="empty">No hay cupones para mostrar.</td></tr>
						{:else}{#each cuponesFiltrados as c (c.id)}<tr>
							<td><b class="code">{c.codigo}</b></td>
							<td class="money">{c.descuentoPorcentaje}%</td>
							<td>{c.fechaExpiracion ? formatFecha(c.fechaExpiracion) : 'Sin vencimiento'}</td>
							<td><span class:paid={c.activo} class:muted={!c.activo} class="pill">{c.activo ? 'Activo' : 'Inactivo'}</span></td>
							<td class="right"><button type="button" class="btn icon" onclick={() => abrirEdicionCupon(c)}>Editar</button><button class:danger={c.activo} type="button" class="btn icon" onclick={() => alternarCupon(c)}>{c.activo ? 'Desactivar' : 'Reactivar'}</button><button type="button" class="btn icon danger" onclick={() => borrarCupon(c)}>Eliminar</button></td>
						</tr>{/each}
						{/if}
					</tbody>
				</table></div>
			</section>

		{:else if page === 'ventas'}
			<section class="panel manager-panel">
				<div class="panel-head"><h2>Historial de ventas</h2><p>Todas las facturas almacenadas.</p></div>
				<div class="toolbar"><label class="search"><span>🧾</span><input bind:value={filtroVentas} placeholder="Buscar factura o documento" /></label><select bind:value={estadoVentas}><option value="TODAS">Todos los estados</option><option value="PAGADA">Pagadas</option><option value="ANULADA">Anuladas</option></select><button type="button" onclick={cargarTodo} class="btn refresh">Actualizar</button></div>
				{#if errorVentas}<p class="inline">{errorVentas}</p>{/if}
				<div class="table-wrap"><table class="mt">
					<thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Total</th><th>Estado</th><th class="right">Acciones</th></tr></thead>
					<tbody>
						{#if cargandoVentas}<tr><td colspan="7" class="empty">Cargando ventas…</td></tr>
						{:else if ventasFiltradas.length === 0}<tr><td colspan="7" class="empty">No se encontraron ventas.</td></tr>
						{:else}{#each ventasFiltradas as v (v.id)}<tr>
							<td class="inv">{v.numeroFactura}</td>
							<td>{formatFecha(v.fechaHora)}</td>
							<td>{v.documentoCliente}</td>
							<td><span class="pill pay">{v.metodoPago || 'N/D'}</span></td>
							<td class="money">{formatCurrency(v.total)}</td>
							<td><span class:paid={v.estado === 'PAGADA'} class:cancelled={v.estado === 'ANULADA'} class="pill">{v.estado}</span></td>
							<td class="right"><button type="button" class="btn icon" onclick={() => ventaSeleccionada = v}>Detalle</button>{#if v.estado === 'PAGADA'}<button class="btn icon danger" disabled={anulandoId === v.id} onclick={() => anular(v)}>{anulandoId === v.id ? 'Anulando…' : 'Anular'}</button>{/if}</td>
						</tr>{/each}
						{/if}
					</tbody>
				</table></div>
				<div class="footer-actions">Mostrando {ventasFiltradas.length} de {ventas.length} ventas.</div>
			</section>
		{/if}
		</div>

		{#if ventaSeleccionada}
			<div class="modal"><div class="modal-backdrop" onclick={() => ventaSeleccionada = null}></div><div class="modal-card">
				<header class="modal-head"><div><p class="kicker">Detalle de venta</p><h2>{ventaSeleccionada.numeroFactura}</h2><small>{formatFecha(ventaSeleccionada.fechaHora)}</small></div><button type="button" onclick={() => ventaSeleccionada = null} class="close">✕</button></header>
				<div class="modal-body"><div class="sale-grid"><div><small>Cliente</small><b>{ventaSeleccionada.documentoCliente}</b></div><div><small>Pago</small><b>{ventaSeleccionada.metodoPago || 'N/D'}</b></div><div><small>Estado</small><b>{ventaSeleccionada.estado}</b></div><div><small>Total</small><b>{formatCurrency(ventaSeleccionada.total)}</b></div></div><div class="items"><h3>Productos</h3>{#if ventaSeleccionada.detalles?.length}{#each ventaSeleccionada.detalles as d}<div class="item-row"><span><b>{d.nombre}</b><small>{d.cantidad} × {formatCurrency(d.precioUnitario)}</small></span><b>{formatCurrency(d.totalLinea)}</b></div>{/each}{:else}<p>Sin productos.</p>{/if}</div><div class="totals"><span>Subtotal <b>{formatCurrency(ventaSeleccionada.subtotal)}</b></span><span>IVA <b>{formatCurrency(ventaSeleccionada.totalIva)}</b></span><strong>Total <b>{formatCurrency(ventaSeleccionada.total)}</b></strong></div></div>
				<div class="modal-foot"><button type="button" class="btn" onclick={() => ventaSeleccionada = null}>Cerrar</button>{#if ventaSeleccionada.estado === 'PAGADA'}<button type="button" class="btn danger" onclick={() => anular(ventaSeleccionada)}>Anular venta</button>{/if}</div>
			</div></div>
		{/if}

		{#if modalProducto}
			<div class="modal"><div class="modal-backdrop" onclick={() => modalProducto = false}></div><div class="modal-card">
				<header class="modal-head"><div><p class="kicker">Inventario</p><h2>{productoForm.id ? 'Editar producto' : 'Nuevo producto'}</h2></div><button type="button" onclick={() => modalProducto = false} class="close">✕</button></header>
				<form onsubmit={enviarProducto} class="modal-form">
					{#if errorFormulario}<p class="inline error">{errorFormulario}</p>{/if}
					<label><span>Código de barras</span><input required bind:value={productoForm.codigoBarras} /></label>
					<label><span>Nombre</span><input required bind:value={productoForm.nombre} /></label>
					<label><span>Categoría</span><select required bind:value={productoForm.categoriaId}><option value="">Selecciona</option>{#each categorias as cat}<option value={cat.id}>{cat.nombre}</option>{/each}</select></label>
					<label><span>Precio</span><input type="number" min="0" step="0.01" required bind:value={productoForm.precio} /></label>
					<label><span>IVA (%)</span><input type="number" min="0" step="0.01" required bind:value={productoForm.ivaPorcentaje} /></label>
					<label><span>Stock</span><input type="number" min="0" required bind:value={productoForm.stock} /></label>
					<label><span>Stock mínimo</span><input type="number" min="0" required bind:value={productoForm.stockMinimo} /></label>
					<div class="modal-actions"><button type="button" class="btn" onclick={() => modalProducto = false}>Cancelar</button><button type="submit" class="btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar producto'}</button></div>
				</form>
			</div></div>
		{/if}

		{#if modalCupon}
			<div class="modal"><div class="modal-backdrop" onclick={() => modalCupon = false}></div><div class="modal-card">
				<header class="modal-head"><div><p class="kicker">Cupones</p><h2>{cuponForm.id ? 'Editar cupón' : 'Nuevo cupón'}</h2></div><button type="button" onclick={() => modalCupon = false} class="close">✕</button></header>
				<form onsubmit={enviarCupon} class="modal-form">
					{#if errorFormulario}<p class="inline error">{errorFormulario}</p>{/if}
					<label><span>Código</span><input required bind:value={cuponForm.codigo} placeholder="BIENVENIDO10" /></label>
					<label><span>Descuento (%)</span><input type="number" min="0" max="100" step="0.01" required bind:value={cuponForm.descuentoPorcentaje} /></label>
					<label><span>Vence el</span><input type="datetime-local" bind:value={cuponForm.fechaExpiracion} /></label>
					<label style="display:flex;align-items:center;gap:8px;"><input type="checkbox" bind:checked={cuponForm.activo} /><span>Activo</span></label>
					<div class="modal-actions"><button type="button" class="btn" onclick={() => modalCupon = false}>Cancelar</button><button type="submit" class="btn primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cupón'}</button></div>
				</form>
			</div></div>
		{/if}
	</main>
</div>

<style>
	:global(body) { margin: 0; }
	:global(*) { box-sizing: border-box; }
	.admin { display: grid; grid-template-columns: 210px 1fr; height: 100vh; overflow: hidden; color: #1f2937; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; }

	/* Sidebar */
	.sidebar { position: sticky; top: 0; height: 100vh; padding: 26px 18px; background: #e9ecef; border-left: 1px solid #000; border-right: 0; display: flex; flex-direction: column; z-index: 10; }
	.brand { display: flex; align-items: center; gap: 10px; margin-bottom: 34px; padding-bottom: 14px; border-bottom: 1px solid #eef2f5; }
	.mark { width: 30px; height: 30px; border-radius: 8px; background: #111827; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 15px; }
	.name { font-weight: 800; font-size: 17px; letter-spacing: -0.02em; }
	.name .light { color: #6b7280; font-weight: 500; }
	nav { display: grid; gap: 6px; margin-bottom: auto; }
	nav button { width: 100%; display: flex; align-items: center; gap: 10px; border: 0; border-radius: 10px; padding: 10px 12px; color: #6b7280; background: transparent; font-size: 13.5px; font-weight: 600; text-align: left; cursor: pointer; transition: .15s; }
	nav button:hover { background: #f3f4f6; color: #111827; }
	nav button.active { background: transparent; color: #000; box-shadow: inset 3px 0 #000; }
	nav svg { width: 18px; height: 18px; flex: none; color: currentColor; }
	.user { display: flex; align-items: center; gap: 10px; padding-top: 18px; border-top: 1px solid #eef2f5; }
	.avatar { width: 34px; height: 34px; border-radius: 10px; background: #f3f4f6; color: #111827; display: grid; place-items: center; font-weight: 800; font-size: 15px; }
	.info { display: grid; gap: 2px; overflow: hidden; }
	.info strong { font-size: 13px; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
	.info small { font-size: 11px; color: #6b7280; font-weight: 700; }
	.logout { width: 100%; display: flex; align-items: center; gap: 10px; border: 0; border-radius: 10px; padding: 10px 12px; color: #ef4444; background: transparent; font-size: 13.5px; font-weight: 600; text-align: left; cursor: pointer; transition: .15s; }
	.logout:hover { background: #fef2f2; }
	.logout svg { width: 18px; height: 18px; flex: none; }

	/* Main */
	.wrap { min-width: 0; padding: 24px; background: #e9ecef; overflow: hidden; }
	.stage { display: flex; flex-direction: column; height: calc(100vh - 48px); overflow: hidden; background: #fff; border-radius: 20px; padding: 24px; }
	.topbar { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 26px; }
	.kicker { margin: 0 0 4px; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #6b7280; }
	.topbar h1 { margin: 0; font-size: clamp(22px, 3vw, 28px); letter-spacing: -.04em; color: #111827; }
	.go-pos { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #d1d5db; border-radius: 10px; padding: 9px 14px; color: #4b5563; background: #fff; font-size: 12.5px; font-weight: 700; text-decoration: none; transition: .15s; }
	.go-pos:hover { border-color: #9ca3af; background: #f9fafb; }
	.go-pos span { color: #10b981; font-size: 15px; }

	/* Alerts */
	.alert { padding: 10px 14px; border-radius: 10px; margin-bottom: 18px; font-size: 13px; display: flex; align-items: center; gap: 10px; }
	.alert-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
	.retry { margin-left: auto; background: none; border: 0; color: #dc2626; font-weight: 700; cursor: pointer; font-size: 12.5px; padding: 2px 6px; }
	.retry:hover { text-decoration: underline; }

	/* KPIs */
	.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
	.kpi { border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px 18px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.04); display: flex; flex-direction: column; gap: 4px; }
	.label { font-size: 11.5px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: .06em; }
	.value { font-size: 21px; font-weight: 800; color: #111827; letter-spacing: -.02em; }
	.kpi small { font-size: 12px; color: #9ca3af; margin-top: 2px; }

	/* Grid & panels */
	.grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(260px, 1fr); gap: 16px; margin-bottom: 18px; }
	.panel { border: 1px solid #e5e7eb; border-radius: 16px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.04); overflow: hidden; display: flex; flex-direction: column; }
	.panel-head { padding: 18px 20px 10px; border-bottom: 1px solid #f3f4f6; }
	.panel-head h2 { margin: 0 0 4px; font-size: 15px; font-weight: 700; color: #111827; }
	.panel-head p { margin: 0; font-size: 12px; color: #6b7280; }

	/* Chart */
	.chart { height: 200px; display: grid; grid-template-columns: repeat(7, 1fr); align-items: end; gap: 10px; padding: 14px 20px 20px; }
	.col { height: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; overflow: hidden; }
	.col .monto { width: 100%; overflow: hidden; color: #9ca3af; font-size: 10px; font-weight: 700; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
	.track { width: 100%; max-width: 32px; height: 100%; display: flex; align-items: end; border-radius: 8px; background: #f3f4f6; overflow: hidden; }
	.track i { width: 100%; min-height: 6px; border-radius: 6px 6px 0 0; background: #111827; }
	.col:nth-child(6) .track i { background: #10b981; }
	.col .dia { color: #9ca3af; font-size: 11px; font-weight: 700; text-transform: capitalize; }

	/* Categories */
	.category-list { display: grid; gap: 10px; padding: 12px 20px 20px; }
	.cat-row { display: flex; align-items: center; gap: 8px; }
	.cat-row .dot { width: 8px; height: 8px; border-radius: 50%; background: #e5e7eb; flex: 0 0 8px; }
	.cat-row b { overflow: hidden; color: #374151; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
	.cat-row strong { color: #111827; font-size: 13px; font-weight: 800; min-width: 30px; text-align: right; }

	/* Recent */
	.recent-panel { min-height: 300px; }
	.table-wrap { flex: 1; width: 100%; overflow: auto; padding: 0 20px 20px; }
	table { width: 100%; border-collapse: collapse; text-align: left; font-size: 12.5px; }
	th { padding: 12px 16px; color: #6b7280; background: #fafbfc; font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; border-bottom: 1px solid #eef2f5; }
	td { border-top: 1px solid #f3f4f6; padding: 12px 16px; color: #374151; white-space: nowrap; }
	.inv { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #111827; font-size: 11.5px; font-weight: 700; }
	.money { color: #111827; font-weight: 700; }
	.pill { display: inline-flex; border-radius: 999px; padding: 3px 8px; color: #6b7280; background: #f3f4f6; font-size: 9.5px; font-weight: 800; letter-spacing: .04em; }
	.paid { color: #047857; background: #d1fae5; }
	.cancelled { color: #b91c1c; background: #fee2e2; }
	.muted { color: #9ca3af; background: #e5e7eb; }
	.pay { color: #6b7280; background: #f3f4f6; }
	.empty { padding: 20px; color: #9ca3af; text-align: center; font-size: 13px; }
	.right { text-align: right; }

	/* Manager panels */
	.manager-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
	.toolbar { display: flex; gap: 10px; border-bottom: 1px solid #f3f4f6; padding: 14px 20px; background: #fafbfc; align-items: center; flex-wrap: wrap; flex-shrink: 0; }
	.search { min-width: 210px; flex: 1; display: flex; align-items: center; gap: 7px; border: 1px solid #d1d5db; border-radius: 10px; padding: 0 12px; background: #fff; }
	.search span { color: #9ca3af; font-size: 16px; }
	.search input { width: 100%; height: 36px; border: 0; outline: 0; color: #1f2937; background: transparent; font: inherit; font-size: 12.5px; }
	.toolbar select, .modal select { min-width: 130px; border: 1px solid #d1d5db; border-radius: 10px; padding: 0 10px; color: #555; background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; height: 36px; }
	.btn { border: 0; border-radius: 10px; padding: 8px 14px; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; transition: .15s; }
	.btn.primary { color: #fff; background: #111827; }
	.btn.primary:hover { background: #374151; }
	.btn.refresh { color: #374151; background: #f3f4f6; }
	.btn.refresh:hover { background: #e5e7eb; }
	.btn.icon { padding: 6px 10px; font-size: 11.5px; color: #5b636e; background: transparent; border: 1px solid transparent; }
	.btn.icon:hover { background: #f3f4f6; color: #111827; }
	.btn.icon.danger { color: #b91c1c; }
	.btn.icon.danger:hover { background: #fef2f2; }
	.btn.danger { color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; }
	.btn.danger:hover { background: #fee2e2; }
	.footer-actions { padding: 14px 20px 20px; display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #6b7280; }

	.inline { margin: 0 0 10px; font-size: 13px; color: #b91c1c; }
	.inline.error { color: #b91c1c; background: #fef2f2; padding: 8px 12px; border-radius: 8px; border: 1px solid #fecaca; }

	/* Modals */
	.modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: rgba(15, 23, 42, .45); backdrop-filter: blur(4px); }
	.modal-backdrop { position: absolute; inset: 0; }
	.modal-card { position: relative; z-index: 1; width: min(560px, 92%); max-height: 90vh; overflow: auto; border-radius: 16px; background: #fff; box-shadow: 0 20px 50px rgba(2, 6, 23, .18); display: flex; flex-direction: column; }
	.modal-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #eceef0; padding: 20px 24px; }
	.modal-head .kicker { margin: 0; }
	.modal-head h2 { margin: 2px 0 0; font-size: 19px; letter-spacing: -.02em; }
	.modal-head small { margin-top: 4px; display: block; color: #6b7280; font-size: 12px; }
	.close { width: 30px; height: 30px; border: 0; border-radius: 8px; color: #6b7280; background: #f3f4f6; font-size: 18px; line-height: 1; cursor: pointer; }
	.close:hover { background: #e5e7eb; color: #111827; }
	.modal-body { padding: 24px; flex: 1; }
	.modal-form { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; padding: 24px; }
	.modal-form label { display: grid; gap: 6px; color: #5b636e; font-size: 11.5px; font-weight: 700; }
	.modal-form input, .modal-form select { width: 100%; height: 40px; border: 1px solid #d1d5db; border-radius: 10px; padding: 0 12px; color: #1f2937; background: #fff; font: inherit; font-size: 13px; }
	.modal-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; padding-top: 16px; border-top: 1px solid #eceef0; }
	.sale-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; margin: 20px 0; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 12px; background: #e5e7eb; }
	.sale-grid div { display: grid; gap: 4px; padding: 14px; background: #fafbfc; }
	.sale-grid small { color: #6b7280; font-size: 11px; }
	.sale-grid b { color: #111827; font-size: 13px; }
	.items { padding: 20px 0; border-top: 1px solid #f3f4f6; border-bottom: 1px solid #f3f4f6; }
	.items h3 { margin: 0 0 10px; color: #6b7280; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; }
	.item-row { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
	.item-row span { color: #374151; }
	.item-row b { color: #111827; font-weight: 700; }
	.totals { padding-top: 18px; border-top: 1px solid #f3f4f6; display: flex; flex-direction: column; gap: 6px; }
	.totals span { display: flex; justify-content: space-between; color: #374151; font-size: 13px; }
	.totals strong { display: flex; justify-content: space-between; font-size: 16px; font-weight: 800; color: #111827; border-top: 2px solid #111827; padding-top: 6px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px 20px; border-top: 1px solid #eceef0; }

	@media (max-width: 900px) {
		.admin { grid-template-columns: 1fr; }
		.sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid #e5e7eb; flex-direction: row; padding: 14px 18px; overflow-x: auto; }
		.brand { margin-bottom: 0; margin-right: 24px; border-bottom: 0; padding-bottom: 0; flex: 0 0 auto; }
		nav { margin-bottom: 0; margin-right: 24px; flex: 0 0 auto; display: flex; gap: 6px; }
		nav button { white-space: nowrap; padding: 8px 12px; font-size: 12.5px; }
		.user { margin-right: auto; border-top: 0; border-bottom: 0; padding-top: 0; padding-bottom: 0; flex: 0 0 auto; }
		.logout { flex: 0 0 auto; }
		.wrap { padding: 16px; background: #e9ecef; overflow: visible; }
		.stage { min-height: auto; height: auto; padding: 20px 20px 40px; border-radius: 0; overflow: visible; }
		.manager-panel { flex: auto; height: auto; }
		.table-wrap { flex: auto; height: auto; }
		.kpis { grid-template-columns: repeat(2, 1fr); }
		.grid { grid-template-columns: 1fr; }
	}
</style>
