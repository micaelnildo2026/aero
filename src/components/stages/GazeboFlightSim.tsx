import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { stepFlightDynamics } from '../../engine/aerospace';
import {
  AircraftPartsRefs,
  buildProceduralAircraft,
  detectSoftwareWebGL,
  disposeObject3D,
} from '../../engine/aircraftMesh';
import {
  AircraftProject,
  FlightSimTelemetry,
  SizingResults,
  StabilityResults,
} from '../../types/aerospace';

interface GazeboFlightSimProps {
  project: AircraftProject;
  sizing: SizingResults;
  stability: StabilityResults;
}

export const GazeboFlightSim: React.FC<GazeboFlightSimProps> = ({
  project,
  sizing,
  stability,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(true);
  const [autopilot, setAutopilot] = useState(true);
  const [throttlePct, setThrottlePct] = useState(72);
  const [targetAltM, setTargetAltM] = useState(120);

  const initialTelemetry = (): FlightSimTelemetry => ({
    airspeedMs: Number(sizing.cruiseSpeedMs.toFixed(1)),
    altitudeM: 85,
    vsiMs: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    aoaDeg: 3.5,
    gForce: 1.0,
    throttlePct: 72,
    autopilotEnabled: true,
    targetAltitudeM: 120,
    distanceFlownM: 0,
  });

  const [telemetry, setTelemetry] = useState<FlightSimTelemetry>(initialTelemetry);

  const simRef = useRef({
    telemetry: initialTelemetry(),
    running: true,
    autopilot: true,
    throttlePct: 72,
    targetAltM: 120,
    keys: {} as Record<string, boolean>,
    manualPitch: 0,
    manualRoll: 0,
    manualYaw: 0,
    worldPos: new THREE.Vector3(0, 85, 0),
    sizing,
    stability,
  });

  useEffect(() => {
    simRef.current.running = running;
    simRef.current.autopilot = autopilot;
    simRef.current.throttlePct = throttlePct;
    simRef.current.targetAltM = targetAltM;
    simRef.current.sizing = sizing;
    simRef.current.stability = stability;
  }, [running, autopilot, throttlePct, targetAltM, sizing, stability]);

  const handleResetFlight = () => {
    const fresh = initialTelemetry();
    fresh.autopilotEnabled = autopilot;
    fresh.targetAltitudeM = targetAltM;
    fresh.throttlePct = throttlePct;
    simRef.current.telemetry = fresh;
    simRef.current.worldPos.set(0, 85, 0);
    setTelemetry(fresh);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'].includes(e.code)) {
        simRef.current.keys[e.code] = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.keys[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const aircraftHolderRef = useRef<{
    rebuild: (proj: AircraftProject) => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const w = container.clientWidth || 920;
    const h = container.clientHeight || 460;
    renderer.setSize(w, h);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c1726);
    scene.fog = new THREE.FogExp2(0x0c1726, 0.0055);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(48, w / h, 0.2, 500);
    const startVisualAlt = 85 * 0.35;
    camera.position.set(-10.5, startVisualAlt + 3.2, 0);
    camera.lookAt(4, startVisualAlt + 0.4, 0);

    // Lighting
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
    sun.position.set(40, 80, 30);
    scene.add(sun);

    // Outdoor Terrain Ground + Runway Strip (continuous horizon)
    const groundGeo = new THREE.PlaneGeometry(800, 800);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x13202e,
      roughness: 0.92,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // Grid overlay on terrain (moves/wraps to simulate continuous flight)
    const grid = new THREE.GridHelper(400, 40, 0x1e40af, 0x1e293b);
    grid.position.y = 0.05;
    scene.add(grid);

    // Runway + Instanced Pylons
    const runwayGeo = new THREE.PlaneGeometry(240, 14);
    const runwayMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.1,
    });
    const runway = new THREE.Mesh(runwayGeo, runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(0, 0.08, 0);
    scene.add(runway);

    // Instanced runway edge lights/markers (32 items)
    const pylonGeo = new THREE.BoxGeometry(0.45, 0.9, 0.45);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x0891b2,
      emissiveIntensity: 0.7,
      roughness: 0.3,
    });
    const pylonCount = 32;
    const pylons = new THREE.InstancedMesh(pylonGeo, pylonMat, pylonCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < pylonCount; i++) {
      const side = i % 2 === 0 ? -7.5 : 7.5;
      const xPos = -110 + Math.floor(i / 2) * 14.5;
      dummy.position.set(xPos, 0.45, side);
      dummy.updateMatrix();
      pylons.setMatrixAt(i, dummy.matrix);
    }
    pylons.instanceMatrix.needsUpdate = true;
    pylons.computeBoundingSphere();
    scene.add(pylons);

    // Aircraft Pivot
    const aircraftPivot = new THREE.Group();
    scene.add(aircraftPivot);
    let parts: AircraftPartsRefs | null = null;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const rebuild = (proj: AircraftProject) => {
      if (parts) {
        aircraftPivot.remove(parts.root);
        disposeObject3D(parts.root);
      }
      parts = buildProceduralAircraft(proj, isSoftwareGl, maxAniso);
      aircraftPivot.add(parts.root);
    };
    rebuild(project);
    aircraftHolderRef.current = { rebuild };

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let hudSyncAccum = 0;

    const desiredCamPos = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const forwardVec = new THREE.Vector3();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const status = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 6);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 6);
    }

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      const s = simRef.current;

      if (s.running) {
        const k = s.keys;
        const keyPitch = (k['KeyS'] ? 1 : 0) - (k['KeyW'] ? 1 : 0);
        const keyRoll = (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0);
        const keyYaw = (k['KeyE'] ? 1 : 0) - (k['KeyQ'] ? 1 : 0);

        const nextTel = stepFlightDynamics(
          s.telemetry,
          {
            pitchCmd: keyPitch || s.manualPitch,
            rollCmd: keyRoll || s.manualRoll,
            yawCmd: keyYaw || s.manualYaw,
            throttlePct: s.throttlePct,
            autopilotEnabled: s.autopilot && keyPitch === 0 && keyRoll === 0 && s.manualPitch === 0 && s.manualRoll === 0,
            targetAltitudeM: s.targetAltM,
          },
          s.sizing,
          s.stability,
          dt
        );
        s.telemetry = nextTel;

        // Move worldPos forward along yaw heading (+X is nose direction at yaw=0)
        const yawRad = (-nextTel.yawDeg * Math.PI) / 180;
        const speedVisual = Math.max(4, nextTel.airspeedMs * 0.45);
        forwardVec.set(Math.cos(yawRad), 0, Math.sin(yawRad));
        s.worldPos.x += forwardVec.x * speedVisual * dt;
        s.worldPos.z += forwardVec.z * speedVisual * dt;
        // Keep terrain/runway infinite by wrapping worldPos smoothly or snapping grid
        if (Math.abs(s.worldPos.x) > 150) s.worldPos.x = -Math.sign(s.worldPos.x) * 140;
        if (Math.abs(s.worldPos.z) > 150) s.worldPos.z = -Math.sign(s.worldPos.z) * 140;

        const visualAlt = Math.max(2.2, nextTel.altitudeM * 0.35);
        aircraftPivot.position.set(s.worldPos.x, visualAlt, s.worldPos.z);

        // Apply YXZ Euler for Yaw, Roll, Pitch (nose is +X)
        aircraftPivot.rotation.set(
          (nextTel.rollDeg * Math.PI) / 180,
          yawRad,
          (nextTel.pitchDeg * Math.PI) / 180,
          'YXZ'
        );

        if (parts) {
          parts.propGroup.rotation.x += dt * (12 + nextTel.throttlePct * 0.45);
          parts.aileronLeft.rotation.z = (nextTel.rollDeg / 45) * 0.4;
          parts.aileronRight.rotation.z = -(nextTel.rollDeg / 45) * 0.4;
          parts.elevator.rotation.z = -(nextTel.pitchDeg / 25) * 0.35;
        }

        // Smooth Chase Camera behind aircraft
        desiredCamPos.set(
          aircraftPivot.position.x - forwardVec.x * 10.5,
          aircraftPivot.position.y + 3.2,
          aircraftPivot.position.z - forwardVec.z * 10.5
        );
        const camAlpha = 1 - Math.exp(-5 * dt);
        camera.position.lerp(desiredCamPos, camAlpha);
        lookTarget.set(
          aircraftPivot.position.x + forwardVec.x * 4,
          aircraftPivot.position.y + 0.4,
          aircraftPivot.position.z + forwardVec.z * 4
        );
        camera.lookAt(lookTarget);

        hudSyncAccum += dt;
        if (hudSyncAccum >= 0.14) {
          hudSyncAccum = 0;
          setTelemetry(nextTel);
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    const handleResize = () => {
      if (!container || disposed) return;
      const cw = container.clientWidth || 920;
      const ch = container.clientHeight || 460;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    };
    window.addEventListener('resize', handleResize);

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      if (parts) disposeObject3D(parts.root);
      groundGeo.dispose();
      groundMat.dispose();
      runwayGeo.dispose();
      runwayMat.dispose();
      pylonGeo.dispose();
      pylonMat.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      aircraftHolderRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    aircraftHolderRef.current?.rebuild(project);
  }, [project]);

  return (
    <div className="space-y-4">
      {/* Flight HUD Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
          <div className="text-[11px] text-slate-400">Velocidade (IAS)</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-cyan-300">
            {telemetry.airspeedMs.toFixed(1)} <span className="text-xs text-slate-400">m/s</span>
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
          <div className="text-[11px] text-slate-400">Altitude AGL</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-100">
            {telemetry.altitudeM.toFixed(1)} <span className="text-xs text-slate-400">m</span>
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
          <div className="text-[11px] text-slate-400">Razão Subida (VSI)</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-emerald-400">
            {telemetry.vsiMs >= 0 ? '+' : ''}
            {telemetry.vsiMs.toFixed(1)} <span className="text-xs text-slate-400">m/s</span>
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
          <div className="text-[11px] text-slate-400">Atitude (P / R)</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-100">
            {telemetry.pitchDeg.toFixed(0)}° / {telemetry.rollDeg.toFixed(0)}°
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
          <div className="text-[11px] text-slate-400">Força G / AoA</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-amber-300">
            {telemetry.gForce.toFixed(2)}G · {telemetry.aoaDeg.toFixed(1)}°
          </div>
        </div>
        <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
          <div className="text-[11px] text-slate-400">Distância</div>
          <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-100">
            {telemetry.distanceFlownM.toFixed(0)} <span className="text-xs text-slate-400">m</span>
          </div>
        </div>
      </div>

      {/* Gazebo 3D Flight Viewport */}
      <div className="relative h-[380px] w-full overflow-hidden rounded-md border border-slate-800 bg-[#090D14]">
        <div ref={mountRef} data-testid="gazebo-sim-viewport" className="h-full w-full" />

        {/* Clean non-blur bottom bar */}
        <div className="absolute bottom-3 left-1/2 z-10 flex w-[min(860px,96%)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-md border border-slate-700 bg-[#0F141F]/95 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              className="inline-flex items-center gap-1.5 rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
            >
              {running ? (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  Pausar Sim
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Retomar Sim
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setAutopilot((a) => !a)}
              className={`rounded border px-3 py-1.5 text-xs font-medium cursor-pointer ${
                autopilot
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-[#0B0F17] text-slate-300'
              }`}
            >
              Piloto Automático: {autopilot ? 'PX4 Ativo' : 'Manual (W/A/S/D)'}
            </button>

            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="sim-throttle" className="text-slate-300">
                Manete
              </label>
              <input
                id="sim-throttle"
                type="range"
                min={20}
                max={100}
                value={throttlePct}
                onChange={(e) => setThrottlePct(Number(e.target.value))}
                className="w-24 accent-cyan-400 cursor-pointer"
              />
              <span className="font-mono tabular-nums text-cyan-300">{throttlePct}%</span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="sim-alt" className="text-slate-300">
                Alt. Alvo
              </label>
              <input
                id="sim-alt"
                type="number"
                min={20}
                max={500}
                step={10}
                value={targetAltM}
                onChange={(e) => setTargetAltM(Math.max(20, Number(e.target.value) || 20))}
                className="w-16 rounded border border-slate-700 bg-[#0B0F17] px-2 py-1 font-mono text-xs tabular-nums text-slate-100"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetFlight}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reiniciar Voo
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Controles manuais de voo no teclado: <span className="font-mono text-slate-200">W/S</span> Arfagem (Pitch),{' '}
        <span className="font-mono text-slate-200">A/D</span> Rolagem (Roll),{' '}
        <span className="font-mono text-slate-200">Q/E</span> Guinada (Yaw). Com PX4 Ativo, a malha PID estabiliza atitude e sobe até a altitude alvo.
      </p>
    </div>
  );
};
