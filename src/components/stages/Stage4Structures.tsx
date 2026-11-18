import React, { useMemo, useRef } from 'react';
import { ArrowRight, Download } from 'lucide-react';
import {
  computeFeaWing,
  generateDxf2DBlueprint,
  generateNaca4Coordinates,
  MATERIALS,
} from '../../engine/aerospace';
import {
  AircraftProject,
  MaterialId,
  StructuralParams,
} from '../../types/aerospace';

interface Stage4StructuresProps {
  project: AircraftProject;
  onUpdateStructures: (patch: Partial<StructuralParams>) => void;
  onAdvanceStage: () => void;
}

function stressToColor(ratio: number): string {
  // ratio = vonMises / yieldStrength
  if (ratio > 0.85) return '#F43F5E'; // Rose critical
  if (ratio > 0.6) return '#F59E0B'; // Amber high
  if (ratio > 0.35) return '#10B981'; // Emerald moderate
  return '#06B6D4'; // Cyan low
}

export const Stage4Structures: React.FC<Stage4StructuresProps> = ({
  project,
  onUpdateStructures,
  onAdvanceStage,
}) => {
  const fea = useMemo(() => computeFeaWing(project), [project]);
  const blueprintSvgRef = useRef<SVGSVGElement | null>(null);
  const st = project.structures;

  const nacaRib = useMemo(
    () =>
      generateNaca4Coordinates(
        project.airfoil.maxCamberPct,
        project.airfoil.camberPosTenths,
        project.airfoil.thicknessPct,
        32
      ),
    [project.airfoil.maxCamberPct, project.airfoil.camberPosTenths, project.airfoil.thicknessPct]
  );

  const handleDownloadDxf = () => {
    const dxf = generateDxf2DBlueprint(project);
    const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-fabricacao.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSvg = () => {
    const svgEl = blueprintSvgRef.current;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const str = serializer.serializeToString(svgEl);
    const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-prancha-2d.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // FEA Wing Deflection & Heatmap SVG geometry
  const feaW = 640;
  const feaH = 220;
  const rootX = 56;
  const tipX = 590;
  const baselineY = 155;
  const maxDeflectPx = 88;
  const tipDeflRatio = Math.min(1, fea.tipDeflectionMm / Math.max(10, project.geometry.wingspanM * 60));

  const mapFeaX = (frac: number) => rootX + frac * (tipX - rootX);
  const mapFeaY = (defMm: number) =>
    baselineY - (defMm / Math.max(1, fea.tipDeflectionMm)) * maxDeflectPx * tipDeflRatio;

  // Blueprint SVG rib path
  const ribW = 240;
  const ribY = 105;
  const ribPath = useMemo(() => {
    const pts = [...nacaRib.upper, ...nacaRib.lower.slice().reverse().slice(1)];
    return (
      pts
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${(34 + p.x * ribW).toFixed(1)} ${(
              ribY -
              p.y * ribW
            ).toFixed(1)}`
        )
        .join(' ') + ' Z'
    );
  }, [nacaRib]);

  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-12">
      {/* Left Structural Controls */}
      <aside className="lg:col-span-4 space-y-5 rounded-md border border-slate-800 bg-[#111827] p-5">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Parâmetros FEA e Longarina
          </h2>
          <p className="text-xs text-slate-400">
            Ansys · CalculiX · Pranchas de Fabricação 2D
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="fea-material" className="block text-xs font-medium text-slate-300">
              Material Estrutural
            </label>
            <select
              id="fea-material"
              value={st.materialId}
              onChange={(e) => onUpdateStructures({ materialId: e.target.value as MaterialId })}
              className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
            >
              {Object.values(MATERIALS).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} (σy {m.yieldMpa} MPa)
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="fea-load-g" className="font-medium text-slate-300">
                Fator de Carga Limite (nG)
              </label>
              <span className="font-mono tabular-nums text-amber-300">
                +{st.designLoadFactorG.toFixed(1)} G
              </span>
            </div>
            <input
              id="fea-load-g"
              type="range"
              min={2}
              max={9}
              step={0.5}
              value={st.designLoadFactorG}
              onChange={(e) =>
                onUpdateStructures({ designLoadFactorG: Number(e.target.value) })
              }
              className="mt-1.5 w-full accent-amber-400 cursor-pointer"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="fea-spar-w" className="block text-xs font-medium text-slate-300">
                Largura Longarina (mm)
              </label>
              <input
                id="fea-spar-w"
                type="number"
                min={4}
                max={200}
                value={st.sparWidthMm}
                onChange={(e) =>
                  onUpdateStructures({ sparWidthMm: Math.max(4, Number(e.target.value) || 4) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="fea-spar-h" className="block text-xs font-medium text-slate-300">
                Altura Longarina (mm)
              </label>
              <input
                id="fea-spar-h"
                type="number"
                min={6}
                max={300}
                value={st.sparHeightMm}
                onChange={(e) =>
                  onUpdateStructures({ sparHeightMm: Math.max(6, Number(e.target.value) || 6) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="fea-spar-wall" className="block text-xs font-medium text-slate-300">
                Parede Caixa (mm)
              </label>
              <input
                id="fea-spar-wall"
                type="number"
                step={0.5}
                min={0.8}
                max={30}
                value={st.sparWallMm}
                onChange={(e) =>
                  onUpdateStructures({ sparWallMm: Math.max(0.8, Number(e.target.value) || 0.8) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="fea-ribs" className="block text-xs font-medium text-slate-300">
                Nervuras / Semi-asa
              </label>
              <input
                id="fea-ribs"
                type="number"
                min={4}
                max={32}
                value={st.ribCountPerSide}
                onChange={(e) =>
                  onUpdateStructures({ ribCountPerSide: Math.max(4, Number(e.target.value) || 4) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs">
              <label htmlFor="fea-sf" className="font-medium text-slate-300">
                Fator de Segurança Mínimo
              </label>
              <span className="font-mono tabular-nums text-cyan-300">
                {st.safetyFactorTarget.toFixed(2)}×
              </span>
            </div>
            <input
              id="fea-sf"
              type="range"
              min={1.2}
              max={2.5}
              step={0.1}
              value={st.safetyFactorTarget}
              onChange={(e) =>
                onUpdateStructures({ safetyFactorTarget: Number(e.target.value) })
              }
              className="mt-1.5 w-full accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadDxf}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Prancha DXF
            </button>
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center justify-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Prancha SVG
            </button>
          </div>

          <button
            type="button"
            onClick={onAdvanceStage}
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
          >
            Avançar: Construção CAM & Gazebo
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* Main FEA & Blueprint Stage */}
      <div className="lg:col-span-8 space-y-5">
        {/* FEA KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">Tensão Máx. Von Mises</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {fea.maxVonMisesMpa.toFixed(1)}
              </span>
              <span className="ml-1.5 font-mono text-xs text-slate-400">MPa</span>
            </div>
            <div className="mt-1 font-mono text-xs text-slate-400">
              Limite σy: {fea.yieldStrengthMpa} MPa
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">Fator de Segurança (FS)</div>
            <div className="mt-1.5 flex items-baseline">
              <span
                className={`font-mono text-2xl font-semibold tabular-nums ${
                  fea.approved ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fea.safetyFactorActual.toFixed(2)}×
              </span>
            </div>
            <div
              className={`mt-1 font-mono text-xs ${
                fea.approved ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {fea.approved
                ? `● Aprovado (meta ≥ ${st.safetyFactorTarget.toFixed(1)}×)`
                : `✖ Reprovado (reforce a longarina)`}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">Deflexão na Ponta</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {fea.tipDeflectionMm.toFixed(1)}
              </span>
              <span className="ml-1.5 font-mono text-xs text-slate-400">mm</span>
            </div>
            <div className="mt-1 font-mono text-xs text-slate-400">
              {fea.tipDeflectionPctSpan.toFixed(2)}% da envergadura
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">Momento Fletor Raiz</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {fea.maxBendingMomentNm.toFixed(0)}
              </span>
              <span className="ml-1.5 font-mono text-xs text-slate-400">N·m</span>
            </div>
            <div className="mt-1 font-mono text-xs text-slate-400">
              Massa longarina: {fea.sparMassKg.toFixed(2)} kg
            </div>
          </div>
        </div>

        {/* FEA Deflection & Stress Heatmap Visualization */}
        <div className="rounded-md border border-slate-800 bg-[#111827] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Malha FEA da Semi-Asa: Deflexão e Tensão Von Mises (+{st.designLoadFactorG}G)
              </h3>
              <p className="text-xs text-slate-400">
                Distribuição elíptica de sustentação integrada ao longo da longarina e nervuras
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-slate-400">
              <span className="text-cyan-400">■ Baixa</span>
              <span className="text-emerald-400">■ Moderada</span>
              <span className="text-amber-400">■ Alta</span>
              <span className="text-rose-400">■ Crítica</span>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${feaW} ${feaH}`}
            className="mt-3 w-full h-auto rounded border border-slate-800 cad-grid-bg"
            role="img"
            aria-label="Mapa de tensão Von Mises e deflexão estrutural da semi-asa"
          >
            {/* Unloaded wing reference dashed line */}
            <line
              x1={rootX}
              y1={baselineY}
              x2={tipX}
              y2={baselineY}
              stroke="#475569"
              strokeDasharray="4 4"
              strokeWidth="1.2"
            />
            {/* Fixed Root Wall Clamp */}
            <rect x={rootX - 10} y={baselineY - 40} width={10} height={80} fill="#334155" />

            {/* Deflected Spar Segments colored by Von Mises ratio */}
            {fea.stations.slice(0, -1).map((stn, idx) => {
              const next = fea.stations[idx + 1];
              const x1 = mapFeaX(stn.spanFraction);
              const y1 = mapFeaY(stn.deflectionMm);
              const x2 = mapFeaX(next.spanFraction);
              const y2 = mapFeaY(next.deflectionMm);
              const color = stressToColor(stn.vonMisesMpa / fea.yieldStrengthMpa);
              return (
                <line
                  key={stn.spanFraction}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              );
            })}

            {/* Rib stations along spar */}
            {Array.from({ length: Math.min(16, st.ribCountPerSide) }).map((_, i) => {
              const frac = (i + 1) / Math.min(16, st.ribCountPerSide);
              const idx = Math.min(fea.stations.length - 1, Math.round(frac * (fea.stations.length - 1)));
              const stn = fea.stations[idx];
              const rx = mapFeaX(stn.spanFraction);
              const ry = mapFeaY(stn.deflectionMm);
              return (
                <line
                  key={i}
                  x1={rx}
                  y1={ry - 13}
                  x2={rx}
                  y2={ry + 13}
                  stroke="#CBD5E1"
                  strokeWidth="1.5"
                />
              );
            })}

            {/* Tip Deflection Annotation */}
            <line
              x1={tipX + 12}
              y1={baselineY}
              x2={tipX + 12}
              y2={mapFeaY(fea.tipDeflectionMm)}
              stroke="#F59E0B"
              strokeWidth="1.2"
            />
            <text
              x={tipX - 88}
              y={Math.max(22, mapFeaY(fea.tipDeflectionMm) - 12)}
              fill="#FDE68A"
              fontSize="11"
              fontFamily="JetBrains Mono"
            >
              δ ponta = {fea.tipDeflectionMm.toFixed(1)} mm
            </text>
            <text x={rootX + 6} y={baselineY + 26} fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">
              Engaste Raiz (M={fea.maxBendingMomentNm.toFixed(0)} N·m)
            </text>
          </svg>
        </div>

        {/* 2D Manufacturing Technical Drawing Sheet */}
        <div className="rounded-md border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Prancha Técnica 2D para Fabricação (Nervura, Caverna e Carimbo)
          </h3>
          <svg
            ref={blueprintSvgRef}
            viewBox="0 0 680 230"
            className="mt-3 w-full h-auto rounded border border-slate-800 bg-[#090D14]"
            role="img"
            aria-label="Prancha técnica 2D com perfil de nervura, caverna e carimbo de engenharia"
          >
            {/* Outer Blueprint Frame */}
            <rect x="8" y="8" width="664" height="214" fill="none" stroke="#334155" strokeWidth="1.5" />

            {/* Rib NACA Profile + Spar Cutout */}
            <text x="26" y="30" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">
              DETALHE A · NERVURA NACA {nacaRib.code} (CORDA {(project.geometry.rootChordM * 1000).toFixed(0)} mm)
            </text>
            <path d={ribPath} fill="rgba(6, 182, 212, 0.1)" stroke="#22D3EE" strokeWidth="1.6" />
            {/* Box Spar Slot */}
            <rect
              x={34 + ribW * 0.28 - 9}
              y={ribY - 12}
              width="18"
              height="24"
              fill="#090D14"
              stroke="#F59E0B"
              strokeWidth="1.3"
            />
            {/* Lightening Holes */}
            <circle cx={34 + ribW * 0.52} cy={ribY} r="9" fill="none" stroke="#64748B" strokeWidth="1" />
            <circle cx={34 + ribW * 0.68} cy={ribY} r="6.5" fill="none" stroke="#64748B" strokeWidth="1" />

            {/* Fuselage Bulkhead / Caverna */}
            <text x="340" y="30" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">
              DETALHE B · CAVERNA MESTRA (Ø {(project.geometry.fuselageDiameterM * 1000).toFixed(0)} mm)
            </text>
            <circle cx="405" cy="110" r="54" fill="rgba(30, 41, 59, 0.4)" stroke="#22D3EE" strokeWidth="1.6" />
            <rect x="381" y="84" width="48" height="52" rx="6" fill="none" stroke="#F59E0B" strokeWidth="1.2" />

            {/* Title Block / Carimbo de Engenharia */}
            <rect x="490" y="132" width="174" height="82" fill="#0F141F" stroke="#475569" strokeWidth="1" />
            <line x1="490" y1="154" x2="664" y2="154" stroke="#475569" />
            <line x1="490" y1="176" x2="664" y2="176" stroke="#475569" />
            <line x1="490" y1="196" x2="664" y2="196" stroke="#475569" />
            <text x="498" y="147" fill="#F8FAFC" fontSize="10" fontFamily="JetBrains Mono" fontWeight="bold">
              {project.name.slice(0, 22)}
            </text>
            <text x="498" y="169" fill="#CBD5E1" fontSize="9" fontFamily="JetBrains Mono">
              MAT: {st.materialId.toUpperCase()} · FS {fea.safetyFactorActual.toFixed(2)}×
            </text>
            <text x="498" y="190" fill="#CBD5E1" fontSize="9" fontFamily="JetBrains Mono">
              NERVURAS: {st.ribCountPerSide * 2} UN · TOL ±0.2mm
            </text>
            <text x="498" y="209" fill="#22D3EE" fontSize="9" fontFamily="JetBrains Mono">
              PRANCHA 01/01 · ESCALA 1:5
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
};
