import {
  addBox, addCylinder, addSphere, addLabel, addTopLabel, addTopFootprint,
  markMain, makeStandardMaterial, makeTopFill, annularSectorShape
} from './primitives.js';

// Stage / structures
import { buildTrussBox, buildTrussTri, buildScreen, buildTotem, buildPodium, buildRunway, buildCurvedPlatform, buildBooth } from './stage.js';
// Equipment / facilities
import {
  buildPortableToilet, buildSinkStation, buildGenerator, buildElectricalBox, buildExtinguisher,
  buildRecyclingPoint, buildTrashContainer, buildSignPanel, buildFence, buildInfoPoint,
  buildBarStraight, buildFridge, buildBottleRack, buildCoffeeMachine, buildServiceCart,
  buildDrinkDispenser, buildShowcase
} from './equipment.js';
// Seating
import { buildStool } from './seating.js';
// Decorative
import {
  buildFoldingScreen, buildFlowerPanel, buildLedPanel, buildPhotocall, buildDecorArch,
  buildGiantLetters, buildNeonSign,
  buildCurvedBar, buildVase, buildCenterpiece, buildCandelabra, buildPedestal, buildIceBucket
} from './deco.js';
// Vehicles + staircase
import { buildCoche, buildMoto, buildCamion, buildAvioneta, buildBarco, buildHelicoptero, buildEscalera } from './vehicles.js';
// Audio / DJ
import { buildSpeaker, buildMicrophone, buildMesaDJ } from './audio.js';
// Walls / architecture
import { buildPared, buildMuro, buildTecho, buildParedPuerta } from './walls.js';
// Nature
import { buildArbustoRecto, buildArbustoCorner, buildArbustoCurvo } from './nature.js';
// Roofs
import { buildTejado1Aguas, buildTejado2Aguas, buildTejado4Aguas } from './roofs.js';
// Tables (folding only — round/chair are top-level schema entries)
import { buildMesaPlegable } from './tables.js';

function inferRectProfile(item) {
  if (item.assetProfile) return item.assetProfile;
  switch (item.catalogDefinitionId) {
    case 'truss_cuadrado':        return 'trussBox';
    case 'truss_triangular':      return 'trussTri';
    case 'pantalla_led':
    case 'pantalla_proyeccion':   return 'screen';
    case 'totem_publicitario':    return 'totem';
    case 'podium':                return 'podium';
    case 'pasarela':              return 'runway';
    case 'tarima_curva':          return 'curvedPlatform';
    case 'cabina_tecnica':
    case 'cabina_traduccion':     return 'booth';
    case 'bano_portatil':         return 'portableToilet';
    case 'lavamanos_portatil':    return 'sinkStation';
    case 'generador_electrico':   return 'generator';
    case 'cuadro_electrico':      return 'electricalBox';
    case 'extintor':              return 'extinguisher';
    case 'punto_reciclaje':       return 'recyclingPoint';
    case 'contenedor_basura':     return 'trashContainer';
    case 'senal_salida':
    case 'senal_emergencia':      return 'signPanel';
    case 'vallado_tecnico':       return 'fence';
    case 'punto_informacion':     return 'infoPoint';
    case 'barra_recta':           return 'barStraight';
    case 'nevera_industrial':     return 'fridge';
    case 'botellero':             return 'bottleRack';
    case 'cafetera_industrial':   return 'coffeeMachine';
    case 'carro_servicio':        return 'serviceCart';
    case 'taburete_alto':         return 'stool';
    case 'dispensador_bebidas':   return 'drinkDispenser';
    case 'vitrina_refrigerada':   return 'showcase';
    case 'carrito_buffet':        return 'serviceCart';
    case 'biombo_decorativo':     return 'foldingScreen';
    case 'panel_floral':          return 'flowerPanel';
    case 'panel_led_deco':        return 'ledPanel';
    case 'photocall':             return 'photocall';
    case 'arco_decorativo':       return 'decorArch';
    case 'letras_gigantes':       return 'giantLetters';
    case 'neon_personalizado':    return 'neonSign';
    case 'coche':                 return 'coche';
    case 'moto':                  return 'moto';
    case 'camion':                return 'camion';
    case 'avioneta':              return 'avioneta';
    case 'barco':                 return 'barco';
    case 'helicoptero':           return 'helicoptero';
    case 'escalera':              return 'escalera';
    case 'mesa_dj':               return 'mesaDJ';
    case 'altavoz_grande':        return 'speaker';
    case 'microfono_pie':         return 'microphone';
    case 'pared':                 return 'pared';
    case 'muro':                  return 'muro';
    case 'techo':                 return 'techo';
    case 'pared_puerta':          return 'paredPuerta';
    case 'arbusto':               return 'arbustoRecto';
    case 'arbusto_esquina':       return 'arbustoCorner';
    case 'arbusto_curvo':         return 'arbustoCurvo';
    case 'tejado_1aguas':         return 'tejado1Aguas';
    case 'tejado_2aguas':         return 'tejado2Aguas';
    case 'tejado_4aguas':         return 'tejado4Aguas';
    case 'mesa_plegable':         return 'mesaPlegable';
    default:                      return '';
  }
}

function inferRoundProfile(item) {
  if (item.assetProfile) return item.assetProfile;
  switch (item.catalogDefinitionId) {
    case 'barra_curva':      return 'curvedBar';
    case 'jarron_alto':      return 'vase';
    case 'centro_mesa':      return 'centerpiece';
    case 'candelabro':       return 'candelabra';
    case 'peana_decorativa': return 'pedestal';
    case 'cubitera':         return 'iceBucket';
    case 'fuente_ambiente':  return 'fountain';
    default:                 return '';
  }
}

function buildFountain(group, diameter, height, color) {
  const R = diameter / 2;
  const basinH = Math.max(0.28, height * 0.30);
  const wallT  = Math.max(0.08, R * 0.08);
  const mat    = makeStandardMaterial(color, 'matte', 1);

  // Outer basin
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.03, basinH, 48), mat.clone());
  outer.position.y = basinH / 2;
  markMain(outer, color);
  group.add(outer);

  // Water surface
  const waterDisc = new THREE.Mesh(
    new THREE.CircleGeometry(R - wallT, 48),
    makeStandardMaterial('#60A5FA', 'glass', 0.60)
  );
  waterDisc.rotation.x = -Math.PI / 2;
  waterDisc.position.y = basinH - 0.01;
  group.add(waterDisc);

  // Pillar base
  const pillarH = height - basinH;
  const pillarBase = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.22, R * 0.32, 0.10, 32), mat.clone());
  pillarBase.position.y = basinH + 0.05;
  group.add(pillarBase);

  // Main pillar
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.09, R * 0.14, pillarH, 24), mat.clone());
  pillar.position.y = basinH + 0.10 + pillarH / 2;
  group.add(pillar);

  // Top cap / lip
  const topCap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.28, R * 0.20, 0.06, 32), mat.clone());
  topCap.position.y = basinH + 0.10 + pillarH + 0.03;
  group.add(topCap);

  // Small upper basin
  const upR = R * 0.30;
  const upBasin = new THREE.Mesh(new THREE.CylinderGeometry(upR, upR * 1.06, 0.14, 32), mat.clone());
  upBasin.position.y = basinH + 0.10 + pillarH + 0.07;
  group.add(upBasin);

  // Water spout
  const spoutH = 0.22;
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.018, spoutH, 12),
    makeStandardMaterial('#BAE6FD', 'glass', 0.75)
  );
  spout.position.y = basinH + 0.10 + pillarH + 0.14 + spoutH / 2;
  group.add(spout);

  // Torus ring accent at basin rim
  const rimRing = new THREE.Mesh(
    new THREE.TorusGeometry(R, 0.025, 8, 48),
    makeStandardMaterial(color, 'matte', 1)
  );
  rimRing.rotation.x = Math.PI / 2;
  rimRing.position.y = basinH;
  group.add(rimRing);
}

export function buildGenericRect(item, view) {
  const group = new THREE.Group();
  const W = item.dims?.width ?? 1.2;
  const L = item.dims?.length ?? 1.2;
  const H = item.dims?.height ?? 1.2;
  const color = item.color || '#B6B1A9';
  const profile = inferRectProfile(item);

  if (view === 'top') {
    addTopFootprint(group, item, L, W, color, item.visual?.opacity ?? 0.2);
    return group;
  }

  switch (profile) {
    case 'trussBox':        buildTrussBox(group, item, L, W, H, color); break;
    case 'trussTri':        buildTrussTri(group, item, L, W, H, color); break;
    case 'screen':          buildScreen(group, item, L, W, H, color); break;
    case 'totem':           buildTotem(group, item, L, W, H, color); break;
    case 'podium':          buildPodium(group, item, L, W, H, color); break;
    case 'runway':          buildRunway(group, item, L, W, H, color); break;
    case 'curvedPlatform':  buildCurvedPlatform(group, item, L, W, H, color); break;
    case 'booth':           buildBooth(group, item, L, W, H, color); break;
    case 'portableToilet':  buildPortableToilet(group, item, L, W, H, color); break;
    case 'sinkStation':     buildSinkStation(group, item, L, W, H, color); break;
    case 'generator':       buildGenerator(group, item, L, W, H, color); break;
    case 'electricalBox':   buildElectricalBox(group, item, L, W, H, color); break;
    case 'extinguisher':    buildExtinguisher(group, item, H, color); break;
    case 'recyclingPoint':  buildRecyclingPoint(group, item, L, W, H, color); break;
    case 'trashContainer':  buildTrashContainer(group, item, W, H, color); break;
    case 'signPanel':       buildSignPanel(group, item, L, W, H, color); break;
    case 'fence':           buildFence(group, item, L, W, H, color); break;
    case 'infoPoint':       buildInfoPoint(group, item, L, W, H, color); break;
    case 'barStraight':     buildBarStraight(group, item, L, W, H, color); break;
    case 'fridge':          buildFridge(group, item, L, W, H, color); break;
    case 'bottleRack':      buildBottleRack(group, item, L, W, H, color); break;
    case 'coffeeMachine':   buildCoffeeMachine(group, item, L, W, H, color); break;
    case 'serviceCart':     buildServiceCart(group, item, L, W, H, color); break;
    case 'stool':           buildStool(group, item, W, H, color); break;
    case 'drinkDispenser':  buildDrinkDispenser(group, item, W, H, color); break;
    case 'showcase':        buildShowcase(group, item, L, W, H, color); break;
    case 'foldingScreen':   buildFoldingScreen(group, item, L, W, H, color); break;
    case 'flowerPanel':     buildFlowerPanel(group, item, L, W, H, color); break;
    case 'ledPanel':        buildLedPanel(group, item, L, W, H, color); break;
    case 'photocall':       buildPhotocall(group, item, L, W, H, color); break;
    case 'decorArch':       buildDecorArch(group, item, L, W, H, color); break;
    case 'giantLetters':    buildGiantLetters(group, item, L, W, H, color); break;
    case 'neonSign':        buildNeonSign(group, item, L, W, H, color); break;
    case 'coche':           buildCoche(group, item, L, W, H, color); break;
    case 'moto':            buildMoto(group, item, L, W, H, color); break;
    case 'camion':          buildCamion(group, item, L, W, H, color); break;
    case 'avioneta':        buildAvioneta(group, item, L, W, H, color); break;
    case 'barco':           buildBarco(group, item, L, W, H, color); break;
    case 'helicoptero':     buildHelicoptero(group, item, L, W, H, color); break;
    case 'escalera':        buildEscalera(group, item, L, W, H, color); break;
    case 'mesaDJ':          buildMesaDJ(group, item, L, W, H, color); break;
    case 'speaker':         buildSpeaker(group, item, L, W, H, color); break;
    case 'microphone':      buildMicrophone(group, item, L, W, H, color); break;
    case 'pared':           buildPared(group, item, L, W, H, color); break;
    case 'muro':            buildMuro(group, item, L, W, H, color); break;
    case 'techo':           buildTecho(group, item, L, W, H, color); break;
    case 'paredPuerta':     buildParedPuerta(group, item, L, W, H, color); break;
    case 'arbustoRecto':    buildArbustoRecto(group, item, L, W, H, color); break;
    case 'arbustoCorner':   buildArbustoCorner(group, item, L, W, H, color); break;
    case 'arbustoCurvo':    buildArbustoCurvo(group, item, L, W, H, color); break;
    case 'tejado1Aguas':    buildTejado1Aguas(group, item, L, W, H, color); break;
    case 'tejado2Aguas':    buildTejado2Aguas(group, item, L, W, H, color); break;
    case 'tejado4Aguas':    buildTejado4Aguas(group, item, L, W, H, color); break;
    case 'mesaPlegable':    buildMesaPlegable(group, item, L, W, H, color); break;
    default: {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(L, H, W),
        makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
      );
      body.position.y = H / 2;
      body.castShadow = item.visual?.shadows !== false;
      markMain(body, color);
      group.add(body);
    }
  }

  addLabel(group, item.labelText, H + 0.45);
  return group;
}

export function buildGenericRound(item, view) {
  const group = new THREE.Group();
  const diameter = item.dims?.diameter ?? 1.5;
  const height = item.dims?.height ?? 0.8;
  const color = item.color || '#B6B1A9';
  const profile = inferRoundProfile(item);

  if (view === 'top') {
    if (profile === 'curvedBar') {
      const outerRadius = diameter / 2;
      const innerRadius = Math.max(0.24, outerRadius - Math.max(0.42, diameter * 0.2));
      const shape = annularSectorShape(innerRadius, outerRadius, Math.PI * 0.74);
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), makeTopFill(color, item.visual?.opacity ?? 0.24));
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.04;
      markMain(fill, color);
      group.add(fill);
    } else {
      const fill = new THREE.Mesh(new THREE.CircleGeometry(diameter / 2, 72), makeTopFill(color, item.visual?.opacity ?? 0.2));
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = 0.04;
      markMain(fill, color);
      group.add(fill);
    }
    if (item.labelText) addTopLabel(group, item.labelText);
    return group;
  }

  switch (profile) {
    case 'curvedBar':   buildCurvedBar(group, diameter, height, color); break;
    case 'vase':        buildVase(group, diameter, height, color); break;
    case 'centerpiece': buildCenterpiece(group, diameter, height, color); break;
    case 'candelabra':  buildCandelabra(group, diameter, height, color); break;
    case 'pedestal':    buildPedestal(group, diameter, height, color); break;
    case 'iceBucket':   buildIceBucket(group, diameter, height, color); break;
    case 'fountain':    buildFountain(group, diameter, height, color); break;
    default: {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 56),
        makeStandardMaterial(color, item.visual?.materialPreset || 'matte', item.visual?.opacity ?? 1)
      );
      body.position.y = height / 2;
      body.castShadow = item.visual?.shadows !== false;
      markMain(body, color);
      group.add(body);
    }
  }

  addLabel(group, item.labelText, height + 0.45);
  return group;
}

export function buildText2D(item) {
  const group = new THREE.Group();
  const text = item.labelText || item.name || 'Texto';
  const fontSize = item.dims?.height ?? 0.6;
  const color = item.color || '#111827';

  // Canvas texture para el texto
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const px = Math.max(24, Math.round(fontSize * 80));
  canvas.height = px * 2;
  ctx.font = `bold ${px}px "JetBrains Mono", monospace`;
  const measured = ctx.measureText(text);
  canvas.width = Math.max(64, measured.width + px * 0.6);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${px}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const aspect = canvas.width / canvas.height;
  const worldH = fontSize;
  const worldW = worldH * aspect;

  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.06;
  plane.renderOrder = 80;
  plane.userData.skipTopStroke = true;
  markMain(plane, color);
  group.add(plane);
  return group;
}
