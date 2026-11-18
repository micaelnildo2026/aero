import React, { useMemo } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import {
  computeAirfoilPolar,
  formatNacaCode,
  generateDxf2DBlueprint,
  generateNaca4Coordinates,
} from '../../engine/aerospace';
import {
  AircraftProject,
  AirfoilParams,
  Geometry2D3D,
  SizingResults,
  StabilityResults,
} from '../../types/aerospace';

interface Stage2Design2DProps {
  project: AircraftProject;
  sizing: SizingResults;
  stability: StabilityResults;
  onUpdateAirfoil: (patch: Partial<AirfoilParams>) => void;
  onUpdateGeometry: (patch: Partial<Geometry2D3D>) => void;
  onAdvanceStage: () => void;
}

export const Stage2Design2D: React.FC<Stage2Design2DProps> = ({
  project,
  sizing,
  stability,
  onUpdateAirfoil,
  onUpdateGeometry,
  onAdvanceStage,
}) => {
  const { airfoil, geometry } = project;

  const nacaProfile = useMemo(
    () =>
      generateNaca4Coordinates(
        airfoil.maxCamberPct,
        airfoil.camberPosTenths,
        airfoil.thicknessPct,
        44
      ),
    [airfoil.maxCamberPct, airfoil.camberPosTenths, airfoil.thicknessPct]
  );

  const polar = useMemo(
    () => computeAirfoilPolar(airfoil, sizing.reynoldsNumber, sizing.aspectRatio),
    [airfoil, sizing.reynoldsNumber, sizing.aspectRatio]
  );

  const currentPolarPoint = useMemo(() => {
    const rounded = Math.round(airfoil.angleOfAttackDeg);
    return polar.find((p) => p.alphaDeg === rounded) ?? polar[10];
  }, [polar, airfoil.angleOfAttackDeg]);

  const handleDownloadDxf = () => {
    const dxf = generateDxf2DBlueprint(project);
    const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-vistas-2d.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Airfoil SVG path builder
  const afW = 540;
  const afH = 180;
  const afPadX = 36;
  const afScale = afW - afPadX * 2;
  const afMidY = afH / 2 + 8;

  const airfoilOutlinePath = useMemo(() => {
    const pts = [
      ...nacaProfile.upper,
      ...nacaProfile.lower.slice().reverse().slice(1),
    ];
    return (
      pts
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${(afPadX + p.x * afScale).toFixed(1)} ${(
              afMidY -
              p.y * afScale
            ).toFixed(1)}`
        )
        .join(' ') + ' Z'
    );
  }, [nacaProfile, afScale, afMidY]);

  const camberPath = useMemo(() => {
    return nacaProfile.camber
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'} ${(afPadX + p.x * afScale).toFixed(1)} ${(
            afMidY -
            p.y * afScale
          ).toFixed(1)}`
      )
      .join(' ');
  }, [nacaProfile, afScale, afMidY]);

  // Polar CL x alpha SVG
  const pW = 320;
  const pH = 175;
  const pPad = 32;
  const clMin = -0.6;
  const clMax = 2.0;
  const mapAlphaX = (a: number) => pPad + ((a + 6) / 24) * (pW - pPad * 2);
  const mapClY = (cl: number) =>
    pH - pPad - ((cl - clMin) / (clMax - clMin)) * (pH - pPad * 2);

  const clCurvePath = polar
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'} ${mapAlphaX(pt.alphaDeg).toFixed(1)} ${mapClY(pt.cl).toFixed(1)}`
    )
    .join(' ');

  // 3-View Orthographic CAD SVG coordinates (Top, Side, Front)
  const cadW = 680;
  const cadH = 340;
  const maxDim = Math.max(geometry.wingspanM, geometry.fuselageLengthM);
  const scalePx = 220 / Math.max(1, maxDim);
  const halfBpx = (geometry.wingspanM * scalePx) / 2;
  const fuseLpx = geometry.fuselageLengthM * scalePx;
  const fuseRpx = (geometry.fuselageDiameterM * scalePx) / 2;
  const crPx = geometry.rootChordM * scalePx;
  const ctPx = geometry.tipChordM * scalePx;
  const sweepPx = Math.tan((geometry.sweepDeg * Math.PI) / 180) * halfBpx;

  const topCenterX = 185;
  const topNoseY = 36;
  const topWingRootY = topNoseY + fuseLpx * 0.28;

  const sideCenterY = 120;
  const sideNoseX = 395;
  const sideWingY =
    geometry.wingPosition === 'high'
      ? sideCenterY - fuseRpx * 0.85
      : geometry.wingPosition === 'low'
      ? sideCenterY + fuseRpx * 0.75
      : sideCenterY;

  const frontCenterX = 520;
  const frontCenterY = 265;
  const dihedralPx = Math.tan((geometry.dihedralDeg * Math.PI) / 180) * halfBpx;

  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-12">
      {/* Left Column: Airfoil + Parametric Geometry Controls */}
      <aside className="lg:col-span-4 space-y-5 rounded-md border border-slate-800 bg-[#111827] p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Parametrização 2D e Perfil NACA
            </h2>
            <p className="text-xs text-slate-400">
              OpenVSP · AutoCAD · XFOIL · XFLR5
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-cyan-300">
            NACA {nacaProfile.code}
          </span>
        </div>

        {/* NACA 4-Digit Controls */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="af-camber" className="font-medium text-slate-300">
                Arqueamento Máximo (m)
              </label>
              <span className="font-mono tabular-nums text-cyan-300">{airfoil.maxCamberPct}%</span>
            </div>
            <input
              id="af-camber"
              type="range"
              min={0}
              max={7}
              step={1}
              value={airfoil.maxCamberPct}
              onChange={(e) => {
                const m = Number(e.target.value);
                onUpdateAirfoil({
                  maxCamberPct: m,
                  nacaCode: formatNacaCode(m, airfoil.camberPosTenths, airfoil.thicknessPct),
                });
              }}
              className="mt-1 w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="af-pos" className="font-medium text-slate-300">
                Posição do Arqueamento (p)
              </label>
              <span className="font-mono tabular-nums text-cyan-300">{airfoil.camberPosTenths * 10}%</span>
            </div>
            <input
              id="af-pos"
              type="range"
              min={2}
              max={6}
              step={1}
              value={airfoil.camberPosTenths}
              onChange={(e) => {
                const p = Number(e.target.value);
                onUpdateAirfoil({
                  camberPosTenths: p,
                  nacaCode: formatNacaCode(airfoil.maxCamberPct, p, airfoil.thicknessPct),
                });
              }}
              className="mt-1 w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="af-thick" className="font-medium text-slate-300">
                Espessura Relativa (t/c)
              </label>
              <span className="font-mono tabular-nums text-cyan-300">{airfoil.thicknessPct}%</span>
            </div>
            <input
              id="af-thick"
              type="range"
              min={8}
              max={20}
              step={1}
              value={airfoil.thicknessPct}
              onChange={(e) => {
                const t = Number(e.target.value);
                onUpdateAirfoil({
                  thicknessPct: t,
                  nacaCode: formatNacaCode(airfoil.maxCamberPct, airfoil.camberPosTenths, t),
                });
              }}
              className="mt-1 w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="af-aoa" className="font-medium text-slate-300">
                Ângulo de Ataque de Análise (α)
              </label>
              <span className="font-mono tabular-nums text-amber-300">{airfoil.angleOfAttackDeg.toFixed(1)}°</span>
            </div>
            <input
              id="af-aoa"
              type="range"
              min={-4}
              max={16}
              step={1}
              value={airfoil.angleOfAttackDeg}
              onChange={(e) => onUpdateAirfoil({ angleOfAttackDeg: Number(e.target.value) })}
              className="mt-1 w-full accent-amber-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Geometry 2D/OpenVSP Sliders */}
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="geom-span" className="block text-xs font-medium text-slate-300">
                Envergadura (m)
              </label>
              <input
                id="geom-span"
                type="number"
                step={project.aircraftClass === 'real' ? 0.2 : 0.05}
                min={0.6}
                max={30}
                value={geometry.wingspanM}
                onChange={(e) =>
                  onUpdateGeometry({ wingspanM: Math.max(0.6, Number(e.target.value) || 0.6) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="geom-fuse" className="block text-xs font-medium text-slate-300">
                Fuselagem (m)
              </label>
              <input
                id="geom-fuse"
                type="number"
                step={project.aircraftClass === 'real' ? 0.1 : 0.05}
                min={0.5}
                max={25}
                value={geometry.fuselageLengthM}
                onChange={(e) =>
                  onUpdateGeometry({ fuselageLengthM: Math.max(0.5, Number(e.target.value) || 0.5) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="geom-cr" className="block text-xs font-medium text-slate-300">
                Corda Raiz (m)
              </label>
              <input
                id="geom-cr"
                type="number"
                step={0.02}
                min={0.1}
                max={4}
                value={geometry.rootChordM}
                onChange={(e) =>
                  onUpdateGeometry({ rootChordM: Math.max(0.1, Number(e.target.value) || 0.1) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="geom-ct" className="block text-xs font-medium text-slate-300">
                Corda Ponta (m)
              </label>
              <input
                id="geom-ct"
                type="number"
                step={0.02}
                min={0.08}
                max={3.5}
                value={geometry.tipChordM}
                onChange={(e) =>
                  onUpdateGeometry({ tipChordM: Math.max(0.08, Number(e.target.value) || 0.08) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="geom-sweep" className="font-medium text-slate-300">Enflechamento</label>
                <span className="font-mono tabular-nums text-cyan-300">{geometry.sweepDeg}°</span>
              </div>
              <input
                id="geom-sweep"
                type="range"
                min={-5}
                max={25}
                step={0.5}
                value={geometry.sweepDeg}
                onChange={(e) => onUpdateGeometry({ sweepDeg: Number(e.target.value) })}
                className="mt-1 w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="geom-dihedral" className="font-medium text-slate-300">Diedro</label>
                <span className="font-mono tabular-nums text-cyan-300">{geometry.dihedralDeg}°</span>
              </div>
              <input
                id="geom-dihedral"
                type="range"
                min={-2}
                max={8}
                step={0.5}
                value={geometry.dihedralDeg}
                onChange={(e) => onUpdateGeometry({ dihedralDeg: Number(e.target.value) })}
                className="mt-1 w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="geom-cg" className="font-medium text-slate-300">
                Posição do CG (% CMA)
              </label>
              <span className="font-mono tabular-nums text-amber-300">{geometry.cgPercentMac}%</span>
            </div>
            <input
              id="geom-cg"
              type="range"
              min={15}
              max={48}
              step={1}
              value={geometry.cgPercentMac}
              onChange={(e) => onUpdateGeometry({ cgPercentMac: Number(e.target.value) })}
              className="mt-1 w-full accent-amber-400 cursor-pointer"
            />
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleDownloadDxf}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Exportar DXF
          </button>

          <button
            type="button"
            onClick={onAdvanceStage}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer"
          >
            Avançar: CAD 3D & CFD
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* Main 2D CAD & XFOIL Polar Stage */}
      <div className="lg:col-span-8 space-y-5">
        {/* Top Row: NACA Airfoil Geometry + XFOIL Polar */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="xl:col-span-7 rounded-md border border-slate-800 bg-[#111827] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Perfil Aerodinâmico NACA {nacaProfile.code} (XFOIL)
              </h3>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                CL {currentPolarPoint.cl.toFixed(2)} · CD {currentPolarPoint.cd.toFixed(4)} · L/D {currentPolarPoint.ld.toFixed(1)}
              </span>
            </div>

            <svg
              viewBox={`0 0 ${afW} ${afH}`}
              className="mt-3 w-full h-auto rounded border border-slate-800 cad-grid-bg"
              role="img"
              aria-label={`Contorno do perfil NACA ${nacaProfile.code}`}
            >
              {/* Chord line */}
              <line
                x1={afPadX}
                y1={afMidY}
                x2={afPadX + afScale}
                y2={afMidY}
                stroke="#475569"
                strokeDasharray="4 3"
                strokeWidth="1"
              />
              {/* Mean camber line */}
              <path d={camberPath} fill="none" stroke="#F59E0B" strokeWidth="1.2" strokeDasharray="3 3" />
              {/* Airfoil silhouette */}
              <path
                d={airfoilOutlinePath}
                fill="rgba(6, 182, 212, 0.16)"
                stroke="#22D3EE"
                strokeWidth="2"
              />
              {/* Quarter-chord aerodynamic center */}
              <line
                x1={afPadX + afScale * 0.25}
                y1={afMidY}
                x2={afPadX + afScale * 0.25}
                y2={afMidY + 34}
                stroke="#F43F5E"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle cx={afPadX + afScale * 0.25} cy={afMidY} r="4" fill="#F43F5E" />
              <text
                x={afPadX + afScale * 0.25 + 6}
                y={afMidY + 38}
                fill="#FDA4AF"
                fontSize="10"
                fontFamily="JetBrains Mono"
              >
                CA (25%c)
              </text>
            </svg>
          </div>

          <div className="xl:col-span-5 rounded-md border border-slate-800 bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              Curva Polar CL × α (XFLR5)
            </h3>
            <svg
              viewBox={`0 0 ${pW} ${pH}`}
              className="mt-3 w-full h-auto rounded border border-slate-800 cad-grid-bg"
              role="img"
              aria-label="Curva polar de sustentação por ângulo de ataque"
            >
              <line x1={pPad} y1={pPad} x2={pPad} y2={pH - pPad} stroke="#334155" />
              <line x1={pPad} y1={mapClY(0)} x2={pW - pPad} y2={mapClY(0)} stroke="#334155" />
              <path d={clCurvePath} fill="none" stroke="#06B6D4" strokeWidth="2" />
              <circle
                cx={mapAlphaX(currentPolarPoint.alphaDeg)}
                cy={mapClY(currentPolarPoint.cl)}
                r="4.5"
                fill="#F59E0B"
                stroke="#FFFFFF"
                strokeWidth="1.2"
              />
              <text
                x={mapAlphaX(currentPolarPoint.alphaDeg) - 24}
                y={Math.max(16, mapClY(currentPolarPoint.cl) - 10)}
                fill="#FDE68A"
                fontSize="10"
                fontFamily="JetBrains Mono"
              >
                α={currentPolarPoint.alphaDeg}° CL={currentPolarPoint.cl.toFixed(2)}
              </text>
              <text x={pW / 2} y={pH - 8} textAnchor="middle" fill="#94A3B8" fontSize="10">
                Ângulo de Ataque α (graus)
              </text>
            </svg>
          </div>
        </div>

        {/* AutoCAD / OpenVSP 3-View Orthographic Blueprint */}
        <div className="rounded-md border border-slate-800 bg-[#111827] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Prancheta Ortográfica 2D (AutoCAD / OpenVSP)
              </h3>
              <p className="text-xs text-slate-400">
                Vista superior, perfil lateral e vista frontal com marcadores de CG e Ponto Neutro
              </p>
            </div>
            <div className="font-mono text-xs tabular-nums text-slate-300">
              Ponto Neutro: <strong className="text-cyan-300">{stability.neutralPointPercentMac.toFixed(1)}% CMA</strong> ·
              Margem Estática:{' '}
              <strong
                className={
                  stability.status === 'Estável'
                    ? 'text-emerald-400'
                    : stability.status === 'Marginal'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }
              >
                {stability.staticMarginPct.toFixed(1)}% ({stability.status})
              </strong>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${cadW} ${cadH}`}
            className="mt-4 w-full h-auto rounded border border-slate-800 cad-grid-bg"
            role="img"
            aria-label="Três vistas ortográficas da aeronave em CAD 2D"
          >
            {/* View Labels */}
            <text x="20" y="22" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">
              VISTA SUPERIOR (PLANTA) · b = {geometry.wingspanM.toFixed(2)} m
            </text>
            <text x="380" y="22" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">
              VISTA LATERAL · L = {geometry.fuselageLengthM.toFixed(2)} m
            </text>
            <text x="380" y="205" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">
              VISTA FRONTAL · DIEDRO {geometry.dihedralDeg}°
            </text>

            {/* TOP VIEW */}
            {/* Fuselage top */}
            <ellipse
              cx={topCenterX}
              cy={topNoseY + fuseLpx * 0.45}
              rx={Math.max(5, fuseRpx)}
              ry={fuseLpx * 0.45}
              fill="rgba(30, 41, 59, 0.7)"
              stroke="#94A3B8"
              strokeWidth="1.4"
            />
            {/* Top Wings */}
            <polygon
              points={`
                ${topCenterX},${topWingRootY}
                ${topCenterX + halfBpx},${topWingRootY + sweepPx}
                ${topCenterX + halfBpx},${topWingRootY + sweepPx + ctPx}
                ${topCenterX},${topWingRootY + crPx}
                ${topCenterX - halfBpx},${topWingRootY + sweepPx + ctPx}
                ${topCenterX - halfBpx},${topWingRootY + sweepPx}
              `}
              fill="rgba(6, 182, 212, 0.14)"
              stroke="#22D3EE"
              strokeWidth="1.6"
            />
            {/* Top Horizontal Tail */}
            <polygon
              points={`
                ${topCenterX - halfBpx * 0.36},${topNoseY + fuseLpx * 0.84}
                ${topCenterX + halfBpx * 0.36},${topNoseY + fuseLpx * 0.84}
                ${topCenterX + halfBpx * 0.3},${topNoseY + fuseLpx * 0.94}
                ${topCenterX - halfBpx * 0.3},${topNoseY + fuseLpx * 0.94}
              `}
              fill="rgba(6, 182, 212, 0.12)"
              stroke="#38BDF8"
              strokeWidth="1.3"
            />
            {/* CG & Neutral Point Markers */}
            <circle
              cx={topCenterX}
              cy={topWingRootY + crPx * (geometry.cgPercentMac / 100)}
              r="4"
              fill="#F59E0B"
            />
            <circle
              cx={topCenterX}
              cy={topWingRootY + crPx * (stability.neutralPointPercentMac / 100)}
              r="4"
              fill="#10B981"
            />
            {/* Span Dimension Line */}
            <line
              x1={topCenterX - halfBpx}
              y1={topNoseY + fuseLpx + 18}
              x2={topCenterX + halfBpx}
              y2={topNoseY + fuseLpx + 18}
              stroke="#64748B"
              strokeWidth="1"
            />
            <text
              x={topCenterX}
              y={topNoseY + fuseLpx + 32}
              textAnchor="middle"
              fill="#CBD5E1"
              fontSize="10"
              fontFamily="JetBrains Mono"
            >
              Envergadura: {geometry.wingspanM.toFixed(2)} m · CMA: {stability.macM.toFixed(2)} m
            </text>

            {/* SIDE VIEW */}
            <path
              d={`M ${sideNoseX} ${sideCenterY}
                  Q ${sideNoseX + fuseLpx * 0.15} ${sideCenterY - fuseRpx * 1.1} ${sideNoseX + fuseLpx * 0.45} ${sideCenterY - fuseRpx * 0.9}
                  L ${sideNoseX + fuseLpx} ${sideCenterY - fuseRpx * 0.25}
                  L ${sideNoseX + fuseLpx} ${sideCenterY + fuseRpx * 0.25}
                  L ${sideNoseX + fuseLpx * 0.45} ${sideCenterY + fuseRpx * 0.9}
                  Q ${sideNoseX + fuseLpx * 0.15} ${sideCenterY + fuseRpx} ${sideNoseX} ${sideCenterY} Z`}
              fill="rgba(30, 41, 59, 0.7)"
              stroke="#94A3B8"
              strokeWidth="1.4"
            />
            {/* Side Wing Chord */}
            <rect
              x={sideNoseX + fuseLpx * 0.28}
              y={sideWingY - 3}
              width={crPx}
              height={6}
              rx={3}
              fill="#22D3EE"
            />
            {/* Vertical Tail Fin */}
            <polygon
              points={`
                ${sideNoseX + fuseLpx * 0.8},${sideCenterY - fuseRpx * 0.3}
                ${sideNoseX + fuseLpx * 0.96},${sideCenterY - fuseRpx * 0.25}
                ${sideNoseX + fuseLpx * 1.02},${sideCenterY - fuseRpx * 2.1}
                ${sideNoseX + fuseLpx * 0.9},${sideCenterY - fuseRpx * 2.1}
              `}
              fill="rgba(6, 182, 212, 0.16)"
              stroke="#38BDF8"
              strokeWidth="1.3"
            />

            {/* FRONT VIEW */}
            <circle
              cx={frontCenterX}
              cy={frontCenterY}
              r={Math.max(6, fuseRpx)}
              fill="rgba(30, 41, 59, 0.8)"
              stroke="#94A3B8"
              strokeWidth="1.4"
            />
            {/* Front Wings with Dihedral */}
            <polyline
              points={`
                ${frontCenterX - halfBpx},${frontCenterY - dihedralPx}
                ${frontCenterX},${frontCenterY - (geometry.wingPosition === 'high' ? fuseRpx * 0.85 : geometry.wingPosition === 'low' ? -fuseRpx * 0.75 : 0)}
                ${frontCenterX + halfBpx},${frontCenterY - dihedralPx}
              `}
              fill="none"
              stroke="#22D3EE"
              strokeWidth="3"
            />
            {/* Vertical Fin front */}
            <line
              x1={frontCenterX}
              y1={frontCenterY - fuseRpx}
              x2={frontCenterX}
              y2={frontCenterY - fuseRpx * 2.3}
              stroke="#38BDF8"
              strokeWidth="2.5"
            />
          </svg>

          <div className="mt-3 flex flex-wrap items-center gap-6 text-xs font-mono text-slate-400">
            <span className="text-amber-400">● Centro de Gravidade ({geometry.cgPercentMac}% CMA)</span>
            <span className="text-emerald-400">● Ponto Neutro ({stability.neutralPointPercentMac.toFixed(1)}% CMA)</span>
            <span>VH = {stability.hTailVolumeCoeff.toFixed(2)}</span>
            <span>VV = {stability.vTailVolumeCoeff.toFixed(3)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
