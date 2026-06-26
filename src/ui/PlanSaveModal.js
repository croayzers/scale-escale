/* ─────────────────────────────────────────────────────────
   PLAN SAVE MODAL — Guarda el plano calibrado en la nube
   y arranca el flujo Zonas → Inventario.

   Requiere columnas en org_floor_plans (migración Supabase):
     ALTER TABLE org_floor_plans ADD COLUMN IF NOT EXISTS ciudad TEXT;
     ALTER TABLE org_floor_plans ADD COLUMN IF NOT EXISTS tipo TEXT;
   ───────────────────────────────────────────────────────── */

import { AppState } from '../core/AppState.js';
import { OrgContentManager } from '../services/OrgContentManager.js';
import { HeaderActionMenus } from './HeaderActionMenus.js';
import { NotifEmitter } from '../services/NotifEmitter.js';

/* ─── Ciudades europeas para el datalist ─── */
const EU_CITIES = [
  // España
  'Madrid','Barcelona','Valencia','Sevilla','Zaragoza','Málaga','Murcia',
  'Palma','Las Palmas de Gran Canaria','Bilbao','Alicante','Córdoba',
  'Valladolid','Vigo','Gijón','Granada','Vitoria-Gasteiz','A Coruña',
  'Salamanca','Pamplona','San Sebastián','Burgos','Almería','Toledo',
  'Santander','Cádiz','Jerez de la Frontera','Albacete','Tarragona','Lleida',
  'Logroño','Badajoz','Huelva','Marbella','Oviedo','Cartagena','Elche',
  'Terrassa','Sabadell','Santa Cruz de Tenerife','Jaén','Alcalá de Henares',
  'Fuenlabrada','Leganés','Getafe','Hospitalet de Llobregat','Badalona',
  // Francia
  'París','Marsella','Lyon','Toulouse','Niza','Nantes','Estrasburgo',
  'Montpellier','Burdeos','Lille','Rennes','Reims','El Havre','Dijon',
  'Grenoble','Toulon','Saint-Étienne','Angers','Brest','Nîmes','Aix-en-Provence',
  // Italia
  'Roma','Milán','Nápoles','Turín','Palermo','Génova','Bolonia',
  'Florencia','Bari','Catania','Venecia','Verona','Trieste','Padua',
  'Brescia','Parma','Taranto','Prato','Módena','Reggio Calabria',
  // Alemania
  'Berlín','Hamburgo','Múnich','Colonia','Fráncfort','Stuttgart',
  'Düsseldorf','Dortmund','Essen','Leipzig','Bremen','Dresde',
  'Hannover','Núremberg','Duisburg','Bochum','Wuppertal','Bielefeld','Bonn','Münster',
  // Reino Unido
  'Londres','Manchester','Birmingham','Glasgow','Leeds','Sheffield',
  'Edimburgo','Liverpool','Bristol','Cardiff','Leicester','Coventry',
  'Nottingham','Bradford','Belfast',
  // Portugal
  'Lisboa','Oporto','Braga','Setúbal','Coímbra','Funchal','Almada','Faro','Évora',
  // Países Bajos
  'Ámsterdam','Róterdam','La Haya','Utrecht','Eindhoven','Tilburg',
  'Groninga','Almere','Breda','Nimega',
  // Bélgica
  'Bruselas','Amberes','Gante','Charleroi','Lieja','Brujas','Namur',
  // Suiza
  'Zúrich','Ginebra','Basilea','Berna','Lausana','Lugano',
  // Austria
  'Viena','Graz','Linz','Salzburgo','Innsbruck',
  // Grecia
  'Atenas','Tesalónica','Patras','Heraclión','Larisa',
  // Polonia
  'Varsovia','Cracovia','Lodz','Breslavia','Poznan','Gdansk',
  'Szczecin','Bydgoszcz','Lublin','Katowice',
  // República Checa
  'Praga','Brno','Ostrava','Pilsen',
  // Dinamarca
  'Copenhague','Aarhus','Odense','Aalborg',
  // Suecia
  'Estocolmo','Gotemburgo','Malmö','Uppsala',
  // Noruega
  'Oslo','Bergen','Trondheim','Stavanger',
  // Finlandia
  'Helsinki','Espoo','Tampere','Vantaa',
  // Hungría
  'Budapest','Debrecen','Miskolc','Szeged',
  // Rumanía
  'Bucarest','Cluj-Napoca','Timișoara','Iași','Constanța',
  // Irlanda
  'Dublín','Cork','Limerick','Galway',
  // Balcanes y Este
  'Belgrado','Zagreb','Sarajevo','Ljubljana','Skopie',
  'Tirana','Pristina','Podgorica','Sofía','Chisinau',
  // Bálticos y otros
  'Tallin','Riga','Vilna','Bratislava','Luxemburgo','Reikiavik',
];

/* ─── Helpers de empresa ─── */
function _orgName() {
  const c = AppState.company;
  if (c.name) return c.name;
  if (c.licenseDetectedOrganizationName) return c.licenseDetectedOrganizationName;
  const email = c.authEmail || '';
  const domain = email.split('@')[1] || '';
  const base   = domain.split('.')[0];
  return base
    ? base.charAt(0).toUpperCase() + base.slice(1)
    : (c.authDisplayName || 'Mi empresa');
}

function _getPlanImage() {
  try {
    const img = AppState.plan?.texture?.image;
    const src = img?.src;
    if (src && src.startsWith('data:')) return src;
    // Blob URL u otro: rasterizar via canvas 2D (WebGL toDataURL devuelve negro sin preserveDrawingBuffer)
    if (img) {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/jpeg', 0.82);
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ─── Init datalist ─── */
function _initCitiesList() {
  const dl = document.getElementById('psm-cities-list');
  if (!dl || dl.children.length) return;
  const frag = document.createDocumentFragment();
  EU_CITIES.forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    frag.appendChild(opt);
  });
  dl.appendChild(frag);
}

/* ════════════════════════════════════════════
   API PÚBLICA
   ════════════════════════════════════════════ */

function open() {
  _initCitiesList();

  const modal = document.getElementById('plan-save-modal');
  if (!modal) return;

  const meta = AppState.plan?.meta || {};

  const orgEl = document.getElementById('psm-org');
  if (orgEl) orgEl.value = _orgName();

  const nameEl = document.getElementById('psm-nombre');
  if (nameEl && !nameEl.value.trim()) nameEl.value = meta.nombre || '';

  const ciudadEl = document.getElementById('psm-ciudad');
  if (ciudadEl && !ciudadEl.value.trim()) ciudadEl.value = meta.ciudad || '';

  const tipoEl = document.getElementById('psm-tipo');
  if (tipoEl && !tipoEl.value) tipoEl.value = meta.tipo || '';

  const clienteEl = document.getElementById('psm-cliente');
  if (clienteEl && !clienteEl.value.trim()) clienteEl.value = meta.cliente || '';

  const lugarEl = document.getElementById('psm-lugar');
  if (lugarEl && !lugarEl.value.trim()) lugarEl.value = meta.lugar || '';

  modal.classList.add('visible');
  setTimeout(() => nameEl?.focus(), 60);
}

function close() {
  document.getElementById('plan-save-modal')?.classList.remove('visible');
}

async function save() {
  const nombre  = document.getElementById('psm-nombre')?.value.trim();
  const ciudad  = document.getElementById('psm-ciudad')?.value.trim() || null;
  const tipo    = document.getElementById('psm-tipo')?.value || null;
  const cliente = document.getElementById('psm-cliente')?.value.trim() || null;
  const lugar   = document.getElementById('psm-lugar')?.value.trim() || null;

  if (!nombre) {
    const el = document.getElementById('psm-nombre');
    el?.focus();
    el?.classList.add('psm-field-error');
    setTimeout(() => el?.classList.remove('psm-field-error'), 1500);
    return;
  }

  // Persistir meta en AppState para que Export e Inventario lo lean
  if (AppState.plan) {
    AppState.plan.meta = { nombre: nombre || '', ciudad: ciudad || '', tipo: tipo || '', cliente: cliente || '', lugar: lugar || '' };
  }

  const saveBtn = document.getElementById('psm-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando…'; }

  try {
    const result = await OrgContentManager.saveFloorPlan({
      name:         nombre,
      ciudad,
      tipo,
      cliente,
      venue:        lugar,
      imageDataUrl: _getPlanImage(),
      widthM:       AppState.plan.widthM,
      lengthM:      AppState.plan.lengthM,
      opacity:      AppState.plan.opacity,
    });
    if (result) {
      document.dispatchEvent(new CustomEvent('escale:toast', {
        detail: { msg: `Plano "${nombre}" guardado y compartido con la empresa`, kind: 'success' }
      }));
      NotifEmitter.emitirNotificacion({
        tipo: 'plano',
        titulo: 'Se creó un nuevo plano',
        recursoLabel: lugar || ciudad || nombre,
      });
    } else {
      document.dispatchEvent(new CustomEvent('escale:toast', {
        detail: { msg: 'No se pudo guardar el plano en la nube', kind: 'warning' }
      }));
    }
  } catch (err) {
    console.error('[PlanSaveModal] Error guardando plano:', err);
    document.dispatchEvent(new CustomEvent('escale:toast', {
      detail: { msg: 'No se pudo guardar en la nube', kind: 'warning' }
    }));
  }

  close();
  _postSaveFlow();
}

/** También disponible en botón "Omitir": ejecuta el flujo sin guardar. */
function skip() {
  // Guardar lo que haya escrito aunque no suba a la nube
  const nombre  = document.getElementById('psm-nombre')?.value.trim() || '';
  const ciudad  = document.getElementById('psm-ciudad')?.value.trim() || '';
  const tipo    = document.getElementById('psm-tipo')?.value || '';
  const cliente = document.getElementById('psm-cliente')?.value.trim() || '';
  const lugar   = document.getElementById('psm-lugar')?.value.trim() || '';
  if (AppState.plan) AppState.plan.meta = { nombre, ciudad, tipo, cliente, lugar };
  close();
  _postSaveFlow();
}

/* ─── Flujo post-guardado: Zonas → Inventario con glow ─── */
function _postSaveFlow() {
  // 1. Abrir menú Zonas inmediatamente
  HeaderActionMenus.openMenu('zones');

  // 2. Después de 700 ms abrir Inventario + glow
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent('escale:open-inventory-glow'));
  }, 700);
}

/* ─── Bindear botones del modal ─── */
function init() {
  document.getElementById('psm-save')?.addEventListener('click', () => save());
  document.getElementById('psm-skip')?.addEventListener('click', () => skip());

  // Cerrar al pulsar fondo
  document.getElementById('plan-save-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) skip();
  });

  // Enter en los campos de texto
  ['psm-nombre', 'psm-ciudad'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') save();
    });
  });
}

export const PlanSaveModal = { init, open, close, save, skip };
