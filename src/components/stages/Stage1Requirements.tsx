import React, { useMemo, useState } from 'react';
import { ArrowRight, Download, Play } from 'lucide-react';
import {
  computeConstraintDiagram,
  generatePythonTradeStudyScript,
} from '../../engine/aerospace';
import {
  AircraftProject,
  MissionRequirements,
  SizingResults,
} from '../../types/aerospace';

interface Stage1RequirementsProps {
  project: AircraftProject;
  sizing: SizingResults;
  onUpdateRequirements: (patch: Partial<MissionRequirements>) => void;
  onAdvanceStage: () => void;
}

export const Stage1Requirements: React.FC<Stage1RequirementsProps> = ({
  project,
  sizing,
  onUpdateRequirements,
  onAdvanceStage,
}) => {
  const req = project.requirements;
  const [tradeStudyExecutedAt, setTradeStudyExecutedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'diagram' | 'python'>('diagram');

  const constraintData = useMemo(() => computeConstraintDiagram(project), [project]);
  const pythonScript = useMemo(() => generatePythonTradeStudyScript(project), [project]);

  const handleRunPythonStudy = () => {
    setActiveTab('diagram');
    const now = new Date();
    setTradeStudyExecutedAt(now.toLocaleTimeString('pt-BR'));
  };

  const handleExportCsv = () => {
    const rows = [
      ['Parametro', 'Valor', 'Unidade'],
      ['Projeto', project.name, '-'],
      ['Classe', project.aircraftClass, '-'],
      ['Massa Vazia', req.emptyMassKg.toFixed(2), 'kg'],
      ['Carga Paga', req.payloadMassKg.toFixed(2), 'kg'],
      ['Massa Energia', req.energyMassKg.toFixed(2), 'kg'],
      ['MTOW', sizing.mtowKg.toFixed(2), 'kg'],
      ['Area Alar', sizing.wingAreaM2.toFixed(3), 'm2'],
      ['Carga Alar', sizing.wingLoadingKgM2.toFixed(2), 'kg/m2'],
      ['Velocidade Cruzeiro', sizing.cruiseSpeedMs.toFixed(1), 'm/s'],
      ['Velocidade Estol', sizing.stallSpeedMs.toFixed(1), 'm/s'],
      ['Distancia Decolagem', sizing.takeoffDistanceM.toFixed(1), 'm'],
      ['Alcance Estimado', sizing.estimatedRangeKm.toFixed(1), 'km'],
      ['Autonomia', sizing.enduranceHours.toFixed(2), 'h'],
      ['Potencia Requerida', sizing.requiredPowerKw.toFixed(2), 'kW'],
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}-requisitos.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Constraint diagram SVG scales
  const svgW = 640;
  const svgH = 290;
  const padL = 58;
  const padR = 24;
  const padT = 22;
  const padB = 42;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const maxWL = Math.max(
    constraintData.stallLimitKgM2 * 1.15,
    ...constraintData.points.map((p) => p.wingLoadingKgM2),
    sizing.wingLoadingKgM2 * 1.1
  );
  const minWL = Math.min(...constraintData.points.map((p) => p.wingLoadingKgM2), sizing.wingLoadingKgM2 * 0.8);
  const maxPW = Math.max(
    sizing.powerToWeightWKg * 1.3,
    ...constraintData.points.map((p) => Math.max(p.cruisePW, p.takeoffPW))
  );

  const mapX = (wl: number) =>
    padL + ((wl - minWL) / Math.max(1, maxWL - minWL)) * plotW;
  const mapY = (pw: number) =>
    padT + plotH - (Math.min(maxPW, Math.max(0, pw)) / Math.max(1, maxPW)) * plotH;

  const cruisePath = constraintData.points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.wingLoadingKgM2).toFixed(1)} ${mapY(pt.cruisePW).toFixed(1)}`)
    .join(' ');
  const takeoffPath = constraintData.points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${mapX(pt.wingLoadingKgM2).toFixed(1)} ${mapY(pt.takeoffPW).toFixed(1)}`)
    .join(' ');

  const stallX = mapX(constraintData.stallLimitKgM2);
  const designX = mapX(sizing.wingLoadingKgM2);
  const designY = mapY(sizing.powerToWeightWKg);

  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-12">
      {/* Left Parameter Column (Planilha Excel / Inputs) */}
      <aside className="lg:col-span-4 space-y-5 rounded-md border border-slate-800 bg-[#111827] p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Planilha de Missão e Pesos
            </h2>
            <p className="text-xs text-slate-400">
              Parâmetros base de massa, propulsão e pista
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            CSV
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="req-empty-mass" className="block text-xs font-medium text-slate-300">
                Massa Vazia (kg)
              </label>
              <input
                id="req-empty-mass"
                type="number"
                step={project.aircraftClass === 'real' ? 5 : 0.05}
                min={0.1}
                value={req.emptyMassKg}
                onChange={(e) =>
                  onUpdateRequirements({ emptyMassKg: Math.max(0.1, Number(e.target.value) || 0.1) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="req-payload-mass" className="block text-xs font-medium text-slate-300">
                Carga Paga (kg)
              </label>
              <input
                id="req-payload-mass"
                type="number"
                step={project.aircraftClass === 'real' ? 5 : 0.05}
                min={0}
                value={req.payloadMassKg}
                onChange={(e) =>
                  onUpdateRequirements({ payloadMassKg: Math.max(0, Number(e.target.value) || 0) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="req-energy-mass" className="block text-xs font-medium text-slate-300">
                {req.propulsion === 'electric' ? 'Bateria (kg)' : 'Combustível (kg)'}
              </label>
              <input
                id="req-energy-mass"
                type="number"
                step={project.aircraftClass === 'real' ? 2 : 0.05}
                min={0.05}
                value={req.energyMassKg}
                onChange={(e) =>
                  onUpdateRequirements({ energyMassKg: Math.max(0.05, Number(e.target.value) || 0.05) })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="req-propulsion" className="block text-xs font-medium text-slate-300">
                Propulsão
              </label>
              <select
                id="req-propulsion"
                value={req.propulsion}
                onChange={(e) =>
                  onUpdateRequirements({ propulsion: e.target.value as 'piston' | 'electric' })
                }
                className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
              >
                <option value="piston">Pistão / AvGas</option>
                <option value="electric">Elétrico (LiPo/Li-Ion)</option>
              </select>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3">
            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="req-cruise" className="font-medium text-slate-300">
                  Velocidade de Cruzeiro
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {req.cruiseSpeedMs.toFixed(1)} m/s ({(req.cruiseSpeedMs * 3.6).toFixed(0)} km/h)
                </span>
              </div>
              <input
                id="req-cruise"
                type="range"
                min={10}
                max={95}
                step={0.5}
                value={req.cruiseSpeedMs}
                onChange={(e) => onUpdateRequirements({ cruiseSpeedMs: Number(e.target.value) })}
                className="mt-1.5 w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="req-stall" className="font-medium text-slate-300">
                  Meta Velocidade de Estol
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {req.stallSpeedMs.toFixed(1)} m/s ({(req.stallSpeedMs * 3.6).toFixed(0)} km/h)
                </span>
              </div>
              <input
                id="req-stall"
                type="range"
                min={6}
                max={35}
                step={0.5}
                value={req.stallSpeedMs}
                onChange={(e) => onUpdateRequirements({ stallSpeedMs: Number(e.target.value) })}
                className="mt-1.5 w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs">
                <label htmlFor="req-power" className="font-medium text-slate-300">
                  Potência Instalada
                </label>
                <span className="font-mono tabular-nums text-cyan-300">
                  {req.installedPowerKw.toFixed(2)} kW ({(req.installedPowerKw * 1.341).toFixed(1)} hp)
                </span>
              </div>
              <input
                id="req-power"
                type="range"
                min={0.2}
                max={160}
                step={req.installedPowerKw < 5 ? 0.05 : 1}
                value={req.installedPowerKw}
                onChange={(e) => onUpdateRequirements({ installedPowerKw: Number(e.target.value) })}
                className="mt-1.5 w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="req-runway" className="block text-xs font-medium text-slate-300">
                  Pista Máxima (m)
                </label>
                <input
                  id="req-runway"
                  type="number"
                  min={10}
                  max={2000}
                  value={req.runwayLimitM}
                  onChange={(e) =>
                    onUpdateRequirements({ runwayLimitM: Math.max(10, Number(e.target.value) || 10) })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="req-range" className="block text-xs font-medium text-slate-300">
                  Meta de Alcance (km)
                </label>
                <input
                  id="req-range"
                  type="number"
                  min={1}
                  max={5000}
                  value={req.targetRangeKm}
                  onChange={(e) =>
                    onUpdateRequirements({ targetRangeKm: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="mt-1 w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 font-mono text-sm tabular-nums text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleRunPythonStudy}
            className="inline-flex items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            Executar Estudo Python
          </button>

          <button
            type="button"
            onClick={onAdvanceStage}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors cursor-pointer"
          >
            Avançar: Desenho 2D
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </aside>

      {/* Main Engineering Viewport */}
      <div className="lg:col-span-8 space-y-5">
        {/* Precision Telemetry KPI Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">MTOW Calculado</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {sizing.mtowKg.toFixed(2)}
              </span>
              <span className="ml-1.5 font-mono text-xs text-slate-400">kg</span>
            </div>
            <div className="mt-1 font-mono text-xs tabular-nums text-slate-400">
              {sizing.weightN.toFixed(0)} N · AR {sizing.aspectRatio.toFixed(1)}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">Distância de Decolagem</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {sizing.takeoffDistanceM.toFixed(0)}
              </span>
              <span className="ml-1.5 font-mono text-xs text-slate-400">m</span>
            </div>
            <div
              className={`mt-1 font-mono text-xs ${
                sizing.runwayCompliant ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {sizing.runwayCompliant
                ? `● Aprovado (limite ${req.runwayLimitM} m)`
                : `✖ Excede pista (${req.runwayLimitM} m)`}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">Alcance e Autonomia</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {sizing.estimatedRangeKm.toFixed(0)}
              </span>
              <span className="ml-1.5 font-mono text-xs text-slate-400">km</span>
            </div>
            <div
              className={`mt-1 font-mono text-xs ${
                sizing.rangeCompliant ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {sizing.rangeCompliant
                ? `● ${sizing.enduranceHours.toFixed(1)} h de voo`
                : `▲ Abaixo da meta (${req.targetRangeKm} km)`}
            </div>
          </div>

          <div className="rounded-md border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-medium text-slate-400">Potência Requerida</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="font-mono text-2xl font-semibold tabular-nums text-slate-100">
                {sizing.requiredPowerKw.toFixed(2)}
              </span>
              <span className="ml-1.5 font-mono text-xs text-slate-400">kW</span>
            </div>
            <div
              className={`mt-1 font-mono text-xs ${
                sizing.powerMarginPct >= 25 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              Margem: +{sizing.powerMarginPct.toFixed(0)}% · Re {(sizing.reynoldsNumber / 1e6).toFixed(2)}M
            </div>
          </div>
        </div>

        {/* Constraint Diagram & Python Parametric Engine */}
        <div className="rounded-md border border-slate-800 bg-[#111827] p-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Análise de Restrições (Carga Alar × Potência/Peso)
              </h3>
              <p className="text-xs text-slate-400">
                {tradeStudyExecutedAt
                  ? `Estudo paramétrico Python executado às ${tradeStudyExecutedAt}`
                  : 'Curvas de limite de estol, corrida de decolagem e cruzeiro em tempo real'}
              </p>
            </div>

            <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#0B0F17] p-1">
              <button
                type="button"
                onClick={() => setActiveTab('diagram')}
                className={`rounded px-3 py-1 text-xs font-medium cursor-pointer ${
                  activeTab === 'diagram'
                    ? 'bg-slate-800 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Diagrama Gráfico
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('python')}
                className={`rounded px-3 py-1 text-xs font-medium cursor-pointer ${
                  activeTab === 'python'
                    ? 'bg-slate-800 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Script Python
              </button>
            </div>
          </div>

          {activeTab === 'diagram' ? (
            <div className="mt-4">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto rounded border border-slate-800/80 cad-grid-bg"
                role="img"
                aria-label="Diagrama de restrições de carga alar versus relação potência peso"
              >
                {/* Viable region shading left of stall line */}
                <rect
                  x={padL}
                  y={padT}
                  width={Math.max(0, Math.min(plotW, stallX - padL))}
                  height={plotH}
                  fill="rgba(6, 182, 212, 0.06)"
                />

                {/* Grid & Axes */}
                <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="#334155" strokeWidth="1" />
                <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="#334155" strokeWidth="1" />

                {/* Stall vertical limit */}
                <line
                  x1={stallX}
                  y1={padT}
                  x2={stallX}
                  y2={padT + plotH}
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                />
                <text x={stallX + 5} y={padT + 14} fill="#F59E0B" fontSize="10" fontFamily="JetBrains Mono">
                  Limite Estol ({constraintData.stallLimitKgM2.toFixed(1)} kg/m²)
                </text>

                {/* Cruise & Takeoff requirement curves */}
                <path d={cruisePath} fill="none" stroke="#06B6D4" strokeWidth="2" />
                <path d={takeoffPath} fill="none" stroke="#10B981" strokeWidth="2" strokeDasharray="4 3" />

                {/* Current Design Point */}
                <circle cx={designX} cy={designY} r="6" fill="#F43F5E" stroke="#FFFFFF" strokeWidth="1.5" />
                <text
                  x={Math.min(svgW - 140, designX + 10)}
                  y={Math.max(padT + 16, designY - 8)}
                  fill="#F8FAFC"
                  fontSize="11"
                  fontFamily="JetBrains Mono"
                >
                  Ponto Atual ({sizing.wingLoadingKgM2.toFixed(1)}, {sizing.powerToWeightWKg.toFixed(0)} W/kg)
                </text>

                {/* Axis labels */}
                <text x={padL + plotW / 2} y={svgH - 10} textAnchor="middle" fill="#94A3B8" fontSize="11">
                  Carga Alar W/S (kg/m²)
                </text>
                <text
                  x={16}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="11"
                  transform={`rotate(-90 16 ${padT + plotH / 2})`}
                >
                  Potência / Peso (W/kg)
                </text>
              </svg>

              <div className="mt-3 flex flex-wrap items-center gap-6 text-xs font-mono text-slate-400">
                <span className="text-cyan-400">― Requisito Cruzeiro</span>
                <span className="text-emerald-400">-- Requisito Decolagem</span>
                <span className="text-amber-400">-- Limite Estol (CLmáx)</span>
                <span className="text-rose-400">● Projeto Atual</span>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <pre className="overflow-x-auto rounded border border-slate-800 bg-[#090D14] p-4 font-mono text-xs leading-relaxed text-cyan-200">
                {pythonScript}
              </pre>
            </div>
          )}
        </div>

        {/* Summary Balance Table */}
        <div className="rounded-md border border-slate-800 bg-[#111827] p-5">
          <h3 className="text-sm font-semibold text-slate-100">
            Resumo Aerodinâmico e Balanço de Massa (Estilo Planilha Excel)
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-4 font-medium">Parâmetro de Engenharia</th>
                  <th className="py-2 px-4 font-medium">Fórmula / Critério</th>
                  <th className="py-2 pl-4 text-right font-medium">Valor Calculado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums text-slate-200">
                <tr>
                  <td className="py-2 pr-4 font-sans text-slate-300">Velocidade de Estol Real</td>
                  <td className="py-2 px-4 text-slate-400">√(2·W / (ρ·S·CLmáx))</td>
                  <td className="py-2 pl-4 text-right">{sizing.stallSpeedMs.toFixed(2)} m/s ({(sizing.stallSpeedMs * 3.6).toFixed(1)} km/h)</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-sans text-slate-300">Área Alar & Alongamento (AR)</td>
                  <td className="py-2 px-4 text-slate-400">S = b·(Cr+Ct)/2 · AR = b²/S</td>
                  <td className="py-2 pl-4 text-right">{sizing.wingAreaM2.toFixed(3)} m² · AR {sizing.aspectRatio.toFixed(2)}</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-sans text-slate-300">Relação Potência / Massa</td>
                  <td className="py-2 px-4 text-slate-400">P_inst / MTOW</td>
                  <td className="py-2 pl-4 text-right">{sizing.powerToWeightWKg.toFixed(1)} W/kg</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-sans text-slate-300">Número de Mach & Reynolds</td>
                  <td className="py-2 px-4 text-slate-400">V/a · ρ·V·CMA/μ</td>
                  <td className="py-2 pl-4 text-right">M {sizing.machNumber.toFixed(3)} · Re {Math.round(sizing.reynoldsNumber).toLocaleString('pt-BR')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
