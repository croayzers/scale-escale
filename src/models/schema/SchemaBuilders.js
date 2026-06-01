/* ─────────────────────────────────────────────────────────
   SCHEMA BUILDERS — master registry
   Imports category builders and maps them to schema keys.
   To add a new element: add its builder to the right category
   file in builders/, then register it here.
   ───────────────────────────────────────────────────────── */

import { buildRoundTable, buildChair, buildChairLine,
         buildMesaPresi, buildMesaRect, buildMesaCocktail,
         buildMesaCurva, buildMesaSerpentina }              from './builders/tables.js';
import { buildBuffet, buildBuffetCarrito, buildBuffetCarro,
         buildBuffetStreet, buildBarraLibre }               from './builders/buffet.js';
import { buildStage }                                       from './builders/stage.js';
import { buildLighting, buildCableLuces, buildFocoSpot }    from './builders/lighting.js';
import { buildSurface, buildArrow,
         buildAlfombra, buildAmbiente }                     from './builders/surfaces.js';
import { buildPerson }                                      from './builders/persons.js';
import { buildSofa }                                        from './builders/seating.js';
import { buildPergola, buildArbol, buildPoste, buildPlanta } from './builders/nature.js';
import { buildGenericRect, buildGenericRound, buildText2D }  from './builders/generic.js';
import { buildRoom }                                        from './builders/walls.js';
import { buildCarpa, buildCarpaCuadrada, buildCarpaStar,
         buildCarpaPabellon, buildCarpaSailcloth,
         buildCarpaBeduina, buildCarpaTipi,
         buildCarpaTransparente, buildCarpaDomo }           from './builders/tents.js';

export const SCHEMA_BUILDERS = {
  // ── tables ──────────────────────────────────────────────
  roundTableBanquet: buildRoundTable,
  chairDining:       buildChair,
  chairLine:         buildChairLine,
  mesaPresi:         buildMesaPresi,
  mesaRect:          buildMesaRect,
  mesaCocktail:      buildMesaCocktail,
  mesaCurva:         buildMesaCurva,
  mesaSerpentina:    buildMesaSerpentina,
  // ── buffet / bars ───────────────────────────────────────
  buffetStation:     buildBuffet,
  buffetCarrito:     buildBuffetCarrito,
  buffetCart:        buildBuffetCarro,
  buffetStreet:      buildBuffetStreet,
  barraLibre:        buildBarraLibre,
  // ── stage ───────────────────────────────────────────────
  stagePlatform:     buildStage,
  // ── generic props ───────────────────────────────────────
  genericRectProp:   buildGenericRect,
  genericRoundProp:  buildGenericRound,
  text2d:            buildText2D,
  // ── surfaces / ambient ──────────────────────────────────
  genericSurface:    buildSurface,
  alfombra:          buildAlfombra,
  ambiente:          buildAmbiente,
  arrow2D:           buildArrow,
  // ── persons ─────────────────────────────────────────────
  genericPerson:     buildPerson,
  // ── seating ─────────────────────────────────────────────
  sofaSeat:          buildSofa,
  // ── lighting ────────────────────────────────────────────
  genericLighting:   buildLighting,
  cableLuces:        buildCableLuces,
  focoSpot:          buildFocoSpot,
  // ── nature / decor ──────────────────────────────────────
  pergola:           buildPergola,
  arbol:             buildArbol,
  poste:             buildPoste,
  planta:            buildPlanta,
  // ── structures ──────────────────────────────────────────
  room:              buildRoom,
  // ── tents / carpas ──────────────────────────────────────
  carpa:             buildCarpa,
  carpaCuadrada:     buildCarpaCuadrada,
  carpaStar:         buildCarpaStar,
  carpaPabellon:     buildCarpaPabellon,
  carpaSailcloth:    buildCarpaSailcloth,
  carpaBeduina:      buildCarpaBeduina,
  carpaTipi:         buildCarpaTipi,
  carpaTransparente: buildCarpaTransparente,
  carpaDomo:         buildCarpaDomo,
};
