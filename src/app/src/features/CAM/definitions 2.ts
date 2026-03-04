import { SPINDLE } from '../../lib/definitions/gcode_virtualization';

export type CAMFileType = 'SVG' | 'DXF' | 'STL' | 'STEP' | 'IMAGE';

export interface CAMTool {
    id: string;
    name: string;
    type: 'Endmill' | 'Ballnose' | 'V-Bit' | 'D-Bit' | 'Laser';
    metricDiameter: number;
    imperialDiameter: number;
    flutes: number;
    stepover: number; // percentage
    stepdown: number; // mm/inch
    feedrate: number;
    plungeRate: number;
    spindleRPM: number;
    toolLength: number;
    angle?: number; // For V-Bits and D-Bits
}

export interface CAMSetup {
    id: string;
    name: string;
    orientation: 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back';
}

export interface CAMPathingOption {
    id: string;
    featureId: string; // ID of the feature in the design
    type: 'inside' | 'outside' | 'pocket' | 'on-line' | '3d-raster' | 'v-carve' | 'v-carve-inlay';
    depth: number;
    toolId: string;
    helicalBoring?: boolean;
    tabs?: {
        enabled: boolean;
        count: number;
        width: number;
        height: number;
    };
    // 2.5D Advanced Options
    vCarveFlatDepth?: number;
    vCarveInlay?: {
        mode: 'female-pocket' | 'male-plug';
        startDepth: number;
    };
    leadIn?: {
        type: 'none' | 'linear' | 'arc' | 'helical';
        distance: number;
        angle?: number;
    };
    dogbones?: {
        enabled: boolean;
        type: 'dogbone' | 't-bone';
        toolDiameterOffset?: number;
    };
    // 3D Specific Options
    threeDRoughing?: {
        enabled: boolean;
        toolId: string;
        stepdown: number;
        stockToLeave: number;
    };
    threeDRestMachining?: {
        enabled: boolean;
        previousToolId: string;
    };
    threeDTabs?: {
        enabled: boolean;
        count: number;
        width: number;
        height: number;
    };
    threeDBoundaryId?: string;
    threeDStrategy?: 'raster-x' | 'raster-y' | 'cross-hatch' | 'waterline';
    threeDAdaptiveStepover?: boolean;
}

export interface CAMSettings {
    units: 'mm' | 'inch';
    zOrigin: 'top' | 'bed';
    millingSide: 'top' | 'bottom';
    scalingType: 'percentage' | 'dimensions';
    rasterResolution: 'adaptive' | 'standard' | 'high' | 'custom';
    customResolutionValue: number;
    optimizePath: boolean;
    scalePercentage: number;
    targetWidth: number;
    targetHeight: number;
    safeZ: number;
    spindle: SPINDLE;
    mist: boolean;
    flood: boolean;
    stockWidth: number;
    stockLength: number;
    stockThickness: number;
    nestingX: number;
    nestingY: number;
    nestingSpacing: number;
    nestingType?: 'grid' | 'true-shape';
    startGcode: string;
    endGcode: string;
    // Multi-Setup
    setups?: CAMSetup[];
    activeSetupId?: string;
    // Workflow Options
    autoFeatureRecognition?: boolean;
    postProcessor?: 'grbl' | 'grblhal' | 'marlin' | 'mach3';
    tiling?: {
        enabled: boolean;
        tileWidth: number;
        tileHeight: number;
        overlap: number;
    };
    stayDownRapids?: {
        enabled: boolean;
        maxDistance: number;
        skimHeight: number;
    };
    collisionDetection?: {
        enabled: boolean;
        colletDiameter: number;
        colletLength: number;
    };
    // 3D Visualization and Placement Options
    threeDAlignment?: 'top' | 'center' | 'bottom';
    threeDZOffset?: number;
    showTransparentStock?: boolean;
    showDepthHeatmap?: boolean;
    solidSimulation?: boolean;
    // Accessibility & Safety
    showSafetyChecklist?: boolean;
    skipChecklistForever?: boolean;
    visualTheme?: 'default' | 'high-contrast' | 'colorblind' | 'depth-map';
    // Resolution & Precision
    curveTolerance?: number;
    // STEP Enhancements
    stepTesselationQuality?: 'low' | 'medium' | 'high' | 'ultra';
    analyzeUndercuts?: boolean;
    // UI & Accessibility Enhancements
    uiDensity?: 'comfortable' | 'compact';
    enableAudioAlerts?: boolean;
    gcodeComments?: boolean;
    gcodeLineNumbers?: boolean;
    defaultSafeZ?: number;
}

export interface CAMFeature {
    id: string;
    name: string;
    type: 'path' | 'circle' | 'rectangle' | 'hole' | 'face' | 'mesh';
    color?: string;
    points: { x: number; y: number; z?: number }[]; // geometry data
    meshVertices?: number[]; // Flat array of [x,y,z, x,y,z...] for STL meshes
    selected: boolean;
    // Hierarchy & Topology
    parentId?: string;
    children?: string[];
    isHidden?: boolean;
    isFace?: boolean;
    isEdge?: boolean;
    cylinderRadius?: number; // Smart Boring
    order?: number; // Machining order
}
