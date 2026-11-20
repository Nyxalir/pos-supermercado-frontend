// src/lib/stores/cliente.js
// Store para almacenar la cédula / documento del cliente ingresada en el acceso inicial
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'pos_cliente_documento';

function getInitialDoc() {
	if (browser) {
		return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || '';
	}
	return '';
}

function createClienteStore() {
	const { subscribe, set, update } = writable(getInitialDoc());

	return {
		subscribe,
		set(doc) {
			const clean = (doc || '').trim();
			if (browser) {
				sessionStorage.setItem(STORAGE_KEY, clean);
				localStorage.setItem(STORAGE_KEY, clean);
			}
			set(clean);
		},
		clear() {
			if (browser) {
				sessionStorage.removeItem(STORAGE_KEY);
				localStorage.removeItem(STORAGE_KEY);
			}
			set('');
		}
	};
}

export const clienteDocumento = createClienteStore();
