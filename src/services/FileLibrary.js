/* ─────────────────────────────────────────────────────────
   FILE LIBRARY — Upload y visualización de PDFs e imágenes
   por organización vía Supabase Storage (bucket: org-files).
   ───────────────────────────────────────────────────────── */

import { AuthManager } from './AuthManager.js';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf'];
const MAX_SIZE_MB = 20;

async function _getToken() {
  const db = AuthManager.getSupabaseClient?.();
  if (!db) return null;
  try {
    const { data } = await db.auth.getSession();
    return data?.session?.access_token || null;
  } catch { return null; }
}

async function _apiFetch(path, opts = {}) {
  const token = await _getToken();
  if (!token) throw new Error('No autenticado');
  const res = await fetch(path, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(opts.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function listFiles() {
  const data = await _apiFetch('/api/org/files');
  return data.files || [];
}

export async function uploadFile(file, onProgress) {
  if (!file) throw new Error('Sin archivo');
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(`Tipo no soportado: ${file.type}`);
  if (file.size > MAX_SIZE_MB * 1024 * 1024) throw new Error(`Archivo demasiado grande (máx ${MAX_SIZE_MB} MB)`);

  // 1. Pedir URL firmada de subida al servidor
  const { signedURL, path } = await _apiFetch('/api/org/files', {
    method: 'POST',
    body: JSON.stringify({ action: 'sign-upload', filename: file.name, mimeType: file.type })
  });

  // 2. Subir directamente a Supabase Storage con la URL firmada (no pasa por la función)
  const uploadRes = await fetch(signedURL, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!uploadRes.ok) {
    const txt = await uploadRes.text().catch(() => '');
    throw new Error(`Error subiendo: ${txt || uploadRes.status}`);
  }

  return path;
}

export async function getViewUrl(path) {
  const data = await _apiFetch('/api/org/files', {
    method: 'POST',
    body: JSON.stringify({ action: 'sign-view', path })
  });
  return data.url;
}

export async function deleteFile(path) {
  await _apiFetch('/api/org/files', {
    method: 'DELETE',
    body: JSON.stringify({ path }),
    headers: { 'Content-Type': 'application/json' }
  });
}

export function canSync() {
  return Boolean(AuthManager.getSupabaseClient?.());
}

export function getFileType(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.pdf') || file.metadata?.mimetype === 'application/pdf') return 'pdf';
  return 'image';
}

export function getFilename(file) {
  const name = file.name || '';
  // Quita el prefijo uuid_ del nombre
  return name.replace(/^[a-z0-9]+_/, '');
}

export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const FileLibrary = {
  canSync,
  listFiles,
  uploadFile,
  getViewUrl,
  deleteFile,
  getFileType,
  getFilename,
  formatSize,
};

window.FileLibrary = FileLibrary;
