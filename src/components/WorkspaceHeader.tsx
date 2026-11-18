import React from 'react';
import { CheckSquare, ChevronDown, ChevronUp, RotateCcw, Square } from 'lucide-react';
import { STAGE_METADATA, WORKFLOW_STEPS } from '../data/presets';
import {
  AircraftClass,
  AircraftProject,
  EngineeringStage,
  SizingResults,
  StabilityResults,
} from '../types/aerospace';

interface WorkspaceHeaderProps {
  project: AircraftProject;
  sizing: SizingResults;
  stability: StabilityResults;
  activeStage: EngineeringStage;
  guideOpen: boolean;
  onToggleGuide: () => void;
  onSelectClass: (cls: AircraftClass) => void;
  onRenameProject: (name: string) => void;
  onToggleStepComplete: (stepId: string) => void;
  onResetProject: () => void;
}

const CLASS_OPTIONS: Array<{ id: AircraftClass; label: string }> = [
  { id: 'real', label: 'Aeronave Real' },
  { id: 'rc', label: 'Controle Remoto (R/C)' },
  { id: 'uav', label: 'Sem Piloto (VANT)' },
];

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  project,
  sizing,
  stability,
  activeStage,
  guideOpen,
  onToggleGuide,
  onSelectClass,
  onRenameProject,
  onToggleStepComplete,
  onResetProject,
}) => {
  const stageMeta = STAGE_METADATA[activeStage];
  const stageSteps = WORKFLOW_STEPS.filter((s) => s.stage === activeStage);
  const completedCount = WORKFLOW_STEPS.filter((s) =>
    project.completedStepIds.includes(s.id)
  ).length;

  return (
    <section className="border-b border-slate-800 bg-[#0F141F]">
      <div className="mx-auto max-w-[1440px] px-6 py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <div
              role="group"
              aria-label="Selecionar categoria de aeronave"
              className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#0B0F17] p-1"
            >
              {CLASS_OPTIONS.map((opt) => {
                const selected = project.aircraftClass === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onSelectClass(opt.id)}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selected
                        ? 'bg-slate-800 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="project-name-input" className="sr-only">
                Nome do projeto aeronáutico
              </label>
              <input
                id="project-name-input"
                type="text"
                value={project.name}
                onChange={(e) => onRenameProject(e.target.value)}
                className="w-52 rounded border border-slate-800 bg-[#0B0F17] px-2.5 py-1.5 text-sm font-semibold text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
              <span className="hidden xl:inline text-xs text-slate-400">
                {project.subtitle}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-300">
              <span>
                MTOW <strong className="text-slate-100">{sizing.mtowKg.toFixed(1)} kg</strong>
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                Carga Alar{' '}
                <strong className="text-slate-100">{sizing.wingLoadingKgM2.toFixed(1)} kg/m²</strong>
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                Margem Estática{' '}
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
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetProject}
                title="Restaurar parâmetros originais da categoria"
                className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-600 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Resetar
              </button>

              <button
                type="button"
                onClick={onToggleGuide}
                aria-expanded={guideOpen}
                className="inline-flex items-center gap-2 rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>
                  Passo a Passo ({completedCount}/{WORKFLOW_STEPS.length})
                </span>
                {guideOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Stage Context Header & Collapsible Step-by-Step Checklist */}
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-800/80 pt-3">
          <div>
            <h1 className="text-base font-semibold text-slate-100">
              {stageMeta.fullTitle}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400 max-w-4xl">
              {stageMeta.objective}
            </p>
          </div>
          <div className="text-xs font-mono text-amber-300/90">
            Softwares de referência: {stageMeta.industryTools}
          </div>
        </div>

        {guideOpen && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-800 pt-3 md:grid-cols-3">
            {stageSteps.map((step) => {
              const checked = project.completedStepIds.includes(step.id);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onToggleStepComplete(step.id)}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors cursor-pointer ${
                    checked
                      ? 'border-emerald-500/40 bg-emerald-950/20'
                      : 'border-slate-800 bg-[#0B0F17] hover:border-slate-700'
                  }`}
                >
                  <span className="mt-0.5 shrink-0 text-cyan-400">
                    {checked ? (
                      <CheckSquare className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                      <span className="font-semibold text-cyan-300">Passo {step.stepNumber}</span>
                      <span aria-hidden="true">·</span>
                      <span>{step.softwareRef}</span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-100">
                      {step.title}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {step.actionSummary}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
