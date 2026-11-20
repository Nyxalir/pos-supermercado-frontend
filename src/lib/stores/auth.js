// src/lib/stores/auth.js
// Store de autenticación para el panel de administración

import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { loginAdmin } from '#lib/api.js';

const STORAGE_KEY = 'pos_auth';

function getInitialState() {
	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				return {
					isAuthenticated: !!parsed.token,
					token: parsed.token || null,
					user: parsed.username || parsed.user || 'Administrador',
					rol: parsed.rol || 'ADMIN'
				};
			} catch {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	}
	return {
		isAuthenticated: false,
		token: null,
		user: null,
		rol: null
	};
}

function createAuthStore() {
	const { subscribe, set, update } = writable(getInitialState());

	return {
		subscribe,

		/**
		 * Inicia sesión contra el backend
		 * @param {string} username
		 * @param {string} password
		 */
		async login(username, password) {
			if (!username?.trim() || !password?.trim()) {
				throw new Error('Debe ingresar usuario y contraseña');
			}

			const data = await loginAdmin(username.trim(), password);
			const token = data.token || data.accessToken || 'session-token-' + Date.now();
			const user = data.username || username.trim();
			const rol = data.rol || 'ADMIN';

			const authData = {
				isAuthenticated: true,
				token,
				user,
				rol
			};

			if (browser) {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
			}

			set(authData);
			return authData;
		},

		/**
		 * Cierra la sesión activa
		 */
		logout() {
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
			}
			set({
				isAuthenticated: false,
				token: null,
				user: null,
				rol: null
			});
		},

		/**
		 * Comprueba si la sesión actual es válida
		 */
		checkAuth() {
			if (browser) {
				const stored = localStorage.getItem(STORAGE_KEY);
				if (!stored) return false;
				try {
					const parsed = JSON.parse(stored);
					return !!parsed.token;
				} catch {
					return false;
				}
			}
			return false;
		}
	};
}

export const auth = createAuthStore();
