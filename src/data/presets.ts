import { AircraftClass, AircraftProject, EngineeringStage, WorkflowStepItem } from '../types/aerospace';

export interface StageMetadata {
  stage: EngineeringStage;
  shortTitle: string;
  fullTitle: string;
  industryTools: string;
  objective: string;
  deliverable: string;
}

export const STAGE_METADATA: Record<EngineeringStage, StageMetadata> = {
  1: {
    stage: 1,
    shortTitle: '1. Requisitos',
    fullTitle: 'Etapa 1 · Requisitos e Dimensionamento Inicial',
    industryTools: 'Microsoft Excel · Scripts Python (NumPy/SciPy)',
    objective:
      'Estimar peso máximo de decolagem (MTOW), carga paga, potência instalada, carga alar, alcance e comprimento de pista antes de iniciar qualquer desenho.',
    deliverable: 'Planilha de Missão & Diagrama de Restrições',
  },
  2: {
    stage: 2,
    shortTitle: '2. Desenho 2D',
    fullTitle: 'Etapa 2 · Desenho 2D, Conceito e Estabilidade',
    industryTools: 'AutoCAD · OpenVSP · XFOIL · XFLR5',
    objective:
      'Traçar as três vistas ortográficas iniciais, definir geometria paramétrica da asa/empenagem, selecionar o perfil NACA e validar a margem estática de estabilidade.',
    deliverable: 'Vistas 2D, Polares Aerodinâmicas & Margem Estática',
  },
  3: {
    stage: 3,
    shortTitle: '3. CAD & CFD',
    fullTitle: 'Etapa 3 · Modelagem CAD 3D e Túnel de Vento Virtual',
    industryTools: 'Autodesk Fusion · Onshape · SolidWorks · CATIA · SimScale',
    objective:
      'Consolidar a montagem paramétrica 3D (fuselagem, asas, empenagem, trem de pouso e propulsão) e simular o escoamento aerodinâmico e forças em túnel de vento virtual.',
    deliverable: 'Modelo 3D Paramétrico & Análise CFD',
  },
  4: {
    stage: 4,
    shortTitle: '4. Estruturas',
    fullTitle: 'Etapa 4 · Detalhamento Estrutural FEA e Pranchas 2D',
    industryTools: 'Ansys · CalculiX · Exportação CAD 2D (DXF/SVG)',
    objective:
      'Aplicar elementos finitos na longarina e nervuras sob carga G limite para garantir fator de segurança e exportar as pranchas técnicas em 2D para fabricação.',
    deliverable: 'Relatório FEA & Pranchas Técnicas DXF/SVG',
  },
  5: {
    stage: 5,
    shortTitle: '5. Construção',
    fullTitle: 'Etapa 5 · Manufatura CAM, Aviônica KiCad e Simulação Gazebo',
    industryTools: 'Módulos CAM/CNC · KiCad · Simulador Gazebo / PX4 SITL',
    objective:
      'Gerar percursos CNC (G-Code) para corte de nervuras, dimensionar chicotes e placas eletrônicas (KiCad) e validar a dinâmica de voo e controle antes do ensaio real.',
    deliverable: 'G-Code CNC, Diagrama KiCad & Teste de Voo Gazebo',
  },
};

export const WORKFLOW_STEPS: WorkflowStepItem[] = [
  // Stage 1
  {
    id: 's1-1',
    stage: 1,
    stepNumber: '1.1',
    title: 'Definir Classe, Carga Paga e Massa Vazia',
    softwareRef: 'Excel / Python',
    actionSummary: 'Ajuste massa vazia, carga paga e energia (combustível ou bateria LiPo) na planilha para fechar o MTOW.',
  },
  {
    id: 's1-2',
    stage: 1,
    stepNumber: '1.2',
    title: 'Calibrar Metas de Velocidade, Pista e Alcance',
    softwareRef: 'Excel / Python',
    actionSummary: 'Defina velocidade de cruzeiro, estol e pista máxima; verifique conformidade nos cartões de desempenho.',
  },
  {
    id: 's1-3',
    stage: 1,
    stepNumber: '1.3',
    title: 'Executar Estudo Paramétrico (Trade Study)',
    softwareRef: 'Script Python',
    actionSummary: 'Rode a varredura de Carga Alar vs. Razão Potência/Peso para posicionar o ponto de projeto na zona viável.',
  },
  // Stage 2
  {
    id: 's2-1',
    stage: 2,
    stepNumber: '2.1',
    title: 'Selecionar Perfil Aerodinâmico NACA',
    softwareRef: 'XFOIL / XFLR5',
    actionSummary: 'Configure arqueamento, posição de arqueamento e espessura; analise CL máx e razão CL/CD nas polares.',
  },
  {
    id: 's2-2',
    stage: 2,
    stepNumber: '2.2',
    title: 'Traçar Vistas Ortográficas e Geometria Paramétrica',
    softwareRef: 'AutoCAD / OpenVSP',
    actionSummary: 'Ajuste envergadura, cordas raiz/ponta, enflechamento, diedro e comprimento de fuselagem na prancheta 2D.',
  },
  {
    id: 's2-3',
    stage: 2,
    stepNumber: '2.3',
    title: 'Validar Estabilidade Longitudinal (Margem Estática)',
    softwareRef: 'XFLR5',
    actionSummary: 'Posicione o CG e as áreas das empenagens para manter Margem Estática entre 8% e 20% da CMA.',
  },
  // Stage 3
  {
    id: 's3-1',
    stage: 3,
    stepNumber: '3.1',
    title: 'Inspecionar Montagem CAD 3D e Vista Explodida',
    softwareRef: 'Fusion / SolidWorks / CATIA',
    actionSummary: 'Valide encaixe entre fuselagem, asas, empenagem, grupo motopropulsor e trem de pouso no viewport 3D.',
  },
  {
    id: 's3-2',
    stage: 3,
    stepNumber: '3.2',
    title: 'Configurar Túnel de Vento Virtual e Ângulo de Ataque',
    softwareRef: 'SimScale CFD',
    actionSummary: 'Ative as linhas de corrente 3D, ajuste o ângulo de ataque α e inspecione vórtices de ponta de asa e L/D.',
  },
  // Stage 4
  {
    id: 's4-1',
    stage: 4,
    stepNumber: '4.1',
    title: 'Executar Análise de Elementos Finitos (FEA) na Asa',
    softwareRef: 'Ansys / CalculiX',
    actionSummary: 'Selecione o material estrutural, aplique fator de carga G limite e confirme Fator de Segurança ≥ 1.5.',
  },
  {
    id: 's4-2',
    stage: 4,
    stepNumber: '4.2',
    title: 'Exportar Pranchas Técnicas 2D para Fabricação',
    softwareRef: 'AutoCAD / Fusion 2D',
    actionSummary: 'Gere e baixe as pranchas cotadas (DXF/SVG) com lista de corte de nervuras e cavernas.',
  },
  // Stage 5
  {
    id: 's5-1',
    stage: 5,
    stepNumber: '5.1',
    title: 'Gerar Percurso CAM e G-Code para Usinagem CNC',
    softwareRef: 'Módulo CAM / CNC',
    actionSummary: 'Configure diâmetro da fresa, avanço e abas de retenção; gere e baixe o arquivo .gcode das nervuras.',
  },
  {
    id: 's5-2',
    stage: 5,
    stepNumber: '5.2',
    title: 'Dimensionar Aviônica, Placas e Chicote Elétrico',
    softwareRef: 'KiCad',
    actionSummary: 'Revise o esquemático de potência, bitolas AWG e corrente de pico dos servos, ESC e controladora.',
  },
  {
    id: 's5-3',
    stage: 5,
    stepNumber: '5.3',
    title: 'Validar Dinâmica de Voo e Controle no Simulador',
    softwareRef: 'Gazebo / PX4 SITL',
    actionSummary: 'Decole e teste arfagem, rolagem, guinada e piloto automático em tempo real antes do voo real.',
  },
];

export const AIRCRAFT_PRESETS: Record<AircraftClass, AircraftProject> = {
  real: {
    id: 'preset-real-lsa',
    name: 'AeroCruiser LSA-2',
    aircraftClass: 'real',
    subtitle: 'Aeronave Real Tripulada · Categoria LSA Asa Alta (2 Lugares)',
    requirements: {
      emptyMassKg: 345,
      payloadMassKg: 185,
      energyMassKg: 70,
      propulsion: 'piston',
      cruiseSpeedMs: 56, // ~201 km/h
      stallSpeedMs: 22, // ~79 km/h
      runwayLimitM: 350,
      targetRangeKm: 900,
      loadFactorMax: 4.0,
      clMax: 1.55,
      ldRatio: 13.5,
      propEfficiency: 0.80,
      specificFuelConsumption: 0.28,
      installedPowerKw: 74.5, // ~100 hp Rotax 912
    },
    airfoil: {
      nacaCode: '2412',
      maxCamberPct: 2,
      camberPosTenths: 4,
      thicknessPct: 12,
      angleOfAttackDeg: 4,
    },
    geometry: {
      wingspanM: 9.6,
      rootChordM: 1.38,
      tipChordM: 1.05,
      sweepDeg: 2.0,
      dihedralDeg: 2.5,
      wingPosition: 'high',
      fuselageLengthM: 6.45,
      fuselageDiameterM: 1.12,
      tailArmM: 3.4,
      hTailAreaM2: 1.95,
      vTailAreaM2: 1.15,
      cgPercentMac: 26,
      propDiameterM: 1.72,
      landingGearType: 'tricycle',
      wingletsEnabled: false,
      wingletHeightPct: 8,
      flapDeflectionDeg: 0,
    },
    structures: {
      materialId: 'al6061',
      ribCountPerSide: 14,
      sparWidthMm: 96,
      sparHeightMm: 145,
      sparWallMm: 8.5,
      skinThicknessMm: 0.8,
      designLoadFactorG: 4.0,
      safetyFactorTarget: 1.5,
    },
    cam: {
      toolDiameterMm: 6.0,
      feedRateMmMin: 1200,
      spindleRpm: 16000,
      cutDepthMm: 2.0,
      tabCount: 4,
      sheetMaterialName: 'Alumínio 6061-T6 (Chapa 1.2 mm)',
    },
    avionics: [
      { id: 'av-1', name: 'Bateria LiFePO4 12V 20Ah + Alternador 40A', category: 'power', voltageV: 12.8, currentA: 2.0, massG: 3200, bus: 'BUS-PRI', wireAwg: 8, enabled: true },
      { id: 'av-2', name: 'EFIS Glass Cockpit + Computador de Dados do Ar', category: 'compute', voltageV: 12.0, currentA: 3.8, massG: 1450, bus: 'CAN-AER', wireAwg: 18, enabled: true },
      { id: 'av-3', name: 'Transponder Mode-S + Rádio VHF Aeronáutico', category: 'rf', voltageV: 12.0, currentA: 4.5, massG: 1100, bus: 'RF-COM', wireAwg: 16, enabled: true },
      { id: 'av-4', name: 'Tubo de Pitot Aquecido + Sensor AoA + AHRS', category: 'sensor', voltageV: 12.0, currentA: 6.2, massG: 420, bus: 'I2C/CAN', wireAwg: 16, enabled: true },
      { id: 'av-5', name: 'Atuadores Trim Elétrico + Flapes 24A Pico', category: 'actuator', voltageV: 12.0, currentA: 8.5, massG: 980, bus: 'PWM-ACT', wireAwg: 14, enabled: true },
    ],
    finish: 'alu_brushed',
    completedStepIds: ['s1-1'],
  },

  rc: {
    id: 'preset-rc-sport',
    name: 'Falcon RC-1600',
    aircraftClass: 'rc',
    subtitle: 'Aeronave de Controle Remoto (R/C) · Treinador/Sport Asa Média',
    requirements: {
      emptyMassKg: 1.45,
      payloadMassKg: 0.35,
      energyMassKg: 0.55, // 4S 5000mAh LiPo
      propulsion: 'electric',
      cruiseSpeedMs: 18, // ~65 km/h
      stallSpeedMs: 9.2,
      runwayLimitM: 35,
      targetRangeKm: 12,
      loadFactorMax: 6.0,
      clMax: 1.38,
      ldRatio: 11.2,
      propEfficiency: 0.74,
      batterySpecificEnergyWhKg: 175,
      installedPowerKw: 0.68, // ~680W Brushless
    },
    airfoil: {
      nacaCode: '2414',
      maxCamberPct: 2,
      camberPosTenths: 4,
      thicknessPct: 14,
      angleOfAttackDeg: 3,
    },
    geometry: {
      wingspanM: 1.6,
      rootChordM: 0.28,
      tipChordM: 0.21,
      sweepDeg: 4.0,
      dihedralDeg: 3.5,
      wingPosition: 'mid',
      fuselageLengthM: 1.18,
      fuselageDiameterM: 0.14,
      tailArmM: 0.62,
      hTailAreaM2: 0.072,
      vTailAreaM2: 0.038,
      cgPercentMac: 27,
      propDiameterM: 0.30, // 12x6 prop
      landingGearType: 'taildragger',
      wingletsEnabled: false,
      wingletHeightPct: 8,
      flapDeflectionDeg: 0,
    },
    structures: {
      materialId: 'balsa_ply',
      ribCountPerSide: 11,
      sparWidthMm: 14,
      sparHeightMm: 26,
      sparWallMm: 4.0,
      skinThicknessMm: 1.5,
      designLoadFactorG: 6.0,
      safetyFactorTarget: 1.5,
    },
    cam: {
      toolDiameterMm: 1.5,
      feedRateMmMin: 900,
      spindleRpm: 18000,
      cutDepthMm: 3.0,
      tabCount: 3,
      sheetMaterialName: 'Compensado Aeronáutico / Balsa 3 mm',
    },
    avionics: [
      { id: 'rc-1', name: 'Bateria LiPo 4S 14.8V 5000mAh 50C', category: 'power', voltageV: 14.8, currentA: 42.0, massG: 520, bus: 'XT60-PWR', wireAwg: 10, enabled: true },
      { id: 'rc-2', name: 'ESC Brushless 60A com BEC 5V/5A', category: 'power', voltageV: 14.8, currentA: 40.0, massG: 64, bus: 'PWM-ESC', wireAwg: 12, enabled: true },
      { id: 'rc-3', name: 'Receptor R/C 2.4GHz 8 Canais + Giroscópio 3-Eixos', category: 'rf', voltageV: 5.0, currentA: 0.35, massG: 22, bus: 'SBUS', wireAwg: 22, enabled: true },
      { id: 'rc-4', name: '4x Servos Digitais Metal Gear (Ail/Elev/Rud)', category: 'actuator', voltageV: 6.0, currentA: 4.8, massG: 112, bus: 'PWM-50Hz', wireAwg: 22, enabled: true },
      { id: 'rc-5', name: 'Sensor de Tensão / Variômetro Telemetria', category: 'sensor', voltageV: 5.0, currentA: 0.12, massG: 14, bus: 'SPORT', wireAwg: 24, enabled: true },
    ],
    finish: 'balsa_rc',
    completedStepIds: ['s1-1'],
  },

  uav: {
    id: 'preset-uav-bvlos',
    name: 'Vanguard UAV-X4',
    aircraftClass: 'uav',
    subtitle: 'Aeronave Sem Piloto (VANT/UAV) · Mapeamento BVLOS Autônomo',
    requirements: {
      emptyMassKg: 7.4,
      payloadMassKg: 3.2, // LiDAR + Multiespectral
      energyMassKg: 4.2, // Li-Ion high density pack
      propulsion: 'electric',
      cruiseSpeedMs: 24, // ~86 km/h
      stallSpeedMs: 12.5,
      runwayLimitM: 60,
      targetRangeKm: 95,
      loadFactorMax: 4.5,
      clMax: 1.52,
      ldRatio: 16.5,
      propEfficiency: 0.82,
      batterySpecificEnergyWhKg: 245,
      installedPowerKw: 1.85,
    },
    airfoil: {
      nacaCode: '4412',
      maxCamberPct: 4,
      camberPosTenths: 4,
      thicknessPct: 12,
      angleOfAttackDeg: 3.5,
    },
    geometry: {
      wingspanM: 3.2,
      rootChordM: 0.36,
      tipChordM: 0.22,
      sweepDeg: 5.5,
      dihedralDeg: 3.0,
      wingPosition: 'high',
      fuselageLengthM: 1.85,
      fuselageDiameterM: 0.24,
      tailArmM: 0.96,
      hTailAreaM2: 0.165,
      vTailAreaM2: 0.088,
      cgPercentMac: 25,
      propDiameterM: 0.48,
      landingGearType: 'skid',
      wingletsEnabled: true,
      wingletHeightPct: 9,
      flapDeflectionDeg: 0,
    },
    structures: {
      materialId: 'cfrp',
      ribCountPerSide: 16,
      sparWidthMm: 18,
      sparHeightMm: 28,
      sparWallMm: 2.2,
      skinThicknessMm: 0.6,
      designLoadFactorG: 4.5,
      safetyFactorTarget: 1.6,
    },
    cam: {
      toolDiameterMm: 2.0,
      feedRateMmMin: 1100,
      spindleRpm: 20000,
      cutDepthMm: 1.5,
      tabCount: 4,
      sheetMaterialName: 'Fibra de Carbono CFRP / Núcleo Airex 2 mm',
    },
    avionics: [
      { id: 'uav-1', name: 'Pack Li-Ion 6S6P 22.2V 21Ah + Power Module', category: 'power', voltageV: 22.2, currentA: 34.0, massG: 4200, bus: 'XT90-BUS', wireAwg: 10, enabled: true },
      { id: 'uav-2', name: 'Autopilot Pixhawk 6X Redundante (STM32H7)', category: 'compute', voltageV: 5.2, currentA: 1.4, massG: 86, bus: 'UAVCAN', wireAwg: 22, enabled: true },
      { id: 'uav-3', name: 'GPS RTK Dupla Antena + Pitot Digital + LiDAR', category: 'sensor', voltageV: 5.0, currentA: 1.8, massG: 290, bus: 'CAN/UART', wireAwg: 24, enabled: true },
      { id: 'uav-4', name: 'Rádio Telemetria 900MHz + Link Vídeo HD BVLOS', category: 'rf', voltageV: 12.0, currentA: 2.2, massG: 240, bus: 'ETH/UART', wireAwg: 20, enabled: true },
      { id: 'uav-5', name: '4x Servos High-Torque CAN + ESC 80A FOC', category: 'actuator', voltageV: 22.2, currentA: 32.0, massG: 480, bus: 'DroneCAN', wireAwg: 12, enabled: true },
    ],
    finish: 'carbon_weave',
    completedStepIds: ['s1-1'],
  },
};
