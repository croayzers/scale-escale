/* ===========================================================================
 * NotifEmitter — emite notificaciones in-app de E-Scale al centro de
 * notificaciones compartido (public.company_notifications). E-Scale es vanilla
 * (sin el paquete npm @scale/shared), así que inserta directamente con el
 * cliente Supabase de AuthManager. Misma tabla que el chat de L/P/S-Scale.
 * ======================================================================== */
import { AuthManager } from './AuthManager.js';
import { AppState } from '../core/AppState.js';

// Inserta una notificación para los miembros de la empresa.
//   tipo: 'plano'  ·  titulo: "Se creó un nuevo plano"  ·  recursoLabel: lugar
export async function emitirNotificacion({ tipo, titulo, recursoLabel = null, cmd = null }) {
  try {
    const sb = AuthManager.getSupabaseClient?.();
    const companyId = AppState.company?.organizationId || null;
    if (!sb || !companyId) return;            // sin sesión/empresa → silencioso

    const actorId = AppState.company?.authUserId || null;
    const email   = AppState.company?.authEmail || '';
    const actorNombre =
      AppState.company?.authDisplayName ||
      (email ? email.split('@')[0].replace(/[._]/g, ' ') : 'Alguien');

    const { error } = await sb.from('company_notifications').insert({
      company_id:    companyId,
      actor_id:      actorId,
      actor_nombre:  actorNombre,
      app_id:        'escale',
      tipo,
      titulo,
      recurso_label: recursoLabel,
      cmd,
    });
    if (error) console.warn('[NotifEmitter]', error.message);
  } catch (e) {
    console.warn('[NotifEmitter]', e?.message || e);
  }
}

export const NotifEmitter = { emitirNotificacion };
