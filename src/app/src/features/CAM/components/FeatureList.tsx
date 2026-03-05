import React, { useState } from 'react';
import { Checkbox } from '../../../components/Checkbox';
import { Button } from '../../../components/Button';
import { CAMFeature, CAMSettings, CAMPathingOption, CAMTool } from '../definitions';
import Tooltip from '../../../components/Tooltip';
import CAMAccessibility from '../utils/CAMAccessibility';
import cx from 'classnames';
import { ChevronDown, ChevronRight, CornerDownRight, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';

interface FeatureListProps {
    features: CAMFeature[];
    onToggleFeature: (id: string) => void;
    onFocusFeature?: (id: string) => void;
    onBulkToggle?: (ids: string[], selected: boolean) => void;
    onReorder: (id: string, direction: 'up' | 'down') => void;
    settings: CAMSettings;
    options: CAMPathingOption[];
    tools: CAMTool[];
    focusedIdx?: number;
}

const FeatureList = ({ features, onToggleFeature, onFocusFeature, onBulkToggle, onReorder, settings, options, tools, focusedIdx = -1 }: FeatureListProps) => {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    if (features.length === 0) {
        return <div className="p-4 text-gray-500 italic">No features detected. Upload a file to see features.</div>;
    }

    const toggleExpand = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleSelectAll = () => {
        if (onBulkToggle) {
            onBulkToggle(features.map(f => f.id), true);
        }
    };

    const handleClearAll = () => {
        if (onBulkToggle) {
            onBulkToggle(features.map(f => f.id), false);
        }
    };

    const renderFeature = (feature: CAMFeature, depth: number = 0) => {
        const isExpanded = expanded[feature.id] !== false; // Default expanded
        const hasChildren = feature.children && feature.children.length > 0;
        const childFeatures = hasChildren ? features.filter(f => feature.children!.includes(f.id)) : [];
        const isFocused = features.findIndex(f => f.id === feature.id) === focusedIdx;

        const warnings = feature.selected ? CAMAccessibility.getFeatureWarnings(feature, options, tools) : [];

        return (
            <React.Fragment key={feature.id}>
                <li 
                    onClick={() => onFocusFeature?.(feature.id)}
                    className={cx(
                        "flex items-center gap-2 p-1.5 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group cursor-pointer",
                        depth > 0 && "pl-6 bg-gray-50/30 dark:bg-black/10 text-sm",
                        isFocused && "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20 z-10"
                    )}
                >
                    {hasChildren ? (
                        <button 
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500" 
                            onClick={() => toggleExpand(feature.id)}
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                    ) : (
                        <div className="w-6 flex justify-center text-gray-300 dark:text-gray-700">
                            {depth > 0 && <CornerDownRight size={12} />}
                        </div>
                    )}
                    
                    <Checkbox
                        id={`feature-${feature.id}`}
                        checked={feature.selected}
                        onChange={() => onToggleFeature(feature.id)}
                        aria-label={`Select feature: ${feature.name} (${feature.type}). ${CAMAccessibility.getFeatureAudit(feature, settings)}`}
                    />
                    
                    <label 
                        htmlFor={`feature-${feature.id}`}
                        className="flex-1 cursor-pointer select-none flex items-center gap-2 overflow-hidden whitespace-nowrap"
                    >
                        <span className={cx("font-semibold truncate", feature.color ? "" : "")} style={{ color: feature.color }}>
                            {feature.name}
                        </span>
                        <span className="text-[10px] text-gray-400 uppercase bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded shrink-0">
                            {feature.type}
                        </span>
                        {warnings.length > 0 && (
                            <Tooltip content={(
                                <div className="flex flex-col gap-1 p-1 max-w-xs">
                                    <span className="font-bold text-red-400">Warnings Found:</span>
                                    {warnings.map((w, i) => <span key={i} className="text-[11px]">• {w}</span>)}
                                </div>
                            ) as any}>
                                <div className="text-amber-500 shrink-0 cursor-help animate-pulse">
                                    <AlertTriangle size={14} />
                                </div>
                            </Tooltip>
                        )}
                        <span className="sr-only">. {CAMAccessibility.getFeatureAudit(feature, settings)}</span>
                    </label>

                    {!feature.parentId && (
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="mini" className="h-6 w-6 p-0" onClick={() => onReorder(feature.id, 'up')} title="Move Up"><ArrowUp size={12}/></Button>
                            <Button variant="ghost" size="mini" className="h-6 w-6 p-0" onClick={() => onReorder(feature.id, 'down')} title="Move Down"><ArrowDown size={12}/></Button>
                        </div>
                    )}
                </li>
                {isExpanded && childFeatures.map(child => renderFeature(child, depth + 1))}
            </React.Fragment>
        );
    };

    const rootFeatures = [...features].filter(f => !f.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));

    return (
        <div className="flex flex-col gap-2">
            <div className="flex gap-2 p-1 bg-gray-100 dark:bg-dark-darker rounded-md">
                <Button size="xs" variant="ghost" className="flex-1 h-7 text-[10px] uppercase font-bold" onClick={handleSelectAll}>Select All</Button>
                <div className="w-px bg-gray-300 dark:bg-gray-700 h-4 self-center" />
                <Button size="xs" variant="ghost" className="flex-1 h-7 text-[10px] uppercase font-bold" onClick={handleClearAll}>Clear All</Button>
            </div>
            <ul className="flex flex-col list-none p-0 border rounded-md overflow-hidden" role="list">
                {rootFeatures.map((feature) => renderFeature(feature, 0))}
            </ul>
        </div>
    );
};

export default FeatureList;
