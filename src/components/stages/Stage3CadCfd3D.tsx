import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ArrowRight,
  Box,
  ChevronDown,
  ChevronUp,
  Download,
  Play,
  Wind,
} from 'lucide-react';
import {
  buildProceduralAircraft,
  AircraftPartsRefs,
  detectSoftwareWebGL,
  disposeObject3D,
  extractTrianglesFromObject3D,
} from '../../engine/aircraftMesh';
import {
  exportTrianglesToAsciiStl,
  exportTrianglesToObj,
  runCfdAnalysis,
} from '../../engine/cadCfd';
import {
  AircraftProject,
  AirfoilParams,
  CadPartKey,
  CfdConfig,
  CfdViewMode,
  FinishId,
  Geometry2D3D,
  SizingResults,
} from '../../types/aerospace';

interface Stage3CadCfd3DProps {
  project: AircraftProject;
  sizing: SizingResults;
  onUpdateFinish: (finish: FinishId) => void;
  onUpdateGeometry: (patch: Partial<Geometry2D3D>) => void;
  onUpdateAirfoil: (patch: Partial<AirfoilParams>) => void;
  onUpdateAoA: (aoaDeg: number) => void;
  onAdvanceStage: () => void;
}

type WorkbenchTab = 'cad' | 'cfd';
type CameraPreset = 'perspective' | 'top' | 'side' | 'front';

const CAMERA_TARGETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  perspective: { pos: [6.2, 3.1, 6.4], target: [0, 0.2, 0] },
  top: { pos: [0.01, 8.6, 0.01], target: [0, 0, 0] },
  side: { pos: [0, 0.8, 7.8], target: [0, 0.2, 0] },
  front: { pos: [8.0, 1.0, 0], target: [0, 0.2, 0] },
};

const FINISH_OPTIONS: Array<{ id: FinishId; label: string; swatch: string }> = [
  { id: 'alu_brushed', label: 'Alumínio', swatch: '#cbd5e1' },
  { id: 'carbon_weave', label: 'Carbono', swatch: '#334155' },
  { id: 'composite_white', label: 'Compósito', swatch: '#f8fafc' },
  { id: 'balsa_rc', label: 'Balsa RC', swatch: '#d9b382' },
];

const CAD_PARTS: Array<{ key: CadPartKey; label: string }> = [
  { key: 'fuselage', label: 'Fuselagem & Canopy' },
  { key: 'wings', label: 'Asas Principais' },
  { key: 'surfaces', label: 'Ailerons & Flapes' },
  { key: 'tail', label: 'Empenagem H/V' },
  { key: 'propulsion', label: 'Grupo Motopropulsor' },
  { key: 'gear', label: 'Trem de Pouso' },
  { key: 'winglets', label: 'Winglets de Ponta' },
];

const MAX_STREAMLINES = 24;
const SEGS_PER_STREAM = 24;

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const Stage3CadCfd3D: React.FC<Stage3CadCfd3DProps> = ({
  project,
  onUpdateFinish,
  onUpdateGeometry,
  onUpdateAirfoil,
  onUpdateAoA,
  onAdvanceStage,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('cad');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [explodedPct, setExplodedPct] = useState(0);
  const [windTunnelOn, setWindTunnelOn] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('perspective');
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const [partVisibility, setPartVisibility] = useState<Record<CadPartKey, boolean>>({
    fuselage: true,
    wings: true,
    surfaces: true,
    tail: true,
    propulsion: true,
    gear: true,
    winglets: true,
  });

  const [cfdConfig, setCfdConfig] = useState<CfdConfig>(() => ({
    velocityMs: Math.round(project.requirements.cruiseSpeedMs),
    aoaDeg: project.airfoil.angleOfAttackDeg,
    sideslipDeg: 0,
    altitudeM: project.aircraftClass === 'real' ? 1500 : 120,
    streamlineCount: 16,
    showTunnelDomain: true,
    showForceVectors: true,
    viewMode: 'solid',
  }));

  const [solverRunCount, setSolverRunCount] = useState(1);
  const [triangleCount, setTriangleCount] = useState(0);

  // Sync preset switches cleanly
  useEffect(() => {
    setCfdConfig((prev) => ({
      ...prev,
      velocityMs: Math.round(project.requirements.cruiseSpeedMs),
      aoaDeg: project.airfoil.angleOfAttackDeg,
      altitudeM: project.aircraftClass === 'real' ? 1500 : 120,
    }));
  }, [project.id, project.aircraftClass, project.requirements.cruiseSpeedMs]);

  useEffect(() => {
    setCfdConfig((prev) =>
      prev.aoaDeg === project.airfoil.angleOfAttackDeg
        ? prev
        : { ...prev, aoaDeg: project.airfoil.angleOfAttackDeg }
    );
  }, [project.airfoil.angleOfAttackDeg]);

  const cfdResult = useMemo(
    () => runCfdAnalysis(project, cfdConfig),
    [project, cfdConfig]
  );

  // Refs shared with persistent WebGL loop
  const simStateRef = useRef({
    explodedTarget: 0,
    explodedCurrent: 0,
    windTunnelOn: true,
    tunnelSpeedMs: 30,
    aoaDeg: 4,
    sideslipDeg: 0,
    streamlineCount: 16,
    showTunnelDomain: true,
    showForceVectors: true,
    liftN: 1000,
    dragN: 100,
    camTransitionActive: false,
    camTargetPos: new THREE.Vector3(6.2, 3.1, 6.4),
    camTargetLook: new THREE.Vector3(0, 0.2, 0),
    dirty: true,
  });

  useEffect(() => {
    simStateRef.current.explodedTarget = explodedPct / 100;
    simStateRef.current.windTunnelOn = windTunnelOn;
    simStateRef.current.tunnelSpeedMs = cfdConfig.velocityMs;
    simStateRef.current.aoaDeg = cfdConfig.aoaDeg;
    simStateRef.current.sideslipDeg = cfdConfig.sideslipDeg;
    simStateRef.current.streamlineCount = cfdConfig.streamlineCount;
    simStateRef.current.showTunnelDomain = cfdConfig.showTunnelDomain;
    simStateRef.current.showForceVectors = cfdConfig.showForceVectors;
    simStateRef.current.liftN = cfdResult.liftN;
    simStateRef.current.dragN = cfdResult.dragN;
    simStateRef.current.dirty = true;
    sceneApiRef.current?.requestRender();
  }, [explodedPct, windTunnelOn, cfdConfig, cfdResult.liftN, cfdResult.dragN]);

  const sceneApiRef = useRef<{
    rebuildAircraft: (
      proj: AircraftProject,
      viewMode: CfdViewMode,
      aoaDeg: number,
      vis: Record<CadPartKey, boolean>
    ) => void;
    requestRender: () => void;
    getAircraftRoot: () => THREE.Object3D | null;
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
      setWebglUnavailable(true);
      return;
    }

    const width = container.clientWidth || 860;
    const height = container.clientHeight || 560;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d14);
    scene.fog = new THREE.FogExp2(0x090d14, 0.022);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 120);
    camera.position.set(6.2, 3.1, 6.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.4;
    controls.maxDistance = 22;
    controls.target.set(0, 0.2, 0);
    controls.addEventListener('start', () => {
      simStateRef.current.camTransitionActive = false;
    });

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.88);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(7, 10, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.92);
    rimLight.position.set(-7, 4, -6);
    scene.add(rimLight);

    // Engineering Floor Grid
    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b1019,
      roughness: 0.9,
      metalness: 0.08,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.35;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(28, 28, 0x1e3a5f, 0x162032);
    grid.position.y = -1.33;
    scene.add(grid);

    // Contact shadow disc
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext('2d');
    if (sctx) {
      const grad = sctx.createRadialGradient(64, 64, 6, 64, 64, 64);
      grad.addColorStop(0, 'rgba(0,0,0,0.65)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 128, 128);
    }
    const contactTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 32),
      new THREE.MeshBasicMaterial({
        map: contactTex,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = -1.32;
    scene.add(contactShadow);

    // CFD Bounding Tunnel Domain Box
    const domainGroup = new THREE.Group();
    const domainBoxGeo = new THREE.BoxGeometry(9.2, 3.8, 7.0);
    const domainEdges = new THREE.EdgesGeometry(domainBoxGeo);
    const domainWire = new THREE.LineSegments(
      domainEdges,
      new THREE.LineBasicMaterial({
        color: 0x1e3a5f,
        transparent: true,
        opacity: 0.65,
      })
    );
    domainWire.position.y = 0.55;
    domainGroup.add(domainWire);

    const inletFrame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(7.0, 3.8)),
      new THREE.LineBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.45,
      })
    );
    inletFrame.rotation.y = Math.PI / 2;
    inletFrame.position.set(4.6, 0.55, 0);
    domainGroup.add(inletFrame);
    scene.add(domainGroup);

    // 3D Lift & Drag Force Vectors (ArrowHelper)
    const forceVectorsGroup = new THREE.Group();
    const liftArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0.2, 0),
      1.6,
      0x22d3ee,
      0.28,
      0.16
    );
    const dragArrow = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0.2, 0),
      0.9,
      0xf59e0b,
      0.22,
      0.13
    );
    forceVectorsGroup.add(liftArrow, dragArrow);
    scene.add(forceVectorsGroup);

    // Aircraft Container
    let aircraftRefs: AircraftPartsRefs | null = null;
    const aircraftPivot = new THREE.Group();
    scene.add(aircraftPivot);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const rebuildAircraft = (
      proj: AircraftProject,
      viewMode: CfdViewMode,
      aoaDeg: number,
      vis: Record<CadPartKey, boolean>
    ) => {
      if (aircraftRefs) {
        aircraftPivot.remove(aircraftRefs.root);
        disposeObject3D(aircraftRefs.root);
      }
      aircraftRefs = buildProceduralAircraft(proj, isSoftwareGl, maxAniso, {
        viewMode,
        aoaDeg,
        partVisibility: vis,
      });
      aircraftPivot.add(aircraftRefs.root);
      const tris = extractTrianglesFromObject3D(aircraftRefs.root);
      setTriangleCount(tris.length);
      simStateRef.current.dirty = true;
    };

    rebuildAircraft(project, cfdConfig.viewMode, cfdConfig.aoaDeg, partVisibility);

    // Virtual Wind Tunnel Streamlines Pool (24 ribbons)
    const windGroup = new THREE.Group();
    scene.add(windGroup);

    const streamLines: Array<{
      line: THREE.Line;
      baseZ: number;
      baseY: number;
      phase: number;
    }> = [];

    for (let s = 0; s < MAX_STREAMLINES; s++) {
      const frac = s / (MAX_STREAMLINES - 1) - 0.5;
      const baseZ = frac * 5.6;
      const baseY = ((s % 4) - 1.5) * 0.34 + 0.18;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < SEGS_PER_STREAM; i++) {
        pts.push(
          new THREE.Vector3(4.6 - (i / (SEGS_PER_STREAM - 1)) * 9.2, baseY, baseZ)
        );
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const isTip = Math.abs(baseZ) > 2.25;
      const mat = new THREE.LineBasicMaterial({
        color: isTip ? 0xf59e0b : 0x22d3ee,
        transparent: true,
        opacity: 0.72,
      });
      const line = new THREE.Line(geo, mat);
      windGroup.add(line);
      streamLines.push({ line, baseZ, baseY, phase: s * 0.52 });
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();

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

    const tmpOffset = new THREE.Vector3();

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;
      const elapsed = now / 1000;
      const st = simStateRef.current;

      // Exploded view damping
      st.explodedCurrent = THREE.MathUtils.damp(
        st.explodedCurrent,
        st.explodedTarget,
        8,
        dt
      );
      if (aircraftRefs) {
        for (let i = 0; i < aircraftRefs.explodedTargets.length; i++) {
          const item = aircraftRefs.explodedTargets[i];
          tmpOffset.copy(item.offset).multiplyScalar(st.explodedCurrent);
          item.obj.position.copy(item.basePos).add(tmpOffset);
        }
        const targetPitch = (st.aoaDeg * Math.PI) / 180;
        const targetYaw = (st.sideslipDeg * Math.PI) / 180;
        aircraftPivot.rotation.z = THREE.MathUtils.damp(
          aircraftPivot.rotation.z,
          targetPitch,
          8,
          dt
        );
        aircraftPivot.rotation.y = THREE.MathUtils.damp(
          aircraftPivot.rotation.y,
          targetYaw,
          8,
          dt
        );
        if (st.windTunnelOn) {
          aircraftRefs.propGroup.rotation.x += dt * (st.tunnelSpeedMs * 0.45);
        }
      }

      // Domain box & 3D Lift/Drag vectors
      domainGroup.visible = st.showTunnelDomain;
      forceVectorsGroup.visible = st.showForceVectors;
      if (st.showForceVectors) {
        const liftMag = Math.max(
          0.6,
          Math.min(2.6, 0.7 + Math.log10(Math.max(10, Math.abs(st.liftN))) * 0.45)
        );
        const dragMag = Math.max(
          0.45,
          Math.min(2.0, 0.45 + Math.log10(Math.max(5, Math.abs(st.dragN))) * 0.35)
        );
        liftArrow.setDirection(
          new THREE.Vector3(0, st.liftN >= 0 ? 1 : -1, 0)
        );
        liftArrow.setLength(liftMag, 0.26, 0.14);
        dragArrow.setLength(dragMag, 0.2, 0.11);
      }

      // Camera transition damping
      if (st.camTransitionActive) {
        const alpha = 1 - Math.exp(-7 * dt);
        camera.position.lerp(st.camTargetPos, alpha);
        controls.target.lerp(st.camTargetLook, alpha);
        if (camera.position.distanceTo(st.camTargetPos) < 0.03) {
          camera.position.copy(st.camTargetPos);
          controls.target.copy(st.camTargetLook);
          st.camTransitionActive = false;
        }
      }

      // Wind tunnel streamlines
      windGroup.visible = st.windTunnelOn;
      if (st.windTunnelOn) {
        const aoaFactor = st.aoaDeg / 12;
        const speedScale = Math.max(0.4, st.tunnelSpeedMs / 25);
        const sideFactor = Math.tan((st.sideslipDeg * Math.PI) / 180);
        const step = Math.max(1, Math.floor(MAX_STREAMLINES / Math.max(1, st.streamlineCount)));
        let activeDrawn = 0;

        for (let s = 0; s < streamLines.length; s++) {
          const item = streamLines[s];
          const shouldShow = s % step === 0 && activeDrawn < st.streamlineCount;
          item.line.visible = shouldShow;
          if (!shouldShow) continue;
          activeDrawn++;

          const pos = item.line.geometry.attributes.position as THREE.BufferAttribute;
          const isTip = Math.abs(item.baseZ) > 2.2;
          for (let i = 0; i < SEGS_PER_STREAM; i++) {
            const u = i / (SEGS_PER_STREAM - 1);
            const x = 4.6 - u * 9.2;
            const wingBump =
              Math.exp(-Math.pow((x - 0.1) / 1.15, 2)) *
              (0.28 + aoaFactor * 0.28) *
              (item.baseY >= 0 ? 1 : -0.45);
            const downwash =
              x < 0 ? -aoaFactor * 0.35 * Math.min(1, -x / 3.5) : 0;
            const wave =
              Math.sin(x * 1.8 + elapsed * 4.5 * speedScale + item.phase) * 0.04;
            const swirlZ =
              isTip && x < 0.4
                ? Math.cos(x * 2.4 + elapsed * 5 * speedScale) *
                  0.18 *
                  Math.max(0.2, Math.abs(aoaFactor))
                : 0;
            const swirlY =
              isTip && x < 0.4
                ? Math.sin(x * 2.4 + elapsed * 5 * speedScale) *
                  0.18 *
                  Math.max(0.2, Math.abs(aoaFactor))
                : 0;
            const sideShift = (4.6 - x) * sideFactor * 0.16;

            pos.setXYZ(
              i,
              x,
              item.baseY + wingBump + downwash + wave + swirlY,
              item.baseZ + swirlZ + sideShift
            );
          }
          pos.needsUpdate = true;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      const needsContinuous =
        st.windTunnelOn ||
        st.camTransitionActive ||
        Math.abs(st.explodedCurrent - st.explodedTarget) > 0.002;

      if (needsContinuous) {
        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
      } else {
        st.dirty = false;
      }
    };

    const requestRender = () => {
      if (disposed) return;
      if (!simStateRef.current.dirty) {
        simStateRef.current.dirty = true;
        if (isSoftwareGl) afterDraw(tick);
        else frameId = requestAnimationFrame(tick);
      }
    };

    controls.addEventListener('change', requestRender);

    sceneApiRef.current = {
      rebuildAircraft,
      requestRender,
      getAircraftRoot: () => aircraftRefs?.root ?? null,
    };

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 860;
      const h = container.clientHeight || 560;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();
      if (aircraftRefs) disposeObject3D(aircraftRefs.root);
      domainBoxGeo.dispose();
      domainEdges.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      contactTex.dispose();
      envTex.dispose();
      streamLines.forEach((s) => {
        s.line.geometry.dispose();
        (s.line.material as THREE.Material).dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneApiRef.current = null;
    };
    // Mount WebGL once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild 3D geometry whenever project CAD params, view mode, AoA (for Cp), or visibility change
  useEffect(() => {
    sceneApiRef.current?.rebuildAircraft(
      project,
      cfdConfig.viewMode,
      cfdConfig.aoaDeg,
      partVisibility
    );
    sceneApiRef.current?.requestRender();
  }, [project, cfdConfig.viewMode, cfdConfig.aoaDeg, partVisibility]);

  const handleSelectCamera = (preset: CameraPreset) => {
    setCameraPreset(preset);
    const cfg = CAMERA_TARGETS[preset];
    simStateRef.current.camTargetPos.set(...cfg.pos);
    simStateRef.current.camTargetLook.set(...cfg.target);
    simStateRef.current.camTransitionActive = true;
    simStateRef.current.dirty = true;
    sceneApiRef.current?.requestRender();
  };

  const handleTogglePart = (key: CadPartKey) => {
    setPartVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExportCad = (format: 'stl' | 'obj') => {
    const root = sceneApiRef.current?.getAircraftRoot();
    if (!root) return;
    const tris = extractTrianglesFromObject3D(root);
    const baseSlug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (format === 'stl') {
      const stl = exportTrianglesToAsciiStl(baseSlug, tris);
      downloadTextFile(`${baseSlug}-cad.stl`, stl, 'model/stl');
    } else {
      const obj = exportTrianglesToObj(baseSlug, tris);
      downloadTextFile(`${baseSlug}-cad.obj`, obj, 'text/plain');
    }
  };

  const handleExportCfdCsv = () => {
    const lines = [
      'Parametro,Valor,Unidade',
      `Aeronave,${project.name},`,
      `Velocidade_Vinf,${cfdConfig.velocityMs},m/s`,
      `AoA,${cfdConfig.aoaDeg},deg`,
      `Derrapagem,${cfdConfig.sideslipDeg},deg`,
      `Altitude_ISA,${cfdConfig.altitudeM},m`,
      `Densidade_Ar,${cfdResult.atmosphere.densityKgM3},kg/m3`,
      `Pressao_Dinamica_q,${cfdResult.dynamicPressurePa},Pa`,
      `Reynolds,${cfdResult.reynoldsNumber},-`,
      `Mach,${cfdResult.machNumber},-`,
      `CL,${cfdResult.cl},-`,
      `CD_Total,${cfdResult.cd},-`,
      `CD0,${cfdResult.cd0},-`,
      `CDi,${cfdResult.cdInduced},-`,
      `L_D,${cfdResult.ldRatio},-`,
      `Sustentacao,${cfdResult.liftN},N`,
      `Arrasto,${cfdResult.dragN},N`,
      `Momento_Pitch,${cfdResult.pitchingMomentNm},N.m`,
      '',
      'Iteracao,CL,CD,Residuo',
      ...cfdResult.iterations.map(
        (it) => `${it.iteration},${it.cl},${it.cd},${it.residual}`
      ),
    ];
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    downloadTextFile(`${slug}-cfd-relatorio.csv`, lines.join('\n'), 'text/csv');
  };

  const handleUpdateNacaField = (
    field: 'maxCamberPct' | 'thicknessPct',
    val: number
  ) => {
    const m =
      field === 'maxCamberPct' ? Math.round(val) : Math.round(project.airfoil.maxCamberPct);
    const p = Math.round(project.airfoil.camberPosTenths);
    const tt =
      field === 'thicknessPct'
        ? Math.round(val)
        : Math.round(project.airfoil.thicknessPct);
    const nacaCode = `${m}${p}${String(tt).padStart(2, '0')}`;
    onUpdateAirfoil({ [field]: val, nacaCode });
  };

  // Convergence SVG paths
  const svgPaths = useMemo(() => {
    const pts = cfdResult.iterations;
    const w = 280;
    const h = 92;
    const padX = 12;
    const padY = 10;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;

    const clVals = pts.map((p) => p.cl);
    const minCl = Math.min(...clVals) * 0.9;
    const maxCl = Math.max(...clVals, minCl + 0.1) * 1.05;

    const clPath = pts
      .map((pt, idx) => {
        const x = padX + (idx / (pts.length - 1)) * plotW;
        const y =
          padY + plotH - ((pt.cl - minCl) / Math.max(0.01, maxCl - minCl)) * plotH;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    const resPath = pts
      .map((pt, idx) => {
        const x = padX + (idx / (pts.length - 1)) * plotW;
        // Log scale residual from 1e-0 down to 1e-5
        const logVal = Math.max(-5, Math.min(0, Math.log10(pt.residual)));
        const norm = (logVal + 5) / 5; // 1 at top (high residual), 0 at bottom
        const y = padY + (1 - norm) * plotH;
        return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');

    return { clPath, resPath, w, h };
  }, [cfdResult.iterations]);

  const g = project.geometry;

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left CAD & CFD Workbench Console */}
        <aside className="flex h-[calc(100vh-310px)] min-h-[480px] max-h-[572px] flex-col overflow-hidden rounded-md border border-slate-800 bg-[#0F141F] lg:col-span-4">
          {/* Tab Switcher */}
          <div className="grid grid-cols-2 border-b border-slate-800 bg-[#0B0F17]">
            <button
              type="button"
              onClick={() => setActiveTab('cad')}
              className={`flex items-center justify-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'cad'
                  ? 'border-cyan-400 bg-[#0F141F] text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Box className="h-3.5 w-3.5" aria-hidden="true" />
              Construção CAD 3D
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('cfd')}
              className={`flex items-center justify-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'cfd'
                  ? 'border-cyan-400 bg-[#0F141F] text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wind className="h-3.5 w-3.5" aria-hidden="true" />
              Ambiente CFD
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {activeTab === 'cad' ? (
              <>
                {/* Solid Visibility Feature Tree */}
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Árvore de Sólidos CAD
                  </h3>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {CAD_PARTS.map((part) => (
                      <label
                        key={part.key}
                        className="flex items-center gap-2 rounded border border-slate-800 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-200 hover:border-slate-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={partVisibility[part.key]}
                          onChange={() => handleTogglePart(part.key)}
                          className="accent-cyan-400 cursor-pointer"
                        />
                        <span className="truncate">{part.label}</span>
                      </label>
                    ))}
                  </div>
                </section>

                {/* Parametric Wing & Fuselage Builder */}
                <section className="space-y-3 border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Modelador Paramétrico 3D
                    </h3>
                    <span className="font-mono text-[11px] text-slate-400">
                      NACA {project.airfoil.nacaCode}
                    </span>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <label htmlFor="cad-wingspan">Envergadura</label>
                      <span className="font-mono tabular-nums text-cyan-300">
                        {g.wingspanM.toFixed(1)} m
                      </span>
                    </div>
                    <input
                      id="cad-wingspan"
                      type="range"
                      min={0.8}
                      max={16.0}
                      step={0.1}
                      value={g.wingspanM}
                      onChange={(e) =>
                        onUpdateGeometry({ wingspanM: Number(e.target.value) })
                      }
                      className="mt-1 w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cad-root-chord">Corda Raiz</label>
                        <span className="font-mono tabular-nums text-slate-200">
                          {g.rootChordM.toFixed(2)} m
                        </span>
                      </div>
                      <input
                        id="cad-root-chord"
                        type="range"
                        min={0.15}
                        max={2.6}
                        step={0.02}
                        value={g.rootChordM}
                        onChange={(e) =>
                          onUpdateGeometry({ rootChordM: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cad-tip-chord">Corda Ponta</label>
                        <span className="font-mono tabular-nums text-slate-200">
                          {g.tipChordM.toFixed(2)} m
                        </span>
                      </div>
                      <input
                        id="cad-tip-chord"
                        type="range"
                        min={0.1}
                        max={2.2}
                        step={0.02}
                        value={g.tipChordM}
                        onChange={(e) =>
                          onUpdateGeometry({ tipChordM: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cad-sweep">Enflechamento</label>
                        <span className="font-mono tabular-nums text-slate-200">
                          {g.sweepDeg.toFixed(0)}°
                        </span>
                      </div>
                      <input
                        id="cad-sweep"
                        type="range"
                        min={-10}
                        max={35}
                        step={1}
                        value={g.sweepDeg}
                        onChange={(e) =>
                          onUpdateGeometry({ sweepDeg: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cad-dihedral">Diedro</label>
                        <span className="font-mono tabular-nums text-slate-200">
                          {g.dihedralDeg.toFixed(1)}°
                        </span>
                      </div>
                      <input
                        id="cad-dihedral"
                        type="range"
                        min={-4}
                        max={12}
                        step={0.5}
                        value={g.dihedralDeg}
                        onChange={(e) =>
                          onUpdateGeometry({ dihedralDeg: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Wing Position & Landing Gear */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-xs text-slate-300">Posição da Asa</span>
                      <div className="mt-1 grid grid-cols-3 gap-1 rounded border border-slate-800 bg-[#0B0F17] p-0.5">
                        {(['high', 'mid', 'low'] as const).map((pos) => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => onUpdateGeometry({ wingPosition: pos })}
                            className={`rounded py-1 text-[11px] font-medium cursor-pointer ${
                              g.wingPosition === pos
                                ? 'bg-slate-800 text-cyan-300'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {pos === 'high' ? 'Alta' : pos === 'mid' ? 'Média' : 'Baixa'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="block text-xs text-slate-300">Trem de Pouso</span>
                      <div className="mt-1 grid grid-cols-3 gap-1 rounded border border-slate-800 bg-[#0B0F17] p-0.5">
                        {(['tricycle', 'taildragger', 'skid'] as const).map((gear) => (
                          <button
                            key={gear}
                            type="button"
                            onClick={() => onUpdateGeometry({ landingGearType: gear })}
                            className={`rounded py-1 text-[11px] font-medium cursor-pointer ${
                              g.landingGearType === gear
                                ? 'bg-slate-800 text-cyan-300'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {gear === 'tricycle'
                              ? 'Tric.'
                              : gear === 'taildragger'
                              ? 'Conv.'
                              : 'Esqui'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Fuselage & Prop */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <label htmlFor="cad-fuse-len">Fusel.</label>
                        <span className="font-mono tabular-nums">
                          {g.fuselageLengthM.toFixed(1)}m
                        </span>
                      </div>
                      <input
                        id="cad-fuse-len"
                        type="range"
                        min={0.6}
                        max={12.0}
                        step={0.1}
                        value={g.fuselageLengthM}
                        onChange={(e) =>
                          onUpdateGeometry({ fuselageLengthM: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <label htmlFor="cad-fuse-dia">Diâm.</label>
                        <span className="font-mono tabular-nums">
                          {g.fuselageDiameterM.toFixed(2)}m
                        </span>
                      </div>
                      <input
                        id="cad-fuse-dia"
                        type="range"
                        min={0.08}
                        max={1.8}
                        step={0.02}
                        value={g.fuselageDiameterM}
                        onChange={(e) =>
                          onUpdateGeometry({
                            fuselageDiameterM: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <label htmlFor="cad-prop-dia">Hélice</label>
                        <span className="font-mono tabular-nums">
                          {g.propDiameterM.toFixed(2)}m
                        </span>
                      </div>
                      <input
                        id="cad-prop-dia"
                        type="range"
                        min={0.15}
                        max={2.4}
                        step={0.02}
                        value={g.propDiameterM}
                        onChange={(e) =>
                          onUpdateGeometry({ propDiameterM: Number(e.target.value) })
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Winglets & Flaps */}
                  <div className="rounded border border-slate-800 bg-[#0B0F17] p-2.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="cad-winglets-toggle"
                        className="flex items-center gap-2 text-xs font-medium text-slate-200 cursor-pointer"
                      >
                        <input
                          id="cad-winglets-toggle"
                          type="checkbox"
                          checked={Boolean(g.wingletsEnabled)}
                          onChange={(e) =>
                            onUpdateGeometry({ wingletsEnabled: e.target.checked })
                          }
                          className="accent-cyan-400 cursor-pointer"
                        />
                        Winglets de Ponta de Asa
                      </label>
                      {g.wingletsEnabled && (
                        <span className="font-mono text-[11px] tabular-nums text-cyan-300">
                          {g.wingletHeightPct ?? 8}% semi-env.
                        </span>
                      )}
                    </div>

                    {g.wingletsEnabled && (
                      <div>
                        <label
                          htmlFor="cad-winglet-h"
                          className="sr-only"
                        >
                          Altura do Winglet
                        </label>
                        <input
                          id="cad-winglet-h"
                          type="range"
                          min={4}
                          max={16}
                          step={1}
                          value={g.wingletHeightPct ?? 8}
                          onChange={(e) =>
                            onUpdateGeometry({
                              wingletHeightPct: Number(e.target.value),
                            })
                          }
                          className="w-full accent-cyan-400 cursor-pointer"
                        />
                      </div>
                    )}

                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cad-flap-deflect">Deflexão de Flapes</label>
                        <span className="font-mono tabular-nums text-amber-300">
                          {g.flapDeflectionDeg ?? 0}°
                        </span>
                      </div>
                      <input
                        id="cad-flap-deflect"
                        type="range"
                        min={0}
                        max={30}
                        step={2}
                        value={g.flapDeflectionDeg ?? 0}
                        onChange={(e) =>
                          onUpdateGeometry({
                            flapDeflectionDeg: Number(e.target.value),
                          })
                        }
                        className="mt-1 w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Quick NACA Section */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cad-naca-camber">Arqueamento</label>
                        <span className="font-mono tabular-nums text-slate-200">
                          {project.airfoil.maxCamberPct}%
                        </span>
                      </div>
                      <input
                        id="cad-naca-camber"
                        type="range"
                        min={0}
                        max={6}
                        step={1}
                        value={project.airfoil.maxCamberPct}
                        onChange={(e) =>
                          handleUpdateNacaField('maxCamberPct', Number(e.target.value))
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cad-naca-thick">Espessura Perfil</label>
                        <span className="font-mono tabular-nums text-slate-200">
                          {project.airfoil.thicknessPct}%
                        </span>
                      </div>
                      <input
                        id="cad-naca-thick"
                        type="range"
                        min={8}
                        max={22}
                        step={1}
                        value={project.airfoil.thicknessPct}
                        onChange={(e) =>
                          handleUpdateNacaField('thicknessPct', Number(e.target.value))
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>
                </section>

                {/* CAD 3D Mesh Export */}
                <section className="border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Exportação Malha CAD 3D
                    </h3>
                    <span className="font-mono text-[11px] tabular-nums text-slate-400">
                      {triangleCount.toLocaleString('pt-BR')} triângulos
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportCad('stl')}
                      className="inline-flex items-center justify-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-semibold text-slate-100 hover:border-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Exportar .STL
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportCad('obj')}
                      className="inline-flex items-center justify-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-semibold text-slate-100 hover:border-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      Exportar .OBJ
                    </button>
                  </div>
                </section>
              </>
            ) : (
              <>
                {/* CFD Boundary Conditions */}
                <section className="space-y-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Condições de Contorno (ISA)
                  </h3>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <label htmlFor="cfd-velocity">Velocidade Escoamento V∞</label>
                      <span className="font-mono tabular-nums text-cyan-300">
                        {cfdConfig.velocityMs} m/s ({Math.round(cfdConfig.velocityMs * 3.6)} km/h)
                      </span>
                    </div>
                    <input
                      id="cfd-velocity"
                      type="range"
                      min={5}
                      max={110}
                      step={1}
                      value={cfdConfig.velocityMs}
                      onChange={(e) =>
                        setCfdConfig((prev) => ({
                          ...prev,
                          velocityMs: Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cfd-aoa">Ângulo Ataque α</label>
                        <span className="font-mono tabular-nums text-amber-300">
                          {cfdConfig.aoaDeg}°
                        </span>
                      </div>
                      <input
                        id="cfd-aoa"
                        type="range"
                        min={-6}
                        max={18}
                        step={1}
                        value={cfdConfig.aoaDeg}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCfdConfig((prev) => ({ ...prev, aoaDeg: val }));
                          onUpdateAoA(val);
                        }}
                        className="mt-1 w-full accent-amber-400 cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-300">
                        <label htmlFor="cfd-sideslip">Derrapagem β</label>
                        <span className="font-mono tabular-nums text-slate-200">
                          {cfdConfig.sideslipDeg}°
                        </span>
                      </div>
                      <input
                        id="cfd-sideslip"
                        type="range"
                        min={-15}
                        max={15}
                        step={1}
                        value={cfdConfig.sideslipDeg}
                        onChange={(e) =>
                          setCfdConfig((prev) => ({
                            ...prev,
                            sideslipDeg: Number(e.target.value),
                          }))
                        }
                        className="mt-1 w-full accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <label htmlFor="cfd-altitude">Altitude ISA</label>
                      <span className="font-mono tabular-nums text-slate-200">
                        {cfdConfig.altitudeM} m · ρ {cfdResult.atmosphere.densityKgM3.toFixed(3)} kg/m³
                      </span>
                    </div>
                    <input
                      id="cfd-altitude"
                      type="range"
                      min={0}
                      max={6000}
                      step={100}
                      value={cfdConfig.altitudeM}
                      onChange={(e) =>
                        setCfdConfig((prev) => ({
                          ...prev,
                          altitudeM: Number(e.target.value),
                        }))
                      }
                      className="mt-1 w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">Linhas de Corrente</span>
                    <div className="flex gap-1 rounded border border-slate-800 bg-[#0B0F17] p-0.5">
                      {[8, 16, 24].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() =>
                            setCfdConfig((prev) => ({
                              ...prev,
                              streamlineCount: count,
                            }))
                          }
                          className={`rounded px-2.5 py-0.5 font-mono text-xs cursor-pointer ${
                            cfdConfig.streamlineCount === count
                              ? 'bg-slate-800 text-cyan-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {count}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Visualization Mode & Domain Overlays */}
                <section className="space-y-2.5 border-t border-slate-800 pt-3">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Malha & Campo de Pressão
                  </h3>

                  <div className="grid grid-cols-3 gap-1 rounded border border-slate-800 bg-[#0B0F17] p-0.5">
                    {(
                      [
                        { id: 'solid', label: 'Sólido PBR' },
                        { id: 'cp_pressure', label: 'Pressão Cp' },
                        { id: 'wireframe', label: 'Wireframe' },
                      ] as Array<{ id: CfdViewMode; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setCfdConfig((prev) => ({ ...prev, viewMode: m.id }))
                        }
                        className={`rounded py-1 text-[11px] font-medium cursor-pointer ${
                          cfdConfig.viewMode === m.id
                            ? 'bg-slate-800 text-cyan-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 rounded border border-slate-800 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfdConfig.showTunnelDomain}
                        onChange={(e) =>
                          setCfdConfig((prev) => ({
                            ...prev,
                            showTunnelDomain: e.target.checked,
                          }))
                        }
                        className="accent-cyan-400 cursor-pointer"
                      />
                      Domínio CFD
                    </label>
                    <label className="flex items-center gap-2 rounded border border-slate-800 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cfdConfig.showForceVectors}
                        onChange={(e) =>
                          setCfdConfig((prev) => ({
                            ...prev,
                            showForceVectors: e.target.checked,
                          }))
                        }
                        className="accent-cyan-400 cursor-pointer"
                      />
                      Vetores L / D
                    </label>
                  </div>
                </section>

                {/* Solver Execution & Convergence Plot */}
                <section className="space-y-2.5 border-t border-slate-800 pt-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSolverRunCount((c) => c + 1);
                        setCfdConfig((prev) => ({
                          ...prev,
                          viewMode: 'cp_pressure',
                        }));
                      }}
                      className="inline-flex items-center gap-1.5 rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Executar Solver CFD
                    </button>
                    <span className="font-mono text-[11px] text-emerald-400">
                      #{solverRunCount} · {cfdResult.converged ? 'Convergido' : 'Iterando'}
                    </span>
                  </div>

                  {/* 20-step Convergence Chart */}
                  <div className="rounded border border-slate-800 bg-[#0B0F17] p-2.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Convergência (20 iterações)</span>
                      <span className="font-mono tabular-nums text-cyan-300">
                        Res {cfdResult.iterations[19]?.residual.toExponential(1)}
                      </span>
                    </div>
                    <svg
                      viewBox={`0 0 ${svgPaths.w} ${svgPaths.h}`}
                      className="mt-1.5 h-24 w-full"
                      role="img"
                      aria-label="Gráfico de convergência CL e resíduo CFD"
                    >
                      <line
                        x1="12"
                        y1="46"
                        x2="268"
                        y2="46"
                        stroke="#1e293b"
                        strokeDasharray="3 3"
                      />
                      <path
                        d={svgPaths.resPath}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                      />
                      <path
                        d={svgPaths.clPath}
                        fill="none"
                        stroke="#22d3ee"
                        strokeWidth="2"
                      />
                    </svg>
                    <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
                      <span className="text-cyan-300">― CL estabilizado</span>
                      <span className="text-amber-300">― Resíduo log10</span>
                    </div>
                  </div>

                  {/* Coefficient Breakdown */}
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums">
                    <div className="rounded border border-slate-800 bg-[#0B0F17] p-2">
                      <div className="text-[10px] text-slate-400">CL / L·D</div>
                      <div className="mt-0.5 font-semibold text-cyan-300">
                        {cfdResult.cl.toFixed(2)} · {cfdResult.ldRatio.toFixed(1)}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-[#0B0F17] p-2">
                      <div className="text-[10px] text-slate-400">CD0 / CDi</div>
                      <div className="mt-0.5 font-semibold text-amber-300">
                        {cfdResult.cd0.toFixed(3)} / {cfdResult.cdInduced.toFixed(3)}
                      </div>
                    </div>
                    <div className="rounded border border-slate-800 bg-[#0B0F17] p-2">
                      <div className="text-[10px] text-slate-400">Momento Cm</div>
                      <div className="mt-0.5 font-semibold text-slate-200">
                        {cfdResult.pitchingMomentNm.toFixed(0)} N·m
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCfdCsv}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-semibold text-slate-100 hover:border-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Exportar Relatório CFD (.CSV)
                  </button>
                </section>
              </>
            )}
          </div>
        </aside>

        {/* Central Unobstructed 3D CAD + CFD Viewport */}
        <section className="relative h-[calc(100vh-310px)] min-h-[480px] max-h-[572px] w-full overflow-hidden rounded-md border border-slate-800 bg-[#090D14] lg:col-span-8">
          <div
            ref={mountRef}
            data-testid="cad-3d-viewport"
            className="h-full w-full"
          />

          {webglUnavailable && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#090D14] p-6 text-center">
              <div className="max-w-md rounded-md border border-slate-800 bg-[#111827] p-6">
                <p className="text-sm font-semibold text-slate-100">
                  Visualizador 3D indisponível neste dispositivo
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  O contexto WebGL não pôde ser inicializado. Verifique a aceleração de hardware do navegador.
                </p>
              </div>
            </div>
          )}

          {/* Top-Left Live CAD & CFD Telemetry Strip */}
          <div className="pointer-events-none absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-md border border-slate-800 bg-[#0B0F17]/90 px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-400">
              <span>
                Ambiente CAD &amp; CFD SimScale · {project.name}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                AR_ef {cfdResult.effectiveAspectRatio.toFixed(1)} · Mach {cfdResult.machNumber.toFixed(2)} · Re {(cfdResult.reynoldsNumber / 1e6).toFixed(2)}M
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums text-slate-100">
              <span>
                Sustentação{' '}
                <strong className="text-cyan-300">{cfdResult.liftN.toFixed(0)} N</strong>{' '}
                ({cfdResult.liftKgf.toFixed(1)} kgf)
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                Arrasto{' '}
                <strong className="text-amber-300">{cfdResult.dragN.toFixed(1)} N</strong>
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                L/D <strong className="text-emerald-400">{cfdResult.ldRatio.toFixed(1)}</strong>
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                CL {cfdResult.cl.toFixed(2)} · q {cfdResult.dynamicPressurePa.toFixed(0)} Pa
              </span>
            </div>

            {cfdConfig.viewMode === 'cp_pressure' && (
              <div className="mt-2 flex items-center gap-2 border-t border-slate-800 pt-1.5 text-[10px] font-mono text-slate-300">
                <span>Cp</span>
                <span className="text-blue-400">-1.8 Sucção</span>
                <div
                  className="h-2 w-28 rounded-sm"
                  style={{
                    background:
                      'linear-gradient(90deg, #0d40f2 0%, #0dccf2 25%, #33e666 50%, #f2b314 75%, #f22614 100%)',
                  }}
                />
                <span className="text-red-400">+1.0 Estagnação</span>
              </div>
            )}
          </div>

          {/* Collapsible Unified Bottom Control Dock */}
          <div
            className="absolute bottom-3 left-1/2 z-10 w-[min(860px,96%)] transition-transform duration-200"
            style={{
              transform: dockCollapsed
                ? 'translate(-50%, calc(100% - 34px))'
                : 'translate(-50%, 0)',
            }}
          >
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setDockCollapsed((c) => !c)}
                className="inline-flex items-center gap-1.5 rounded-t-md border border-b-0 border-slate-700 bg-[#0F141F] px-3 py-1 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Mostrar Controles 3D
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    Recolher Controles
                  </>
                )}
              </button>
            </div>

            <div className="rounded-md border border-slate-700 bg-[#0F141F]/95 px-4 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Exploded View + View Mode */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-32">
                    <div className="flex justify-between text-[11px] text-slate-300">
                      <label htmlFor="cad-exploded">Vista Explodida</label>
                      <span className="font-mono tabular-nums text-cyan-300">
                        {explodedPct}%
                      </span>
                    </div>
                    <input
                      id="cad-exploded"
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={explodedPct}
                      onChange={(e) => setExplodedPct(Number(e.target.value))}
                      className="mt-1 w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center gap-1 rounded border border-slate-800 bg-[#0B0F17] p-0.5">
                    {(
                      [
                        { id: 'solid', label: 'Sólido' },
                        { id: 'cp_pressure', label: 'Pressão Cp' },
                        { id: 'wireframe', label: 'Wireframe' },
                      ] as Array<{ id: CfdViewMode; label: string }>
                    ).map((vm) => (
                      <button
                        key={vm.id}
                        type="button"
                        onClick={() =>
                          setCfdConfig((prev) => ({ ...prev, viewMode: vm.id }))
                        }
                        className={`rounded px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                          cfdConfig.viewMode === vm.id
                            ? 'bg-slate-800 text-cyan-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {vm.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Camera Presets */}
                <div className="flex items-center gap-1 rounded border border-slate-800 bg-[#0B0F17] p-0.5">
                  {(['perspective', 'top', 'side', 'front'] as CameraPreset[]).map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleSelectCamera(preset)}
                        className={`rounded px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                          cameraPreset === preset
                            ? 'bg-slate-800 text-cyan-300'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset === 'perspective'
                          ? 'Perspectiva'
                          : preset === 'top'
                          ? 'Topo'
                          : preset === 'side'
                          ? 'Lateral'
                          : 'Frontal'}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Bottom Row: Material Finish + Tunnel Toggle + Next Stage */}
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Acabamento:</span>
                  {FINISH_OPTIONS.map((fin) => (
                    <button
                      key={fin.id}
                      type="button"
                      onClick={() => onUpdateFinish(fin.id)}
                      className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                        project.finish === fin.id
                          ? 'border-cyan-400 bg-slate-800 text-slate-100'
                          : 'border-slate-800 bg-[#0B0F17] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full border border-slate-600"
                        style={{ backgroundColor: fin.swatch }}
                        aria-hidden="true"
                      />
                      {fin.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWindTunnelOn((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer ${
                      windTunnelOn
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                        : 'border-slate-700 bg-[#0B0F17] text-slate-300'
                    }`}
                  >
                    <Wind className="h-3.5 w-3.5" aria-hidden="true" />
                    {windTunnelOn ? 'Túnel CFD: Ativo' : 'Túnel CFD: Pausado'}
                  </button>

                  <button
                    type="button"
                    onClick={onAdvanceStage}
                    className="inline-flex items-center gap-1.5 rounded bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 whitespace-nowrap cursor-pointer"
                  >
                    Avançar: Estruturas
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
