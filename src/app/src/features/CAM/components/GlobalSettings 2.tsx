import React from 'react';
import { ControlledInput } from '../../../components/ControlledInput';
import { CAMSettings } from '../definitions';
import Switch from '../../../components/Switch';
import { Button } from '../../../components/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/shadcn/Select';
import { Textarea } from '../../../components/shadcn/TextArea';
import { cn } from '../../../lib/utils';
import { RefreshCcw } from 'lucide-react';
import pubsub from 'pubsub-js';

interface GlobalSettingsProps {
    settings: CAMSettings;
    onChange: (settings: CAMSettings) => void;
    designBounds?: { width: number; height: number };
}

const SettingRow = ({ label, control, description, className }: { label: string, control: React.ReactNode, description: string, className?: string }) => (
    <div className={cn("flex flex-col gap-2 p-3 border-b border-gray-200 dark:border-gray-700 last:border-0", className)}>
        <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 shrink-0">{label}</label>
            <div className="flex-1 flex justify-end">{control}</div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 italic leading-relaxed">{description}</p>
    </div>
);

const GlobalSettings = ({ settings, onChange, designBounds }: GlobalSettingsProps) => {
    const handleValueChange = (key: keyof CAMSettings, value: any) => {
        onChange({ ...settings, [key]: value });
    };

    const handleAutoFit = () => {
        if (!designBounds || designBounds.width === 0 || designBounds.height === 0) return;
        const scaleX = (settings.stockWidth * 0.9) / designBounds.width;
        const scaleY = (settings.stockLength * 0.9) / designBounds.height;
        const autoScale = Math.min(scaleX, scaleY) * 100;
        handleValueChange('scalePercentage', Math.floor(autoScale));
    };

    return (
        <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
            <SettingRow 
                label="Units"
                description="Choose between Metric (mm) or Imperial (inches) for all dimensions and feedrates."
                control={
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={settings.units === 'mm'} onChange={() => handleValueChange('units', 'mm')} />
                            <span>mm</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={settings.units === 'inch'} onChange={() => handleValueChange('units', 'inch')} />
                            <span>in</span>
                        </label>
                    </div>
                }
            />

            <SettingRow 
                label="Milling Side"
                description="Select which side of the part you are currently milling. 'Bottom' automatically mirrors the design for flip-milling."
                control={
                    <div className="flex gap-1">
                        <Button 
                            variant={settings.millingSide === 'top' ? 'primary' : 'outline'} 
                            size="mini" 
                            onClick={() => handleValueChange('millingSide', 'top')}
                            className="text-[10px] h-7"
                        >
                            Top
                        </Button>
                        <Button 
                            variant={settings.millingSide === 'bottom' ? 'primary' : 'outline'} 
                            size="mini" 
                            onClick={() => handleValueChange('millingSide', 'bottom')}
                            className="text-[10px] h-7"
                        >
                            Bottom
                        </Button>
                    </div>
                }
            />

            <SettingRow 
                label="3D Resolution"
                description="The resolution defines the 'grid' size. Smaller values increase detail but slow down generation. Adaptive scales to tool size."
                control={
                    <div className="flex flex-col gap-2 items-end">
                        <Select value={settings.rasterResolution} onValueChange={(val: any) => handleValueChange('rasterResolution', val)}>
                            <SelectTrigger className="h-8 w-24 text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="adaptive">Adaptive</SelectItem>
                                <SelectItem value="standard">Standard</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                        </Select>
                        {settings.rasterResolution === 'custom' && (
                            <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-400">Val:</span>
                                <ControlledInput 
                                    type="number" 
                                    value={settings.customResolutionValue} 
                                    onChange={(e) => handleValueChange('customResolutionValue', Number(e.target.value))} 
                                    className="w-16 h-7 text-xs"
                                    suffix={settings.units}
                                    step="0.01"
                                />
                            </div>
                        )}
                    </div>
                }
            />

            <SettingRow 
                label="Path Optimization"
                description="Reorders cuts to minimize the distance the machine spends 'jogging' between features."
                control={
                    <Switch checked={settings.optimizePath} onChange={(checked) => handleValueChange('optimizePath', checked)} />
                }
            />

            <SettingRow 
                label="Stay-Down Rapids"
                description="Keep the bit low during short rapid moves to save time instead of fully retracting to Safe Z."
                control={
                    <div className="flex flex-col gap-2 items-end">
                        <Switch checked={!!settings.stayDownRapids?.enabled} onChange={(checked) => handleValueChange('stayDownRapids', { enabled: checked, maxDistance: settings.stayDownRapids?.maxDistance || 20, skimHeight: settings.stayDownRapids?.skimHeight || 1 })} />
                        {settings.stayDownRapids?.enabled && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400">Max Dist:</span>
                                <ControlledInput type="number" value={settings.stayDownRapids.maxDistance} onChange={(e) => handleValueChange('stayDownRapids', { ...settings.stayDownRapids!, maxDistance: Number(e.target.value) })} className="w-12 h-7 text-xs" />
                                <span className="text-[10px] text-gray-400">Skim:</span>
                                <ControlledInput type="number" value={settings.stayDownRapids.skimHeight} onChange={(e) => handleValueChange('stayDownRapids', { ...settings.stayDownRapids!, skimHeight: Number(e.target.value) })} className="w-12 h-7 text-xs" />
                            </div>
                        )}
                    </div>
                }
            />

            <SettingRow 
                label="Auto Feature Recognition"
                description="Automatically identify and assign optimal strategies to standard geometry upon import."
                control={
                    <Switch checked={!!settings.autoFeatureRecognition} onChange={(checked) => handleValueChange('autoFeatureRecognition', checked)} />
                }
            />

            <SettingRow 
                label="Collision Detection"
                description="Checks if your spindle/collet will crash into the stock based on the tool length and part depth."
                control={
                    <div className="flex flex-col gap-2 items-end">
                        <Switch checked={!!settings.collisionDetection?.enabled} onChange={(checked) => handleValueChange('collisionDetection', { enabled: checked, colletDiameter: settings.collisionDetection?.colletDiameter || 15, colletLength: settings.collisionDetection?.colletLength || 20 })} />
                        {settings.collisionDetection?.enabled && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-400">Diameter:</span>
                                <ControlledInput type="number" value={settings.collisionDetection.colletDiameter} onChange={(e) => handleValueChange('collisionDetection', { ...settings.collisionDetection!, colletDiameter: Number(e.target.value) })} className="w-12 h-7 text-xs" />
                            </div>
                        )}
                    </div>
                }
            />

            <SettingRow 
                label="Active Setup (Orientation)"
                description="For multi-sided machining, select which side is currently facing UP on the machine bed."
                control={
                    <Select value={settings.activeSetupId || 'default'} onValueChange={(val: any) => handleValueChange('activeSetupId', val)}>
                        <SelectTrigger className="h-8 w-24 text-[10px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Default</SelectItem>
                            {settings.setups?.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.orientation})</SelectItem>)}
                        </SelectContent>
                    </Select>
                }
            />

            <div className="border-t border-gray-200 dark:border-gray-700 my-4 pt-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Precision & Resolution</h4>
                
                <SettingRow 
                    label="Curve Tolerance"
                    description="The maximum allowed error between a true circle and the generated straight segments. Lower is smoother but uses more memory."
                    control={
                        <ControlledInput 
                            type="number" 
                            step="0.001" 
                            value={settings.curveTolerance || 0.01} 
                            onChange={(e) => handleValueChange('curveTolerance', Number(e.target.value))} 
                            suffix={settings.units === 'mm' ? 'mm' : 'in'} 
                            className="w-24 h-8 text-xs" 
                        />
                    }
                />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-4 pt-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Accessibility & Workflow</h4>
                
                <SettingRow 
                    label="UI Layout Density"
                    description="Switch between a spaced-out layout for touchscreens or a dense layout for desktop power users."
                    control={
                        <Select value={settings.uiDensity || 'comfortable'} onValueChange={(val: any) => handleValueChange('uiDensity', val)}>
                            <SelectTrigger className="h-8 w-32 text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="comfortable">Comfortable (Touch)</SelectItem>
                                <SelectItem value="compact">Compact (Desktop)</SelectItem>
                            </SelectContent>
                        </Select>
                    }
                />

                <SettingRow 
                    label="Audio Feedback"
                    description="Play subtle sound cues for job completion, tile shifts, and safety warnings."
                    control={
                        <Switch checked={!!settings.enableAudioAlerts} onChange={(checked) => handleValueChange('enableAudioAlerts', checked)} />
                    }
                />

                <SettingRow 
                    label="Safe Z (Default)"
                    description="The default height the machine will retract to for rapid moves in new projects."
                    control={
                        <ControlledInput type="number" value={settings.defaultSafeZ || 5} onChange={(e) => handleValueChange('defaultSafeZ', Number(e.target.value))} suffix={settings.units} className="w-20 h-8 text-xs" />
                    }
                />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-4 pt-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">G-Code Formatting</h4>
                
                <SettingRow 
                    label="Include Comments"
                    description="Include descriptive (brackets) in the generated file to explain operations."
                    control={
                        <Switch checked={settings.gcodeComments !== false} onChange={(checked) => handleValueChange('gcodeComments', checked)} />
                    }
                />

                <SettingRow 
                    label="Line Numbers (N-Words)"
                    description="Prefix every line of G-code with a line number (e.g., N100, N110)."
                    control={
                        <Switch checked={!!settings.gcodeLineNumbers} onChange={(checked) => handleValueChange('gcodeLineNumbers', checked)} />
                    }
                />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-4 pt-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Post-Processing</h4>

                <SettingRow 
                    label="Post-Processor"
                    description="Select the target controller to automatically format the G-Code syntax correctly."
                    control={
                        <Select value={settings.postProcessor || 'grbl'} onValueChange={(val: any) => handleValueChange('postProcessor', val)}>
                            <SelectTrigger className="h-8 w-24 text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grbl">GRBL</SelectItem>
                                <SelectItem value="grblhal">grblHAL</SelectItem>
                                <SelectItem value="marlin">Marlin</SelectItem>
                                <SelectItem value="mach3">Mach3</SelectItem>
                            </SelectContent>
                        </Select>
                    }
                />

                <SettingRow 
                    label="Job Tiling"
                    description="Split large designs into physical segments to fit on smaller machines."
                    control={
                        <div className="flex flex-col gap-2 items-end">
                            <Switch checked={!!settings.tiling?.enabled} onChange={(checked) => handleValueChange('tiling', { enabled: checked, tileWidth: settings.tiling?.tileWidth || 400, tileHeight: settings.tiling?.tileHeight || 400, overlap: settings.tiling?.overlap || 10 })} />
                            {settings.tiling?.enabled && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-gray-400">Width:</span>
                                    <ControlledInput type="number" value={settings.tiling.tileWidth} onChange={(e) => handleValueChange('tiling', { ...settings.tiling!, tileWidth: Number(e.target.value) })} className="w-12 h-7 text-xs" />
                                    <span className="text-[10px] text-gray-400">Height:</span>
                                    <ControlledInput type="number" value={settings.tiling.tileHeight} onChange={(e) => handleValueChange('tiling', { ...settings.tiling!, tileHeight: Number(e.target.value) })} className="w-12 h-7 text-xs" />
                                    <span className="text-[10px] text-gray-400">Overlap:</span>
                                    <ControlledInput type="number" value={settings.tiling.overlap} onChange={(e) => handleValueChange('tiling', { ...settings.tiling!, overlap: Number(e.target.value) })} className="w-12 h-7 text-xs" />
                                </div>
                            )}
                        </div>
                    }
                />
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 my-4 pt-4">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">STEP / 3D Import Options</h4>
                
                <SettingRow 
                    label="Mesh Quality (Tesselation)"
                    description="Higher quality produces smoother curves but takes longer to process and generate."
                    control={
                        <Select value={settings.stepTesselationQuality || 'medium'} onValueChange={(val: any) => handleValueChange('stepTesselationQuality', val)}>
                            <SelectTrigger className="h-8 w-24 text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Low (Fast)</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="ultra">Ultra (Precise)</SelectItem>
                            </SelectContent>
                        </Select>
                    }
                />

                <SettingRow 
                    label="Undercut Safety Analysis"
                    description="Automatically identify and highlight non-manifold or 'hidden' faces that the 3-axis machine cannot reach from the top down."
                    control={
                        <Switch checked={!!settings.analyzeUndercuts} onChange={(checked) => handleValueChange('analyzeUndercuts', checked)} />
                    }
                />
            </div>

            <SettingRow 
                label="Scaling"
                description="Adjust the size of the design. Use 'Fit' to maximize the part within the defined stock area."
                control={
                    <div className="flex flex-col gap-2 w-full items-end">
                        <div className="flex items-center gap-2">
                            <ControlledInput 
                                type="number" 
                                value={settings.scalePercentage} 
                                onChange={(e) => handleValueChange('scalePercentage', Number(e.target.value))} 
                                suffix="%" 
                                className="w-16 h-8 text-xs" 
                            />
                            <Button variant="outline" size="mini" onClick={() => handleValueChange('scalePercentage', 100)} className="h-8 py-0 px-2 text-[10px]">1:1</Button>
                            <Button variant="outline" size="mini" onClick={handleAutoFit} className="h-8 py-0 px-2 text-[10px]" disabled={!designBounds}>Fit</Button>
                        </div>
                    </div>
                }
            />

            <SettingRow 
                label="Z-Zero Reference"
                description="Determine where Z=0 is located. 'Top' is surface; 'Bed' is wasteboard."
                control={
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={settings.zOrigin === 'top'} onChange={() => handleValueChange('zOrigin', 'top')} />
                            <span>Top</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={settings.zOrigin === 'bed'} onChange={() => handleValueChange('zOrigin', 'bed')} />
                            <span>Bed</span>
                        </label>
                    </div>
                }
            />

            <SettingRow 
                label="Safe Z Height"
                description="The height where the machine moves at rapid speed without hitting anything."
                control={
                    <ControlledInput type="number" value={settings.safeZ} onChange={(e) => handleValueChange('safeZ', Number(e.target.value))} suffix={settings.units} className="w-20 h-8 text-xs" />
                }
            />

            <SettingRow 
                label="Nesting & Layout"
                description="Choose between a simple grid or optimized 'True-Shape' packing to save material."
                control={
                    <div className="flex flex-col gap-2 items-end">
                        <Select value={settings.nestingType || 'grid'} onValueChange={(val: any) => handleValueChange('nestingType', val)}>
                            <SelectTrigger className="h-8 w-32 text-[10px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="grid">Grid (Simple)</SelectItem>
                                <SelectItem value="true-shape">True-Shape Packing</SelectItem>
                            </SelectContent>
                        </Select>
                        
                        {settings.nestingType === 'true-shape' && (
                            <Button 
                                size="xs" 
                                variant="primary" 
                                onClick={() => pubsub.publish('cam:optimize-layout')}
                                className="w-full h-7 text-[9px] gap-1"
                                aria-label="Run nesting algorithm to pack shapes as tightly as possible"
                            >
                                <RefreshCcw size={12} /> Optimize Layout
                            </Button>
                        )}
                    </div>
                }
            />

            <SettingRow 
                label="Stock Thickness"
                description="The total thickness of your material. Used for depth calculations."
                control={
                    <ControlledInput type="number" value={settings.stockThickness} onChange={(e) => handleValueChange('stockThickness', Number(e.target.value))} suffix={settings.units} className="w-20 h-8 text-xs" />
                }
            />

            <SettingRow 
                label="3D Model Alignment"
                description="Align the 3D model relative to the stock material."
                control={
                    <Select value={settings.threeDAlignment || 'top'} onValueChange={(val: any) => handleValueChange('threeDAlignment', val)}>
                        <SelectTrigger className="h-8 w-24 text-[10px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="top">Top</SelectItem>
                            <SelectItem value="center">Center</SelectItem>
                            <SelectItem value="bottom">Bottom</SelectItem>
                        </SelectContent>
                    </Select>
                }
            />

            <SettingRow 
                label="3D Z-Offset"
                description="Offset the 3D model down into the stock (sub-surface)."
                control={
                    <ControlledInput type="number" value={settings.threeDZOffset || 0} onChange={(e) => handleValueChange('threeDZOffset', Number(e.target.value))} suffix={settings.units} className="w-20 h-8 text-xs" />
                }
            />

            <SettingRow 
                label="3D Visualization"
                description="Toggle stock visibility, depth heatmaps, and solid simulation."
                control={
                    <div className="flex flex-col gap-2 items-end">
                        <Select value={settings.visualTheme || 'default'} onValueChange={(val: any) => handleValueChange('visualTheme', val)}>
                            <SelectTrigger className="h-7 w-28 text-[9px]"><SelectValue placeholder="Theme" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="default">Default (RGB)</SelectItem>
                                <SelectItem value="high-contrast">High Contrast</SelectItem>
                                <SelectItem value="colorblind">Colorblind Safe</SelectItem>
                                <SelectItem value="depth-map">Depth Mapping</SelectItem>
                            </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px]">Solid Simulation</span>
                            <Switch checked={!!settings.solidSimulation} onChange={(checked) => handleValueChange('solidSimulation', checked)} />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px]">Transparent Stock</span>
                            <Switch checked={!!settings.showTransparentStock} onChange={(checked) => handleValueChange('showTransparentStock', checked)} />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px]">Depth Heatmap</span>
                            <Switch checked={!!settings.showDepthHeatmap} onChange={(checked) => handleValueChange('showDepthHeatmap', checked)} />
                        </div>
                    </div>
                }
            />

            <SettingRow 
                label="Pre-Flight Safety Checklist"
                description="Show a mandatory safety confirmation before generating G-Code. Highly recommended."
                control={
                    <Switch checked={settings.showSafetyChecklist !== false} onChange={(checked) => handleValueChange('showSafetyChecklist', checked)} />
                }
            />

            <SettingRow 
                label="Nesting Grid"
                description="Create multiple copies of your part. Spacing defines the gap."
                control={
                    <div className="flex gap-2 items-center">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 font-bold" aria-hidden="true">X:</span>
                            <ControlledInput 
                                type="number" 
                                value={settings.nestingX} 
                                onChange={(e) => handleValueChange('nestingX', Number(e.target.value))} 
                                className="w-10 h-8 text-xs" 
                                aria-label="X copies"
                            />
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 font-bold" aria-hidden="true">Y:</span>
                            <ControlledInput 
                                type="number" 
                                value={settings.nestingY} 
                                onChange={(e) => handleValueChange('nestingY', Number(e.target.value))} 
                                className="w-10 h-8 text-xs" 
                                aria-label="Y copies"
                            />
                        </div>
                        <div className="flex items-center gap-1 ml-1">
                            <span className="text-[10px] text-gray-400 font-bold" aria-hidden="true">S:</span>
                            <ControlledInput 
                                type="number" 
                                value={settings.nestingSpacing} 
                                onChange={(e) => handleValueChange('nestingSpacing', Number(e.target.value))} 
                                className="w-14 h-8 text-xs" 
                                suffix={settings.units} 
                                aria-label="Spacing"
                            />
                        </div>
                    </div>
                }
            />

            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1">Start G-Code</label>
                <p className="text-[10px] text-gray-500 italic mb-2">Custom commands to run before the job starts (e.g. M8, G53 G0 Z0).</p>
                <Textarea 
                    value={settings.startGcode} 
                    onChange={(e) => handleValueChange('startGcode', e.target.value)}
                    className="text-[10px] font-mono h-16 bg-gray-50 dark:bg-dark"
                    placeholder="Enter start G-Code..."
                />
            </div>

            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1">End G-Code</label>
                <p className="text-[10px] text-gray-500 italic mb-2">Custom commands to run after the job finishes.</p>
                <Textarea 
                    value={settings.endGcode} 
                    onChange={(e) => handleValueChange('endGcode', e.target.value)}
                    className="text-[10px] font-mono h-16 bg-gray-50 dark:bg-dark"
                    placeholder="Enter end G-Code..."
                />
            </div>

            <div className="p-3 bg-gray-50 dark:bg-dark border-t border-gray-200 dark:border-gray-700">
                <label className="text-[10px] uppercase font-bold text-gray-400 mb-2 block">Coolant Controls</label>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                        <span className="text-xs">Mist Coolant (M7)</span>
                        <Switch checked={settings.mist} onChange={(checked) => handleValueChange('mist', checked)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs">Flood Coolant (M8)</span>
                        <Switch checked={settings.flood} onChange={(checked) => handleValueChange('flood', checked)} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalSettings;
