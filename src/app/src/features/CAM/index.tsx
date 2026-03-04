import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import pubsub from 'pubsub-js';
import cx from 'classnames';
import { Button } from '../../components/Button';
import Tabs from '../../components/Tabs';
import { uploadGcodeFileToServer } from '../../lib/fileupload';
import controller from '../../lib/controller';
import { VISUALIZER_SECONDARY, CAM_CATEGORY } from '../../constants';
import store from '../../store';

import { CAMFeature, CAMSettings, CAMTool, CAMPathingOption } from './definitions';
import FileSelector from './components/FileSelector';
import FeatureList from './components/FeatureList';
import ToolpathSettings from './components/ToolpathSettings';
import GlobalSettings from './components/GlobalSettings';
import CAMVisualizer from './components/CAMVisualizer';
import ToolDatabase from './components/ToolDatabase';
import FileParser from './utils/FileParser';
import GuidedCAMWizard from './components/GuidedCAMWizard';
import CAMAccessibility from './utils/CAMAccessibility';
import { saveAsDialog } from '../../lib/file-save';
import useKeybinding from '../../lib/useKeybinding';
import { toast } from '../../lib/toaster';
import { FolderOpen, Save, AlertTriangle, RefreshCcw, Undo2, Redo2, MessageSquareText, FileText, Wand2, HelpCircle } from 'lucide-react';
import SafetyChecklist from './components/SafetyChecklist';
import ParametricWizards from './components/ParametricWizards';
import NestingEngine from './utils/NestingEngine';
import GCodeEditor from './components/GCodeEditor';

const CAM = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState<File | null>(null);
    const [features, setFeatures] = useState<CAMFeature[]>([]);
    const [isWizardMode, setIsWizardMode] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorMsg, setHasErrorMsg] = useState('');
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [showNarrative, setShowNarrative] = useState(false);
    const [showEditor, setShowEditor] = useState(false);
    const [showWizards, setShowWizards] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const projectInputRef = useRef<HTMLInputElement>(null);
    
    const featurePanelRef = useRef<HTMLElement>(null);
    const visualizerPanelRef = useRef<HTMLElement>(null);
    const settingsPanelRef = useRef<HTMLElement>(null);

    const [settings, setSettings] = useState<CAMSettings>({
        units: store.get('workspace.units', 'mm'),
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
        showSafetyChecklist: true
    });
    
    const [tools, setTools] = useState<CAMTool[]>([]);
    const [pathingOptions, setPathingOptions] = useState<CAMPathingOption[]>([]);
    const [focusedFeatureIdx, setFocusedFeatureIdx] = useState(-1);

    // History for Undo/Redo
    const [history, setHistory] = useState<{ options: CAMPathingOption[], settings: CAMSettings, features: CAMFeature[] }[]>([]);
    const [historyIdx, setHistoryIdx] = useState(-1);

    const pushToHistory = (opts: CAMPathingOption[], sett: CAMSettings, feats: CAMFeature[]) => {
        const newHistory = history.slice(0, historyIdx + 1);
        newHistory.push({ 
            options: JSON.parse(JSON.stringify(opts)), 
            settings: JSON.parse(JSON.stringify(sett)),
            features: JSON.parse(JSON.stringify(feats))
        });
        if (newHistory.length > 50) newHistory.shift();
        setHistory(newHistory);
        setHistoryIdx(newHistory.length - 1);
    };

    const handleUndo = () => {
        if (historyIdx > 0) {
            const prev = history[historyIdx - 1];
            setPathingOptions(prev.options);
            setSettings(prev.settings);
            setFeatures(prev.features);
            setHistoryIdx(historyIdx - 1);
            toast.info("Undo successful");
        }
    };

    const handleRedo = () => {
        if (historyIdx < history.length - 1) {
            const next = history[historyIdx + 1];
            setPathingOptions(next.options);
            setSettings(next.settings);
            setFeatures(next.features);
            setHistoryIdx(historyIdx + 1);
            toast.info("Redo successful");
        }
    };

    const updateSettings = (newSettings: CAMSettings) => {
        setSettings(newSettings);
        pushToHistory(pathingOptions, newSettings, features);
    };

    const updatePathing = (newOptions: CAMPathingOption[]) => {
        setPathingOptions(newOptions);
        pushToHistory(newOptions, settings, features);
    };

    const playAudioAlert = (type: 'success' | 'warning' | 'error') => {
        if (!settings.enableAudioAlerts) return;
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            if (type === 'success') {
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
            } else if (type === 'warning') {
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.setValueAtTime(330, ctx.currentTime + 0.1);
            } else {
                osc.frequency.setValueAtTime(220, ctx.currentTime);
                osc.frequency.setValueAtTime(110, ctx.currentTime + 0.2);
            }
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {}
    };
    
    useEffect(() => {
        const token = pubsub.subscribe('cam:optimize-layout', () => {
            if (features.length === 0) return;
            const optimized = NestingEngine.optimize(features, settings, pathingOptions, tools);
            setFeatures(optimized);
            pushToHistory(pathingOptions, settings, optimized);
            toast.success("Layout optimized for material yield.");
            CAMAccessibility.announce("Layout optimized. Shapes have been packed tightly.");
        });
        return () => { pubsub.unsubscribe(token); };
    }, [features, settings, pathingOptions, tools]);

    useEffect(() => {
        const storeTools = store.get('workspace.tools', []);
        const camTools: CAMTool[] = storeTools.map((t: Partial<CAMTool>, index: number) => ({
            id: t.id || `custom-${index}`,
            name: t.name || `Tool ${t.metricDiameter || 0}mm`,
            type: t.type || 'Endmill',
            metricDiameter: t.metricDiameter || 3.175,
            imperialDiameter: t.imperialDiameter || 0.125,
            flutes: t.flutes || 2,
            stepover: t.stepover || 40,
            stepdown: t.stepdown || 1.5,
            feedrate: t.feedrate || 1000,
            plungeRate: t.plungeRate || 300,
            spindleRPM: t.spindleRPM || 18000,
            toolLength: t.toolLength || 30,
            angle: t.angle || 0
        }));
        setTools(camTools);
    }, []);

    const handleToolsChange = (newTools: CAMTool[]) => {
        setTools(newTools);
        store.set('workspace.tools', newTools);
    };

    const prevUnits = useRef(settings.units);
    useEffect(() => {
        if (prevUnits.current !== settings.units) {
            const factor = settings.units === 'mm' ? 25.4 : 1 / 25.4;
            setSettings(prev => ({
                ...prev,
                stockWidth: prev.stockWidth * factor,
                stockLength: prev.stockLength * factor,
                stockThickness: prev.stockThickness * factor,
                nestingSpacing: prev.nestingSpacing * factor,
                safeZ: prev.safeZ * factor,
                targetWidth: prev.targetWidth * factor,
                targetHeight: prev.targetHeight * factor,
            }));
            // Tools are absolute (metricDiameter is always mm, imperial is always in). 
            // We only scale feedrates which depend on the unit system.
            const scaledTools = tools.map(t => ({
                ...t,
                feedrate: t.feedrate * factor,
                plungeRate: t.plungeRate * factor,
            }));
            setTools(scaledTools);
            prevUnits.current = settings.units;
            CAMAccessibility.announce(`Converted values to ${settings.units === 'mm' ? 'Metric' : 'Imperial'}.`);
        }
    }, [settings.units]);

    const [gcode, setGcode] = useState('');
    const [originalGcode, setOriginalGcode] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [designBounds, setDesignBounds] = useState<{ width: number; height: number } | undefined>();

    useEffect(() => {
        if (features.length > 0 && !gcode) {
            const previewGcode = FileParser.generatePreviewGcode(features);
            const file = new File([previewGcode], 'design_preview.gcode');
            uploadGcodeFileToServer(file, controller.port, VISUALIZER_SECONDARY);
        }
    }, [features, gcode]);

    const printSetupSheet = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        
        const selectedOps = features.filter(f => f.selected).map(f => ({ feature: f, option: pathingOptions.find(o => o.featureId === f.id) })).filter(op => op.option);
        const usedToolIds = Array.from(new Set(selectedOps.map(op => op.option!.toolId)));
        const usedTools = usedToolIds.map(id => tools.find(t => t.id === id)).filter(Boolean);

        const html = `
            <html>
            <head>
                <title>Job Setup Sheet</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
                    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
                    .card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; background: #f9f9f9; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background: #eee; }
                </style>
            </head>
            <body>
                <h1>Job Setup Sheet - gSender CAM</h1>
                <div class="grid">
                    <div class="card">
                        <h3>Stock Dimensions</h3>
                        <p><strong>Width (X):</strong> ${settings.stockWidth.toFixed(2)} ${settings.units}</p>
                        <p><strong>Length (Y):</strong> ${settings.stockLength.toFixed(2)} ${settings.units}</p>
                        <p><strong>Thickness (Z):</strong> ${settings.stockThickness.toFixed(2)} ${settings.units}</p>
                        <p><strong>Z-Zero:</strong> ${settings.zOrigin.toUpperCase()}</p>
                    </div>
                    <div class="card">
                        <h3>Job Info</h3>
                        <p><strong>Source:</strong> ${file ? file.name : 'Generated Parametric Design'}</p>
                        <p><strong>Total Operations:</strong> ${selectedOps.length}</p>
                    </div>
                </div>

                <h3>Required Tools</h3>
                <table>
                    <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Diameter</th><th>Length</th></tr></thead>
                    <tbody>
                        ${usedTools.map((t, i) => `<tr><td>T${i+1}</td><td>${t!.name}</td><td>${t!.type}</td><td>${t!.metricDiameter}mm</td><td>${t!.toolLength}mm</td></tr>`).join('')}
                    </tbody>
                </table>

                <br><br>
                <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; cursor: pointer;">Print Sheet</button>
            </body>
            </html>
        `;
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
    };

    const shuttleControlEvents = React.useMemo(() => ({
        CAM_FOCUS_FEATURES: { title: 'Focus Features', keys: 'ctrl+1', cmd: 'CAM_FOCUS_FEATURES', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => { featurePanelRef.current?.focus(); setFocusedFeatureIdx(0); } },
        CAM_NAV_NEXT: { title: 'Next Feature', keys: 'down', cmd: 'CAM_NAV_NEXT', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => setFocusedFeatureIdx(prev => Math.min(prev + 1, features.length - 1)) },
        CAM_NAV_PREV: { title: 'Prev Feature', keys: 'up', cmd: 'CAM_NAV_PREV', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => setFocusedFeatureIdx(prev => Math.max(prev - 1, 0)) },
        CAM_TOGGLE_FEATURE: { title: 'Toggle Selection', keys: 'space', cmd: 'CAM_TOGGLE_FEATURE', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => {
            if (focusedFeatureIdx >= 0 && features[focusedFeatureIdx]) {
                const id = features[focusedFeatureIdx].id;
                setFeatures(features.map(f => f.id === id ? { ...f, selected: !f.selected } : f));
            }
        }},
        CAM_FOCUS_VISUALIZER: { title: 'Focus Visualizer', keys: 'ctrl+2', cmd: 'CAM_FOCUS_VISUALIZER', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => visualizerPanelRef.current?.focus() },
        CAM_FOCUS_SETTINGS: { title: 'Focus Settings', keys: 'ctrl+3', cmd: 'CAM_FOCUS_SETTINGS', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => settingsPanelRef.current?.focus() },
        CAM_GENERATE_GCODE: { title: 'Generate', keys: 'alt+g', cmd: 'CAM_GENERATE_GCODE', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => handleGenerateRequest() },
        CAM_LOAD_TO_SENDER: { title: 'Load', keys: 'alt+l', cmd: 'CAM_LOAD_TO_SENDER', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => handleLoadToSender() },
        CAM_RESET_SESSION: { title: 'Reset', keys: 'alt+r', cmd: 'CAM_RESET_SESSION', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => { setFile(null); setFeatures([]); setGcode(''); setHasError(false); } },
        CAM_UNDO: { title: 'Undo', keys: 'ctrl+z', cmd: 'CAM_UNDO', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => handleUndo() },
        CAM_REDO: { title: 'Redo', keys: 'ctrl+y', cmd: 'CAM_REDO', preventDefault: true, isActive: true, category: CAM_CATEGORY, callback: () => handleRedo() },
        CAM_GCODE_UPDATE: {
            title: 'Update Visualizer',
            keys: 's',
            cmd: 'CAM_GCODE_UPDATE',
            preventDefault: true,
            isActive: true,
            category: CAM_CATEGORY,
            callback: () => {
                if (showEditor) pubsub.publish('cam:editor-save');
            }
        },
        CAM_GCODE_SEARCH: {
            title: 'Search G-Code',
            keys: 'f',
            cmd: 'CAM_GCODE_SEARCH',
            preventDefault: true,
            isActive: true,
            category: CAM_CATEGORY,
            callback: () => {
                if (showEditor) pubsub.publish('cam:editor-search');
            }
        }
    }), [features, pathingOptions, settings, tools, gcode, historyIdx, focusedFeatureIdx, showEditor]);

    useEffect(() => {
        // Register keybindings once component is mounted to avoid render-phase store updates
        useKeybinding(shuttleControlEvents);
    }, [shuttleControlEvents]);

    const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        CAMAccessibility.announce(`File ${selectedFile.name} uploaded.`);
        let extractedFeatures: CAMFeature[] = [];
        const fileName = selectedFile.name.toLowerCase();

        try {
            if (fileName.endsWith('.svg')) extractedFeatures = await FileParser.parseSVG(selectedFile, settings);
            else if (fileName.endsWith('.dxf')) extractedFeatures = await FileParser.parseDXF(selectedFile, settings);
            else if (fileName.endsWith('.stl')) extractedFeatures = await FileParser.parseSTL(selectedFile);
            else if (fileName.endsWith('.step') || fileName.endsWith('.stp')) extractedFeatures = await FileParser.parseSTEP(selectedFile, settings);
            else if (fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) extractedFeatures = await FileParser.parseImage(selectedFile, settings);
            setFeatures(extractedFeatures);

            const getBounds = (pts: {x: number, y: number}[]) => {
                if (!pts || pts.length === 0) return { width: 0, height: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
                return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
            };

            if (extractedFeatures.length > 0) {
                const globalBounds = getBounds(extractedFeatures.flatMap(f => f.points));
                setDesignBounds({ width: globalBounds.width, height: globalBounds.height });
                if (globalBounds.width > settings.stockWidth || globalBounds.height > settings.stockLength) {
                    const scale = Math.min((settings.stockWidth * 0.9) / globalBounds.width, (settings.stockLength * 0.9) / globalBounds.height);
                    setSettings(prev => ({ ...prev, scalePercentage: Math.floor(scale * 100) }));
                } else {
                    setSettings(prev => ({ ...prev, scalePercentage: 100 }));
                }
            }
            
            // Pre-calculate bounds for containment check optimization
            const boundsMap = new Map(extractedFeatures.map(f => [f.id, getBounds(f.points)]));

            const initialOptions: CAMPathingOption[] = extractedFeatures.map(f => {
                const fb = boundsMap.get(f.id)!;
                const isContained = extractedFeatures.some(other => {
                    if (other.id === f.id) return false;
                    const ob = boundsMap.get(other.id)!;
                    return fb.minX > ob.minX && fb.maxX < ob.maxX && fb.minY > ob.minY && fb.maxY < ob.maxY;
                });
                return {
                    id: Math.random().toString(36).substr(2, 9),
                    featureId: f.id,
                    type: (f.type === 'hole' || isContained) ? 'inside' : 'outside',
                    depth: settings.stockThickness,
                    toolId: '1',
                    helicalBoring: true,
                    tabs: { enabled: false, count: 4, width: 5, height: 2 }
                };
            });
            setPathingOptions(initialOptions);
            pushToHistory(initialOptions, settings, extractedFeatures);
            CAMAccessibility.announce(CAMAccessibility.describeFeatures(extractedFeatures, settings));
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            toast.error(`Error parsing file: ${msg}`);
            CAMAccessibility.announce("Error parsing file.");
        }
    };

    const handleGenerateRequest = () => {
        if (settings.showSafetyChecklist !== false && !settings.skipChecklistForever) {
            setShowChecklistModal(true);
        } else {
            handleGenerateGcode();
        }
    };

    const handleFeatureMove = (id: string, dx: number, dy: number) => {
        setFeatures(prev => {
            const selectedIds = prev.filter(f => f.selected && !f.parentId).map(f => f.id);
            // If the dragged item isn't selected, just move it. Otherwise move all selected.
            const targets = selectedIds.includes(id) ? selectedIds : [id];
            
            return prev.map(f => {
                if (targets.includes(f.id) || (f.parentId && targets.includes(f.parentId))) {
                    return {
                        ...f,
                        points: f.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy })),
                        meshVertices: f.meshVertices ? f.meshVertices.map((v, i) => {
                            if (i % 3 === 0) return v + dx;
                            if (i % 3 === 1) return v + dy;
                            return v;
                        }) : undefined
                    };
                }
                return f;
            });
        });
    };

    const handleMoveEnd = () => {
        pushToHistory(pathingOptions, settings, features);
    };

    const handleConfirmSafety = (skipForever: boolean) => {
        if (skipForever) {
            updateSettings({ ...settings, skipChecklistForever: true });
        }
        setShowChecklistModal(false);
        handleGenerateGcode();
    };

    const handleGenerateGcode = () => {
        setHasError(false);
        const machineMaxX = parseFloat((controller.state as any)?.settings?.['$130'] || '1000');
        const machineMaxY = parseFloat((controller.state as any)?.settings?.['$131'] || '1000');
        let requiredWidth = settings.stockWidth, requiredLength = settings.stockLength;
        if (designBounds) {
            requiredWidth = (designBounds.width * (settings.scalePercentage / 100)) * settings.nestingX + (settings.nestingSpacing * (settings.nestingX - 1));
            requiredLength = (designBounds.height * (settings.scalePercentage / 100)) * settings.nestingY + (settings.nestingSpacing * (settings.nestingY - 1));
        }
        if (requiredWidth > machineMaxX || requiredLength > machineMaxY) {
            alert(`Toolpath dimensions exceed machine limits.`);
            return;
        }

        setIsGenerating(true);
        CAMAccessibility.announce("Generating G-Code...");
        const worker = new Worker(new URL('../../workers/cam-generator.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => {
            if (e.data.success) {
                setGcode(e.data.gcode);
                setOriginalGcode(e.data.gcode);
                const file = new File([e.data.gcode], 'gsender_cam.gcode');
                uploadGcodeFileToServer(file, controller.port, VISUALIZER_SECONDARY);
                CAMAccessibility.announce(`G-Code generated. Estimated time: ${Math.ceil(e.data.estimatedTime)} minutes.`);
                toast.success("Generation complete.");
                playAudioAlert('success');
            } else {
                setHasError(true);
                setHasErrorMsg(e.data.error);
                CAMAccessibility.announce(`Generation failed: ${e.data.error}`);
                playAudioAlert('error');
            }
            setIsGenerating(false);
            worker.terminate();
        };
        worker.onerror = (err: Event) => {
            console.error("CAM Worker Error:", err);
            const message = (err instanceof ErrorEvent) ? err.message : ((err as any).message || 'Unknown error');
            setHasError(true);
            setHasErrorMsg(`Worker thread crashed: ${message}. The design might be too complex for system memory.`);
            setIsGenerating(false);
            worker.terminate();
        };
        worker.postMessage({ features, pathingOptions, settings, tools });
    };

    const handleSaveProject = async () => {
        const projectData = { version: "1.0", settings, features, pathingOptions, tools, fileName: file?.name };
        const defaultName = `${file?.name?.split('.')[0] || 'project'}.gcam`;
        const success = await saveAsDialog(
            JSON.stringify(projectData, null, 2),
            defaultName,
            [{ description: 'gSender CAM Project', accept: { 'application/json': ['.gcam'] } }]
        );
        if (success) toast.success("Project saved.");
    };

    const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data: any = JSON.parse(event.target?.result as string);
                if (data.settings) updateSettings(data.settings);
                if (data.features) setFeatures(data.features);
                if (data.pathingOptions) setPathingOptions(data.pathingOptions);
                if (data.tools) setTools(data.tools);
                toast.success("Project loaded.");
            } catch (err) {
                toast.error("Load failed.");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleSaveToFile = async () => {
        if (!gcode) return;
        const success = await saveAsDialog(
            gcode,
            "gsender_cam.gcode",
            [{ description: 'G-Code Files', accept: { 'text/plain': ['.gcode', '.nc', '.tap', '.cnc'] } }]
        );
        if (success) {
            CAMAccessibility.announce("G-Code saved.");
            toast.success("G-Code saved.");
        }
    };

    const handleLoadToSender = () => {
        const name = 'gsender_cam.gcode';
        pubsub.publish('gcode:surfacing', { gcode, name, size: new File([gcode], name).size }); 
        CAMAccessibility.announce("G-Code loaded.");
        navigate('/');
    };

    const handleReset = () => {
        if (features.length === 0 || window.confirm("Are you sure you want to reset the current CAM session? All unsaved changes will be lost.")) {
            setFile(null);
            setFeatures([]);
            setGcode('');
            setHasError(false);
            CAMAccessibility.announce("Reset.");
        }
    };

    const handleEditorUpdate = (newGcode: string) => {
        setGcode(newGcode);
        const file = new File([newGcode], 'gsender_cam.gcode');
        uploadGcodeFileToServer(file, controller.port, VISUALIZER_SECONDARY);
        toast.success("Visualizer updated with edited G-Code.");
    };

    const handleReorder = (id: string, direction: 'up' | 'down') => {
        const sorted = [...features].sort((a, b) => (a.order || 0) - (b.order || 0));
        const idx = sorted.findIndex(f => f.id === id);
        if (idx === -1) return;

        if (direction === 'up' && idx > 0) {
            const temp = sorted[idx].order;
            sorted[idx].order = sorted[idx - 1].order;
            sorted[idx - 1].order = temp;
        } else if (direction === 'down' && idx < sorted.length - 1) {
            const temp = sorted[idx].order;
            sorted[idx].order = sorted[idx + 1].order;
            sorted[idx + 1].order = temp;
        }

        setFeatures(sorted);
        pushToHistory(pathingOptions, settings, sorted);
    };

    const handleWizardGenerate = (generatedFeatures: CAMFeature[]) => {
        const nextOrder = features.length;
        const orderedFeatures = generatedFeatures.map((f, i) => ({ ...f, order: nextOrder + i, selected: true }));
        const updatedFeatures = [...features, ...orderedFeatures];
        setFeatures(updatedFeatures);
        
        const getBounds = (pts: {x: number, y: number}[]) => {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
            return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
        };

        const globalBounds = getBounds(updatedFeatures.flatMap(f => f.points));
        setDesignBounds({ width: globalBounds.width, height: globalBounds.height });

        // Pre-calculate bounds for containment check optimization
        const boundsMap = new Map(updatedFeatures.map(f => [f.id, getBounds(f.points)]));

        const newOptions: CAMPathingOption[] = orderedFeatures.map(f => {
            const fb = boundsMap.get(f.id)!;
            const isContained = updatedFeatures.some(other => {
                if (other.id === f.id) return false;
                const ob = boundsMap.get(other.id)!;
                return fb.minX > ob.minX && fb.maxX < ob.maxX && fb.minY > ob.minY && fb.maxY < ob.maxY;
            });
            return {
                id: Math.random().toString(36).substr(2, 9),
                featureId: f.id,
                type: isContained ? 'inside' : 'outside',
                depth: settings.stockThickness,
                toolId: '1',
                tabs: { enabled: false, count: 4, width: 5, height: 2 }
            };
        });
        const updatedOptions = [...pathingOptions, ...newOptions];
        setPathingOptions(updatedOptions);
        pushToHistory(updatedOptions, settings, updatedFeatures);
        CAMAccessibility.announce(`Added ${generatedFeatures.length} features from wizard.`);
    };

    if (isWizardMode) {
        return (
            <GuidedCAMWizard 
                file={file} features={features} settings={settings} tools={tools} pathingOptions={pathingOptions}
                onFileSelect={handleFileSelect} onToggleFeature={(id) => setFeatures(features.map(f => f.id === id ? { ...f, selected: !f.selected } : f))}
                onSettingsChange={updateSettings} onPathingChange={updatePathing} onGenerate={handleGenerateRequest} onExit={() => setIsWizardMode(false)}
            />
        );
    }

    return (
        <div className={cx(
            "flex flex-col h-full w-full gap-4 dark:text-white", 
            settings.uiDensity === 'compact' ? "cam-compact p-1 gap-2" : "p-4 gap-4"
        )}>
            {showChecklistModal && <SafetyChecklist onConfirm={handleConfirmSafety} onCancel={() => setShowChecklistModal(false)} />}
            {showWizards && <ParametricWizards features={features} settings={settings} onGenerate={handleWizardGenerate} onClose={() => setShowWizards(false)} />}
            
            <header className="flex flex-col border-b bg-gray-50/50 dark:bg-dark-light">
                <div className="flex justify-between items-center p-2">
                    <div className="flex items-center gap-4">
                        <FileSelector onFileSelect={handleFileSelect} hasFeatures={features.length > 0} />
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={() => setShowWizards(true)} 
                                variant="outline" 
                                size="sm" 
                                className="flex items-center gap-2"
                                tooltip={{ content: "Open the parametric wizard to create common shapes and designs." }}
                            >
                                <Wand2 size={16} /> Create Parametric
                            </Button>
                            {showHelp && <span className="text-[10px] text-gray-500 mt-1">Add geometric shapes</span>}
                        </div>
                        <div className="h-6 w-px bg-gray-300 dark:bg-gray-700" />
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={() => projectInputRef.current?.click()} 
                                variant="outline" 
                                size="sm" 
                                className="flex items-center gap-2"
                                tooltip={{ content: "Open an existing gSender CAM project file (.gcam)." }}
                            >
                                <FolderOpen size={16} /> Open Project (.gcam)
                            </Button>
                            {showHelp && <span className="text-[10px] text-gray-500 mt-1">Load .gcam project</span>}
                        </div>
                        <input type="file" ref={projectInputRef} onChange={handleLoadProject} accept=".gcam" className="hidden" />
                        
                        <div className="flex gap-1 ml-2">
                            <div className="flex flex-col items-center">
                                <Button 
                                    onClick={handleUndo} 
                                    disabled={historyIdx <= 0} 
                                    variant="outline" 
                                    size="mini" 
                                    title="Undo (Ctrl+Z)"
                                    tooltip={{ content: "Undo the last action." }}
                                >
                                    <Undo2 size={14} />
                                </Button>
                                {showHelp && <span className="text-[10px] text-gray-500 mt-1">Revert change</span>}
                            </div>
                            <div className="flex flex-col items-center">
                                <Button 
                                    onClick={handleRedo} 
                                    disabled={historyIdx >= history.length - 1} 
                                    variant="outline" 
                                    size="mini" 
                                    title="Redo (Ctrl+Y)"
                                    tooltip={{ content: "Redo the last undone action." }}
                                >
                                    <Redo2 size={14} />
                                </Button>
                                {showHelp && <span className="text-[10px] text-gray-500 mt-1">Restore change</span>}
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={printSetupSheet} 
                                disabled={features.length === 0} 
                                variant="outline" 
                                size="sm" 
                                className="gap-2"
                                tooltip={{ content: "Print a job setup sheet with stock details and required tools." }}
                            >
                                <FileText size={16} /> Print Setup
                            </Button>
                            {showHelp && <span className="text-[10px] text-gray-500 mt-1">Export job details</span>}
                        </div>
                        {gcode && (
                            <div className="flex flex-col items-center">
                                <Button 
                                    onClick={() => setShowEditor(!showEditor)} 
                                    variant="outline" 
                                    size="sm" 
                                    className={cx("gap-2", showEditor && "bg-blue-100 border-blue-500 dark:bg-blue-900/30")}
                                    tooltip={{ content: showEditor ? "Hide the G-Code editor." : "Open the G-Code editor to manually inspect or modify generated code." }}
                                >
                                    <FileText size={16} /> {showEditor ? "Hide Code" : "View Code"}
                                </Button>
                                {showHelp && <span className="text-[10px] text-gray-500 mt-1">Inspect/edit code</span>}
                            </div>
                        )}
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={() => setShowNarrative(!showNarrative)} 
                                variant="outline" 
                                size="sm" 
                                className={cx("gap-2", showNarrative && "bg-blue-100 border-blue-500 dark:bg-blue-900/30")}
                                tooltip={{ content: showNarrative ? "Hide the toolpath narrative." : "Show a text description of the toolpaths for accessibility." }}
                            >
                                <MessageSquareText size={16} /> {showNarrative ? "Hide Narrative" : "Narrative"}
                            </Button>
                            {showHelp && <span className="text-[10px] text-gray-500 mt-1">Read description</span>}
                        </div>
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={handleSaveProject} 
                                disabled={features.length === 0} 
                                variant="outline" 
                                size="sm" 
                                className="flex items-center gap-2"
                                tooltip={{ content: "Save the current design, tools, and settings as a .gcam project file." }}
                            >
                                <Save size={16} /> Save Project (.gcam)
                            </Button>
                            {showHelp && <span className="text-[10px] text-gray-500 mt-1">Save all settings</span>}
                        </div>
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={() => setIsWizardMode(true)} 
                                size="sm"
                                tooltip={{ content: "Open the step-by-step guided setup wizard." }}
                            >
                                Wizard
                            </Button>
                            {showHelp && <span className="text-[10px] text-gray-500 mt-1">Guided step-by-step</span>}
                        </div>
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={handleReset} 
                                size="sm" 
                                variant="ghost"
                                tooltip={{ content: "Clear all features and reset the session. Requires confirmation if features are present." }}
                            >
                                Reset
                            </Button>
                            {showHelp && <span className="text-[10px] text-gray-500 mt-1">Clear and start over</span>}
                        </div>
                        <div className="h-8 w-px bg-gray-300 dark:bg-gray-700 mx-2 self-center" />
                        <div className="flex flex-col items-center">
                            <Button 
                                onClick={() => setShowHelp(!showHelp)} 
                                size="sm" 
                                variant={showHelp ? "primary" : "ghost"}
                                className="gap-2"
                                tooltip={{ content: "Toggle Help Mode to show descriptions for all toolbar functions." }}
                            >
                                <HelpCircle size={16} /> {showHelp ? "Help ON" : "Help"}
                            </Button>
                            {showHelp && <span className="text-[10px] text-blue-500 mt-1 font-bold italic">Toggle labels</span>}
                        </div>
                    </div>
                </div>
                {showHelp && (
                    <div className="px-4 pb-2 text-[11px] text-blue-600 dark:text-blue-400 italic bg-blue-50/50 dark:bg-blue-900/10 border-t border-blue-100 dark:border-blue-900/30">
                        Help Mode Active: Button descriptions are shown below each action. Use the "Wizard" for a guided experience.
                    </div>
                )}
            </header>

            <div className="flex flex-1 overflow-hidden gap-4">
                <aside ref={featurePanelRef} className="w-1/4 flex flex-col border rounded-md p-2 overflow-y-auto focus:ring-2 focus:ring-blue-500 outline-none group" tabIndex={0}>
                    <h2 className="text-lg font-bold mb-2">Features</h2>
                    <FeatureList 
                        features={features} 
                        onToggleFeature={(id) => setFeatures(features.map(f => f.id === id ? { ...f, selected: !f.selected } : f))} 
                        onReorder={handleReorder}
                        settings={settings}
                        focusedIdx={focusedFeatureIdx}
                    />
                </aside>

                <main ref={visualizerPanelRef} className="flex-1 border rounded-md relative bg-black overflow-hidden focus:ring-2 focus:ring-blue-500 outline-none" tabIndex={0}>
                    {showNarrative && (
                        <div className="absolute inset-0 z-30 bg-white/95 dark:bg-dark/95 p-6 overflow-y-auto">
                            <div className="flex justify-between items-center mb-4 border-b pb-2">
                                <h3 className="text-xl font-bold flex items-center gap-2 text-blue-600"><MessageSquareText /> Toolpath Narrative</h3>
                                <Button variant="ghost" size="mini" onClick={() => setShowNarrative(false)}>Close</Button>
                            </div>
                            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed dark:text-gray-200">
                                {CAMAccessibility.generateNarrative(features, pathingOptions, tools, settings)}
                            </pre>
                        </div>
                    )}

                    {showEditor && (
                        <GCodeEditor 
                            originalGcode={originalGcode} 
                            onUpdate={handleEditorUpdate} 
                            onClose={() => setShowEditor(false)} 
                        />
                    )}

                    {hasError ? (
                        <div className="absolute inset-0 z-20 bg-gray-900/90 flex flex-col items-center justify-center p-8 text-center space-y-4">
                            <AlertTriangle size={48} className="text-red-500" />
                            <h3 className="text-xl font-bold text-white">Generation Failed</h3>
                            <p className="text-gray-400 max-w-md">{errorMsg}</p>
                            <Button onClick={handleGenerateGcode} className="flex items-center gap-2">
                                <RefreshCcw size={16} /> Retry Generation
                            </Button>
                        </div>
                    ) : (
                        <div className="sr-only">
                            {features.length > 0 ? (
                                <div>
                                    <h3>Design Summary</h3>
                                    <p>{CAMAccessibility.describeFeatures(features, settings)}</p>
                                    <ul>{features.map(f => <li key={f.id}>{CAMAccessibility.getFeatureAudit(f, settings)}</li>)}</ul>
                                </div>
                            ) : <p>No file loaded.</p>}
                        </div>
                    )}
                    <CAMVisualizer features={features} gcode={gcode} settings={settings} onMoveFeature={handleFeatureMove} onMoveEnd={handleMoveEnd} />
                </main>

                <aside ref={settingsPanelRef} className="w-1/4 flex flex-col border rounded-md p-2 relative bg-gray-50 dark:bg-dark-light focus:ring-2 focus:ring-blue-500 outline-none" tabIndex={0}>
                    <div className="h-full pt-12 flex flex-col overflow-hidden">
                        <Tabs 
                            items={[
                                { label: 'Pathing', content: () => <div className="overflow-y-auto h-full p-2"><ToolpathSettings features={features.filter(f => f.selected)} options={pathingOptions} tools={tools} onChange={updatePathing} settings={settings} /></div> },
                                { label: 'Global', content: () => <div className="overflow-y-auto h-full p-2"><GlobalSettings settings={settings} onChange={updateSettings} designBounds={designBounds} /></div> },
                                { label: 'Tools', content: () => <div className="overflow-y-auto h-full p-2"><ToolDatabase tools={tools} onChange={handleToolsChange} /></div> }
                            ]}
                        />
                    </div>
                </aside>
            </div>

            <footer className="flex justify-end gap-4 p-2 border-t bg-gray-50/50 dark:bg-dark-light">
                <Button onClick={handleGenerateRequest} disabled={features.filter(f => f.selected).length === 0 || isGenerating}>
                    {isGenerating ? 'Generating...' : 'Generate G-Code (Alt+G)'}
                </Button>
                <Button onClick={handleSaveToFile} disabled={!gcode || isGenerating} variant="outline">Save G-Code</Button>
                <Button onClick={handleLoadToSender} disabled={!gcode || isGenerating}>Load to Workspace (Alt+L)</Button>
            </footer>
        </div>
    );
};

export default CAM;
