import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT_PRESETS } from '../data/presets';
import {
  computeIsaAtmosphere,
  computeSurfaceCp,
  cpToRgb,
  exportTrianglesToAsciiStl,
  exportTrianglesToObj,
  runCfdAnalysis,
} from './cadCfd';

test('computeIsaAtmosphere matches standard sea-level and 3000m density', () => {
  const sl = computeIsaAtmosphere(0);
  assert.equal(sl.densityKgM3, 1.225);
  assert.equal(sl.pressurePa, 101325);

  const alt3k = computeIsaAtmosphere(3000);
  assert.ok(alt3k.densityKgM3 > 0.88 && alt3k.densityKgM3 < 0.93);
  assert.ok(alt3k.temperatureK < sl.temperatureK);
});

test('runCfdAnalysis calculates lift, drag, convergence and responds to winglets & flaps', () => {
  const baseCfg = {
    velocityMs: 56,
    aoaDeg: 4,
    sideslipDeg: 0,
    altitudeM: 0,
    streamlineCount: 14,
    showTunnelDomain: true,
    showForceVectors: true,
    viewMode: 'solid' as const,
  };

  const baseProj = structuredClone(AIRCRAFT_PRESETS.real);
  const resBase = runCfdAnalysis(baseProj, baseCfg);
  assert.equal(resBase.converged, true);
  assert.equal(resBase.iterations.length, 20);
  assert.ok(resBase.liftN > 5000);
  assert.ok(resBase.dragN > 100);

  // Adding winglets increases effective aspect ratio and reduces induced drag
  const wingletProj = structuredClone(AIRCRAFT_PRESETS.real);
  wingletProj.geometry.wingletsEnabled = true;
  wingletProj.geometry.wingletHeightPct = 10;
  const resWinglet = runCfdAnalysis(wingletProj, baseCfg);
  assert.ok(resWinglet.effectiveAspectRatio > resBase.effectiveAspectRatio);
  assert.ok(resWinglet.cdInduced < resBase.cdInduced);

  // Deflecting flaps increases CL
  const flapProj = structuredClone(AIRCRAFT_PRESETS.real);
  flapProj.geometry.flapDeflectionDeg = 20;
  const resFlap = runCfdAnalysis(flapProj, baseCfg);
  assert.ok(resFlap.cl > resBase.cl + 0.4);
});

test('computeSurfaceCp and cpToRgb produce valid suction and stagnation pressure ranges', () => {
  const cpUpperPeak = computeSurfaceCp(0.18, true, 6, 4);
  const cpStagnation = computeSurfaceCp(0.0, false, 6, 4);
  assert.ok(cpUpperPeak < -0.5, 'Upper suction peak should be negative');
  assert.ok(cpStagnation > 0.5, 'Leading-edge stagnation should be positive');

  const rgbSuction = cpToRgb(cpUpperPeak);
  const rgbStag = cpToRgb(cpStagnation);
  assert.ok(rgbSuction[2] > rgbSuction[0], 'Suction should be blue/cyan-dominant');
  assert.ok(rgbStag[0] > rgbStag[2], 'Stagnation should be red/amber-dominant');
});

test('exportTrianglesToAsciiStl and exportTrianglesToObj produce valid CAD geometry files', () => {
  const tris = [
    { ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, cx: 0, cy: 1, cz: 0 },
  ];
  const stl = exportTrianglesToAsciiStl('WingTest', tris);
  assert.ok(stl.startsWith('solid WingTest'));
  assert.ok(stl.includes('facet normal 0.0000e+0 0.0000e+0 1.0000e+0'));
  assert.ok(stl.endsWith('endsolid WingTest'));

  const obj = exportTrianglesToObj('WingTest', tris);
  assert.ok(obj.includes('o WingTest'));
  assert.ok(obj.includes('v 1.00000 0.00000 0.00000'));
  assert.ok(obj.includes('f 1 2 3'));
});
