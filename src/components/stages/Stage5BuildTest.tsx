import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
  computeAvionicsBudget,
  generateCamGCode,
  generateNaca4Coordinates,
} from '../../engine/aerospace';
import {
  AircraftProject,
  CamParams,
  SizingResults,
  StabilityResults,
} from '../../types/aerospace';
import { GazeboFlightSim } from './GazeboFlightSim';

interface Stage5BuildTestProps {
  project: AircraftProject;
  sizing: SizingResults;
  stability: StabilityResults;
  onUpdateCam: (patch: Partial<CamParams>) => void;
  onToggleAvionicsItem: (itemId: string) => void;
}

type BuildTab = 'cam' | 'kicad' | 'gazebo';

export const Stage5BuildTest: React.FC<Stage5BuildTestProps> = ({
  project,
  sizing,
  stability,
  onUpdateCam,
  onToggleAvionicsItem,
}) => {
  const [activeTab, setActiveTab] = useState<BuildTab>('cam');

  const gcode = useMemo(() => generateCamGCode(project), [project]);
  const avionicsBudget = useMemo(
    () => computeAvionicsBudget(project.avionics),
    [project.avionics]
  );

  const naca = useMemo(
    () =>
      generateNaca4Coordinates(
        project.airfoil.maxCamberPct,
        project.airfoil.camberPosTenths,
        project.airfoil.thicknessPct,
        36
      ),
    [project.airfoil.maxCamberPct, project.airfoil.camberPosTenths, project.airfoil.thicknessPct]
  );

  const handleDownloadGCode = () => {
    const blob = new Blob([gcode], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-nervura-naca${naca.code}.gcode`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CAM Toolpath SVG paths
  const camW = 540;
  const camH = 210;
  const chordPx = 420;
  const ox = 56;
  const oy = 118;

  const ribContourPath = useMemo(() => {
    const pts = [...naca.upper, ...naca.lower.slice().reverse().slice(1)];
    return (
      pts
        .map(
          (p, i) =>
            `${i === 0 ? 'M' : 'L'} ${(ox + p.x * chordPx).toFixed(1)} ${(
              oy -
              p.y * chordPx
            ).toFixed(1)}`
        )
        .join(' ') + ' Z'
    );
  }, [naca]);

  const toolOffsetPx = Math.min(14, Math.max(3, project.cam.toolDiameterMm * 1.4));
  const toolpathSvg = useMemo(() => {
    const raw = [...naca.upper, ...naca.lower.slice().reverse().slice(1)];
    const off = raw.map((pt, idx) => {
      const prev = raw[(idx - 1 + raw.length) % raw.length];
      const next = raw[(idx + 1) % raw.length];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      return {
        x: ox + pt.x * chordPx + nx * toolOffsetPx,
        y: oy - (pt.y * chordPx + ny * toolOffsetPx),
      };
    });
    return (
      off.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
      ' Z'
    );
  }, [naca, toolOffsetPx]);

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6 space-y-5">
      {/* Sub-module Segmented Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div
          role="tablist"
          aria-label="Módulos de Construção e Testes"
          className="flex flex-wrap items-center gap-1 rounded-md border border-slate-800 bg-[#111827] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'cam'}
            onClick={() => setActiveTab('cam')}
            className={`rounded px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'cam'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            5.1 Manufatura CAM / G-Code CNC
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'kicad'}
            onClick={() => setActiveTab('kicad')}
            className={`rounded px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'kicad'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            5.2 Eletrônica e Chicote (KiCad)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'gazebo'}
            onClick={() => setActiveTab('gazebo')}
            className={`rounded px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'gazebo'
                ? 'bg-cyan-500 text-slate-950'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            5.3 Simulador de Voo (Gazebo / PX4)
          </button>
        </div>

        <div className="font-mono text-xs tabular-nums text-slate-400">
          {project.structures.ribCountPerSide * 2} nervuras NACA {naca.code} · Barramento{' '}
          {avionicsBudget.totalCurrentA}A (AWG {avionicsBudget.recommendedMainAwg})
        </div>
      </div>

      {/* TAB 1: CAM / CNC G-CODE */}
      {activeTab === 'cam' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <aside className="lg:col-span-4 space-y-4 rounded-md border border-slate-800 bg-[#111827] p-5">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-slate-100">
                Parâmetros de Usinagem CNC (CAM)
              </h2>
              <p className="text-xs text-slate-400">
                {project.cam.sheetMaterialName}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cam-tool" className="block text-xs font-medium text-slate-300">
                  Diâmetro Fresa (mm)
                </label>
                <input
                  id="cam-tool"
                  type="number"
                  step={0.5}
                  min={0.8}
                  max={12}
                  value={project.cam.toolDiameterMm}
                  onChange={(e) =>
                    onUpdateCam({ toolDiameterMm: Math.max(0.8, Number(e.target.value) || 1) })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="cam-feed" className="block text-xs font-medium text-slate-300">
                  Avanço (mm/min)
                </label>
                <input
                  id="cam-feed"
                  type="number"
                  step={50}
                  min={200}
                  max={4000}
                  value={project.cam.feedRateMmMin}
                  onChange={(e) =>
                    onUpdateCam({ feedRateMmMin: Math.max(200, Number(e.target.value) || 200) })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="cam-rpm" className="block text-xs font-medium text-slate-300">
                  Rotação Spindle (RPM)
                </label>
                <input
                  id="cam-rpm"
                  type="number"
                  step={1000}
                  min={4000}
                  max={24000}
                  value={project.cam.spindleRpm}
                  onChange={(e) =>
                    onUpdateCam({ spindleRpm: Math.max(4000, Number(e.target.value) || 4000) })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100"
                />
              </div>

              <div>
                <label htmlFor="cam-tabs" className="block text-xs font-medium text-slate-300">
                  Abas de Retenção
                </label>
                <input
                  id="cam-tabs"
                  type="number"
                  min={0}
                  max={8}
                  value={project.cam.tabCount}
                  onChange={(e) =>
                    onUpdateCam({ tabCount: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadGCode}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Baixar G-Code CNC (.gcode)
            </button>
          </aside>

          <div className="lg:col-span-8 space-y-5">
            <div className="rounded-md border border-slate-800 bg-[#111827] p-5">
              <h3 className="text-sm font-semibold text-slate-100">
                Simulação de Percurso da Fresa (Compensação Externa D={project.cam.toolDiameterMm} mm)
              </h3>
              <svg
                viewBox={`0 0 ${camW} ${camH}`}
                className="mt-3 w-full h-auto rounded border border-slate-800 cad-grid-bg"
                role="img"
                aria-label="Visualização do percurso de ferramenta CNC ao redor da nervura NACA"
              >
                {/* Rapid move line from origin */}
                <line x1="18" y1="190" x2={ox} y2={oy} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth="1.2" />
                <circle cx="18" cy="190" r="4" fill="#F59E0B" />
                <text x="26" y="194" fill="#FDE68A" fontSize="10" fontFamily="JetBrains Mono">
                  Origem Máquina (X0, Y0)
                </text>

                {/* Final rib contour */}
                <path d={ribContourPath} fill="rgba(30,41,59,0.65)" stroke="#94A3B8" strokeWidth="1.5" />
                {/* CNC Offset Toolpath */}
                <path d={toolpathSvg} fill="none" stroke="#22D3EE" strokeWidth="1.8" strokeDasharray="6 2" />
              </svg>
            </div>

            <div className="rounded-md border border-slate-800 bg-[#111827] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  Programa G-Code Gerado (ISO-6983)
                </h3>
                <span className="font-mono text-xs text-slate-400">
                  {gcode.split('\n').length} blocos
                </span>
              </div>
              <pre className="mt-3 max-h-56 overflow-y-auto rounded border border-slate-800 bg-[#090D14] p-4 font-mono text-xs leading-relaxed text-emerald-300">
                {gcode}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: KICAD AVIONICS & HARNESS */}
      {activeTab === 'kicad' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-4 rounded-md border border-slate-800 bg-[#111827] p-5">
            <h2 className="text-sm font-semibold text-slate-100">
              Esquemático de Potência e Sinais (KiCad)
            </h2>
            <svg
              viewBox="0 0 420 260"
              className="w-full h-auto rounded border border-slate-800 bg-[#090D14]"
              role="img"
              aria-label="Esquemático elétrico KiCad do barramento de aviônica e atuadores"
            >
              {/* Power Bus */}
              <rect x="20" y="24" width="110" height="44" rx="4" fill="#111827" stroke="#F59E0B" strokeWidth="1.5" />
              <text x="75" y="44" textAnchor="middle" fill="#FDE68A" fontSize="10" fontFamily="JetBrains Mono">FONTE / BATT</text>
              <text x="75" y="58" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono">AWG {avionicsBudget.recommendedMainAwg}</text>

              {/* Main Bus Line */}
              <line x1="130" y1="46" x2="210" y2="46" stroke="#F59E0B" strokeWidth="2.5" />

              {/* Flight Controller / EFIS */}
              <rect x="210" y="20" width="185" height="60" rx="4" fill="#111827" stroke="#22D3EE" strokeWidth="1.5" />
              <text x="302" y="44" textAnchor="middle" fill="#67E8F9" fontSize="10" fontFamily="JetBrains Mono">
                {project.aircraftClass === 'real' ? 'EFIS + COMPUTADOR AR' : 'AUTOPILOT / RECEPTOR'}
              </text>
              <text x="302" y="60" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono">
                CAN / SBUS / 5V REG
              </text>

              {/* Branches to Sensors, RF, Actuators */}
              <line x1="250" y1="80" x2="250" y2="128" stroke="#10B981" strokeWidth="1.5" />
              <line x1="350" y1="80" x2="350" y2="128" stroke="#38BDF8" strokeWidth="1.5" />
              <line x1="75" y1="68" x2="75" y2="128" stroke="#F59E0B" strokeWidth="2" />

              <rect x="20" y="128" width="115" height="52" rx="4" fill="#111827" stroke="#F59E0B" strokeWidth="1.2" />
              <text x="77" y="150" textAnchor="middle" fill="#F8FAFC" fontSize="10" fontFamily="JetBrains Mono">ESC / MOTOR</text>
              <text x="77" y="166" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono">{avionicsBudget.totalPowerW.toFixed(0)} W Pico</text>

              <rect x="160" y="128" width="120" height="52" rx="4" fill="#111827" stroke="#10B981" strokeWidth="1.2" />
              <text x="220" y="150" textAnchor="middle" fill="#6EE7B7" fontSize="10" fontFamily="JetBrains Mono">SENSORES / GPS</text>
              <text x="220" y="166" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono">Pitot · IMU · RTK</text>

              <rect x="295" y="128" width="105" height="52" rx="4" fill="#111827" stroke="#38BDF8" strokeWidth="1.2" />
              <text x="347" y="150" textAnchor="middle" fill="#7DD3FC" fontSize="10" fontFamily="JetBrains Mono">4x SERVOS</text>
              <text x="347" y="166" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono">Ail / Prof / Leme</text>

              {/* Ground Return Bus */}
              <line x1="20" y1="215" x2="400" y2="215" stroke="#475569" strokeWidth="2" />
              <text x="210" y="234" textAnchor="middle" fill="#94A3B8" fontSize="10" fontFamily="JetBrains Mono">
                MALHA GND COMUM · MASSA AVIÔNICA: {(avionicsBudget.totalMassG / 1000).toFixed(2)} kg
              </text>
            </svg>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
                <div className="text-[11px] text-slate-400">Corrente Total</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-amber-300">
                  {avionicsBudget.totalCurrentA.toFixed(1)} A
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
                <div className="text-[11px] text-slate-400">Bitola Principal</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-cyan-300">
                  AWG {avionicsBudget.recommendedMainAwg}
                </div>
              </div>
              <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
                <div className="text-[11px] text-slate-400">Massa Total</div>
                <div className="mt-1 font-mono text-base font-semibold tabular-nums text-slate-100">
                  {avionicsBudget.totalMassG} g
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 rounded-md border border-slate-800 bg-[#111827] p-5">
            <h3 className="text-sm font-semibold text-slate-100">
              Lista de Materiais (BOM) e Orçamento do Chicote Elétrico
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Ative ou desative módulos para recalcular consumo, bitola do barramento e peso embarcado
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Ativo</th>
                    <th className="py-2 pr-3 font-medium">Subsistema / Componente</th>
                    <th className="py-2 px-3 font-medium">Barramento</th>
                    <th className="py-2 px-3 text-right font-medium">Tensão</th>
                    <th className="py-2 px-3 text-right font-medium">Corrente</th>
                    <th className="py-2 pl-3 text-right font-medium">Massa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums text-slate-200">
                  {project.avionics.map((item) => (
                    <tr key={item.id} className={item.enabled ? '' : 'opacity-45'}>
                      <td className="py-2.5 pr-3">
                        <input
                          type="checkbox"
                          aria-label={`Ativar ${item.name}`}
                          checked={item.enabled}
                          onChange={() => onToggleAvionicsItem(item.id)}
                          className="h-4 w-4 accent-cyan-400 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-sans text-slate-100">{item.name}</td>
                      <td className="py-2.5 px-3 text-cyan-300">{item.bus} (AWG {item.wireAwg})</td>
                      <td className="py-2.5 px-3 text-right">{item.voltageV.toFixed(1)} V</td>
                      <td className="py-2.5 px-3 text-right">{item.currentA.toFixed(1)} A</td>
                      <td className="py-2.5 pl-3 text-right">{item.massG} g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: GAZEBO 3D FLIGHT SIMULATOR */}
      {activeTab === 'gazebo' && (
        <GazeboFlightSim
          project={project}
          sizing={sizing}
          stability={stability}
        />
      )}
    </div>
  );
};
