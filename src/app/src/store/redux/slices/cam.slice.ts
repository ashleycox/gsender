import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { CAMFeature, CAMSettings, CAMTool, CAMPathingOption } from '../../../features/CAM/definitions';
import store from '../../../store';

interface CAMState {
    features: CAMFeature[];
    settings: CAMSettings;
    tools: CAMTool[];
    pathingOptions: CAMPathingOption[];
    gcode: string;
    originalGcode: string;
    multiFiles?: { name: string, gcode: string, estimatedTime: number }[];
    currentMultiFileIdx: number;
    estimatedTime: number | null;
    history: { options: CAMPathingOption[], settings: CAMSettings, features: CAMFeature[] }[];
    historyIdx: number;
}

const initialState: CAMState = {
    features: [],
    settings: {
        units: 'mm',
        zOrigin: 'top',
        millingSide: 'top',
        scalingType: 'percentage',
        rasterResolution: 'adaptive',
        customResolutionValue: 0.1,
        optimizePath: true,
        scalePercentage: 100,
        targetWidth: 0,
        targetHeight: 0,
        safeZ: 5,
        spindle: 'M3',
        mist: false,
        flood: false,
        stockWidth: 100,
        stockLength: 100,
        stockThickness: 10,
        nestingX: 1,
        nestingY: 1,
        nestingSpacing: 5,
        startGcode: '',
        endGcode: '',
        gcodeComments: true,
        gcodeLineNumbers: false,
        showSafetyChecklist: true
    },
    tools: [],
    pathingOptions: [],
    gcode: '',
    originalGcode: '',
    multiFiles: [],
    currentMultiFileIdx: 0,
    estimatedTime: null,
    history: [],
    historyIdx: -1
};

const camSlice = createSlice({
    name: 'cam',
    initialState,
    reducers: {
        setFeatures: (state, action: PayloadAction<CAMFeature[]>) => {
            state.features = action.payload;
        },
        setSettings: (state, action: PayloadAction<CAMSettings>) => {
            state.settings = action.payload;
        },
        updateSettings: (state, action: PayloadAction<Partial<CAMSettings>>) => {
            state.settings = { ...state.settings, ...action.payload };
        },
        setTools: (state, action: PayloadAction<CAMTool[]>) => {
            state.tools = action.payload;
        },
        setPathingOptions: (state, action: PayloadAction<CAMPathingOption[]>) => {
            state.pathingOptions = action.payload;
        },
        updatePathing: (state, action: PayloadAction<CAMPathingOption>) => {
            const idx = state.pathingOptions.findIndex(o => o.id === action.payload.id);
            if (idx !== -1) {
                state.pathingOptions[idx] = action.payload;
            } else {
                state.pathingOptions.push(action.payload);
            }
        },
        setGcode: (state, action: PayloadAction<string>) => {
            state.gcode = action.payload;
        },
        setOriginalGcode: (state, action: PayloadAction<string>) => {
            state.originalGcode = action.payload;
        },
        setMultiFiles: (state, action: PayloadAction<{ name: string, gcode: string, estimatedTime: number }[] | undefined>) => {
            state.multiFiles = action.payload;
            state.currentMultiFileIdx = 0;
        },
        incrementMultiFileIdx: (state) => {
            state.currentMultiFileIdx += 1;
        },
        resetMultiFileIdx: (state) => {
            state.currentMultiFileIdx = 0;
        },
        setEstimatedTime: (state, action: PayloadAction<number | null>) => {
            state.estimatedTime = action.payload;
        },
        pushToHistory: (state) => {
            const { pathingOptions, settings, features } = state;
            const newHistory = state.history.slice(0, state.historyIdx + 1);
            newHistory.push({
                options: JSON.parse(JSON.stringify(pathingOptions)),
                settings: JSON.parse(JSON.stringify(settings)),
                features: JSON.parse(JSON.stringify(features))
            });
            if (newHistory.length > 50) newHistory.shift();
            state.history = newHistory;
            state.historyIdx = state.history.length - 1;
        },
        undo: (state) => {
            if (state.historyIdx > 0) {
                state.historyIdx -= 1;
                const prev = state.history[state.historyIdx];
                state.pathingOptions = prev.options;
                state.settings = prev.settings;
                state.features = prev.features;
            }
        },
        redo: (state) => {
            if (state.historyIdx < state.history.length - 1) {
                state.historyIdx += 1;
                const next = state.history[state.historyIdx];
                state.pathingOptions = next.options;
                state.settings = next.settings;
                state.features = next.features;
            }
        },
        resetCAM: (state) => {
            return { ...initialState, settings: { ...initialState.settings, units: store.get('workspace.units', 'mm') } };
        }
    }
});

export const {
    setFeatures,
    setSettings,
    updateSettings,
    setTools,
    setPathingOptions,
    updatePathing,
    setGcode,
    setOriginalGcode,
    setMultiFiles,
    incrementMultiFileIdx,
    resetMultiFileIdx,
    setEstimatedTime,
    pushToHistory,
    undo,
    redo,
    resetCAM
} = camSlice.actions;

export default camSlice.reducer;
