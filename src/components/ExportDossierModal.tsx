import React, { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import {
  computeAvionicsBudget,
  computeFeaWing,
  generateCamGCode,
  generateDxf2DBlueprint,
} from '../engine/aerospace';
import {
  AircraftProject,
  SizingResults,
  StabilityResults,
} from '../types/aerospace';
import { WORKFLOW_STEPS } from '../data/presets';

interface ExportDossierModalProps {
  open: boolean;
  project: AircraftProject;
  sizing: SizingResults;
  stability: StabilityResults;
  onClose: () => void;
}

export const ExportDossierModal: React.FC<ExportDossierModalProps> = ({
  open,
  project,
  sizing,
  stability,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const fea = computeFeaWing(project);
  const avionics = computeAvionicsBudget(project.avionics);
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/gi, '-');

  const downloadFile = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    const md = [
      `# Dossiê Técnico de Engenharia — ${project.name}`,
      `Categoria: ${project.subtitle}`,
      ``,
      `## 1. Requisitos e Dimensionamento (Excel / Python)`,
      `- MTOW: ${sizing.mtowKg.toFixed(2)} kg (${sizing.weightN.toFixed(0)} N)`,
      `- Área Alar: ${sizing.wingAreaM2.toFixed(3)} m² | Envergadura: ${project.geometry.wingspanM.toFixed(2)} m | AR: ${sizing.aspectRatio.toFixed(2)}`,
      `- Carga Alar: ${sizing.wingLoadingKgM2.toFixed(1)} kg/m²`,
      `- Velocidade de Cruzeiro: ${sizing.cruiseSpeedMs.toFixed(1)} m/s | Estol: ${sizing.stallSpeedMs.toFixed(1)} m/s`,
      `- Corrida de Decolagem: ${sizing.takeoffDistanceM.toFixed(0)} m | Alcance Estimado: ${sizing.estimatedRangeKm.toFixed(0)} km`,
      ``,
      `## 2. Desenho 2D, Aerofólio e Estabilidade (AutoCAD / OpenVSP / XFOIL / XFLR5)`,
      `- Perfil Selecionado: NACA ${project.airfoil.nacaCode}`,
      `- Ponto Neutro: ${stability.neutralPointPercentMac.toFixed(1)}% CMA | CG: ${project.geometry.cgPercentMac}% CMA`,
      `- Margem Estática: ${stability.staticMarginPct.toFixed(1)}% (${stability.status})`,
      ``,
      `## 3. Modelagem CAD 3D e Túnel de Vento (Fusion / SolidWorks / CATIA / SimScale)`,
      `- Acabamento: ${project.finish} | Ângulo de Ataque de Projeto: ${project.airfoil.angleOfAttackDeg}°`,
      ``,
      `## 4. Detalhamento Estrutural FEA (Ansys / CalculiX)`,
      `- Material: ${fea.materialName}`,
      `- Tensão Máxima Von Mises (+${project.structures.designLoadFactorG}G): ${fea.maxVonMisesMpa.toFixed(1)} MPa`,
      `- Fator de Segurança Real: ${fea.safetyFactorActual.toFixed(2)}× (${fea.approved ? 'APROVADO' : 'REPROVADO'})`,
      `- Deflexão na Ponta da Asa: ${fea.tipDeflectionMm.toFixed(1)} mm`,
      ``,
      `## 5. Construção, Aviônica e Simulação (CAM / KiCad / Gazebo)`,
      `- Nervuras a usinar: ${project.structures.ribCountPerSide * 2} un (Fresa ${project.cam.toolDiameterMm} mm)`,
      `- Orçamento Elétrico: ${avionics.totalCurrentA} A | ${avionics.totalPowerW} W | Bitola Principal AWG ${avionics.recommendedMainAwg}`,
      ``,
      `## Checklist Concluído (${project.completedStepIds.length}/${WORKFLOW_STEPS.length})`,
      ...WORKFLOW_STEPS.map(
        (s) =>
          `- [${project.completedStepIds.includes(s.id) ? 'x' : ' '}] Passo ${s.stepNumber}: ${s.title} (${s.softwareRef})`
      ),
    ].join('\n');
    downloadFile(md, `${slug}-dossie-engenharia.md`, 'text/markdown;charset=utf-8;');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-xl rounded-md border border-slate-700 bg-[#111827] p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 id="export-modal-title" className="text-base font-semibold text-slate-100">
              Exportar Dossiê Completo de Engenharia
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {project.name} · {project.completedStepIds.length} de {WORKFLOW_STEPS.length} passos concluídos
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de exportação"
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
          <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
            <div className="text-slate-400">MTOW / Carga Alar</div>
            <div className="mt-1 text-slate-100">
              {sizing.mtowKg.toFixed(2)} kg · {sizing.wingLoadingKgM2.toFixed(1)} kg/m²
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
            <div className="text-slate-400">Perfil / Estabilidade</div>
            <div className="mt-1 text-slate-100">
              NACA {project.airfoil.nacaCode} · SM {stability.staticMarginPct.toFixed(1)}%
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
            <div className="text-slate-400">FEA Estrutural</div>
            <div className="mt-1 text-slate-100">
              FS {fea.safetyFactorActual.toFixed(2)}× · {fea.approved ? 'Aprovado' : 'Reforçar'}
            </div>
          </div>
          <div className="rounded border border-slate-800 bg-[#0B0F17] p-3">
            <div className="text-slate-400">Aviônica KiCad</div>
            <div className="mt-1 text-slate-100">
              {avionics.totalCurrentA} A · AWG {avionics.recommendedMainAwg}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Relatório Técnico (.md)
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                generateDxf2DBlueprint(project),
                `${slug}-prancha-2d.dxf`,
                'application/dxf;charset=utf-8;'
              )
            }
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-[#0B0F17] px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Desenho CAD 2D (.dxf)
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                generateCamGCode(project),
                `${slug}-nervuras-cnc.gcode`,
                'text/plain;charset=utf-8;'
              )
            }
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-[#0B0F17] px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Percurso CAM CNC (.gcode)
          </button>
          <button
            type="button"
            onClick={() =>
              downloadFile(
                JSON.stringify(project, null, 2),
                `${slug}-projeto.json`,
                'application/json;charset=utf-8;'
              )
            }
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-[#0B0F17] px-4 py-2.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Dados do Projeto (.json)
          </button>
        </div>
      </div>
    </div>
  );
};
