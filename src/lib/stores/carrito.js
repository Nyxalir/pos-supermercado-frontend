// src/lib/stores/carrito.js
// Store reactivo para la gestión del carrito de compras del POS

import { writable, derived } from 'svelte/store';

/**
 * @typedef {Object} ItemCarrito
 * @property {number} id
 * @property {string} codigoBarras
 * @property {string} nombre
 * @property {number} precio
 * @property {number} [ivaPorcentaje]
 * @property {number} cantidad
 * @property {number} totalLinea
 * @property {boolean} seleccionado
 * @property {number} [stock]
 */

/**
 * @typedef {Object} CuponAplicado
 * @property {string} codigo
 * @property {number} descuentoPorcentaje
 */

/**
 * @typedef {Object} CarritoState
 * @property {ItemCarrito[]} items
 * @property {CuponAplicado | null} cupon
 */

const initialState = {
	items: [],
	cupon: null
};

function createCarritoStore() {
	const { subscribe, set, update } = writable(initialState);

	return {
		subscribe,

		/**
		 * Agrega un producto al carrito o incrementa su cantidad si ya existe
		 * @param {any} producto
		 * @param {number} [cantidad=1]
		 */
		agregarProducto(producto, cantidad = 1) {
			update(state => {
				const id = producto.id;
				const index = state.items.findIndex(item => item.id === id || (item.codigoBarras && item.codigoBarras === producto.codigoBarras));
				const precioUnitario = Number(producto.precio) || 0;
				const iva = Number(producto.ivaPorcentaje) || 0;
				const stock = producto.stock !== undefined ? Number(producto.stock) : 999;

				let newItems = [...state.items];

				if (index >= 0) {
					// Ya existe: incrementamos la cantidad
					const itemActual = newItems[index];
					const nuevaCantidad = itemActual.cantidad + cantidad;
					newItems[index] = {
						...itemActual,
						cantidad: nuevaCantidad,
						totalLinea: Number((precioUnitario * nuevaCantidad).toFixed(2))
					};
				} else {
					// Nuevo item
					const cant = Math.max(1, cantidad);
					newItems.push({
						id: producto.id,
						codigoBarras: producto.codigoBarras || '',
						nombre: producto.nombre || 'Producto',
						precio: precioUnitario,
						ivaPorcentaje: iva,
						cantidad: cant,
						totalLinea: Number((precioUnitario * cant).toFixed(2)),
						seleccionado: false,
						stock: stock
					});
				}

				return {
					...state,
					items: newItems
				};
			});
		},

		/**
		 * Ajusta la cantidad de un producto con delta (+1 o -1)
		 * @param {number} productoId
		 * @param {number} delta
		 */
		actualizarCantidad(productoId, delta) {
			update(state => {
				const newItems = state.items.map(item => {
					if (item.id === productoId) {
						const nuevaCantidad = Math.max(1, item.cantidad + delta);
						return {
							...item,
							cantidad: nuevaCantidad,
							totalLinea: Number((item.precio * nuevaCantidad).toFixed(2))
						};
					}
					return item;
				});

				return {
					...state,
					items: newItems
				};
			});
		},

		/**
		 * Establece una cantidad absoluta para un producto
		 * @param {number} productoId
		 * @param {number} nuevaCantidad
		 */
		setCantidad(productoId, nuevaCantidad) {
			const cant = Math.max(1, Math.floor(nuevaCantidad) || 1);
			update(state => {
				const newItems = state.items.map(item => {
					if (item.id === productoId) {
						return {
							...item,
							cantidad: cant,
							totalLinea: Number((item.precio * cant).toFixed(2))
						};
					}
					return item;
				});
				return { ...state, items: newItems };
			});
		},

		/**
		 * Elimina un producto individual del carrito
		 * @param {number} productoId
		 */
		eliminarProducto(productoId) {
			update(state => ({
				...state,
				items: state.items.filter(item => item.id !== productoId)
			}));
		},

		/**
		 * Alterna el estado de selección de un ítem para borrado múltiple
		 * @param {number} productoId
		 */
		toggleSeleccion(productoId) {
			update(state => ({
				...state,
				items: state.items.map(item =>
					item.id === productoId ? { ...item, seleccionado: !item.seleccionado } : item
				)
			}));
		},

		/**
		 * Marca o desmarca todos los productos
		 * @param {boolean} marcar
		 */
		toggleTodos(marcar) {
			update(state => ({
				...state,
				items: state.items.map(item => ({ ...item, seleccionado: marcar }))
			}));
		},

		/**
		 * Elimina los elementos seleccionados; si ninguno está seleccionado, vacía el carrito
		 */
		eliminarSeleccionados() {
			update(state => {
				const haySeleccionados = state.items.some(item => item.seleccionado);
				if (haySeleccionados) {
					return {
						...state,
						items: state.items.filter(item => !item.seleccionado)
					};
				}
				// Si no hay seleccionados, vacía completamente
				return {
					...state,
					items: []
				};
			});
		},

		/**
		 * Limpia todos los productos y el cupón
		 */
		vaciar() {
			set({
				items: [],
				cupon: null
			});
		},

		/**
		 * Aplica un cupón validado
		 * @param {{ codigo: string, descuentoPorcentaje: number }} cupon
		 */
		aplicarCupon(cupon) {
			update(state => ({
				...state,
				cupon: {
					codigo: cupon.codigo,
					descuentoPorcentaje: Number(cupon.descuentoPorcentaje) || 0
				}
			}));
		},

		/**
		 * Remueve el cupón activo
		 */
		removerCupon() {
			update(state => ({
				...state,
				cupon: null
			}));
		}
	};
}

export const carrito = createCarritoStore();

/**
 * Cálculos reactivos derivados para el total, subtotal, iva y descuento
 */
export const totalesCarrito = derived(carrito, ($carrito) => {
	const items = $carrito.items || [];
	const cupon = $carrito.cupon;

	let totalBruto = 0;
	let subtotalBase = 0;
	let totalIva = 0;
	let totalItems = 0;

	for (const item of items) {
		const totalLinea = item.precio * item.cantidad;
		totalBruto += totalLinea;
		totalItems += item.cantidad;

		// Cálculo fiscal coincidente con backend Spring Boot:
		// base = precio / (1 + (iva / 100))
		const tasaIva = (item.ivaPorcentaje || 0) / 100;
		const baseLinea = totalLinea / (1 + tasaIva);
		const ivaLinea = totalLinea - baseLinea;

		subtotalBase += baseLinea;
		totalIva += ivaLinea;
	}

	// Descuento
	let descuentoMonto = 0;
	if (cupon && cupon.descuentoPorcentaje > 0) {
		descuentoMonto = totalBruto * (cupon.descuentoPorcentaje / 100);
	}

	const totalFinal = Math.max(0, totalBruto - descuentoMonto);
	const haySeleccionados = items.some(item => item.seleccionado);
	const todosSeleccionados = items.length > 0 && items.every(item => item.seleccionado);

	return {
		totalBruto: Number(totalBruto.toFixed(2)),
		subtotal: Number(subtotalBase.toFixed(2)),
		totalIva: Number(totalIva.toFixed(2)),
		descuento: Number(descuentoMonto.toFixed(2)),
		total: Number(totalFinal.toFixed(2)),
		totalItems,
		elementos: items.length,
		haySeleccionados,
		todosSeleccionados,
		cupon
	};
});
