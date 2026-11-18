import {
  AircraftProject,
  AirfoilParams,
  AvionicsItem,
  FeaSummary,
  FlightSimTelemetry,
  Geometry2D3D,
  MaterialId,
  MissionRequirements,
  PolarPoint,
  SizingResults,
  StabilityResults,
} from '../types/aerospace';

const G = 9.80665;
const RHO_SL = 1.225; // kg/m³
const MU_AIR = 1.789e-5; // Pa·s
const SPEED_OF_SOUND = 340.29; // m/s

export interface MaterialSpec {
  id: MaterialId;
  name: string;
  yieldMpa: number;
  modulusGpa: number;
  densityKgM3: number;
}

export const MATERIALS: Record<MaterialId, MaterialSpec> = {
  al6061: {
    id: 'al6061',
    name: 'Alumínio Aeronáutico 6061-T6',
    yieldMpa: 276,
    modulusGpa: 68.9,
    densityKgM3: 2700,
  },
  cfrp: {
    id: 'cfrp',
    name: 'Fibra de Carbono Unidirecional (CFRP)',
    yieldMpa: 620,
    modulusGpa: 135.0,
    densityKgM3: 1580,
  },
  balsa_ply: {
    id: 'balsa_ply',
    name: 'Compensado Birch / Balsa Estrutural',
    yieldMpa: 48,
    modulusGpa: 9.8,
    densityKgM3: 540,
  },
};

export function computeWingGeometry(geom: Geometry2D3D) {
  const wingAreaM2 = ((geom.rootChordM + geom.tipChordM) / 2) * geom.wingspanM;
  const aspectRatio = (geom.wingspanM * geom.wingspanM) / Math.max(0.01, wingAreaM2);
  const taperRatio = geom.tipChordM / Math.max(0.01, geom.rootChordM);
  const macM =
    (2 / 3) *
    geom.rootChordM *
    ((1 + taperRatio + taperRatio * taperRatio) / (1 + taperRatio));
  return { wingAreaM2, aspectRatio, taperRatio, macM };
}

export function computeSizing(
  req: MissionRequirements,
  geom: Geometry2D3D
): SizingResults {
  const mtowKg = Number(
    Math.max(0.1, req.emptyMassKg + req.payloadMassKg + req.energyMassKg).toFixed(3)
  );
  const weightN = mtowKg * G;
  const { wingAreaM2, aspectRatio, macM } = computeWingGeometry(geom);
  const wingLoadingKgM2 = mtowKg / Math.max(0.01, wingAreaM2);
  const powerToWeightWKg = (req.installedPowerKw * 1000) / mtowKg;

  // Stall speed from CLmax
  const stallSpeedMs = Math.sqrt(
    (2 * weightN) / (RHO_SL * wingAreaM2 * Math.max(0.4, req.clMax))
  );

  const cruiseSpeedMs = Math.max(stallSpeedMs * 1.15, req.cruiseSpeedMs);
  const machNumber = cruiseSpeedMs / SPEED_OF_SOUND;
  const reynoldsNumber = (RHO_SL * cruiseSpeedMs * macM) / MU_AIR;

  // Required cruise power: P = (W / (L/D)) * V / eta_p
  const dragCruiseN = weightN / Math.max(2, req.ldRatio);
  const requiredPowerKw =
    (dragCruiseN * cruiseSpeedMs) / (1000 * Math.max(0.3, req.propEfficiency));
  const powerMarginPct =
    ((req.installedPowerKw - requiredPowerKw) / Math.max(0.01, requiredPowerKw)) * 100;

  // Takeoff ground roll approximation (Raymer simplified)
  const vLiftoff = 1.15 * stallSpeedMs;
  const avgThrustN =
    (req.installedPowerKw * 1000 * req.propEfficiency * 0.72) /
    Math.max(5, vLiftoff * 0.7);
  const muRoll = 0.04;
  const netAccel = Math.max(
    0.5,
    (avgThrustN - muRoll * weightN) / mtowKg
  );
  const takeoffDistanceM = (vLiftoff * vLiftoff) / (2 * netAccel);

  // Range and endurance
  let enduranceHours = 0;
  let estimatedRangeKm = 0;

  if (req.propulsion === 'electric') {
    const specificWh = req.batterySpecificEnergyWhKg ?? 180;
    const usableEnergyWh = req.energyMassKg * specificWh * 0.85; // 85% DoD reserve
    const cruiseDrawW = requiredPowerKw * 1000 * 1.08; // avionics + ESC loss
    enduranceHours = usableEnergyWh / Math.max(10, cruiseDrawW);
    estimatedRangeKm = (cruiseSpeedMs * 3.6) * enduranceHours;
  } else {
    const sfc = req.specificFuelConsumption ?? 0.28; // kg/(kW*h)
    const usableFuelKg = req.energyMassKg * 0.9; // 10% reserve
    const fuelFlowKgH = requiredPowerKw * sfc;
    enduranceHours = usableFuelKg / Math.max(0.1, fuelFlowKgH);
    estimatedRangeKm = (cruiseSpeedMs * 3.6) * enduranceHours;
  }

  return {
    mtowKg,
    weightN,
    wingAreaM2,
    aspectRatio,
    wingLoadingKgM2,
    powerToWeightWKg,
    stallSpeedMs,
    cruiseSpeedMs,
    takeoffDistanceM,
    estimatedRangeKm,
    enduranceHours,
    reynoldsNumber,
    machNumber,
    requiredPowerKw,
    powerMarginPct,
    runwayCompliant: takeoffDistanceM <= req.runwayLimitM,
    rangeCompliant: estimatedRangeKm >= req.targetRangeKm,
  };
}

export interface AirfoilCoord {
  x: number;
  y: number;
}

export interface AirfoilProfile {
  upper: AirfoilCoord[];
  lower: AirfoilCoord[];
  camber: AirfoilCoord[];
  code: string;
}

export function formatNacaCode(mPct: number, pTenths: number, tPct: number): string {
  const m = Math.max(0, Math.min(9, Math.round(mPct)));
  const p = m === 0 ? 0 : Math.max(1, Math.min(9, Math.round(pTenths)));
  const t = Math.max(4, Math.min(28, Math.round(tPct)));
  return `${m}${p}${t.toString().padStart(2, '0')}`;
}

export function generateNaca4Coordinates(
  mPct: number,
  pTenths: number,
  tPct: number,
  numPoints = 48
): AirfoilProfile {
  const m = Math.max(0, Math.min(0.09, mPct / 100));
  const p = m === 0 ? 0.4 : Math.max(0.1, Math.min(0.9, pTenths / 10));
  const t = Math.max(0.04, Math.min(0.28, tPct / 100));

  const upper: AirfoilCoord[] = [];
  const lower: AirfoilCoord[] = [];
  const camber: AirfoilCoord[] = [];

  for (let i = 0; i <= numPoints; i++) {
    // Cosine spacing for high leading-edge resolution
    const beta = (i / numPoints) * Math.PI;
    const x = 0.5 * (1 - Math.cos(beta));

    // Thickness distribution (closed trailing edge -0.1036)
    const yt =
      5 *
      t *
      (0.2969 * Math.sqrt(x) -
        0.126 * x -
        0.3516 * x * x +
        0.2843 * x * x * x -
        0.1036 * x * x * x * x);

    let yc = 0;
    let dycDx = 0;
    if (m > 0) {
      if (x < p) {
        yc = (m / (p * p)) * (2 * p * x - x * x);
        dycDx = ((2 * m) / (p * p)) * (p - x);
      } else {
        yc = (m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
        dycDx = ((2 * m) / ((1 - p) * (1 - p))) * (p - x);
      }
    }

    const theta = Math.atan(dycDx);
    upper.push({
      x: x - yt * Math.sin(theta),
      y: yc + yt * Math.cos(theta),
    });
    lower.push({
      x: x + yt * Math.sin(theta),
      y: yc - yt * Math.cos(theta),
    });
    camber.push({ x, y: yc });
  }

  return {
    upper,
    lower,
    camber,
    code: formatNacaCode(mPct, pTenths, tPct),
  };
}

export function computeAirfoilPolar(
  airfoil: AirfoilParams,
  reynolds: number,
  aspectRatio = 8
): PolarPoint[] {
  const m = airfoil.maxCamberPct / 100;
  const t = airfoil.thicknessPct / 100;
  // Thin airfoil zero-lift AoA approximation: roughly -1.15 deg per % camber
  const alphaZeroLift = -1.15 * airfoil.maxCamberPct;
  // Stall angle increases slightly with thickness up to ~16%
  const alphaStall = 11.5 + Math.min(0.18, t) * 28 - m * 12;
  // Re-dependent skin friction Cd0
  const reClamped = Math.max(5e4, reynolds);
  const cf = 0.074 / Math.pow(reClamped, 0.2);
  const cd0 = 2 * cf * (1 + 2.1 * t + 60 * Math.pow(t, 4));
  const oswald = 0.82;

  const points: PolarPoint[] = [];
  for (let alpha = -6; alpha <= 18; alpha += 1) {
    const effAlphaRad = ((alpha - alphaZeroLift) * Math.PI) / 180;
    const liftSlope = (2 * Math.PI) / (1 + 2 / Math.max(3, aspectRatio));
    let clLinear = liftSlope * effAlphaRad;

    // Smooth post-stall blend
    let cl = clLinear;
    let cdSep = 0;
    if (alpha > alphaStall) {
      const over = alpha - alphaStall;
      const stallFactor = Math.exp(-0.18 * over * over);
      const clPeak = liftSlope * (((alphaStall - alphaZeroLift) * Math.PI) / 180);
      cl = clPeak * (0.62 + 0.38 * stallFactor);
      cdSep = 0.035 * over * over * 0.25;
    }

    const cdInduced = (cl * cl) / (Math.PI * oswald * Math.max(3, aspectRatio));
    const cd = cd0 + cdInduced + cdSep + 0.0025 * Math.pow((alpha - 2) / 10, 2);
    const cm = -0.025 * airfoil.maxCamberPct - 0.004 * (alpha - alphaZeroLift);
    const ld = cl / Math.max(0.004, cd);

    points.push({
      alphaDeg: alpha,
      cl: Number(cl.toFixed(3)),
      cd: Number(cd.toFixed(4)),
      cm: Number(cm.toFixed(3)),
      ld: Number(ld.toFixed(2)),
    });
  }

  return points;
}

export function computeStability(geom: Geometry2D3D): StabilityResults {
  const { wingAreaM2, macM } = computeWingGeometry(geom);
  const xAcPercentMac = 25.0; // subsonic quarter-chord aerodynamic center

  // Horizontal & Vertical tail volume coefficients
  const hTailVolumeCoeff =
    (geom.hTailAreaM2 * geom.tailArmM) /
    Math.max(0.001, wingAreaM2 * macM);
  const vTailVolumeCoeff =
    (geom.vTailAreaM2 * geom.tailArmM) /
    Math.max(0.001, wingAreaM2 * geom.wingspanM);

  // Neutral point approximation: X_NP = X_AC + eta_t * V_H * (a_t / a_w) * (1 - dEps/dAlpha)
  const downwashTerm = 0.65; // (1 - de/da)
  const tailEff = 0.90;
  const liftCurveRatio = 0.85;
  const npShiftPercent = tailEff * hTailVolumeCoeff * liftCurveRatio * downwashTerm * 100;
  const neutralPointPercentMac = xAcPercentMac + npShiftPercent;
  const staticMarginPct = neutralPointPercentMac - geom.cgPercentMac;

  let status: StabilityResults['status'] = 'Estável';
  if (staticMarginPct < 3) status = 'Instável';
  else if (staticMarginPct < 7 || staticMarginPct > 30) status = 'Marginal';

  return {
    macM,
    xAcPercentMac,
    hTailVolumeCoeff,
    vTailVolumeCoeff,
    neutralPointPercentMac,
    staticMarginPct,
    status,
  };
}

export function computeFeaWing(project: AircraftProject): FeaSummary {
  const mat = MATERIALS[project.structures.materialId];
  const sizing = computeSizing(project.requirements, project.geometry);
  const { wingspanM } = project.geometry;
  const halfSpan = wingspanM / 2;
  const {
    sparWidthMm,
    sparHeightMm,
    sparWallMm,
    designLoadFactorG,
  } = project.structures;

  // Hollow rectangular box spar moment of inertia I_xx (m^4)
  const bOut = sparWidthMm / 1000;
  const hOut = sparHeightMm / 1000;
  const wall = Math.min(Math.min(bOut, hOut) * 0.45, sparWallMm / 1000);
  const bIn = Math.max(0.001, bOut - 2 * wall);
  const hIn = Math.max(0.001, hOut - 2 * wall);
  const Ixx = (bOut * Math.pow(hOut, 3) - bIn * Math.pow(hIn, 3)) / 12;
  const areaSparM2 = bOut * hOut - bIn * hIn;
  const sparMassKg = areaSparM2 * wingspanM * mat.densityKgM3;

  // Total lift on ONE wing under design load factor (G)
  const totalLiftOneWingN = (sizing.weightN * designLoadFactorG) / 2;
  const numStations = 20;
  const dy = halfSpan / numStations;

  // Elliptical lift distribution: L'(y) = L_0 * sqrt(1 - (y/b_half)^2)
  // Integral from 0 to halfSpan of sqrt(1 - u^2) dy = (pi/4) * halfSpan
  const l0 = totalLiftOneWingN / ((Math.PI / 4) * halfSpan);

  const yCoords: number[] = [];
  const liftDist: number[] = [];
  for (let i = 0; i <= numStations; i++) {
    const u = i / numStations;
    const y = u * halfSpan;
    yCoords.push(y);
    liftDist.push(l0 * Math.sqrt(Math.max(0, 1 - u * u)));
  }

  // Integrate from tip (i = numStations) back to root (i = 0)
  const shear: number[] = new Array(numStations + 1).fill(0);
  const moment: number[] = new Array(numStations + 1).fill(0);

  for (let i = numStations - 1; i >= 0; i--) {
    const avgLift = 0.5 * (liftDist[i] + liftDist[i + 1]);
    shear[i] = shear[i + 1] + avgLift * dy;
    const avgShear = 0.5 * (shear[i] + shear[i + 1]);
    moment[i] = moment[i + 1] + avgShear * dy;
  }

  // Integrate Euler-Bernoulli curvature M(y)/(E*I) from root (i = 0) to tip (i = numStations)
  const E = mat.modulusGpa * 1e9;
  const EI = Math.max(1, E * Ixx);
  const slope: number[] = new Array(numStations + 1).fill(0);
  const deflectionM: number[] = new Array(numStations + 1).fill(0);

  for (let i = 1; i <= numStations; i++) {
    const avgCurv = 0.5 * (moment[i - 1] + moment[i]) / EI;
    slope[i] = slope[i - 1] + avgCurv * dy;
    const avgSlope = 0.5 * (slope[i - 1] + slope[i]);
    deflectionM[i] = deflectionM[i - 1] + avgSlope * dy;
  }

  const cHalf = hOut / 2;
  const stations = yCoords.map((y, i) => {
    const bendingStressPa = (moment[i] * cHalf) / Math.max(1e-12, Ixx);
    const shearStressPa = (shear[i] * 1.5) / Math.max(1e-8, areaSparM2);
    const vonMisesMpa =
      Math.sqrt(bendingStressPa * bendingStressPa + 3 * shearStressPa * shearStressPa) / 1e6;
    return {
      spanFraction: i / numStations,
      yMeters: Number(y.toFixed(3)),
      liftDensityNM: Number(liftDist[i].toFixed(1)),
      shearN: Number(shear[i].toFixed(1)),
      bendingMomentNm: Number(moment[i].toFixed(1)),
      vonMisesMpa: Number(vonMisesMpa.toFixed(2)),
      deflectionMm: Number((deflectionM[i] * 1000).toFixed(2)),
    };
  });

  const maxVonMisesMpa = Math.max(...stations.map((s) => s.vonMisesMpa));
  const tipDeflectionMm = stations[stations.length - 1].deflectionMm;
  const tipDeflectionPctSpan = (tipDeflectionMm / 1000 / wingspanM) * 100;
  const safetyFactorActual = mat.yieldMpa / Math.max(0.01, maxVonMisesMpa);

  return {
    materialName: mat.name,
    yieldStrengthMpa: mat.yieldMpa,
    elasticModulusGpa: mat.modulusGpa,
    densityKgM3: mat.densityKgM3,
    maxShearN: stations[0].shearN,
    maxBendingMomentNm: stations[0].bendingMomentNm,
    maxVonMisesMpa,
    tipDeflectionMm,
    tipDeflectionPctSpan,
    safetyFactorActual: Number(safetyFactorActual.toFixed(2)),
    sparMassKg: Number(sparMassKg.toFixed(2)),
    approved: safetyFactorActual >= project.structures.safetyFactorTarget,
    stations,
  };
}

export function generateCamGCode(project: AircraftProject): string {
  const { airfoil, geometry, cam } = project;
  const chordMm = geometry.rootChordM * 1000;
  const toolRadius = cam.toolDiameterMm / 2;
  const profile = generateNaca4Coordinates(
    airfoil.maxCamberPct,
    airfoil.camberPosTenths,
    airfoil.thicknessPct,
    40
  );

  // Build closed perimeter points (upper LE->TE, then lower TE->LE) with outward tool offset
  const rawPts = [
    ...profile.upper,
    ...profile.lower.slice().reverse().slice(1),
  ];

  const offsetPts = rawPts.map((pt, idx) => {
    const prev = rawPts[(idx - 1 + rawPts.length) % rawPts.length];
    const next = rawPts[(idx + 1) % rawPts.length];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    // Outward normal for clockwise loop
    const nx = -dy / len;
    const ny = dx / len;
    return {
      x: pt.x * chordMm + nx * toolRadius,
      y: pt.y * chordMm + ny * toolRadius,
    };
  });

  const lines: string[] = [
    `(AeroForge Studio - Percurso CAM CNC / Nervura NACA ${profile.code})`,
    `(Projeto: ${project.name})`,
    `(Material: ${cam.sheetMaterialName} | Corda: ${chordMm.toFixed(1)} mm)`,
    `(Fresa: D=${cam.toolDiameterMm.toFixed(1)} mm | Abas de retencao: ${cam.tabCount})`,
    `G21 (Unidades em milimetros)`,
    `G90 (Coordenadas absolutas)`,
    `G17 (Plano XY)`,
    `M03 S${cam.spindleRpm} (Ligar spindle)`,
    `G00 Z5.000 (Altura de seguranca)`,
    `G00 X${offsetPts[0].x.toFixed(3)} Y${offsetPts[0].y.toFixed(3)}`,
    `G01 Z-${cam.cutDepthMm.toFixed(3)} F${Math.round(cam.feedRateMmMin * 0.4)} (Mergulho)`,
    `F${cam.feedRateMmMin}`,
  ];

  const tabInterval = Math.max(5, Math.floor(offsetPts.length / Math.max(1, cam.tabCount)));
  offsetPts.forEach((pt, i) => {
    if (i > 0 && i % tabInterval === 0 && i < offsetPts.length - 2) {
      // Holding bridge tab
      lines.push(`G01 Z-${Math.max(0.4, cam.cutDepthMm * 0.35).toFixed(3)} (Aba de retencao)`);
      lines.push(`G01 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)}`);
      lines.push(`G01 Z-${cam.cutDepthMm.toFixed(3)}`);
    } else {
      lines.push(`G01 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)}`);
    }
  });

  lines.push(
    `G01 X${offsetPts[0].x.toFixed(3)} Y${offsetPts[0].y.toFixed(3)}`,
    `G00 Z15.000 (Retracao final)`,
    `M05 (Desligar spindle)`,
    `G00 X0.000 Y0.000`,
    `M30 (Fim do programa)`
  );

  return lines.join('\n');
}

export function generateDxf2DBlueprint(project: AircraftProject): string {
  const { geometry, airfoil } = project;
  const halfB = (geometry.wingspanM * 1000) / 2;
  const cr = geometry.rootChordM * 1000;
  const ct = geometry.tipChordM * 1000;
  const sweepOffset = Math.tan((geometry.sweepDeg * Math.PI) / 180) * halfB;
  const fuseL = geometry.fuselageLengthM * 1000;
  const fuseW = geometry.fuselageDiameterM * 1000;

  const profile = generateNaca4Coordinates(
    airfoil.maxCamberPct,
    airfoil.camberPosTenths,
    airfoil.thicknessPct,
    36
  );

  const entities: string[] = [];
  const addLine = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    entities.push(
      `0\nLINE\n8\n${layer}\n10\n${x1.toFixed(2)}\n20\n${y1.toFixed(2)}\n30\n0.0\n11\n${x2.toFixed(2)}\n21\n${y2.toFixed(2)}\n31\n0.0`
    );
  };

  // Top-view Right & Left Wing
  const wingX = fuseL * 0.3;
  // Right wing
  addLine('CONTORNO_ASA', wingX, 0, wingX + sweepOffset, halfB);
  addLine('CONTORNO_ASA', wingX + sweepOffset, halfB, wingX + sweepOffset + ct, halfB);
  addLine('CONTORNO_ASA', wingX + sweepOffset + ct, halfB, wingX + cr, 0);
  // Left wing
  addLine('CONTORNO_ASA', wingX, 0, wingX + sweepOffset, -halfB);
  addLine('CONTORNO_ASA', wingX + sweepOffset, -halfB, wingX + sweepOffset + ct, -halfB);
  addLine('CONTORNO_ASA', wingX + sweepOffset + ct, -halfB, wingX + cr, 0);

  // Top-view Fuselage centerline & outline
  addLine('FUSELAGEM', 0, -fuseW * 0.2, fuseL * 0.15, -fuseW * 0.5);
  addLine('FUSELAGEM', fuseL * 0.15, -fuseW * 0.5, fuseL * 0.65, -fuseW * 0.45);
  addLine('FUSELAGEM', fuseL * 0.65, -fuseW * 0.45, fuseL, -fuseW * 0.12);
  addLine('FUSELAGEM', fuseL, -fuseW * 0.12, fuseL, fuseW * 0.12);
  addLine('FUSELAGEM', fuseL, fuseW * 0.12, fuseL * 0.65, fuseW * 0.45);
  addLine('FUSELAGEM', fuseL * 0.65, fuseW * 0.45, fuseL * 0.15, fuseW * 0.5);
  addLine('FUSELAGEM', fuseL * 0.15, fuseW * 0.5, 0, fuseW * 0.2);
  addLine('FUSELAGEM', 0, fuseW * 0.2, 0, -fuseW * 0.2);

  // NACA Rib 1:1 offset below top-view
  const ribOffsetY = -halfB - cr * 1.4;
  const ribPts = [...profile.upper, ...profile.lower.slice().reverse()];
  for (let i = 0; i < ribPts.length - 1; i++) {
    addLine(
      'NERVURA_NACA',
      ribPts[i].x * cr,
      ribPts[i].y * cr + ribOffsetY,
      ribPts[i + 1].x * cr,
      ribPts[i + 1].y * cr + ribOffsetY
    );
  }

  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${entities.join('\n')}\n0\nENDSEC\n0\nEOF`;
}

export function computeAvionicsBudget(items: AvionicsItem[]) {
  const active = items.filter((i) => i.enabled);
  const totalCurrentA = active.reduce((acc, i) => acc + i.currentA, 0);
  const totalPowerW = active.reduce((acc, i) => acc + i.currentA * i.voltageV, 0);
  const totalMassG = active.reduce((acc, i) => acc + i.massG, 0);
  // Conservative ampacity rule for aerospace harnesses
  let recommendedMainAwg = 22;
  if (totalCurrentA > 60) recommendedMainAwg = 8;
  else if (totalCurrentA > 35) recommendedMainAwg = 10;
  else if (totalCurrentA > 20) recommendedMainAwg = 12;
  else if (totalCurrentA > 12) recommendedMainAwg = 14;
  else if (totalCurrentA > 6) recommendedMainAwg = 16;
  else if (totalCurrentA > 3) recommendedMainAwg = 18;

  return {
    activeCount: active.length,
    totalCurrentA: Number(totalCurrentA.toFixed(2)),
    totalPowerW: Number(totalPowerW.toFixed(1)),
    totalMassG,
    recommendedMainAwg,
  };
}

export interface FlightControlsInput {
  pitchCmd: number; // -1 to 1 (stick back = +1 pitch up)
  rollCmd: number; // -1 to 1 (right = +1)
  yawCmd: number; // -1 to 1
  throttlePct: number; // 0 to 100
  autopilotEnabled: boolean;
  targetAltitudeM: number;
}

export function stepFlightDynamics(
  state: FlightSimTelemetry,
  controls: FlightControlsInput,
  sizing: SizingResults,
  stability: StabilityResults,
  dtSec: number
): FlightSimTelemetry {
  const dt = Math.min(0.08, Math.max(0.001, dtSec));
  const vMin = sizing.stallSpeedMs * 0.92;
  const vMax = sizing.cruiseSpeedMs * 1.45;
  const vCruise = sizing.cruiseSpeedMs;

  // Autopilot PID-style attitude & altitude hold
  let effPitchCmd = controls.pitchCmd;
  let effRollCmd = controls.rollCmd;
  let effThrottle = controls.throttlePct;

  if (controls.autopilotEnabled) {
    const altErr = controls.targetAltitudeM - state.altitudeM;
    const targetPitch = Math.max(-12, Math.min(14, altErr * 0.28));
    effPitchCmd = Math.max(-1, Math.min(1, (targetPitch - state.pitchDeg) * 0.12));
    effRollCmd = Math.max(-1, Math.min(1, (0 - state.rollDeg) * 0.08));
    const speedErr = vCruise - state.airspeedMs;
    effThrottle = Math.max(35, Math.min(95, 65 + speedErr * 2.5));
  }

  // Stability damping factor from Static Margin
  const smFactor = Math.max(0.4, Math.min(1.6, stability.staticMarginPct / 12));

  // Pitch, Roll, Yaw integration
  const pitchRateDeg = effPitchCmd * 38 - state.pitchDeg * 0.45 * smFactor;
  const rollRateDeg = effRollCmd * 68 - state.rollDeg * 0.65;
  const yawRateDeg =
    controls.yawCmd * 24 + Math.sin((state.rollDeg * Math.PI) / 180) * 18;

  const pitchDeg = Math.max(-35, Math.min(35, state.pitchDeg + pitchRateDeg * dt));
  const rollDeg = Math.max(-60, Math.min(60, state.rollDeg + rollRateDeg * dt));
  const yawDeg = (state.yawDeg + yawRateDeg * dt + 360) % 360;

  // Longitudinal airspeed dynamics (thrust - drag - gravity component along flight path)
  const throttleFrac = effThrottle / 100;
  const targetV = vMin + throttleFrac * (vMax - vMin);
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const accelMs2 = (targetV - state.airspeedMs) * 0.75 - Math.sin(pitchRad) * 3.8;
  const airspeedMs = Math.max(
    sizing.stallSpeedMs * 0.75,
    Math.min(vMax * 1.1, state.airspeedMs + accelMs2 * dt)
  );

  // Vertical speed & altitude
  const liftFactor = Math.min(1.8, (airspeedMs / Math.max(5, sizing.stallSpeedMs)) ** 2 * 0.7);
  const vsiMs = airspeedMs * Math.sin(pitchRad) + (liftFactor - 1) * 1.2;
  const altitudeM = Math.max(0, state.altitudeM + vsiMs * dt);

  const aoaDeg = Math.max(-4, Math.min(18, 3.2 + effPitchCmd * 6.5));
  const gForce = Math.max(
    0.2,
    Math.min(
      6.5,
      1.0 / Math.max(0.35, Math.cos((rollDeg * Math.PI) / 180)) +
        (pitchRateDeg * Math.PI) / 180 * 0.4
    )
  );

  return {
    airspeedMs: Number(airspeedMs.toFixed(1)),
    altitudeM: Number(altitudeM.toFixed(1)),
    vsiMs: Number(vsiMs.toFixed(2)),
    pitchDeg: Number(pitchDeg.toFixed(1)),
    rollDeg: Number(rollDeg.toFixed(1)),
    yawDeg: Number(yawDeg.toFixed(1)),
    aoaDeg: Number(aoaDeg.toFixed(1)),
    gForce: Number(gForce.toFixed(2)),
    throttlePct: Math.round(effThrottle),
    autopilotEnabled: controls.autopilotEnabled,
    targetAltitudeM: controls.targetAltitudeM,
    distanceFlownM: Number((state.distanceFlownM + airspeedMs * dt).toFixed(1)),
  };
}

export interface ConstraintPoint {
  wingLoadingKgM2: number;
  cruisePW: number; // W/kg
  takeoffPW: number; // W/kg
}

export function computeConstraintDiagram(project: AircraftProject): {
  stallLimitKgM2: number;
  points: ConstraintPoint[];
} {
  const req = project.requirements;
  const sizing = computeSizing(req, project.geometry);

  // Max wing loading allowed by target stall speed
  const stallLimitKgM2 =
    (0.5 * RHO_SL * req.stallSpeedMs * req.stallSpeedMs * req.clMax) / G;

  const maxWL = Math.max(stallLimitKgM2 * 1.45, sizing.wingLoadingKgM2 * 1.4);
  const minWL = Math.max(3, maxWL * 0.25);

  const points: ConstraintPoint[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const wl = minWL + (i / steps) * (maxWL - minWL);
    const qCruise = 0.5 * RHO_SL * req.cruiseSpeedMs * req.cruiseSpeedMs;
    const cd0 = 0.026;
    const k = 1 / (Math.PI * 0.82 * Math.max(4, sizing.aspectRatio));
    const clCruise = (wl * G) / qCruise;
    const dragToWeight = (qCruise * cd0) / (wl * G) + k * clCruise;
    const cruisePW = (dragToWeight * req.cruiseSpeedMs * G) / Math.max(0.4, req.propEfficiency);

    // Takeoff constraint: P/W proportional to W/S / (runway * CLmax)
    const takeoffPW =
      ((wl * G) / (RHO_SL * req.clMax * Math.max(15, req.runwayLimitM))) *
      req.stallSpeedMs *
      1.85;

    points.push({
      wingLoadingKgM2: Number(wl.toFixed(1)),
      cruisePW: Number(cruisePW.toFixed(1)),
      takeoffPW: Number(takeoffPW.toFixed(1)),
    });
  }

  return {
    stallLimitKgM2: Number(stallLimitKgM2.toFixed(1)),
    points,
  };
}

export function generatePythonTradeStudyScript(project: AircraftProject): string {
  const req = project.requirements;
  const sizing = computeSizing(req, project.geometry);
  return `# Script Python - Estudo Parametrico de Requisitos (${project.name})
import math

# 1. Parametros de Missao
m_vazia = ${req.emptyMassKg.toFixed(2)}      # kg
m_carga = ${req.payloadMassKg.toFixed(2)}      # kg
m_energia = ${req.energyMassKg.toFixed(2)}    # kg (${req.propulsion === 'electric' ? 'Bateria' : 'Combustivel'})
v_cruzeiro = ${req.cruiseSpeedMs.toFixed(1)}   # m/s
v_estol_meta = ${req.stallSpeedMs.toFixed(1)} # m/s
pista_max = ${req.runwayLimitM.toFixed(0)}     # m
cl_max = ${req.clMax.toFixed(2)}
ld_ratio = ${req.ldRatio.toFixed(1)}

# 2. Balanco de Massa e Carga Alar
mtow = m_vazia + m_carga + m_energia
peso_n = mtow * 9.80665
area_alar = ${sizing.wingAreaM2.toFixed(3)}  # m^2 (b=${project.geometry.wingspanM.toFixed(2)} m)
carga_alar = mtow / area_alar
v_estol_real = math.sqrt((2 * peso_n) / (1.225 * area_alar * cl_max))

# 3. Potencia Requerida e Alcance
p_req_kw = (peso_n / ld_ratio) * v_cruzeiro / (1000 * ${req.propEfficiency.toFixed(2)})
print(f"MTOW={mtow:.2f} kg | W/S={carga_alar:.1f} kg/m2 | P_req={p_req_kw:.2f} kW")
print(f"V_estol={v_estol_real:.2f} m/s | Pista={${sizing.takeoffDistanceM.toFixed(1)}} m | Alcance={${sizing.estimatedRangeKm.toFixed(1)}} km")`;
}
