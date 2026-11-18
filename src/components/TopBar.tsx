import React from 'react';
import { EngineeringStage } from '../types/aerospace';

interface TopBarProps {
  activeStage: EngineeringStage;
  onSelectStage: (stage: EngineeringStage) => void;
  onOpenExport: () => void;
}

const NAV_STAGES: Array<{ stage: EngineeringStage; label: string }> = [
  { stage: 1, label: '1. Requisitos' },
  { stage: 2, label: '2. Desenho 2D' },
  { stage: 3, label: '3. CAD & CFD' },
  { stage: 4, label: '4. Estruturas' },
  { stage: 5, label: '5. Construção' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeStage,
  onSelectStage,
  onOpenExport,
}) => {
  return (
    <header className="w-full border-b border-slate-800 bg-[#0B0F17] px-6 py-3.5">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectStage(1);
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded"
        >
          AeroForge Studio
        </a>

        <nav
          aria-label="Etapas de desenvolvimento aeronáutico"
          className="flex items-center gap-5 overflow-x-auto"
        >
          {NAV_STAGES.map((item) => {
            const isActive = activeStage === item.stage;
            return (
              <button
                key={item.stage}
                type="button"
                onClick={() => onSelectStage(item.stage)}
                className={`relative py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 rounded ${
                  isActive
                    ? 'text-cyan-400'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenExport}
            className="rounded-md bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 cursor-pointer"
          >
            Exportar Dossiê
          </button>
        </div>
      </div>
    </header>
  );
};
