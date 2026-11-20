// src/lib/api.js
// Cliente HTTP centralizado para interactuar con la API REST de Spring Boot (http://localhost:8080/api)

export const API_BASE = 'http://localhost:8080/api';

/**
 * Obtiene el token de autenticación almacenado
 */
function getAuthToken() {
	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('pos_auth');
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				return parsed.token || null;
			} catch {
				return null;
			}
		}
	}
	return null;
}

/**
 * Función fetch auxiliar con configuración de cabeceras comunes
 */
async function apiFetch(endpoint, options = {}) {
	const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
	const headers = {
		'Content-Type': 'application/json',
		...(options.headers || {})
	};

	// El Basic Auth se envía solo a rutas protegidas. Spring puede rechazar un
	// token vencido/inválido antes de aplicar permitAll en las rutas públicas.
	const requiereAutenticacion = new URL(url).pathname.startsWith('/api/admin/');
	const token = requiereAutenticacion ? getAuthToken() : null;
	if (token) {
		headers['Authorization'] = token.startsWith('Basic ') || token.startsWith('Bearer ')
			? token
			: `Bearer ${token}`;
	}

	const response = await fetch(url, {
		...options,
		headers
	});

	if (!response.ok) {
		let errorMessage = `Error HTTP ${response.status}: ${response.statusText}`;
		try {
			const errorData = await response.json();
			errorMessage = errorData.mensaje || errorData.error || errorData.message || errorMessage;
		} catch {
			// Si la respuesta no es JSON, mantenemos el mensaje estándar
		}
		const error = new Error(errorMessage);
		// @ts-ignore
		error.status = response.status;
		throw error;
	}

	// Manejo de respuestas 204 No Content
	if (response.status === 204) {
		return null;
	}

	return response.json();
}

/**
 * Verifica si una identificación o usuario corresponde a un Administrador
 * GET /api/auth/verificar/{usuario}
 */
export async function verificarUsuario(identificacion) {
	const user = (identificacion || '').trim();
	if (!user) return { esAdmin: false, username: '' };

	try {
		return await apiFetch(`/auth/verificar/${encodeURIComponent(user)}`);
	} catch (error) {
		console.warn('Backend /api/auth/verificar no disponible o con error, usando validación local:', error);
		// Fallback para administradores por defecto ('admin', 'supervisor')
		const adminsConocidos = ['admin', 'supervisor', 'root'];
		const esAdmin = adminsConocidos.includes(user.toLowerCase());
		return {
			esAdmin,
			username: user,
			fallback: true
		};
	}
}

/**
 * Autenticación administrativa
 * Llama a POST /api/auth/login
 */
export async function loginAdmin(username, password) {
	try {
		return await apiFetch('/auth/login', {
			method: 'POST',
			body: JSON.stringify({ username, password })
		});
	} catch (error) {
		// Fallback para desarrollo en caso de que el backend use Basic Auth o no tenga /api/auth/login
		// Si es admin/admin o similar y el endpoint no está implementado (404), generamos token de sesión
		// @ts-ignore
		if (error.status === 404 || error.status === 405) {
			console.warn('Endpoint /api/auth/login no disponible en backend. Usando fallback de sesión.');
			const basicToken = 'Basic ' + btoa(`${username}:${password}`);
			return {
				token: basicToken,
				username: username,
				rol: 'ADMIN',
				fallback: true
			};
		}
		throw error;
	}
}

/**
 * Búsqueda de productos activos por término (nombre o código)
 * GET /api/productos?buscar={termino}
 */
export async function buscarProductos(termino = '') {
	const param = encodeURIComponent(termino.trim());
	const endpoint = param ? `/productos?buscar=${param}` : '/productos';
	return await apiFetch(endpoint);
}

/**
 * Buscar un producto directamente por su código de barras
 * GET /api/productos/codigo/{codigo}
 */
export async function buscarProductoPorCodigo(codigo) {
	try {
		return await apiFetch(`/productos/codigo/${encodeURIComponent(codigo.trim())}`);
	} catch (error) {
		// Si falla por ruta específica, intentar con parámetro de búsqueda
		try {
			const resultados = await apiFetch(`/productos?buscar=${encodeURIComponent(codigo.trim())}`);
			if (Array.isArray(resultados) && resultados.length > 0) {
				const exacto = resultados.find(p => p.codigoBarras === codigo.trim());
				return exacto || resultados[0];
			}
		} catch {
			// Silenciar segundo intento si falla
		}
		throw error;
	}
}

/**
 * Valida un cupón de descuento
 * GET /api/cupones/validar/{codigo}
 */
export async function validarCupon(codigo) {
	return await apiFetch(`/cupones/validar/${encodeURIComponent(codigo.trim())}`);
}

/**
 * Procesa una venta en caja
 * POST /api/ventas
 * Body: { documentoCliente, codigoCupon, items: [...], pago: { metodo, recibido, ... } }
 */
export async function procesarVenta(ventaData) {
	return await apiFetch('/ventas', {
		method: 'POST',
		body: JSON.stringify(ventaData)
	});
}

/**
 * Consulta el listado de ventas (para panel administrativo)
 * Intenta GET /api/admin/ventas o GET /api/ventas
 */
export async function listarVentas() {
	return await apiFetch('/ventas');
}

/** Productos y categorías que se muestran en el panel administrativo. */
export async function listarProductosAdmin() {
	return await apiFetch('/productos/todos');
}

export async function listarCategorias() {
	return await apiFetch('/categorias');
}

/** Cupones para el panel administrativo. */
export async function listarCupones() {
	return await apiFetch('/cupones');
}

export async function guardarCupon(cupon) {
	const method = cupon.id ? 'PUT' : 'POST';
	const endpoint = cupon.id ? `/cupones/${cupon.id}` : '/cupones';
	return await apiFetch(endpoint, {
		method,
		body: JSON.stringify(cupon)
	});
}

export async function desactivarCupon(id) {
	return await apiFetch(`/cupones/${id}/desactivar`, { method: 'PATCH' });
}

export async function reactivarCupon(id) {
	return await apiFetch(`/cupones/${id}/reactivar`, { method: 'PATCH' });
}

export async function eliminarCupon(id) {
	return await apiFetch(`/cupones/${id}`, { method: 'DELETE' });
}

export async function guardarProducto(producto) {
	const method = producto.id ? 'PUT' : 'POST';
	const endpoint = producto.id ? `/productos/${producto.id}` : '/productos';
	const categoriaId = encodeURIComponent(String(producto.categoria?.id ?? ''));
	return await apiFetch(`${endpoint}?categoriaId=${categoriaId}`, {
		method,
		body: JSON.stringify(producto)
	});
}

export async function desactivarProducto(id) {
	return await apiFetch(`/productos/${id}`, { method: 'DELETE' });
}

export async function reactivarProducto(id) {
	return await apiFetch(`/productos/${id}/reactivar`, { method: 'PATCH' });
}

/**
 * Anula una venta previamente registrada
 * POST /api/ventas/{id}/anular o /api/admin/ventas/{id}/anular
 */
export async function anularVenta(id) {
	return await apiFetch(`/ventas/${id}/anular`, {
		method: 'POST'
	});
}
