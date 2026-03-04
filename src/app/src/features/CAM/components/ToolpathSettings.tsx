import React from 'react';
import { CAMFeature, CAMPathingOption, CAMTool } from '../definitions';
import { ControlledInput } from '../../../components/ControlledInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/shadcn/Select';
import Switch from '../../../components/Switch';
import CAMAccessibility from '../utils/CAMAccessibility';
import { Button } from '../../../components/Button';
import { Palette, AlertTriangle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useDispatch } from 'react-redux';
import { useTypedSelector } from '../../../hooks/useTypedSelector';
import * as camActions from '../../../store/redux/slices/cam.slice';
import { v4 as uuid } from 'uuid';

interface ToolpathSettingsProps {
    features: CAMFeature[];
}

const ToolpathInputRow = ({ label, description, control, className }: { label: string, description: string, control: React.ReactNode, className?: string }) => (
    <div className={cn("flex flex-col gap-1 p-2 border-b border-gray-200 dark:border-gray-700 last:border-0", className)}>
        <div className="flex items-center justify-between gap-4">
            <label className="text-[10px] font-bold text-gray-700 dark:text-gray-300 shrink-0 uppercase tracking-tight">{label}</label>
            <div className="flex-1 flex justify-end">{control}</div>
        </div>
        <p className="text-[9px] text-gray-500 dark:text-gray-400 italic leading-tight">{description}</p>
    </div>
);

const DEFAULT_TOOLS: CAMTool[] = [
    { id: '1', name: '1/8" Endmill', type: 'Endmill', metricDiameter: 3.175, imperialDiameter: 0.125, flutes: 2, stepover: 40, stepdown: 1.5, feedrate: 1000, plungeRate: 300, spindleRPM: 18000, toolLength: 30 },
    { id: '2', name: '1/4" Endmill', type: 'Endmill', metricDiameter: 6.35, imperialDiameter: 0.25, flutes: 2, stepover: 40, stepdown: 3, feedrate: 1500, plungeRate: 400, spindleRPM: 16000, toolLength: 35 },
    { id: '3', name: '60deg V-Bit', type: 'V-Bit', metricDiameter: 6.35, imperialDiameter: 0.25, flutes: 1, stepover: 10, stepdown: 1, feedrate: 800, plungeRate: 200, spindleRPM: 20000, toolLength: 25, angle: 60 },
];

const ToolpathSettings = ({ features }: ToolpathSettingsProps) => {
    const dispatch = useDispatch();
    const { pathingOptions: options, tools, settings } = useTypedSelector(state => state.cam);
    const allTools = [...DEFAULT_TOOLS, ...tools];

    const boundsMap = React.useMemo(() => {
        const map = new Map();
        features.forEach(f => {
            if (!f.points || f.points.length === 0) return;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            f.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
            map.set(f.id, { minX, maxX, minY, maxY });
        });
        return map;
    }, [features]);

    const getOptionForFeature = (featureId: string) => {
        const feature = features.find(f => f.id === featureId);
        const existing = Array.isArray(options) ? options.find(o => o.featureId === featureId) : undefined;
        return existing || {
            id: uuid(),
            featureId,
            type: feature?.isFace ? 'pocket' : feature?.isEdge ? 'on-line' : 'outside',
            depth: feature?.cylinderRadius ? feature.cylinderRadius * 2 : settings.stockThickness,
            toolId: '1',
            helicalBoring: !!feature?.cylinderRadius,
            tabs: { enabled: false, count: 4, width: 5, height: 2 }
        };
    };

    const handleOptionChange = (featureId: string, updates: any) => {
        const existing = (Array.isArray(options) ? options.find(o => o.featureId === featureId) : undefined) || getOptionForFeature(featureId);
        
        const deepMerge = (target: any, source: any) => {
            const output = { ...target };
            Object.keys(source).forEach(key => {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    output[key] = deepMerge(target[key] || {}, source[key]);
                } else {
                    output[key] = source[key];
                }
            });
            return output;
        };

        const updatedOption = deepMerge(existing, updates);
        dispatch(camActions.updatePathing(updatedOption));
        dispatch(camActions.pushToHistory());
    };

    const applyBulkColorStrategy = (color: string) => {
        const matchingFeatures = features.filter(f => f.color === color);
        if (matchingFeatures.length === 0) return;
        
        const firstMatch = getOptionForFeature(matchingFeatures[0].id);
        const newOptions = [...options];
        
        matchingFeatures.forEach(f => {
            const idx = newOptions.findIndex(o => o.featureId === f.id);
            if (idx > -1) {
                newOptions[idx] = { ...newOptions[idx], type: firstMatch.type, toolId: firstMatch.toolId, depth: firstMatch.depth };
            } else {
                newOptions.push({ ...firstMatch, featureId: f.id, id: uuid() });
            }
        });
        dispatch(camActions.setPathingOptions(newOptions));
        dispatch(camActions.pushToHistory());
    };

    if (features.length === 0) {
        return <div className="p-4 text-gray-500 italic">Select features in the left panel to configure toolpaths.</div>;
    }

    const uniqueColors = Array.from(new Set(features.map(f => f.color).filter(Boolean))) as string[];

    return (
        <div className="flex flex-col gap-6 p-2">
            {uniqueColors.length > 0 && (
                <div className="p-3 border rounded bg-blue-50 dark:bg-blue-900/20 mb-2">
                    <label className="text-[10px] font-bold uppercase text-blue-500 dark:text-blue-400 flex items-center gap-1 mb-1">
                        <Palette size={12} /> Color Mapping (Bulk Apply)
                    </label>
                    <p className="text-[9px] text-blue-500 dark:text-blue-300 italic mb-3 leading-tight">Apply the first matching feature's strategy to all other features of the same color.</p>
                    <div className="flex flex-wrap gap-2">
                        {uniqueColors.map(color => (
                            <Button 
                                key={color} 
                                onClick={() => applyBulkColorStrategy(color)}
                                variant="outline" 
                                size="mini"
                                className="h-6 text-[9px] flex items-center gap-1 border-gray-300"
                                title={`Apply first feature's strategy to all ${color} features`}
                            >
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                Match {color}
                            </Button>
                        ))}
                    </div>
                </div>
            )}

            {features.map((feature) => {
                const option = getOptionForFeature(feature.id);
                const tool = allTools.find(t => t.id === option.toolId);
                const fitWarning = tool ? CAMAccessibility.checkFit(feature, option, tool) : null;

                return (
                    <div 
                        key={feature.id} 
                        className="border p-3 rounded-md bg-gray-50 dark:bg-gray-900 shadow-sm"
                        role="group"
                        aria-labelledby={`toolpath-title-${feature.id}`}
                    >
                        <div className="flex justify-between items-start mb-3">
                            <h3 id={`toolpath-title-${feature.id}`} className="text-sm font-bold flex items-center gap-2">
                                {feature.color && <div className="w-3 h-3 rounded-full border border-gray-400" style={{ backgroundColor: feature.color }} />}
                                {feature.name}
                            </h3>
                            <span className="sr-only">{CAMAccessibility.getFeatureAudit(feature, settings)}</span>
                        </div>

                        {fitWarning && (
                            <div className="mb-3 p-2 bg-red-100 text-red-700 text-[10px] rounded border border-red-200" aria-live="polite">
                                {fitWarning}
                            </div>
                        )}

                        {option.type === 'inside' && !option.tabs?.enabled && (
                            <div className="mb-3 p-2 bg-orange-100 text-orange-800 text-[10px] rounded border border-orange-200 flex items-start gap-2">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <span>Safety Warning: An 'Inside' profile cut will completely free the center material. Please secure the center piece or enable Holding Tabs below.</span>
                            </div>
                        )}

                        {option.type === 'pocket' && features.some(other => {
                            if (other.id === feature.id) return false;
                            const fb = boundsMap.get(feature.id);
                            const ob = boundsMap.get(other.id);
                            if (!fb || !ob) return false;
                            return ob.minX > fb.minX && ob.maxX < fb.maxX && ob.minY > fb.minY && ob.maxY < fb.maxY;
                        }) && (
                            <div className="mb-3 p-2 bg-yellow-100 text-yellow-800 text-[10px] rounded border border-yellow-200 flex items-start gap-2">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <span>Island Detected: This pocket contains inner features. If you mill those features later, they may become loose projectiles. Plan to use holding tabs on inner cuts.</span>
                            </div>
                        )}
                        
                        <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                            <ToolpathInputRow 
                                label="Cut Type" 
                                description="Machining strategy: Inside/Outside (profile offset), Pocket (clear area), On-Line (follow path), V-Carve (decorative carving), or 3D Raster (relief surface)." 
                                control={
                                    <Select value={option.type} onValueChange={(val: any) => handleOptionChange(feature.id, { type: val })}>
                                        <SelectTrigger id={`cut-type-${feature.id}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {feature.isFace && (
                                                <>
                                                    <SelectItem value="pocket">Face Pocketing</SelectItem>
                                                    <SelectItem value="3d-raster">3D Face Raster</SelectItem>
                                                </>
                                            )}
                                            {feature.isEdge && (
                                                <>
                                                    <SelectItem value="on-line">Follow Edge (On Line)</SelectItem>
                                                    <SelectItem value="outside">Outside Profile</SelectItem>
                                                    <SelectItem value="inside">Inside Profile</SelectItem>
                                                </>
                                            )}
                                            {!feature.isFace && !feature.isEdge && (
                                                <>
                                                    <SelectItem value="outside">Outside</SelectItem>
                                                    <SelectItem value="inside">Inside</SelectItem>
                                                    <SelectItem value="pocket">Pocket</SelectItem>
                                                    <SelectItem value="on-line">On Line</SelectItem>
                                                    <SelectItem value="3d-raster">3D Raster</SelectItem>
                                                    <SelectItem value="v-carve">V-Carve</SelectItem>
                                                    <SelectItem value="v-carve-inlay">V-Carve Inlay</SelectItem>
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                } 
                            />

                            <ToolpathInputRow 
                                label="Tool" 
                                description="Select the physical bit from your database for this operation." 
                                control={
                                    <Select value={option.toolId} onValueChange={(val: any) => handleOptionChange(feature.id, { toolId: val })}>
                                        <SelectTrigger id={`tool-select-${feature.id}`} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>{allTools.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                } 
                            />

                            <ToolpathInputRow 
                                label="Depth" 
                                description="Total depth of the cut. Usually matched to stock thickness for cutouts." 
                                control={
                                    <ControlledInput id={`depth-input-${feature.id}`} type="number" value={option.depth} onChange={(e) => handleOptionChange(feature.id, { depth: Number(e.target.value) })} className="h-8 text-xs" />
                                } 
                            />
                        </div>

                        {(option.type === 'v-carve' || option.type === 'v-carve-inlay') && (
                            <div className="mt-3 bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <ToolpathInputRow 
                                    label="Flat Depth" 
                                    description="Stop carving at this depth to create a flat bottom pocket (optional)." 
                                    control={<ControlledInput type="number" value={option.vCarveFlatDepth || option.depth} onChange={(e) => handleOptionChange(feature.id, { vCarveFlatDepth: Number(e.target.value) })} className="h-7 text-xs" />} 
                                />
                                {option.type === 'v-carve-inlay' && (
                                    <>
                                        <ToolpathInputRow 
                                            label="Inlay Mode" 
                                            description="Select 'Female' for the hole or 'Male' for the insert plug." 
                                            control={
                                                <Select value={option.vCarveInlay?.mode || 'female-pocket'} onValueChange={(val: any) => handleOptionChange(feature.id, { vCarveInlay: { mode: val, startDepth: option.vCarveInlay?.startDepth || 0 } })}>
                                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="female-pocket">Female (Pocket)</SelectItem>
                                                        <SelectItem value="male-plug">Male (Plug)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            } 
                                        />
                                        {option.vCarveInlay?.mode === 'male-plug' && (
                                            <ToolpathInputRow 
                                                label="Start Depth (Offset)" 
                                                description="How deep to start the plug profile (usually 1-2mm) to leave space for glue." 
                                                control={<ControlledInput type="number" value={option.vCarveInlay.startDepth} onChange={(e) => handleOptionChange(feature.id, { vCarveInlay: { ...option.vCarveInlay!, startDepth: Number(e.target.value) } })} className="h-7 text-xs" />} 
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {feature.type === 'hole' && option.type === 'inside' && (
                            <div className="mt-3 bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <ToolpathInputRow 
                                    label="Helical" 
                                    description="Ramp down in a continuous spiral rather than vertical plunges." 
                                    control={<Switch id={`helical-boring-${feature.id}`} checked={!!option.helicalBoring} onChange={(checked) => handleOptionChange(feature.id, { helicalBoring: checked })} />} 
                                />
                            </div>
                        )}

                        {(option.type === 'inside' || option.type === 'outside') && (
                            <fieldset className="mt-3 bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <legend className="sr-only">Advanced Moves</legend>
                                <ToolpathInputRow 
                                    label="Lead-In Type" 
                                    description="Smoothly enter the material using an arc or ramp to avoid dwell marks." 
                                    control={
                                        <Select value={option.leadIn?.type || 'none'} onValueChange={(val: any) => handleOptionChange(feature.id, { leadIn: { ...(option.leadIn || { distance: 5 }), type: val as any } })}>
                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                <SelectItem value="linear">Linear</SelectItem>
                                                <SelectItem value="arc">Arc</SelectItem>
                                                <SelectItem value="helical">Helical</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    } 
                                />
                                {option.leadIn && option.leadIn.type !== 'none' && (
                                    <ToolpathInputRow 
                                        label="Entry Dist" 
                                        description="The radius or distance used for the lead-in move." 
                                        control={<ControlledInput type="number" value={option.leadIn.distance} onChange={(e) => handleOptionChange(feature.id, { leadIn: { ...option.leadIn!, distance: Number(e.target.value) } })} className="h-7 text-xs" />} 
                                    />
                                )}

                                <ToolpathInputRow 
                                    label="Joinery Fillet" 
                                    description="Add 'Dogbones' to internal corners so square parts can fit inside." 
                                    control={
                                        <Select value={option.dogbones?.enabled ? option.dogbones.type : 'none'} onValueChange={(val: any) => handleOptionChange(feature.id, { dogbones: val === 'none' ? { enabled: false, type: 'dogbone' } : { enabled: true, type: val as any, toolDiameterOffset: 0.1 } })}>
                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                <SelectItem value="dogbone">Dogbone</SelectItem>
                                                <SelectItem value="t-bone">T-Bone</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    } 
                                />
                                {option.dogbones?.enabled && (
                                    <ToolpathInputRow 
                                        label="Overcut" 
                                        description="The extra distance to cut into the corner (usually 0.1mm)." 
                                        control={<ControlledInput type="number" step="0.1" value={option.dogbones.toolDiameterOffset || 0.1} onChange={(e) => handleOptionChange(feature.id, { dogbones: { ...option.dogbones!, toolDiameterOffset: Number(e.target.value) } })} className="h-7 text-xs" />} 
                                    />
                                )}

                                <ToolpathInputRow 
                                    label="Holding Tabs" 
                                    description="Leave small bridges of material to keep the part attached to the stock." 
                                    control={<Switch id={`tabs-toggle-${feature.id}`} checked={option.tabs?.enabled || false} onChange={(checked) => handleOptionChange(feature.id, { tabs: { ...(option.tabs || { count: 4, width: 5, height: 2, smartTabs: true }), enabled: checked } })} />} 
                                />
                                {option.tabs?.enabled && (
                                    <div className="grid grid-cols-4 gap-2 p-2 bg-gray-50/50 dark:bg-black/20">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Count</label>
                                            <ControlledInput id={`tabs-count-${feature.id}`} type="number" value={option.tabs.count} onChange={(e) => handleOptionChange(feature.id, { tabs: { ...option.tabs!, count: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Width</label>
                                            <ControlledInput id={`tabs-width-${feature.id}`} type="number" value={option.tabs.width} onChange={(e) => handleOptionChange(feature.id, { tabs: { ...option.tabs!, width: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Height</label>
                                            <ControlledInput id={`tabs-height-${feature.id}`} type="number" value={option.tabs.height} onChange={(e) => handleOptionChange(feature.id, { tabs: { ...option.tabs!, height: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                        <div className="flex flex-col gap-1 items-center justify-center pt-3">
                                            <label className="flex items-center gap-1 text-[9px] font-bold cursor-pointer" title="Place tabs on straightest edges automatically">
                                                <Switch checked={!!option.tabs.smartTabs} onChange={(checked) => handleOptionChange(feature.id, { tabs: { ...option.tabs!, smartTabs: checked } })} />
                                                Smart
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </fieldset>
                        )}

                        {option.type === '3d-raster' && (
                            <fieldset className="mt-3 bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <legend className="sr-only">3D Finishing Strategy</legend>
                                <ToolpathInputRow 
                                    label="3D Strategy" 
                                    description="Direction of the finishing toolpath (e.g. Raster X moves side-to-side)." 
                                    control={
                                        <Select value={option.threeDStrategy || 'raster-x'} onValueChange={(val: any) => handleOptionChange(feature.id, { threeDStrategy: val as any })}>
                                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="raster-x">Raster X</SelectItem>
                                                <SelectItem value="raster-y">Raster Y</SelectItem>
                                                <SelectItem value="cross-hatch">Cross-Hatch</SelectItem>
                                                <SelectItem value="waterline">Waterline</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    } 
                                />
                                <ToolpathInputRow 
                                    label="Adaptive" 
                                    description="Automatically tighten stepover on steep slopes to maintain detail." 
                                    control={<Switch checked={!!option.threeDAdaptiveStepover} onChange={(checked) => handleOptionChange(feature.id, { threeDAdaptiveStepover: checked })} />} 
                                />
                                
                                <ToolpathInputRow 
                                    label="Boundary" 
                                    description="Contain the 3D machining within another 2D feature's area." 
                                    control={
                                        <Select value={option.threeDBoundaryId || 'none'} onValueChange={(val: any) => handleOptionChange(feature.id, { threeDBoundaryId: val === 'none' ? undefined : val })}>
                                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">None</SelectItem>
                                                {features.filter(f => f.id !== feature.id && f.type !== 'mesh').map(f => (
                                                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    } 
                                />

                                <ToolpathInputRow 
                                    label="3D Roughing" 
                                    description="Remove bulk material in slices with a larger tool before finishing." 
                                    control={<Switch checked={!!option.threeDRoughing?.enabled} onChange={(checked) => handleOptionChange(feature.id, { threeDRoughing: { enabled: checked, toolId: option.threeDRoughing?.toolId || allTools[0].id, stepdown: option.threeDRoughing?.stepdown || 2, stockToLeave: option.threeDRoughing?.stockToLeave || 0.5 } })} />} 
                                />
                                {option.threeDRoughing?.enabled && (
                                    <div className="grid grid-cols-3 gap-2 p-2 bg-gray-50/50 dark:bg-black/20">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Rough Tool</label>
                                            <Select value={option.threeDRoughing.toolId} onValueChange={(val: any) => handleOptionChange(feature.id, { threeDRoughing: { ...option.threeDRoughing!, toolId: val } })}>
                                                <SelectTrigger className="h-7 text-[9px]"><SelectValue /></SelectTrigger>
                                                <SelectContent>{allTools.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                                            </Select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Stepdown</label>
                                            <ControlledInput type="number" value={option.threeDRoughing.stepdown} onChange={(e) => handleOptionChange(feature.id, { threeDRoughing: { ...option.threeDRoughing!, stepdown: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Leave Stock</label>
                                            <ControlledInput type="number" value={option.threeDRoughing.stockToLeave} onChange={(e) => handleOptionChange(feature.id, { threeDRoughing: { ...option.threeDRoughing!, stockToLeave: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                    </div>
                                )}

                                <ToolpathInputRow 
                                    label="Rest Machine" 
                                    description="Only machine tight areas that the previous (larger) tool couldn't reach." 
                                    control={<Switch checked={!!option.threeDRestMachining?.enabled} onChange={(checked) => handleOptionChange(feature.id, { threeDRestMachining: { enabled: checked, previousToolId: option.threeDRestMachining?.previousToolId || allTools[0].id } })} />} 
                                />
                                {option.threeDRestMachining?.enabled && (
                                    <div className="p-2 bg-gray-50/50 dark:bg-black/20 flex flex-col gap-1">
                                        <label className="text-[9px] font-bold">Previous Tool</label>
                                        <Select value={option.threeDRestMachining.previousToolId} onValueChange={(val: any) => handleOptionChange(feature.id, { threeDRestMachining: { ...option.threeDRestMachining!, previousToolId: val } })}>
                                            <SelectTrigger className="h-7 text-[9px]"><SelectValue /></SelectTrigger>
                                            <SelectContent>{allTools.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <ToolpathInputRow 
                                    label="3D Tabs" 
                                    description="Automated 3D bridges to keep the model attached to the stock." 
                                    control={<Switch checked={!!option.threeDTabs?.enabled} onChange={(checked) => handleOptionChange(feature.id, { threeDTabs: { enabled: checked, count: option.threeDTabs?.count || 4, width: option.threeDTabs?.width || 5, height: option.threeDTabs?.height || 2 } })} />} 
                                />
                                {option.threeDTabs?.enabled && (
                                    <div className="grid grid-cols-3 gap-2 p-2 bg-gray-50/50 dark:bg-black/20">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Count</label>
                                            <ControlledInput type="number" value={option.threeDTabs.count} onChange={(e) => handleOptionChange(feature.id, { threeDTabs: { ...option.threeDTabs!, count: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Width</label>
                                            <ControlledInput type="number" value={option.threeDTabs.width} onChange={(e) => handleOptionChange(feature.id, { threeDTabs: { ...option.threeDTabs!, width: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold">Height</label>
                                            <ControlledInput type="number" value={option.threeDTabs.height} onChange={(e) => handleOptionChange(feature.id, { threeDTabs: { ...option.threeDTabs!, height: Number(e.target.value) } })} className="h-7 text-xs" />
                                        </div>
                                    </div>
                                )}
                            </fieldset>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ToolpathSettings;
