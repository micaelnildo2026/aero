import * as THREE from 'three';
import { AircraftProject, CadPartKey, CfdViewMode, FinishId } from '../types/aerospace';
import { generateNaca4Coordinates } from './aerospace';
import { computeSurfaceCp, cpToRgb, Triangle3D } from './cadCfd';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createPanelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 256; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    // Subtle rivet dots
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    for (let x = 8; x < 256; x += 32) {
      for (let y = 8; y < 256; y += 32) {
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

export interface AircraftPartsRefs {
  root: THREE.Group;
  fuselageGroup: THREE.Group;
  leftWingGroup: THREE.Group;
  rightWingGroup: THREE.Group;
  tailGroup: THREE.Group;
  propGroup: THREE.Group;
  gearGroup: THREE.Group;
  canopyMesh: THREE.Mesh;
  aileronLeft: THREE.Mesh;
  aileronRight: THREE.Mesh;
  flapLeft: THREE.Mesh;
  flapRight: THREE.Mesh;
  wingletLeft?: THREE.Mesh;
  wingletRight?: THREE.Mesh;
  elevator: THREE.Mesh;
  rudder: THREE.Mesh;
  explodedTargets: Array<{ obj: THREE.Object3D; basePos: THREE.Vector3; offset: THREE.Vector3 }>;
}

export interface BuildAircraftOptions {
  viewMode?: CfdViewMode;
  aoaDeg?: number;
  partVisibility?: Partial<Record<CadPartKey, boolean>>;
}

function getFinishMaterials(finish: FinishId, panelTex: THREE.CanvasTexture, isSoftwareGl: boolean) {
  switch (finish) {
    case 'alu_brushed':
      return {
        body: new THREE.MeshStandardMaterial({
          color: 0xdbe4ee,
          map: panelTex,
          metalness: 0.78,
          roughness: 0.28,
        }),
        wing: new THREE.MeshStandardMaterial({
          color: 0xcbd5e1,
          map: panelTex,
          metalness: 0.72,
          roughness: 0.34,
        }),
        accent: new THREE.MeshStandardMaterial({
          color: 0x0ea5e9,
          metalness: 0.25,
          roughness: 0.45,
        }),
      };
    case 'carbon_weave':
      return {
        body: new THREE.MeshStandardMaterial({
          color: 0x1e2430,
          map: panelTex,
          metalness: 0.35,
          roughness: 0.32,
        }),
        wing: new THREE.MeshStandardMaterial({
          color: 0x262e3d,
          map: panelTex,
          metalness: 0.3,
          roughness: 0.38,
        }),
        accent: new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          metalness: 0.2,
          roughness: 0.5,
        }),
      };
    case 'balsa_rc':
      return {
        body: new THREE.MeshStandardMaterial({
          color: 0xd9b382,
          map: panelTex,
          metalness: 0.05,
          roughness: 0.76,
        }),
        wing: new THREE.MeshStandardMaterial({
          color: 0xe6c89c,
          map: panelTex,
          metalness: 0.05,
          roughness: 0.7,
        }),
        accent: new THREE.MeshStandardMaterial({
          color: 0xdc2626,
          metalness: 0.1,
          roughness: 0.42,
        }),
      };
    case 'composite_white':
    default:
      return {
        body: new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          map: panelTex,
          metalness: 0.12,
          roughness: 0.3,
        }),
        wing: new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          map: panelTex,
          metalness: 0.1,
          roughness: 0.35,
        }),
        accent: new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          metalness: 0.2,
          roughness: 0.42,
        }),
      };
  }
}

export function buildProceduralAircraft(
  project: AircraftProject,
  isSoftwareGl: boolean,
  maxAnisotropy = 4,
  options: BuildAircraftOptions = {}
): AircraftPartsRefs {
  const root = new THREE.Group();
  const { geometry: g, airfoil, aircraftClass } = project;
  const viewMode = options.viewMode ?? 'solid';
  const aoaForCp = options.aoaDeg ?? airfoil.angleOfAttackDeg;
  const vis = options.partVisibility ?? {};

  // Normalize visual scale so all 3 classes (1.6m RC, 3.2m UAV, 9.6m LSA) fit nicely around ~6 scene units
  const normScale = 5.4 / Math.max(1.2, g.wingspanM);
  const L = g.fuselageLengthM * normScale;
  const R = (g.fuselageDiameterM * normScale) / 2;
  const halfSpan = (g.wingspanM * normScale) / 2;
  const cr = g.rootChordM * normScale;
  const ct = g.tipChordM * normScale;
  const sweepRad = (g.sweepDeg * Math.PI) / 180;
  const dihedralRad = (g.dihedralDeg * Math.PI) / 180;

  const panelTex = createPanelTexture();
  panelTex.anisotropy = maxAnisotropy;
  const mats = getFinishMaterials(project.finish, panelTex, isSoftwareGl);

  if (viewMode === 'wireframe') {
    mats.body.wireframe = true;
    mats.wing.wireframe = true;
    mats.accent.wireframe = true;
  } else if (viewMode === 'cp_pressure') {
    mats.wing = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.04,
    });
    mats.body = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.04,
    });
  }

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.55,
    roughness: 0.55,
    wireframe: viewMode === 'wireframe',
  });

  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    metalness: 0.05,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.72,
    transparent: true,
    opacity: isSoftwareGl ? 0.52 : 0.9,
    ior: 1.48,
    clearcoat: 1.0,
    wireframe: viewMode === 'wireframe',
  });

  // 1. Fuselage (LatheGeometry along X axis, nose at +L/2, tail at -L/2)
  const fuselageGroup = new THREE.Group();
  const lathePts: THREE.Vector2[] = [
    new THREE.Vector2(0.01, -L * 0.5),
    new THREE.Vector2(R * 0.28, -L * 0.42),
    new THREE.Vector2(R * 0.56, -L * 0.2),
    new THREE.Vector2(R * 0.96, 0.0),
    new THREE.Vector2(R * 1.0, L * 0.16),
    new THREE.Vector2(R * 0.85, L * 0.34),
    new THREE.Vector2(R * 0.45, L * 0.45),
    new THREE.Vector2(0.01, L * 0.5),
  ];
  const fuseGeo = new THREE.LatheGeometry(lathePts, 24);
  fuseGeo.rotateZ(-Math.PI / 2);
  const tmpColor = new THREE.Color();
  if (viewMode === 'cp_pressure') {
    const fPos = fuseGeo.attributes.position;
    const fCols = new Float32Array(fPos.count * 3);
    for (let i = 0; i < fPos.count; i++) {
      const xNorm = Math.max(0, Math.min(1, (L * 0.5 - fPos.getX(i)) / Math.max(0.1, L)));
      const cp = computeSurfaceCp(xNorm, fPos.getY(i) >= 0, aoaForCp * 0.6, 1);
      const [r, gr, b] = cpToRgb(cp);
      tmpColor.setRGB(r, gr, b, THREE.SRGBColorSpace);
      fCols[i * 3] = tmpColor.r;
      fCols[i * 3 + 1] = tmpColor.g;
      fCols[i * 3 + 2] = tmpColor.b;
    }
    fuseGeo.setAttribute('color', new THREE.BufferAttribute(fCols, 3));
  }
  const fuseMesh = new THREE.Mesh(fuseGeo, mats.body);
  fuseMesh.castShadow = !isSoftwareGl;
  fuseMesh.receiveShadow = true;
  fuselageGroup.add(fuseMesh);

  // 2. Canopy / Avionics Dome
  const canopyGeo = new THREE.SphereGeometry(R * 0.82, 20, 14);
  canopyGeo.scale(1.65, 0.78, 0.78);
  const canopyMesh = new THREE.Mesh(canopyGeo, canopyMat);
  canopyMesh.position.set(L * 0.14, R * 0.55, 0);
  canopyMesh.renderOrder = 2;
  fuselageGroup.add(canopyMesh);

  // Accent racing/telemetry stripe along fuselage
  const stripeGeo = new THREE.BoxGeometry(L * 0.56, R * 0.14, R * 2.04);
  const stripeMesh = new THREE.Mesh(stripeGeo, mats.accent);
  stripeMesh.position.set(-L * 0.04, 0, 0);
  fuselageGroup.add(stripeMesh);

  // Optional UAV gimbal sensor pod
  if (aircraftClass === 'uav') {
    const podGroup = new THREE.Group();
    const podBase = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.45, R * 0.45, R * 0.38, 16),
      darkTrimMat
    );
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.36, 16, 12),
      canopyMat
    );
    lens.position.y = -R * 0.18;
    podGroup.add(podBase, lens);
    podGroup.position.set(L * 0.18, -R * 0.95, 0);
    fuselageGroup.add(podGroup);
  }

  root.add(fuselageGroup);

  // 3. Build Airfoil Shape from live NACA 4-digit generator
  const naca = generateNaca4Coordinates(
    airfoil.maxCamberPct,
    airfoil.camberPosTenths,
    airfoil.thicknessPct,
    24
  );
  const wingShape = new THREE.Shape();
  naca.upper.forEach((pt, idx) => {
    const x = (0.35 - pt.x) * cr; // LE at +0.35*cr, TE at -0.65*cr
    const y = pt.y * cr;
    if (idx === 0) wingShape.moveTo(x, y);
    else wingShape.lineTo(x, y);
  });
  naca.lower
    .slice()
    .reverse()
    .forEach((pt) => {
      const x = (0.35 - pt.x) * cr;
      const y = pt.y * cr;
      wingShape.lineTo(x, y);
    });
  wingShape.closePath();

  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: halfSpan,
    steps: 4,
    bevelEnabled: false,
  });

  // Taper, sweep, and dihedral vertex deformation on extruded wing
  const posAttr = wingGeo.attributes.position;
  const taper = ct / Math.max(0.05, cr);
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i); // 0 to halfSpan
    const frac = z / Math.max(0.01, halfSpan);
    const localScale = 1 - (1 - taper) * frac;
    const sweepShiftX = -Math.tan(sweepRad) * z;
    const dihedralShiftY = Math.tan(dihedralRad) * z;
    posAttr.setXYZ(i, x * localScale + sweepShiftX, y * localScale + dihedralShiftY, z);
  }
  wingGeo.computeVertexNormals();

  if (viewMode === 'cp_pressure') {
    const wCols = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      const frac = z / Math.max(0.01, halfSpan);
      const localScale = 1 - (1 - taper) * frac;
      const sweepShiftX = -Math.tan(sweepRad) * z;
      const dihedralShiftY = Math.tan(dihedralRad) * z;
      const origX = (posAttr.getX(i) - sweepShiftX) / Math.max(0.05, localScale);
      const origY = (posAttr.getY(i) - dihedralShiftY) / Math.max(0.05, localScale);
      const xNorm = Math.max(0, Math.min(1, (0.35 * cr - origX) / Math.max(0.05, cr)));
      const cp = computeSurfaceCp(xNorm, origY >= 0, aoaForCp, airfoil.maxCamberPct);
      const [r, gr, b] = cpToRgb(cp);
      tmpColor.setRGB(r, gr, b, THREE.SRGBColorSpace);
      wCols[i * 3] = tmpColor.r;
      wCols[i * 3 + 1] = tmpColor.g;
      wCols[i * 3 + 2] = tmpColor.b;
    }
    wingGeo.setAttribute('color', new THREE.BufferAttribute(wCols, 3));
  }

  const wingYOffset =
    g.wingPosition === 'high' ? R * 0.72 : g.wingPosition === 'low' ? -R * 0.58 : 0.05;
  const flapAngleRad = -((g.flapDeflectionDeg ?? 0) * Math.PI) / 180;

  // Right Wing (+Z)
  const rightWingGroup = new THREE.Group();
  const rightWingMesh = new THREE.Mesh(wingGeo, mats.wing);
  rightWingMesh.castShadow = !isSoftwareGl;
  rightWingMesh.receiveShadow = true;
  rightWingGroup.add(rightWingMesh);

  // Right Wingtip + Aileron + Inboard Flap
  const tipGeo = new THREE.BoxGeometry(ct * 0.9, cr * 0.05, 0.06);
  const rightTip = new THREE.Mesh(tipGeo, mats.accent);
  rightTip.position.set(
    -Math.tan(sweepRad) * halfSpan - ct * 0.15,
    Math.tan(dihedralRad) * halfSpan,
    halfSpan + 0.02
  );
  rightWingGroup.add(rightTip);

  const aileronGeo = new THREE.BoxGeometry(ct * 0.24, cr * 0.035, halfSpan * 0.36);
  const aileronRight = new THREE.Mesh(aileronGeo, mats.accent);
  aileronRight.position.set(
    -Math.tan(sweepRad) * (halfSpan * 0.72) - cr * 0.52,
    Math.tan(dihedralRad) * (halfSpan * 0.72),
    halfSpan * 0.72
  );
  aileronRight.visible = vis.surfaces !== false;
  rightWingGroup.add(aileronRight);

  const flapGeo = new THREE.BoxGeometry(cr * 0.22, cr * 0.035, halfSpan * 0.32);
  const flapRight = new THREE.Mesh(flapGeo, mats.accent);
  flapRight.position.set(
    -Math.tan(sweepRad) * (halfSpan * 0.3) - cr * 0.56,
    Math.tan(dihedralRad) * (halfSpan * 0.3) + Math.sin(flapAngleRad) * (cr * 0.08),
    halfSpan * 0.3
  );
  flapRight.rotation.z = flapAngleRad;
  flapRight.visible = vis.surfaces !== false;
  rightWingGroup.add(flapRight);

  let wingletRight: THREE.Mesh | undefined;
  let wingletLeft: THREE.Mesh | undefined;
  if (g.wingletsEnabled) {
    const wlH = halfSpan * ((g.wingletHeightPct ?? 8) / 100) * 1.4;
    const wlGeo = new THREE.BoxGeometry(ct * 0.65, wlH, 0.035);
    wingletRight = new THREE.Mesh(wlGeo, mats.accent);
    wingletRight.position.set(
      -Math.tan(sweepRad) * halfSpan - ct * 0.22,
      Math.tan(dihedralRad) * halfSpan + wlH * 0.45,
      halfSpan + 0.03
    );
    wingletRight.rotation.x = 0.22;
    wingletRight.visible = vis.winglets !== false;
    rightWingGroup.add(wingletRight);
  }

  rightWingGroup.position.set(L * 0.06, wingYOffset, 0);
  rightWingGroup.visible = vis.wings !== false;
  root.add(rightWingGroup);

  // Left Wing (-Z mirror)
  const leftWingGroup = new THREE.Group();
  const leftWingMesh = new THREE.Mesh(wingGeo, mats.wing);
  leftWingMesh.scale.z = -1;
  leftWingMesh.castShadow = !isSoftwareGl;
  leftWingMesh.receiveShadow = true;
  leftWingGroup.add(leftWingMesh);

  const leftTip = new THREE.Mesh(tipGeo, mats.accent);
  leftTip.position.set(
    -Math.tan(sweepRad) * halfSpan - ct * 0.15,
    Math.tan(dihedralRad) * halfSpan,
    -(halfSpan + 0.02)
  );
  leftWingGroup.add(leftTip);

  const aileronLeft = new THREE.Mesh(aileronGeo, mats.accent);
  aileronLeft.position.set(
    -Math.tan(sweepRad) * (halfSpan * 0.72) - cr * 0.52,
    Math.tan(dihedralRad) * (halfSpan * 0.72),
    -halfSpan * 0.72
  );
  aileronLeft.visible = vis.surfaces !== false;
  leftWingGroup.add(aileronLeft);

  const flapLeft = new THREE.Mesh(flapGeo, mats.accent);
  flapLeft.position.set(
    -Math.tan(sweepRad) * (halfSpan * 0.3) - cr * 0.56,
    Math.tan(dihedralRad) * (halfSpan * 0.3) + Math.sin(flapAngleRad) * (cr * 0.08),
    -halfSpan * 0.3
  );
  flapLeft.rotation.z = flapAngleRad;
  flapLeft.visible = vis.surfaces !== false;
  leftWingGroup.add(flapLeft);

  if (g.wingletsEnabled) {
    const wlH = halfSpan * ((g.wingletHeightPct ?? 8) / 100) * 1.4;
    const wlGeo = new THREE.BoxGeometry(ct * 0.65, wlH, 0.035);
    wingletLeft = new THREE.Mesh(wlGeo, mats.accent);
    wingletLeft.position.set(
      -Math.tan(sweepRad) * halfSpan - ct * 0.22,
      Math.tan(dihedralRad) * halfSpan + wlH * 0.45,
      -(halfSpan + 0.03)
    );
    wingletLeft.rotation.x = -0.22;
    wingletLeft.visible = vis.winglets !== false;
    leftWingGroup.add(wingletLeft);
  }

  leftWingGroup.position.set(L * 0.06, wingYOffset, 0);
  leftWingGroup.visible = vis.wings !== false;
  root.add(leftWingGroup);

  // 4. Empennage (Horizontal Stabilizer + Elevator + Vertical Stabilizer + Rudder)
  const tailGroup = new THREE.Group();
  const hSpan = halfSpan * 0.38;
  const hChord = cr * 0.52;
  const hStab = new THREE.Mesh(
    new THREE.BoxGeometry(hChord, cr * 0.045, hSpan * 2),
    mats.wing
  );
  hStab.castShadow = !isSoftwareGl;
  tailGroup.add(hStab);

  const elevator = new THREE.Mesh(
    new THREE.BoxGeometry(hChord * 0.34, cr * 0.035, hSpan * 1.92),
    mats.accent
  );
  elevator.position.set(-hChord * 0.52, 0, 0);
  tailGroup.add(elevator);

  const vHeight = halfSpan * 0.28;
  const vShape = new THREE.Shape();
  vShape.moveTo(hChord * 0.55, 0);
  vShape.lineTo(-hChord * 0.45, 0);
  vShape.lineTo(-hChord * 0.65, vHeight);
  vShape.lineTo(hChord * 0.05, vHeight);
  vShape.closePath();
  const vGeo = new THREE.ExtrudeGeometry(vShape, { depth: cr * 0.045, bevelEnabled: false });
  vGeo.translate(0, 0, -cr * 0.0225);
  const vStab = new THREE.Mesh(vGeo, mats.body);
  vStab.castShadow = !isSoftwareGl;
  tailGroup.add(vStab);

  const rudder = new THREE.Mesh(
    new THREE.BoxGeometry(hChord * 0.32, vHeight * 0.9, cr * 0.036),
    mats.accent
  );
  rudder.position.set(-hChord * 0.58, vHeight * 0.48, 0);
  tailGroup.add(rudder);

  tailGroup.position.set(-L * 0.44, R * 0.15, 0);
  root.add(tailGroup);

  // 5. Propulsion Group (Spinner + 2-Blade or 3-Blade Propeller)
  const propGroup = new THREE.Group();
  const propR = (g.propDiameterM * normScale) / 2;
  const spinner = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.42, R * 0.85, 16),
    mats.accent
  );
  spinner.rotation.z = -Math.PI / 2;
  spinner.position.x = R * 0.35;
  propGroup.add(spinner);

  const bladeGeo = new THREE.BoxGeometry(0.03, propR * 2, 0.11);
  const blade = new THREE.Mesh(bladeGeo, darkTrimMat);
  blade.rotation.x = 0.25;
  propGroup.add(blade);
  propGroup.position.set(L * 0.51, 0, 0);
  root.add(propGroup);

  // 6. Landing Gear Group (Tricycle / Taildragger / Skid)
  const gearGroup = new THREE.Group();
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.1,
    roughness: 0.88,
  });
  const strutLen = R * 1.45;
  if (g.landingGearType === 'skid') {
    const skidGeo = new THREE.BoxGeometry(L * 0.38, 0.04, 0.05);
    const strutGeo = new THREE.CylinderGeometry(0.02, 0.02, strutLen * 0.7, 8);
    [-R * 0.85, R * 0.85].forEach((zPos) => {
      const skid = new THREE.Mesh(skidGeo, darkTrimMat);
      skid.position.set(0, -R - strutLen * 0.55, zPos);
      const strut = new THREE.Mesh(strutGeo, darkTrimMat);
      strut.position.set(0, -R - strutLen * 0.25, zPos * 0.75);
      strut.rotation.x = zPos > 0 ? -0.35 : 0.35;
      gearGroup.add(skid, strut);
    });
  } else {
    const wheelGeo = new THREE.CylinderGeometry(R * 0.38, R * 0.38, R * 0.22, 16);
    wheelGeo.rotateX(Math.PI / 2);
    const strutGeo = new THREE.CylinderGeometry(0.028, 0.024, strutLen, 10);

    [-R * 1.25, R * 1.25].forEach((zPos) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(L * 0.04, -R - strutLen * 0.8, zPos);
      const s = new THREE.Mesh(strutGeo, darkTrimMat);
      s.position.set(L * 0.04, -R - strutLen * 0.35, zPos * 0.65);
      s.rotation.x = zPos > 0 ? -0.42 : 0.42;
      gearGroup.add(w, s);
    });

    const thirdWheel = new THREE.Mesh(wheelGeo, wheelMat);
    thirdWheel.scale.setScalar(0.75);
    const thirdX = g.landingGearType === 'tricycle' ? L * 0.36 : -L * 0.42;
    const thirdY = g.landingGearType === 'tricycle' ? -R - strutLen * 0.78 : -R * 0.85;
    thirdWheel.position.set(thirdX, thirdY, 0);
    gearGroup.add(thirdWheel);
  }
  root.add(gearGroup);

  fuselageGroup.visible = vis.fuselage !== false;
  tailGroup.visible = vis.tail !== false;
  propGroup.visible = vis.propulsion !== false;
  gearGroup.visible = vis.gear !== false;

  const explodedTargets = [
    { obj: fuselageGroup, basePos: fuselageGroup.position.clone(), offset: new THREE.Vector3(0, 0, 0) },
    { obj: leftWingGroup, basePos: leftWingGroup.position.clone(), offset: new THREE.Vector3(0, 0.45, -1.25) },
    { obj: rightWingGroup, basePos: rightWingGroup.position.clone(), offset: new THREE.Vector3(0, 0.45, 1.25) },
    { obj: tailGroup, basePos: tailGroup.position.clone(), offset: new THREE.Vector3(-1.35, 0.35, 0) },
    { obj: propGroup, basePos: propGroup.position.clone(), offset: new THREE.Vector3(1.15, 0, 0) },
    { obj: gearGroup, basePos: gearGroup.position.clone(), offset: new THREE.Vector3(0, -0.95, 0) },
  ];

  return {
    root,
    fuselageGroup,
    leftWingGroup,
    rightWingGroup,
    tailGroup,
    propGroup,
    gearGroup,
    canopyMesh,
    aileronLeft,
    aileronRight,
    flapLeft,
    flapRight,
    wingletLeft,
    wingletRight,
    elevator,
    rudder,
    explodedTargets,
  };
}

export function extractTrianglesFromObject3D(root: THREE.Object3D): Triangle3D[] {
  root.updateMatrixWorld(true);
  const triangles: Triangle3D[] = [];
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();

  root.traverse((child) => {
    if (!child.visible) return;
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const geom = mesh.geometry;
    const pos = geom?.attributes?.position;
    if (!pos) return;
    const idx = geom.index;
    const count = idx ? idx.count : pos.count;

    for (let i = 0; i + 2 < count; i += 3) {
      const ia = idx ? idx.getX(i) : i;
      const ib = idx ? idx.getX(i + 1) : i + 1;
      const ic = idx ? idx.getX(i + 2) : i + 2;
      va.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
      vb.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
      vc.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
      triangles.push({
        ax: va.x,
        ay: va.y,
        az: va.z,
        bx: vb.x,
        by: vb.y,
        bz: vb.z,
        cx: vc.x,
        cy: vc.y,
        cz: vc.z,
      });
    }
  });

  return triangles;
}

export function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        if (m) {
          const std = m as THREE.MeshStandardMaterial;
          std.map?.dispose();
          m.dispose();
        }
      });
    }
  });
}
