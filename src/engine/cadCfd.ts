import { AircraftProject, CfdConfig } from '../types/aerospace';
import { computeAirfoilPolar, computeWingGeometry } from './aerospace';

export interface IsaAtmosphere {
  altitudeM: number;
  temperatureK: number;
  pressurePa: number;
  densityKgM3: number;
  viscosityPas: number;
  speedOfSoundMs: number;
}

export interface CfdIterationPoint {
  iteration: number;
  cl: number;
  cd: number;
  residual: number;
}

export interface CfdAnalysisResult {
  atmosphere: IsaAtmosphere;
  dynamicPressurePa: number;
  reynoldsNumber: number;
  machNumber: number;
  cl: number;
  cd: number;
  cd0: number;
  cdInduced: number;
  cm: number;
  ldRatio: number;
  liftN: number;
  liftKgf: number;
  dragN: number;
  pitchingMomentNm: number;
  effectiveAspectRatio: number;
  converged: boolean;
  iterations: CfdIterationPoint[];
}

export function computeIsaAtmosphere(altitudeM: number): IsaAtmosphere {
  const h = Math.max(0, Math.min(11000, altitudeM));
  const T0 = 288.15; // K
  const P0 = 101325; // Pa
  const L = 0.0065; // K/m
  const R = 287.058;
  const g = 9.80665;

  const T = T0 - L * h;
  const P = P0 * Math.pow(T / T0, g / (R * L));
  const rho = P / (R * T);
  const a = Math.sqrt(1.4 * R * T);
  // Sutherland's law for air dynamic viscosity
  const mu = 1.716e-5 * Math.pow(T / 273.15, 1.5) * ((273.15 + 110.4) / (T + 110.4));

  return {
    altitudeM: h,
    temperatureK: Number(T.toFixed(2)),
    pressurePa: Number(P.toFixed(0)),
    densityKgM3: Number(rho.toFixed(4)),
    viscosityPas: mu,
    speedOfSoundMs: Number(a.toFixed(2)),
  };
}

export function runCfdAnalysis(
  project: AircraftProject,
  config: CfdConfig
): CfdAnalysisResult {
  const atm = computeIsaAtmosphere(config.altitudeM);
  const { wingAreaM2, aspectRatio, macM } = computeWingGeometry(project.geometry);

  const v = Math.max(1, config.velocityMs);
  const q = 0.5 * atm.densityKgM3 * v * v;
  const reynolds = (atm.densityKgM3 * v * macM) / atm.viscosityPas;
  const mach = v / atm.speedOfSoundMs;

  // Winglets boost effective aspect ratio and reduce induced drag
  const wingletBoost = project.geometry.wingletsEnabled
    ? 1 + 0.015 * (project.geometry.wingletHeightPct ?? 8)
    : 1.0;
  const effectiveAR = aspectRatio * wingletBoost;

  const polar = computeAirfoilPolar(project.airfoil, reynolds, effectiveAR);
  const clampedAoa = Math.max(-6, Math.min(18, config.aoaDeg));
  const lowIdx = Math.floor(clampedAoa) + 6;
  const highIdx = Math.min(polar.length - 1, lowIdx + 1);
  const frac = clampedAoa - Math.floor(clampedAoa);
  const pLow = polar[Math.max(0, lowIdx)];
  const pHigh = polar[Math.max(0, highIdx)];

  const baseCl = pLow.cl + (pHigh.cl - pLow.cl) * frac;
  const baseCd = pLow.cd + (pHigh.cd - pLow.cd) * frac;
  const baseCm = pLow.cm + (pHigh.cm - pLow.cm) * frac;

  // Flap deflection increments CL and adds profile drag
  const flapDeg = Math.max(0, Math.min(30, project.geometry.flapDeflectionDeg ?? 0));
  const deltaClFlap = 0.028 * flapDeg;
  const deltaCdFlap = 0.0009 * flapDeg + 0.00004 * flapDeg * flapDeg;

  // Sideslip beta reduces effective lift slightly and adds fuselage crossflow drag
  const betaRad = (config.sideslipDeg * Math.PI) / 180;
  const cl = Number(((baseCl + deltaClFlap) * Math.cos(betaRad)).toFixed(3));
  const cdSideslip = 0.18 * Math.sin(betaRad) * Math.sin(betaRad);

  const oswald = project.geometry.wingletsEnabled ? 0.87 : 0.82;
  const cdInduced = (cl * cl) / (Math.PI * oswald * Math.max(3, effectiveAR));
  const cd0 = Math.max(0.012, baseCd * 0.45 + deltaCdFlap + cdSideslip);
  const cd = Number((cd0 + cdInduced).toFixed(4));
  const ld = Number((cl / Math.max(0.005, cd)).toFixed(2));

  const liftN = q * wingAreaM2 * cl;
  const dragN = q * wingAreaM2 * cd;
  const pitchingMomentNm = q * wingAreaM2 * macM * baseCm;

  // Generate realistic 20-step CFD solver residual convergence curve
  const iterations: CfdIterationPoint[] = [];
  for (let i = 1; i <= 20; i++) {
    const decay = Math.exp(-0.28 * i);
    const osc = Math.cos(i * 0.8) * decay * 0.14;
    const residual = Math.max(1e-5, Number((0.45 * Math.exp(-0.42 * i)).toFixed(5)));
    iterations.push({
      iteration: i,
      cl: Number((cl * (1 - decay * 0.35 + osc)).toFixed(3)),
      cd: Number((cd * (1 + decay * 0.45 - osc * 0.5)).toFixed(4)),
      residual,
    });
  }

  return {
    atmosphere: atm,
    dynamicPressurePa: Number(q.toFixed(1)),
    reynoldsNumber: Math.round(reynolds),
    machNumber: Number(mach.toFixed(3)),
    cl,
    cd,
    cd0: Number(cd0.toFixed(4)),
    cdInduced: Number(cdInduced.toFixed(4)),
    cm: Number(baseCm.toFixed(3)),
    ldRatio: ld,
    liftN: Number(liftN.toFixed(1)),
    liftKgf: Number((liftN / 9.80665).toFixed(2)),
    dragN: Number(dragN.toFixed(1)),
    pitchingMomentNm: Number(pitchingMomentNm.toFixed(2)),
    effectiveAspectRatio: Number(effectiveAR.toFixed(2)),
    converged: iterations[iterations.length - 1].residual < 5e-4,
    iterations,
  };
}

/**
 * Computes normalized pressure coefficient Cp in [-2.0, +1.0] for 3D CFD surface heatmaps.
 * xNorm: 0 (leading edge) -> 1 (trailing edge)
 */
export function computeSurfaceCp(
  xNorm: number,
  isUpper: boolean,
  aoaDeg: number,
  camberPct: number
): number {
  const x = Math.max(0, Math.min(1, xNorm));
  // Stagnation near leading edge (x ~ 0 -> Cp ~ +1.0)
  const stagnation = Math.exp(-x * 16) * 1.0;
  const aoaFactor = aoaDeg / 10;
  const camberFactor = camberPct / 5;

  if (isUpper) {
    // Suction peak around 12-22% chord on upper surface
    const suction =
      -Math.exp(-Math.pow((x - 0.18) / 0.25, 2)) *
      (0.75 + aoaFactor * 0.95 + camberFactor * 0.45);
    const recovery = x * 0.15;
    return Math.max(-2.2, Math.min(1.0, stagnation * 0.55 + suction + recovery));
  }
  // Lower surface positive pressure under positive AoA
  const lowerPress = (0.25 + aoaFactor * 0.48) * (1 - x * 0.65);
  return Math.max(-1.0, Math.min(1.0, stagnation * 0.8 + lowerPress));
}

export function cpToRgb(cp: number): [number, number, number] {
  // Map Cp from -2.0 (deep suction blue) -> -0.5 (cyan) -> 0.0 (emerald) -> +0.5 (amber) -> +1.0 (stagnation red)
  const t = Math.max(0, Math.min(1, (cp + 1.8) / 2.8));
  if (t < 0.25) {
    const k = t / 0.25;
    return [0.05, 0.25 + 0.55 * k, 0.95];
  }
  if (t < 0.5) {
    const k = (t - 0.25) / 0.25;
    return [0.05 + 0.15 * k, 0.8 + 0.1 * k, 0.95 - 0.55 * k];
  }
  if (t < 0.75) {
    const k = (t - 0.5) / 0.25;
    return [0.2 + 0.75 * k, 0.9 - 0.2 * k, 0.4 - 0.32 * k];
  }
  const k = (t - 0.75) / 0.25;
  return [0.95, 0.7 - 0.55 * k, 0.08];
}

export interface Triangle3D {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
}

export function exportTrianglesToAsciiStl(
  solidName: string,
  triangles: Triangle3D[]
): string {
  const safeName = solidName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const lines: string[] = [`solid ${safeName}`];

  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    const ux = t.bx - t.ax;
    const uy = t.by - t.ay;
    const uz = t.bz - t.az;
    const vx = t.cx - t.ax;
    const vy = t.cy - t.ay;
    const vz = t.cz - t.az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    lines.push(`  facet normal ${nx.toExponential(4)} ${ny.toExponential(4)} ${nz.toExponential(4)}`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${t.ax.toFixed(5)} ${t.ay.toFixed(5)} ${t.az.toFixed(5)}`);
    lines.push(`      vertex ${t.bx.toFixed(5)} ${t.by.toFixed(5)} ${t.bz.toFixed(5)}`);
    lines.push(`      vertex ${t.cx.toFixed(5)} ${t.cy.toFixed(5)} ${t.cz.toFixed(5)}`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
  }

  lines.push(`endsolid ${safeName}`);
  return lines.join('\n');
}

export function exportTrianglesToObj(
  objectName: string,
  triangles: Triangle3D[]
): string {
  const safeName = objectName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const lines: string[] = [`# AeroForge Studio CAD Mesh Export`, `o ${safeName}`];
  let vIdx = 1;
  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    lines.push(`v ${t.ax.toFixed(5)} ${t.ay.toFixed(5)} ${t.az.toFixed(5)}`);
    lines.push(`v ${t.bx.toFixed(5)} ${t.by.toFixed(5)} ${t.bz.toFixed(5)}`);
    lines.push(`v ${t.cx.toFixed(5)} ${t.cy.toFixed(5)} ${t.cz.toFixed(5)}`);
    lines.push(`f ${vIdx} ${vIdx + 1} ${vIdx + 2}`);
    vIdx += 3;
  }
  return lines.join('\n');
}
