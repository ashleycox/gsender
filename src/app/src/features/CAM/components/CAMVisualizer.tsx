import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import cx from 'classnames';
import { VISUALIZER_PRIMARY, VISUALIZER_SECONDARY, SURFACING_VISUALIZER_CONTAINER_ID } from '../../../constants';
import { setCurrentVisualizer } from '../../../store/redux/slices/visualizer.slice';
import Visualizer from '../../../features/Visualizer';
import { CAMFeature, CAMSettings } from '../definitions';
import { Info, Move, Crosshair, AlertTriangle, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import Tooltip from '../../../components/Tooltip';
import RangeSlider from '../../../components/RangeSlider';
import { Button } from '../../../components/Button';
import { useWorkspaceState } from '../../../hooks/useWorkspaceState';
import controller from '../../../lib/controller';
import { stopContinuousJog, startJogCommand } from '../../Jogging/utils/Jogging';
import { toast } from '../../../lib/toaster';
import JogHelper from '../../Jogging/utils/jogHelper';
import useKeybinding from '../../../lib/useKeybinding';
import { JOGGING_CATEGORY } from '../../../constants';
import store from '../../../store';
import SolidSimulator from './SolidSimulator';

interface CAMVisualizerProps {
    features: CAMFeature[];
    settings: CAMSettings;
    tools: CAMTool[];
    gcode?: string;
    onMoveFeature: (id: string, dx: number, dy: number) => void;
    onMoveEnd: () => void;
}

const CAMVisualizer = ({ features, settings, tools, gcode, onMoveFeature, onMoveEnd }: CAMVisualizerProps) => {
    const dispatch = useDispatch();
    const [scrubValue, setScrubValue] = useState(0);
    const [isMoveMode, setIsMoveMode] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [setupAssistant, setSetupAssistant] = useState(false);
    const [jogType, setJogType] = useState<'rapid' | 'normal' | 'precise'>('normal');

    const workspace = useWorkspaceState() as any;
    const wpos = workspace?.controller?.wpos || { x: 0, y: 0, z: 0 };
    const isConnected = workspace?.controller?.connected || false;

    // Pull native settings from the store ( respects 'Configure' tab )
    const jogSettings = useMemo(() => {
        const config = store.get('widgets.axes.jog', {});
        return {
            rapid: config.rapid || { xyStep: 10, zStep: 5, feedrate: 5000 },
            normal: config.normal || { xyStep: 1, zStep: 1, feedrate: 2000 },
            precise: config.precise || { xyStep: 0.1, zStep: 0.1, feedrate: 500 }
        };
    }, []);

    const activeJog = jogSettings[jogType];
    const jogHelper = useRef<JogHelper | null>(null);

    useEffect(() => {
        if (!jogHelper.current) {
            jogHelper.current = new JogHelper({
                jogCB: (given, f) => startJogCommand(given, f, false),
                startContinuousJogCB: (coords, f) => {
                    const normalized: Record<string, number> = {};
                    Object.keys(coords).forEach(k => { normalized[k] = coords[k] > 0 ? 1 : -1; });
                    startJogCommand(normalized, f, true);
                },
                stopContinuousJogCB: () => stopContinuousJog()
            });
        }
    }, []);

    const handleJog = (axis: { x?: number, y?: number, z?: number }) => {
        if (!jogHelper.current) return;
        const axisList: Record<string, number> = {};
        if (axis.x) axisList.X = activeJog.xyStep * axis.x;
        if (axis.y) axisList.Y = activeJog.xyStep * axis.y;
        if (axis.z) axisList.Z = activeJog.zStep * axis.z;
        
        jogHelper.current.onKeyDown(axisList, activeJog.feedrate);
    };

    // Register Native gSender Shortcuts
    useEffect(() => {
        if (!setupAssistant) return;

        const shuttleControlEvents = {
            JOG_X_P: { title: 'Jog X+ (Setup)', keys: 'shift+right', cmd: 'JOG_X_P', category: JOGGING_CATEGORY, isActive: true, callback: (_:any, p:any) => handleJog(p.axis) },
            JOG_X_M: { title: 'Jog X- (Setup)', keys: 'shift+left', cmd: 'JOG_X_M', category: JOGGING_CATEGORY, isActive: true, callback: (_:any, p:any) => handleJog(p.axis) },
            JOG_Y_P: { title: 'Jog Y+ (Setup)', keys: 'shift+up', cmd: 'JOG_Y_P', category: JOGGING_CATEGORY, isActive: true, callback: (_:any, p:any) => handleJog(p.axis) },
            JOG_Y_M: { title: 'Jog Y- (Setup)', keys: 'shift+down', cmd: 'JOG_Y_M', category: JOGGING_CATEGORY, isActive: true, callback: (_:any, p:any) => handleJog(p.axis) },
            JOG_Z_P: { title: 'Jog Z+ (Setup)', keys: 'shift+pageup', cmd: 'JOG_Z_P', category: JOGGING_CATEGORY, isActive: true, callback: (_:any, p:any) => handleJog(p.axis) },
            JOG_Z_M: { title: 'Jog Z- (Setup)', keys: 'shift+pagedown', cmd: 'JOG_Z_M', category: JOGGING_CATEGORY, isActive: true, callback: (_:any, p:any) => handleJog(p.axis) },
            STOP_CONT_JOG: { title: 'Stop Jog', keys: '', cmd: 'STOP_CONT_JOG', isActive: true, callback: () => jogHelper.current?.onKeyUp() }
        };

        useKeybinding(shuttleControlEvents as any);
    }, [setupAssistant, jogType, activeJog]);

    const handleZero = (axis: 'xy' | 'z') => {
        if (axis === 'xy') controller.command('gcode', ['G10 L20 P1 X0 Y0']);
        else controller.command('gcode', ['G10 L20 P1 Z0']);
        toast.success(`Zeroed ${axis.toUpperCase()} at machine position.`);
    };

    useEffect(() => {
        dispatch(setCurrentVisualizer(VISUALIZER_SECONDARY));
        return () => {
            dispatch(setCurrentVisualizer(VISUALIZER_PRIMARY));
        };
    }, []);

    useEffect(() => {
        setScrubValue(0);
    }, [gcode]);

    const totalLines = useMemo(() => {
        if (!gcode) return 0;
        return gcode.split('\n').length;
    }, [gcode]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!isMoveMode) return;
        setIsDragging(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !isMoveMode) return;
        
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        
        const target = features.find(f => f.selected && !f.parentId);
        if (target) {
            const sensitivity = settings.units === 'mm' ? 0.5 : 0.02;
            onMoveFeature(target.id, dx * sensitivity, -dy * sensitivity);
        }
        
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
        if (isDragging) {
            onMoveEnd();
        }
        setIsDragging(false);
    };

    const getThemeColors = () => {
        const theme = settings.visualTheme || 'default';
        if (theme === 'high-contrast') return { cut: 'text-yellow-400', rapid: 'text-fuchsia-500', lead: 'text-cyan-400' };
        if (theme === 'colorblind') return { cut: 'text-orange-500', rapid: 'text-blue-500', lead: 'text-white' };
        if (theme === 'depth-map') return { cut: 'text-emerald-500', rapid: 'text-red-500', lead: 'text-amber-500' };
        return { cut: 'text-blue-400', rapid: 'text-red-400', lead: 'text-yellow-400' };
    };

    const colors = getThemeColors();

    const isDesignOutOfBounds = useMemo(() => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const activeFeatures = features.filter(f => f.selected);
        if (activeFeatures.length === 0) return false;

        activeFeatures.forEach(f => {
            f.points.forEach(p => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
        });

        return minX < 0 || maxX > settings.stockWidth || minY < 0 || maxY > settings.stockLength;
    }, [features, settings.stockWidth, settings.stockLength]);

    const isSpindleOutOfBounds = wpos.x < 0 || wpos.x > settings.stockWidth || wpos.y < 0 || wpos.y > settings.stockLength;

    if (!gcode && features.length === 0) {
        return (
            <div className="flex flex-col h-full items-center justify-center bg-gray-900">
                <p className="text-gray-500 text-center text-sm">
                    Upload a file to preview the design.
                </p>
            </div>
        );
    }

    return (
        <div 
            className={cx(
                "w-full h-full min-h-[400px] relative border-2 rounded-md overflow-hidden bg-black transition-colors duration-300", 
                `theme-${settings.visualTheme || 'default'}`, 
                isMoveMode && "cursor-move",
                (isDesignOutOfBounds || isSpindleOutOfBounds) ? "border-red-600/50 shadow-[0_0_15px_rgba(220,38,38,0.2)]" : "border-gray-800"
            )} 
            id={SURFACING_VISUALIZER_CONTAINER_ID}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <div className="absolute top-2 left-2 z-10 flex gap-2">
                <Tooltip content={(
                    <div className="p-2 max-w-xs text-xs space-y-2">
                        <p className="font-bold border-b border-gray-700 pb-1 mb-1">Visualizer Guide</p>
                        <p>• <strong>White Box:</strong> Physical stock material (Width x Length x Thickness).</p>
                        <p>• <strong>RGB Tripod:</strong> Work Coordinate System (WCS) origin (X=Red, Y=Green, Z=Blue).</p>
                        <p>• <strong>Path Colors ({settings.visualTheme || 'default'}):</strong> <span className={colors.cut}>Cut</span>, <span className={colors.rapid}>Rapid</span>, <span className={colors.lead}>Ramp/Lead</span>.</p>
                        <p>• <strong>Ghosting:</strong> The dim outline shows your original design scale relative to stock.</p>
                        <p>• <strong>Scrubbing:</strong> Use the slider at the bottom to simulate the tool movement.</p>
                        <p>• <strong>Move Mode:</strong> Toggle the move icon to drag selected parts directly.</p>
                    </div>
                ) as any}>
                    <div className="bg-gray-800/80 p-1.5 rounded-full text-blue-400 cursor-help hover:bg-gray-700 transition-colors">
                        <Info size={16} />
                    </div>
                </Tooltip>

                <Button 
                    variant={isMoveMode ? "primary" : "outline"} 
                    size="mini" 
                    className="h-7 w-7 p-0 rounded-full" 
                    onClick={() => setIsMoveMode(!isMoveMode)}
                    title={isMoveMode ? "Disable Move Mode" : "Enable Move Mode (Drag elements)"}
                    aria-pressed={isMoveMode}
                >
                    <Move size={14} />
                </Button>

                <Button 
                    variant={setupAssistant ? "primary" : "outline"} 
                    size="mini" 
                    className="h-7 px-2 gap-1 rounded-full" 
                    onClick={() => setSetupAssistant(!setupAssistant)}
                    title="Toggle Live Setup Assistant"
                >
                    <Crosshair size={14} /> Setup
                </Button>
                
                <div className="bg-black/50 px-2 py-1 rounded text-[10px] text-gray-400 border border-gray-700 uppercase tracking-wider font-bold">
                    {settings.millingSide} Side | {settings.zOrigin} Origin
                </div>
            </div>

            {setupAssistant && isConnected && (
                <div className="absolute top-12 left-2 z-10 bg-black/80 backdrop-blur-md p-3 rounded-lg border border-gray-700 text-xs w-64 shadow-xl animate-in slide-in-from-top-2">
                    <h4 className="font-bold text-white border-b border-gray-700 pb-1 mb-2 flex items-center justify-between">
                        Live Setup Assistant
                        {isSpindleOutOfBounds && <AlertTriangle size={14} className="text-amber-500 animate-pulse" />}
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-y-1 text-gray-300 mb-3 px-1">
                        <span className="text-gray-500">WPOS X:</span> <span className="font-mono text-right">{wpos.x.toFixed(3)}</span>
                        <span className="text-gray-500">WPOS Y:</span> <span className="font-mono text-right">{wpos.y.toFixed(3)}</span>
                        <span className="text-gray-500">WPOS Z:</span> <span className="font-mono text-right">{wpos.z.toFixed(3)}</span>
                    </div>

                    <div className="bg-gray-900/50 p-2 rounded border border-gray-700 mb-3">
                        <div className="flex justify-between items-center mb-2 px-1">
                            <span className="text-[9px] uppercase font-bold text-gray-500">Speed Preset</span>
                            <div className="flex gap-1">
                                {(['precise', 'normal', 'rapid'] as const).map(type => (
                                    <button 
                                        key={type}
                                        onClick={() => setJogType(type)}
                                        className={cx(
                                            "px-1.5 py-0.5 rounded text-[9px] border transition-colors font-bold capitalize",
                                            jogType === type ? "bg-blue-500 border-blue-500 text-white" : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
                                        )}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-4 items-center justify-center py-1">
                            <div className="grid grid-cols-3 gap-1">
                                <div />
                                <Button variant="outline" size="mini" className="h-7 w-7 p-0" onMouseDown={() => handleJog({y: 1})} onMouseUp={() => jogHelper.current?.onKeyUp()}><ChevronUp size={14}/></Button>
                                <div />
                                <Button variant="outline" size="mini" className="h-7 w-7 p-0" onMouseDown={() => handleJog({x: -1})} onMouseUp={() => jogHelper.current?.onKeyUp()}><ChevronLeft size={14}/></Button>
                                <div className="flex items-center justify-center text-gray-600"><Target size={10}/></div>
                                <Button variant="outline" size="mini" className="h-7 w-7 p-0" onMouseDown={() => handleJog({x: 1})} onMouseUp={() => jogHelper.current?.onKeyUp()}><ChevronRight size={14}/></Button>
                                <div />
                                <Button variant="outline" size="mini" className="h-7 w-7 p-0" onMouseDown={() => handleJog({y: -1})} onMouseUp={() => jogHelper.current?.onKeyUp()}><ChevronDown size={14}/></Button>
                                <div />
                            </div>

                            <div className="flex flex-col gap-1 border-l border-gray-700 pl-4">
                                <Button variant="outline" size="mini" className="h-7 w-7 p-0" onMouseDown={() => handleJog({z: 1})} onMouseUp={() => jogHelper.current?.onKeyUp()}><ChevronUp size={14}/></Button>
                                <div className="h-7 w-7 flex items-center justify-center font-bold text-gray-500 text-[10px]">Z</div>
                                <Button variant="outline" size="mini" className="h-7 w-7 p-0" onMouseDown={() => handleJog({z: -1})} onMouseUp={() => jogHelper.current?.onKeyUp()}><ChevronDown size={14}/></Button>
                            </div>
                        </div>
                        
                        <div className="mt-2 px-1 text-[8px] text-gray-500 flex justify-between italic">
                            <span>Step: {activeJog.xyStep}{settings.units}</span>
                            <span>Feed: {activeJog.feedrate}</span>
                        </div>

                        <div className="flex gap-2 mt-3">
                            <Button variant="outline" size="mini" className="flex-1 text-[9px] h-6 uppercase font-bold" onClick={() => handleZero('xy')}>Zero XY</Button>
                            <Button variant="outline" size="mini" className="flex-1 text-[9px] h-6 uppercase font-bold" onClick={() => handleZero('z')}>Zero Z</Button>
                        </div>
                    </div>

                    {isSpindleOutOfBounds ? (
                        <div className="text-[10px] text-amber-500 bg-amber-500/10 p-1.5 rounded leading-tight flex gap-2 items-start">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                            <span>Warning: Spindle is outside stock bounds. Check clamp clearance!</span>
                        </div>
                    ) : (
                        <div className="text-[10px] text-emerald-500 bg-emerald-500/10 p-1.5 rounded leading-tight">
                            Spindle is within stock bounds. Safe to test boundaries.
                        </div>
                    )}
                </div>
            )}

            {!isConnected && setupAssistant && (
                <div className="absolute top-12 left-2 z-10 bg-black/80 backdrop-blur-md p-3 rounded-lg border border-red-900/50 text-xs w-64 shadow-xl">
                    <p className="text-red-400 flex items-center gap-2"><AlertTriangle size={14}/> Machine Not Connected</p>
                    <p className="text-gray-500 text-[10px] mt-1 leading-tight">Connect to a machine to enable live tracking and clamp verification.</p>
                </div>
            )}

            {settings.solidSimulation ? (
                <SolidSimulator gcode={gcode} settings={settings} tools={tools} currentLine={scrubValue} />
            ) : (
                /* @ts-ignore */
                <Visualizer isSecondary receivedLines={scrubValue} forceShowTool={setupAssistant} />
            )}

            {gcode && (
                <div className="absolute bottom-4 left-4 right-4 z-10 bg-black/60 p-3 rounded-lg border border-gray-700 backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-2 text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                        <span>Simulation Progress</span>
                        <span>Line {scrubValue} / {totalLines}</span>
                    </div>
                    <RangeSlider
                        title="Simulation"
                        min={0}
                        max={totalLines}
                        percentage={[scrubValue]}
                        value={String(scrubValue)}
                        showText={false}
                        onChange={(p) => setScrubValue(p[0])}
                        onButtonPress={(p) => setScrubValue(p[0])}
                        aria-label="Simulate toolpath progress"
                    />
                </div>
            )}
        </div>
    );
};

export default CAMVisualizer;
