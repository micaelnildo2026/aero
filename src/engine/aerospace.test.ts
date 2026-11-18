import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRCRAFT_PRESETS } from '../data/presets';
import {
  computeAirfoilPolar,
  computeAvionicsBudget,
  computeConstraintDiagram,
  computeFeaWing,
  computeSizing,
  computeStability,
  generateCamGCode,
  generateDxf2DBlueprint,
  generateNaca4Coordinates,
  stepFlightDynamics,
} from './aerospace';

test('computeSizing computes accurate MTOW, wing loading and range for all 3 aircraft classes', () => {
  const realSizing = computeSizing(
    AIRCRAFT_PRESETS.real.requirements,
    AIRCRAFT_PRESETS.real.geometry
  );
  assert.equal(realSizing.mtowKg, 600);
  assert.ok(realSizing.wingAreaM2 > 10 && realSizing.wingAreaM2 < 14);
  assert.ok(realSizing.stallSpeedMs < 25);
  assert.ok(realSizing.estimatedRangeKm > 800);

  const rcSizing = computeSizing(
    AIRCRAFT_PRESETS.rc.requirements,
    AIRCRAFT_PRESETS.rc.geometry
  );
  assert.equal(rcSizing.mtowKg, 2.35);
  assert.ok(rcSizing.takeoffDistanceM < 35);

  const uavSizing = computeSizing(
    AIRCRAFT_PRESETS.uav.requirements,
    AIRCRAFT_PRESETS.uav.geometry
  );
  assert.equal(uavSizing.mtowKg, 14.8);
  assert.ok(uavSizing.estimatedRangeKm > 80);
});

test('generateNaca4Coordinates produces valid closed NACA 2412 airfoil profile', () => {
  const profile = generateNaca4Coordinates(2, 4, 12, 32);
  assert.equal(profile.code, '2412');
  assert.equal(profile.upper.length, 33);
  assert.equal(profile.lower.length, 33);
  // Leading edge near (0,0), trailing edge near (1,0)
  assert.ok(Math.abs(profile.upper[0].x) < 1e-6);
  assert.ok(Math.abs(profile.upper[profile.upper.length - 1].x - 1) < 1e-3);
  // Max upper y > max lower y
  const maxUpper = Math.max(...profile.upper.map((p) => p.y));
  const minLower = Math.min(...profile.lower.map((p) => p.y));
  assert.ok(maxUpper > 0.05);
  assert.ok(minLower < -0.02);
});

test('computeAirfoilPolar predicts positive lift at AoA=4 deg and stall drop after peak', () => {
  const polar = computeAirfoilPolar(AIRCRAFT_PRESETS.real.airfoil, 2_500_000, 7.6);
  const aoa4 = polar.find((p) => p.alphaDeg === 4);
  const aoa12 = polar.find((p) => p.alphaDeg === 12);
  const aoa18 = polar.find((p) => p.alphaDeg === 18);
  assert.ok(aoa4 && aoa4.cl > 0.4);
  assert.ok(aoa12 && aoa18 && aoa12.cl > aoa18.cl);
});

test('computeStability validates positive static margin for preset aircraft', () => {
  const stabReal = computeStability(AIRCRAFT_PRESETS.real.geometry);
  assert.equal(stabReal.status, 'Estável');
  assert.ok(stabReal.staticMarginPct > 7 && stabReal.staticMarginPct < 30);
});

test('computeFeaWing calculates root bending moment, Von Mises stress and safety factor', () => {
  const fea = computeFeaWing(AIRCRAFT_PRESETS.real);
  assert.equal(fea.stations.length, 21);
  // Bending moment is highest at root (index 0) and zero at tip
  assert.ok(fea.stations[0].bendingMomentNm > 5000);
  assert.equal(fea.stations[20].bendingMomentNm, 0);
  assert.ok(fea.safetyFactorActual > 1.0);
  assert.ok(fea.tipDeflectionMm > 0);
});

test('generateCamGCode and generateDxf2DBlueprint produce valid manufacturing outputs', () => {
  const gcode = generateCamGCode(AIRCRAFT_PRESETS.rc);
  assert.ok(gcode.includes('G21'));
  assert.ok(gcode.includes('M03'));
  assert.ok(gcode.includes('M30'));

  const dxf = generateDxf2DBlueprint(AIRCRAFT_PRESETS.rc);
  assert.ok(dxf.includes('CONTORNO_ASA'));
  assert.ok(dxf.includes('NERVURA_NACA'));
  assert.ok(dxf.endsWith('EOF'));
});

test('computeAvionicsBudget sums active currents and picks conservative wire AWG', () => {
  const budget = computeAvionicsBudget(AIRCRAFT_PRESETS.uav.avionics);
  assert.equal(budget.activeCount, 5);
  assert.ok(budget.totalCurrentA > 60);
  assert.equal(budget.recommendedMainAwg, 8);
});

test('stepFlightDynamics responds to throttle, pitch and autopilot altitude hold', () => {
  const sizing = computeSizing(
    AIRCRAFT_PRESETS.uav.requirements,
    AIRCRAFT_PRESETS.uav.geometry
  );
  const stability = computeStability(AIRCRAFT_PRESETS.uav.geometry);
  let state = {
    airspeedMs: 24,
    altitudeM: 50,
    vsiMs: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    aoaDeg: 3.5,
    gForce: 1,
    throttlePct: 70,
    autopilotEnabled: true,
    targetAltitudeM: 120,
    distanceFlownM: 0,
  };
  for (let i = 0; i < 40; i++) {
    state = stepFlightDynamics(
      state,
      {
        pitchCmd: 0,
        rollCmd: 0,
        yawCmd: 0,
        throttlePct: 70,
        autopilotEnabled: true,
        targetAltitudeM: 120,
      },
      sizing,
      stability,
      0.05
    );
  }
  assert.ok(state.altitudeM > 52, 'Autopilot should climb toward target altitude');
  assert.ok(state.distanceFlownM > 30, 'Aircraft should advance forward');
});

test('computeConstraintDiagram returns valid curve points and stall limit', () => {
  const cd = computeConstraintDiagram(AIRCRAFT_PRESETS.real);
  assert.ok(cd.stallLimitKgM2 > 30);
  assert.equal(cd.points.length, 13);
});
