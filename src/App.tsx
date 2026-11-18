/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useMemo, useState } from 'react';
import { ExportDossierModal } from './components/ExportDossierModal';
import { TopBar } from './components/TopBar';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { Stage1Requirements } from './components/stages/Stage1Requirements';
import { Stage2Design2D } from './components/stages/Stage2Design2D';
import { Stage3CadCfd3D } from './components/stages/Stage3CadCfd3D';
import { Stage4Structures } from './components/stages/Stage4Structures';
import { Stage5BuildTest } from './components/stages/Stage5BuildTest';
import { AIRCRAFT_PRESETS } from './data/presets';
import { computeSizing, computeStability } from './engine/aerospace';
import {
  AircraftClass,
  AircraftProject,
  AirfoilParams,
  CamParams,
  EngineeringStage,
  FinishId,
  Geometry2D3D,
  MissionRequirements,
  StructuralParams,
} from './types/aerospace';

const STORAGE_KEY = 'aeroforge_studio_project_v1';

function loadInitialProject(): AircraftProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AircraftProject;
      if (parsed && parsed.requirements && parsed.geometry && parsed.airfoil) {
        return parsed;
      }
    }
  } catch {
    // fallback to default preset
  }
  return structuredClone(AIRCRAFT_PRESETS.real);
}

export default function App() {
  const [project, setProject] = useState<AircraftProject>(loadInitialProject);
  const [activeStage, setActiveStage] = useState<EngineeringStage>(1);
  const [guideOpen, setGuideOpen] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      // ignore storage quota errors
    }
  }, [project]);

  const sizing = useMemo(
    () => computeSizing(project.requirements, project.geometry),
    [project.requirements, project.geometry]
  );

  const stability = useMemo(
    () => computeStability(project.geometry),
    [project.geometry]
  );

  const handleSelectClass = (cls: AircraftClass) => {
    setProject(structuredClone(AIRCRAFT_PRESETS[cls]));
  };

  const handleResetProject = () => {
    setProject(structuredClone(AIRCRAFT_PRESETS[project.aircraftClass]));
  };

  const handleRenameProject = (name: string) => {
    setProject((prev) => ({ ...prev, name }));
  };

  const handleToggleStepComplete = (stepId: string) => {
    setProject((prev) => {
      const exists = prev.completedStepIds.includes(stepId);
      return {
        ...prev,
        completedStepIds: exists
          ? prev.completedStepIds.filter((id) => id !== stepId)
          : [...prev.completedStepIds, stepId],
      };
    });
  };

  const handleUpdateRequirements = (patch: Partial<MissionRequirements>) => {
    setProject((prev) => ({
      ...prev,
      requirements: { ...prev.requirements, ...patch },
    }));
  };

  const handleUpdateAirfoil = (patch: Partial<AirfoilParams>) => {
    setProject((prev) => ({
      ...prev,
      airfoil: { ...prev.airfoil, ...patch },
    }));
  };

  const handleUpdateGeometry = (patch: Partial<Geometry2D3D>) => {
    setProject((prev) => ({
      ...prev,
      geometry: { ...prev.geometry, ...patch },
    }));
  };

  const handleUpdateStructures = (patch: Partial<StructuralParams>) => {
    setProject((prev) => ({
      ...prev,
      structures: { ...prev.structures, ...patch },
    }));
  };

  const handleUpdateCam = (patch: Partial<CamParams>) => {
    setProject((prev) => ({
      ...prev,
      cam: { ...prev.cam, ...patch },
    }));
  };

  const handleToggleAvionicsItem = (itemId: string) => {
    setProject((prev) => ({
      ...prev,
      avionics: prev.avionics.map((it) =>
        it.id === itemId ? { ...it, enabled: !it.enabled } : it
      ),
    }));
  };

  const handleUpdateFinish = (finish: FinishId) => {
    setProject((prev) => ({ ...prev, finish }));
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      <TopBar
        activeStage={activeStage}
        onSelectStage={setActiveStage}
        onOpenExport={() => setExportOpen(true)}
      />

      <WorkspaceHeader
        project={project}
        sizing={sizing}
        stability={stability}
        activeStage={activeStage}
        guideOpen={guideOpen}
        onToggleGuide={() => setGuideOpen((o) => !o)}
        onSelectClass={handleSelectClass}
        onRenameProject={handleRenameProject}
        onToggleStepComplete={handleToggleStepComplete}
        onResetProject={handleResetProject}
      />

      <main className="flex-1">
        {activeStage === 1 && (
          <Stage1Requirements
            project={project}
            sizing={sizing}
            onUpdateRequirements={handleUpdateRequirements}
            onAdvanceStage={() => setActiveStage(2)}
          />
        )}

        {activeStage === 2 && (
          <Stage2Design2D
            project={project}
            sizing={sizing}
            stability={stability}
            onUpdateAirfoil={handleUpdateAirfoil}
            onUpdateGeometry={handleUpdateGeometry}
            onAdvanceStage={() => setActiveStage(3)}
          />
        )}

        {activeStage === 3 && (
          <Stage3CadCfd3D
            project={project}
            sizing={sizing}
            onUpdateFinish={handleUpdateFinish}
            onUpdateGeometry={handleUpdateGeometry}
            onUpdateAirfoil={handleUpdateAirfoil}
            onUpdateAoA={(aoaDeg) => handleUpdateAirfoil({ angleOfAttackDeg: aoaDeg })}
            onAdvanceStage={() => setActiveStage(4)}
          />
        )}

        {activeStage === 4 && (
          <Stage4Structures
            project={project}
            onUpdateStructures={handleUpdateStructures}
            onAdvanceStage={() => setActiveStage(5)}
          />
        )}

        {activeStage === 5 && (
          <Stage5BuildTest
            project={project}
            sizing={sizing}
            stability={stability}
            onUpdateCam={handleUpdateCam}
            onToggleAvionicsItem={handleToggleAvionicsItem}
          />
        )}
      </main>

      <ExportDossierModal
        open={exportOpen}
        project={project}
        sizing={sizing}
        stability={stability}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}
