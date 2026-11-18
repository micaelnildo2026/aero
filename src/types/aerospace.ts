export type AircraftClass = 'real' | 'rc' | 'uav';

export type EngineeringStage = 1 | 2 | 3 | 4 | 5;

export type PropulsionType = 'piston' | 'electric';

export type WingPosition = 'high' | 'mid' | 'low';

export type MaterialId = 'al6061' | 'cfrp' | 'balsa_ply';

export type FinishId = 'alu_brushed' | 'carbon_weave' | 'composite_white' | 'balsa_rc';

export interface MissionRequirements {
  emptyMassKg: number;
  payloadMassKg: number;
  energyMassKg: number; // fuel or battery mass
  propulsion: PropulsionType;
  cruiseSpeedMs: number;
  stallSpeedMs: number;
  runwayLimitM: number;
  targetRangeKm: number;
  loadFactorMax: number;
  clMax: number;
  ldRatio: number;
  propEfficiency: number;
  specificFuelConsumption?: number; // kg/(kW·h) for piston
  batterySpecificEnergyWhKg?: number; // Wh/kg for electric
  installedPowerKw: number;
}

export interface AirfoilParams {
  nacaCode: string; // 4-digit e.g. "2412"
  maxCamberPct: number; // 0-9% (first digit)
  camberPosTenths: number; // 1-9 (second digit * 10%)
  thicknessPct: number; // 6-24% (last two digits)
  angleOfAttackDeg: number;
}

export interface Geometry2D3D {
  wingspanM: number;
  rootChordM: number;
  tipChordM: number;
  sweepDeg: number;
  dihedralDeg: number;
  wingPosition: WingPosition;
  fuselageLengthM: number;
  fuselageDiameterM: number;
  tailArmM: number;
  hTailAreaM2: number;
  vTailAreaM2: number;
  cgPercentMac: number; // e.g., 26% MAC
  propDiameterM: number;
  landingGearType: 'tricycle' | 'taildragger' | 'skid';
  wingletsEnabled?: boolean;
  wingletHeightPct?: number; // % of half-span (e.g. 6-15%)
  flapDeflectionDeg?: number; // 0 to 30 deg
}

export type CadPartKey =
  | 'fuselage'
  | 'wings'
  | 'surfaces'
  | 'tail'
  | 'propulsion'
  | 'gear'
  | 'winglets';

export type CfdViewMode = 'solid' | 'cp_pressure' | 'wireframe';

export interface CfdConfig {
  velocityMs: number;
  aoaDeg: number;
  sideslipDeg: number;
  altitudeM: number;
  streamlineCount: number;
  showTunnelDomain: boolean;
  showForceVectors: boolean;
  viewMode: CfdViewMode;
}

export interface StructuralParams {
  materialId: MaterialId;
  ribCountPerSide: number;
  sparWidthMm: number;
  sparHeightMm: number;
  sparWallMm: number;
  skinThicknessMm: number;
  designLoadFactorG: number;
  safetyFactorTarget: number;
}

export interface CamParams {
  toolDiameterMm: number;
  feedRateMmMin: number;
  spindleRpm: number;
  cutDepthMm: number;
  tabCount: number;
  sheetMaterialName: string;
}

export interface AvionicsItem {
  id: string;
  name: string;
  category: 'power' | 'compute' | 'actuator' | 'sensor' | 'rf';
  voltageV: number;
  currentA: number;
  massG: number;
  bus: string;
  wireAwg: number;
  enabled: boolean;
}

export interface WorkflowStepItem {
  id: string;
  stage: EngineeringStage;
  stepNumber: string;
  title: string;
  softwareRef: string;
  actionSummary: string;
}

export interface AircraftProject {
  id: string;
  name: string;
  aircraftClass: AircraftClass;
  subtitle: string;
  requirements: MissionRequirements;
  airfoil: AirfoilParams;
  geometry: Geometry2D3D;
  structures: StructuralParams;
  cam: CamParams;
  avionics: AvionicsItem[];
  finish: FinishId;
  completedStepIds: string[];
}

export interface SizingResults {
  mtowKg: number;
  weightN: number;
  wingAreaM2: number;
  aspectRatio: number;
  wingLoadingKgM2: number;
  powerToWeightWKg: number;
  stallSpeedMs: number;
  cruiseSpeedMs: number;
  takeoffDistanceM: number;
  estimatedRangeKm: number;
  enduranceHours: number;
  reynoldsNumber: number;
  machNumber: number;
  requiredPowerKw: number;
  powerMarginPct: number;
  runwayCompliant: boolean;
  rangeCompliant: boolean;
}

export interface PolarPoint {
  alphaDeg: number;
  cl: number;
  cd: number;
  cm: number;
  ld: number;
}

export interface StabilityResults {
  macM: number;
  xAcPercentMac: number;
  hTailVolumeCoeff: number;
  vTailVolumeCoeff: number;
  neutralPointPercentMac: number;
  staticMarginPct: number;
  status: 'Estável' | 'Marginal' | 'Instável';
}

export interface FeaStation {
  spanFraction: number; // 0 to 1
  yMeters: number;
  liftDensityNM: number;
  shearN: number;
  bendingMomentNm: number;
  vonMisesMpa: number;
  deflectionMm: number;
}

export interface FeaSummary {
  materialName: string;
  yieldStrengthMpa: number;
  elasticModulusGpa: number;
  densityKgM3: number;
  maxShearN: number;
  maxBendingMomentNm: number;
  maxVonMisesMpa: number;
  tipDeflectionMm: number;
  tipDeflectionPctSpan: number;
  safetyFactorActual: number;
  sparMassKg: number;
  approved: boolean;
  stations: FeaStation[];
}

export interface FlightSimTelemetry {
  airspeedMs: number;
  altitudeM: number;
  vsiMs: number;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  aoaDeg: number;
  gForce: number;
  throttlePct: number;
  autopilotEnabled: boolean;
  targetAltitudeM: number;
  distanceFlownM: number;
}
