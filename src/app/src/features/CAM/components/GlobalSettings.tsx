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
import { useDispatch } from 'react-redux';
import { useTypedSelector } from '../../../hooks/useTypedSelector';
import * as camActions from '../../../store/redux/slices/cam.slice';

interface GlobalSettingsProps {
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

const SectionHeader = ({ title }: { title: string }) => (
    <div className="bg-gray-100 dark:bg-dark p-2 px-3 border-y border-gray-200 dark:border-gray-700">
        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{title}</h4>
    </div>
);

const GlobalSettings = ({ designBounds }: GlobalSettingsProps) => {
    const dispatch = useDispatch();
    const settings = useTypedSelector(state => state.cam.settings);

    const handleValueChange = (key: keyof CAMSettings, value: any) => {
        dispatch(camActions.updateSettings({ [key]: value }));
        dispatch(camActions.pushToHistory());
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
            
            <SectionHeader title="Material & Stock" />
            <SettingRow 
                label="Units"
                description="Metric (mm) or Imperial (inches) for all dimensions."
                control={
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold">
                            <input type="radio" checked={settings.units === 'mm'} onChange={() => handleValueChange('units', 'mm')} className="accent-blue-500" />
                            <span>mm</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold">
                            <input type="radio" checked={settings.units === 'inch'} onChange={() => handleValueChange('units', 'inch')} className="accent-blue-500" />
                            <span>in</span>
                        </label>
                    </div>
                }
            />
            <SettingRow 
                label="Stock Size"
                description="The physical dimensions of your material board."
                control={
                    <div className="flex gap-2">
                        <ControlledInput type="number" value={settings.stockWidth} onChange={(e) => handleValueChange('stockWidth', Number(e.target.value))} className="w-14 h-8 text-xs" suffix="W" />
                        <ControlledInput type="number" value={settings.stockLength} onChange={(e) => handleValueChange('stockLength', Number(e.target.value))} className="w-14 h-8 text-xs" suffix="L" />
                        <ControlledInput type="number" value={settings.stockThickness} onChange={(e) => handleValueChange('stockThickness', Number(e.target.value))} className="w-14 h-8 text-xs" suffix="T" />
                    </div>
                }
            />
            <SettingRow 
                label="Z-Zero Origin"
                description="Where Z=0 is located. 'Top' is surface; 'Bed' is wasteboard."
                control={
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={settings.zOrigin === 'top'} onChange={() => handleValueChange('zOrigin', 'top')} className="accent-blue-500" />
                            <span className="font-bold">Top</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" checked={settings.zOrigin === 'bed'} onChange={() => handleValueChange('zOrigin', 'bed')} className="accent-blue-500" />
                            <span className="font-bold">Bed</span>
                        </label>
                    </div>
                }
            />

            <SectionHeader title="Layout & Scaling" />
            <SettingRow 
                label="Design Scaling"
                description="Adjust the part size. 'Fit' maximizes within stock."
                control={
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
                }
            />
            <SettingRow 
                label="Nesting Strategy"
                description="Choose between a grid or material-saving True-Shape packing."
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
                            <Button size="xs" variant="primary" onClick={() => pubsub.publish('cam:optimize-layout')} className="w-full h-7 text-[9px] gap-1">
                                <RefreshCcw size={12} /> Pack Shapes
                            </Button>
                        )}
                    </div>
                }
            />
            {settings.nestingType === 'grid' && (
                <SettingRow 
                    label="Grid Array"
                    description="X/Y copies and the spacing between them."
                    control={
                        <div className="flex gap-2 items-center">
                            <ControlledInput type="number" value={settings.nestingX} onChange={(e) => handleValueChange('nestingX', Number(e.target.value))} className="w-10 h-8 text-xs" suffix="X" />
                            <ControlledInput type="number" value={settings.nestingY} onChange={(e) => handleValueChange('nestingY', Number(e.target.value))} className="w-10 h-8 text-xs" suffix="Y" />
                            <ControlledInput type="number" value={settings.nestingSpacing} onChange={(e) => handleValueChange('nestingSpacing', Number(e.target.value))} className="w-14 h-8 text-xs" suffix="Gap" />
                        </div>
                    }
                />
            )}

            <SectionHeader title="Machining Strategy" />
            <SettingRow 
                label="Milling Side"
                description="Select which side you are currently milling. 'Bottom' mirrors the design."
                control={
                    <div className="flex gap-1">
                        <Button variant={settings.millingSide === 'top' ? 'primary' : 'outline'} size="mini" onClick={() => handleValueChange('millingSide', 'top')} className="text-[10px] h-7">Top</Button>
                        <Button variant={settings.millingSide === 'bottom' ? 'primary' : 'outline'} size="mini" onClick={() => handleValueChange('millingSide', 'bottom')} className="text-[10px] h-7">Bottom</Button>
                    </div>
                }
            />
            <SettingRow 
                label="Safe Z Height"
                description="Retract height for rapid moves between features."
                control={<ControlledInput type="number" value={settings.safeZ} onChange={(e) => handleValueChange('safeZ', Number(e.target.value))} suffix={settings.units} className="w-20 h-8 text-xs" />}
            />
            <SettingRow 
                label="Path Optimization"
                description="Minimize 'jogging' distance between operations."
                control={<Switch checked={settings.optimizePath} onChange={(checked) => handleValueChange('optimizePath', checked)} />}
            />
            <SettingRow 
                label="Stay-Down Rapids"
                description="Keep bit low during short moves to save time."
                control={
                    <div className="flex flex-col gap-2 items-end">
                        <Switch checked={!!settings.stayDownRapids?.enabled} onChange={(checked) => handleValueChange('stayDownRapids', { enabled: checked, maxDistance: settings.stayDownRapids?.maxDistance || 20, skimHeight: settings.stayDownRapids?.skimHeight || 1 })} />
                        {settings.stayDownRapids?.enabled && (
                            <div className="flex items-center gap-2">
                                <span className="text-[9px] text-gray-400">Max: {settings.stayDownRapids.maxDistance}</span>
                                <span className="text-[9px] text-gray-400">Skim: {settings.stayDownRapids.skimHeight}</span>
                            </div>
                        )}
                    </div>
                }
            />
            <SettingRow 
                label="Collision Detection"
                description="Warn if the collet will hit stock during deep cuts."
                control={<Switch checked={!!settings.collisionDetection?.enabled} onChange={(checked) => handleValueChange('collisionDetection', { enabled: checked, colletDiameter: 15, colletLength: 20 })} />}
            />

            <SectionHeader title="Machine & Output" />
            <SettingRow 
                label="Post-Processor"
                description="G-Code syntax standard for your controller."
                control={
                    <Select value={settings.postProcessor || 'grbl'} onValueChange={(val: any) => handleValueChange('postProcessor', val)}>
                        <SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="grbl">GRBL</SelectItem>
                            <SelectItem value="grblhal">grblHAL</SelectItem>
                            <SelectItem value="marlin">Marlin</SelectItem>
                        </SelectContent>
                    </Select>
                }
            />
            <div className="p-3 bg-gray-50 dark:bg-dark/20">
                <label className="text-[10px] uppercase font-bold text-gray-400 mb-2 block">Coolant & Spindle</label>
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs">Mist (M7)</span>
                        <Switch checked={settings.mist} onChange={(checked) => handleValueChange('mist', checked)} />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-xs">Flood (M8)</span>
                        <Switch checked={settings.flood} onChange={(checked) => handleValueChange('flood', checked)} />
                    </div>
                </div>
            </div>
            <div className="p-3">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1">Start G-Code</label>
                <Textarea value={settings.startGcode} onChange={(e) => handleValueChange('startGcode', e.target.value)} className="text-[10px] font-mono h-12 bg-gray-50 dark:bg-dark" placeholder="G53 G0 Z0..." />
            </div>
            <div className="p-3">
                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 block mb-1">End G-Code</label>
                <Textarea value={settings.endGcode} onChange={(e) => handleValueChange('endGcode', e.target.value)} className="text-[10px] font-mono h-12 bg-gray-50 dark:bg-dark" placeholder="M5; G53 G0 Z0..." />
            </div>

            <SectionHeader title="3D Visualization" />
            <SettingRow 
                label="Theme"
                description="Visualizer color scheme and transparency."
                control={
                    <Select value={settings.visualTheme || 'default'} onValueChange={(val: any) => handleValueChange('visualTheme', val)}>
                        <SelectTrigger className="h-7 w-28 text-[9px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="default">Default (RGB)</SelectItem>
                            <SelectItem value="high-contrast">High Contrast</SelectItem>
                            <SelectItem value="depth-map">Depth Mapping</SelectItem>
                        </SelectContent>
                    </Select>
                }
            />
            <SettingRow 
                label="Solid Simulation"
                description="Preview material removal during simulation."
                control={<Switch checked={!!settings.solidSimulation} onChange={(checked) => handleValueChange('solidSimulation', checked)} />}
            />

            <SectionHeader title="Output Control" />
            <SettingRow 
                label="Split Export by Tool"
                description="Save multiple files instead of one if using different tools."
                control={<Switch checked={!!settings.exportSplitByTool} onChange={(checked) => handleValueChange('exportSplitByTool', checked)} />}
            />
            <SettingRow 
                label="Include Comments"
                description="Embed descriptive comments and feature names in G-Code."
                control={<Switch checked={settings.gcodeComments !== false} onChange={(checked) => handleValueChange('gcodeComments', checked)} />}
            />
            <SettingRow 
                label="Line Numbers"
                description="Prefix each G-Code line with an 'N' number (N10, N20...)."
                control={<Switch checked={!!settings.gcodeLineNumbers} onChange={(checked) => handleValueChange('gcodeLineNumbers', checked)} />}
            />

            <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-900/10">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-blue-600 dark:text-blue-400">Pre-Flight Safety Checklist</label>
                    <Switch checked={settings.showSafetyChecklist !== false} onChange={(checked) => handleValueChange('showSafetyChecklist', checked)} />
                </div>
            </div>
        </div>
    );
};

export default GlobalSettings;
