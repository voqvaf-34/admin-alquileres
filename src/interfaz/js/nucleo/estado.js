// Estado compartido de la interfaz: datos cargados, filtros y pestaña activa.
import * as D from '../../../dominios/index.js';

export const estado = {
  entries: null,            // alquileres cargados (hidratados)
  admins: null,
  owners: [], contacts: [], contractOwners: [], ownerDocs: [], ownerAccounts: [],
  marks: {},                // aumento enviado, renovado, no renueva... (por direccion)
  appSettings: {},
  ipc: 3.16,
  selMonth: new Date().getMonth() + 1,
  selYear: new Date().getFullYear(),
  activeTab: 'basedatos',
  opShowSinResolver: false, opShowResuelto: false,
  dbSearchText: '', dbFilterYear: 0, dbFilterMonth: 0, dbShowActive: true, dbShowInactive: false,
  expandedRows: new Set(),  // filas abiertas en la Base de Datos
};

// Recibe {owners, contacts, contractOwners} (completos o parciales) y re-vincula los contratos.
export function applyOwners(st) {
  if (st.owners)         estado.owners = st.owners;
  if (st.contacts)       estado.contacts = st.contacts;
  if (st.contractOwners) estado.contractOwners = st.contractOwners;
  if (st.ownerDocs)      estado.ownerDocs = st.ownerDocs;
  if (st.ownerAccounts)  estado.ownerAccounts = st.ownerAccounts;
  if (estado.entries) D.adjuntarPropietarios(estado.entries, estado.owners, estado.contacts, estado.contractOwners);
}

export function replaceEntry(raw) {
  const h = D.hidratarContrato(raw);
  const i = estado.entries.findIndex(e => e.id === h.id);
  if (i >= 0) estado.entries[i] = h; else estado.entries.push(h);
  D.adjuntarPropietarios([h], estado.owners, estado.contacts, estado.contractOwners);
  return h;
}
