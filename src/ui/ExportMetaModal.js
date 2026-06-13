/* ─────────────────────────────────────────────────────────
   EXPORT META MODAL — Cuestionario previo a exportar.
   Reemplaza el modal "Mi empresa" al exportar.
   Recoge: nombre empresa, email, cliente, tipo plano,
   lugar evento, logo, color corporativo primario.
   Al confirmar: guarda plan.meta, dispara el callback,
   y persiste plano + items como plantilla en Supabase.
   ───────────────────────────────────────────────────────── */

import { AppState } from '../core/AppState.js';
import { OrgContentManager } from '../services/OrgContentManager.js';

const FIELD_TIPOS = ['Banquete', 'Cóctel', 'Conferencia', 'Exposición', 'Boda', 'Corporativo', 'Otro'];

let _pendingCallback = null;

/* ─── Helpers ─── */
function _get(id) { return document.getElementById(id); }
function _val(id)  { return _get(id)?.value?.trim() ?? ''; }

function _company() { return AppState.company || {}; }
function _meta()    { return AppState.plan?.meta || {}; }

/* ─── Datos combinados: Portal → plan.meta → vacío ─── */
function _prefill() {
  const c = _company();
  const m = _meta();
  return {
    orgName:      c.name            || c.licenseDetectedOrganizationName || '',
    email:        c.authEmail       || c.email       || '',
    logo:         c.logo            || null,
    colorPrimary: c.colorPrimary    || '#2563EB',
    cliente:      m.cliente         || c.cliente      || '',
    tipo:         m.tipo            || '',
    lugar:        m.lugar           || c.venueName    || '',
  };
}

/* ─── Campos requeridos ─── */
function _missingFields(data) {
  const missing = [];
  if (!data.orgName)  missing.push('Nombre empresa');
  if (!data.email)    missing.push('Email');
  if (!data.lugar)    missing.push('Lugar del evento');
  return missing;
}

/* ─── Abrir modal ─── */
function open(callback) {
  _pendingCallback = callback;
  const modal = _get('export-meta-modal');
  if (!modal) { callback?.(); return; }

  const pf = _prefill();

  _get('emm-org')?.setAttribute('value', pf.orgName);
  if (_get('emm-org')) _get('emm-org').value = pf.orgName;
  if (_get('emm-email')) _get('emm-email').value = pf.email;
  if (_get('emm-cliente')) _get('emm-cliente').value = pf.cliente;
  if (_get('emm-lugar')) _get('emm-lugar').value = pf.lugar;
  if (_get('emm-color')) _get('emm-color').value = pf.colorPrimary;

  const tipoSel = _get('emm-tipo');
  if (tipoSel) tipoSel.value = pf.tipo || '';

  // Logo preview
  _updateLogoPreview(pf.logo);

  // Limpiar errores
  _clearErrors();

  // Marcar campos vacíos
  _highlightMissing(pf);

  modal.classList.add('visible');
}

function close() {
  _get('export-meta-modal')?.classList.remove('visible');
}

function _updateLogoPreview(src) {
  const preview = _get('emm-logo-preview');
  const label   = _get('emm-logo-label');
  if (!preview || !label) return;
  if (src) {
    preview.src = src;
    preview.style.display = '';
    label.textContent = 'Logo cargado ✓';
  } else {
    preview.style.display = 'none';
    label.textContent = 'Sin logo (opcional)';
  }
}

function _clearErrors() {
  _get('emm-error')?.classList.add('hidden');
  ['emm-org', 'emm-email', 'emm-lugar'].forEach(id => {
    _get(id)?.classList.remove('psm-field-error');
  });
}

function _highlightMissing(data) {
  if (!data.orgName)  _get('emm-org')?.classList.add('psm-field-error');
  if (!data.email)    _get('emm-email')?.classList.add('psm-field-error');
  if (!data.lugar)    _get('emm-lugar')?.classList.add('psm-field-error');
}

async function _confirm() {
  const data = {
    orgName:      _val('emm-org'),
    email:        _val('emm-email'),
    cliente:      _val('emm-cliente'),
    tipo:         _val('emm-tipo'),
    lugar:        _val('emm-lugar'),
    colorPrimary: _val('emm-color') || '#2563EB',
    logo:         AppState.company?.logo || null,
  };

  const missing = _missingFields(data);
  if (missing.length) {
    const err = _get('emm-error');
    if (err) { err.textContent = `Rellena: ${missing.join(', ')}`; err.classList.remove('hidden'); }
    _highlightMissing({ orgName: data.orgName, email: data.email, lugar: data.lugar });
    return;
  }

  // Persistir en AppState
  AppState.company.name         = data.orgName;
  AppState.company.email        = data.email;
  AppState.company.authEmail    = data.email;
  AppState.company.colorPrimary = data.colorPrimary;
  if (AppState.plan) {
    AppState.plan.meta = {
      ...(AppState.plan.meta || {}),
      cliente: data.cliente,
      tipo:    data.tipo,
      lugar:   data.lugar,
    };
  }
  // Compat legacy
  AppState.company.venueName = data.lugar;
  AppState.company.cliente   = data.cliente;

  close();

  // Guardar en Supabase en background (no bloqueante)
  _persistToCloud(data).catch(err => console.warn('[ExportMetaModal] cloud persist error:', err));

  // Ejecutar el flujo de exportación
  _pendingCallback?.();
  _pendingCallback = null;
}

async function _persistToCloud(data) {
  if (!OrgContentManager.canSync()) return;

  const meta = AppState.plan?.meta || {};
  const planName = meta.nombre || data.cliente || data.orgName || 'Plano sin nombre';

  // 1. Guardar plano
  try {
    const canvas = document.getElementById('scene-canvas');
    const imageDataUrl = canvas?.toDataURL?.('image/jpeg', 0.7) || null;
    await OrgContentManager.saveFloorPlan({
      name:         planName,
      ciudad:       meta.ciudad || '',
      tipo:         data.tipo || '',
      cliente:      data.cliente || '',
      venue:        data.lugar || '',
      imageDataUrl,
      widthM:       AppState.plan?.widthM,
      lengthM:      AppState.plan?.lengthM,
      opacity:      AppState.plan?.opacity,
    });
  } catch (e) {
    console.warn('[ExportMetaModal] saveFloorPlan:', e);
  }

  // 2. Guardar items como plantilla planning
  if (AppState.items?.length) {
    try {
      await OrgContentManager.saveTemplate({
        name: planName,
        kind: 'planning',
        data: {
          items:   AppState.items,
          meta:    AppState.plan?.meta || {},
          empresa: { name: data.orgName, email: data.email, colorPrimary: data.colorPrimary },
        },
      });
    } catch (e) {
      console.warn('[ExportMetaModal] saveTemplate:', e);
    }
  }

  document.dispatchEvent(new CustomEvent('escale:toast', {
    detail: { msg: 'Plano y plantilla guardados en la empresa', kind: 'success' }
  }));
}

/* ─── Logo upload ─── */
function _handleLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const src = e.target.result;
    AppState.company.logo = src;
    _updateLogoPreview(src);
  };
  reader.readAsDataURL(file);
}

export function init() {
  const modal = _get('export-meta-modal');
  if (!modal) return;

  _get('emm-confirm')?.addEventListener('click', () => _confirm());
  _get('emm-cancel')?.addEventListener('click', () => { close(); _pendingCallback = null; });

  // Cerrar al pulsar fondo
  modal.addEventListener('click', e => { if (e.target === modal) { close(); _pendingCallback = null; } });

  // Enter en inputs de texto
  ['emm-org', 'emm-email', 'emm-cliente', 'emm-lugar'].forEach(id => {
    _get(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') _confirm(); });
    _get(id)?.addEventListener('input', () => { _get(id)?.classList.remove('psm-field-error'); _get('emm-error')?.classList.add('hidden'); });
  });

  // Logo
  _get('emm-logo-btn')?.addEventListener('click', () => _get('emm-logo-file')?.click());
  _get('emm-logo-file')?.addEventListener('change', e => _handleLogoFile(e.target.files?.[0]));
  _get('emm-logo-drop')?.addEventListener('dragover', e => e.preventDefault());
  _get('emm-logo-drop')?.addEventListener('drop', e => { e.preventDefault(); _handleLogoFile(e.dataTransfer.files?.[0]); });
}

export const ExportMetaModal = { init, open, close };
