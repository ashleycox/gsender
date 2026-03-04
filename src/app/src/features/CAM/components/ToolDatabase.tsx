import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CAMTool } from '../definitions';
import { ControlledInput } from '../../../components/ControlledInput';
import { Button } from '../../../components/Button';
import { Trash2, Plus, Search, ChevronLeft, ChevronRight, Download, Upload } from 'lucide-react';
import store from '../../../store';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/shadcn/Select';
import { saveAsDialog } from '../../../lib/file-save';
import { toast } from '../../../lib/toaster';
import { useDispatch } from 'react-redux';
import { useTypedSelector } from '../../../hooks/useTypedSelector';
import * as camActions from '../../../store/redux/slices/cam.slice';
import { v4 as uuid } from 'uuid';
import { Confirm } from '../../../components/ConfirmationDialog/ConfirmationDialogLib';

const ToolDatabase = () => {
    const dispatch = useDispatch();
    const tools = useTypedSelector(state => state.cam.tools);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(() => store.get('cam.toolsPerPage', 5));
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        store.set('cam.toolsPerPage', itemsPerPage);
    }, [itemsPerPage]);

    const filteredTools = useMemo(() => {
        return tools.filter(tool => 
            (tool.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (tool.type || '').toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [tools, searchQuery]);

    const totalPages = Math.ceil(filteredTools.length / itemsPerPage);
    const paginatedTools = filteredTools.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleAddTool = () => {
        const newTool: CAMTool = {
            id: uuid(),
            name: 'New Tool',
            type: 'Endmill',
            metricDiameter: 3.175,
            imperialDiameter: 0.125,
            flutes: 2,
            stepover: 40,
            stepdown: 1.5,
            feedrate: 1000,
            plungeRate: 300,
            spindleRPM: 18000,
            toolLength: 30,
            angle: 0
        };
        dispatch(camActions.setTools([...tools, newTool]));
        setCurrentPage(1); 
    };

    const handleUpdateTool = (id: string, updates: Partial<CAMTool>) => {
        dispatch(camActions.setTools(tools.map(t => t.id === id ? { ...t, ...updates } : t)));
    };

    const handleRemoveTool = (id: string) => {
        dispatch(camActions.setTools(tools.filter(t => t.id !== id)));
    };

    const handleExportTools = async () => {
        const blob = new Blob([JSON.stringify(tools, null, 2)], { type: 'application/json' });
        const success = await saveAsDialog(
            blob,
            'gsender-cam-tools.json',
            [{ description: 'Tool Database', accept: { 'application/json': ['.json'] } }]
        );
        if (success) toast.success('Tool database exported.');
    };

    const handleImportTools = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedTools = JSON.parse(event.target?.result as string) as CAMTool[];
                if (!Array.isArray(importedTools)) throw new Error('Invalid format');

                Confirm({
                    title: 'Import Tools',
                    content: 'Do you want to MERGE with existing tools or REPLACE the entire database?',
                    confirmLabel: 'Merge',
                    cancelLabel: 'Replace',
                    onConfirm: () => {
                        const existingNames = new Set(tools.map(t => (t.name || '').toLowerCase()));
                        const uniqueNew = importedTools.filter(t => t.name && !existingNames.has(t.name.toLowerCase()));
                        dispatch(camActions.setTools([...tools, ...uniqueNew]));
                        toast.success(`Merged ${uniqueNew.length} new tools.`);
                    },
                    onClose: () => {
                        // Using 'onClose' here as the 'Cancel' (Replace) handler 
                        // if we want to follow gSender's ConfirmationDialogLib pattern
                        dispatch(camActions.setTools(importedTools));
                        toast.success('Tool database replaced.');
                    }
                });
            } catch (err) {
                toast.error('Failed to import tools. Invalid file format.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    return (
        <div className="flex flex-col h-full gap-4 p-2">
            <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                    <Button onClick={handleExportTools} variant="outline" size="sm" className="flex items-center gap-2">
                        <Download size={14} /> Export
                    </Button>
                    <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm" className="flex items-center gap-2">
                        <Upload size={14} /> Import
                    </Button>
                    <input type="file" ref={fileInputRef} onChange={handleImportTools} accept=".json" className="hidden" />
                </div>

                <Button onClick={handleAddTool} className="flex items-center gap-2 w-full justify-center">
                    <Plus size={16} aria-hidden="true" /> Add Custom Tool
                </Button>
                
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} aria-hidden="true" />
                        <ControlledInput
                            placeholder="Search tools..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            className="pl-8 h-9 text-sm w-full"
                            aria-label="Search tools in database"
                        />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Select 
                            value={String(itemsPerPage)} 
                            onValueChange={(val: any) => {
                                setItemsPerPage(Number(val));
                                setCurrentPage(1);
                            }}
                        >
                            <SelectTrigger className="h-9 w-16 text-xs px-2">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="5">5</SelectItem>
                                <SelectItem value="10">10</SelectItem>
                                <SelectItem value="25">25</SelectItem>
                                <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3">
                {paginatedTools.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm italic">
                        {searchQuery ? 'No tools match your search.' : 'No tools in database.'}
                    </div>
                ) : (
                    paginatedTools.map((tool) => (
                        <div key={tool.id} className="border p-3 rounded-md bg-gray-50 dark:bg-gray-900 shadow-sm" role="region" aria-label={`Tool: ${tool.name}`}>
                            <div className="flex justify-between items-start mb-2 gap-2">
                                <div className="flex flex-col flex-1 gap-1">
                                    <ControlledInput
                                        value={tool.name}
                                        onChange={(e) => handleUpdateTool(tool.id, { name: e.target.value })}
                                        className="font-bold bg-transparent border-none p-0 h-auto w-full text-sm focus:ring-0"
                                        aria-label="Tool Name"
                                    />
                                    <Select 
                                        value={tool.type} 
                                        onValueChange={(val: any) => handleUpdateTool(tool.id, { type: val as any })}
                                    >
                                        <SelectTrigger className="h-6 w-24 text-[10px] p-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Endmill">Endmill</SelectItem>
                                            <SelectItem value="Ballnose">Ballnose</SelectItem>
                                            <SelectItem value="V-Bit">V-Bit</SelectItem>
                                            <SelectItem value="D-Bit">D-Bit</SelectItem>
                                            <SelectItem value="Laser">Laser</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <Button 
                                    onClick={() => handleRemoveTool(tool.id)}
                                    className="p-1 h-auto bg-transparent text-red-500 hover:bg-red-100 shrink-0"
                                    aria-label={`Remove tool: ${tool.name}`}
                                    title="Remove Tool"
                                >
                                    <Trash2 size={16} aria-hidden="true" />
                                </Button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                                <div className="flex flex-col">
                                    <label className="text-gray-400 uppercase font-bold mb-0.5">Diameter</label>
                                    <ControlledInput type="number" value={tool.metricDiameter} onChange={(e) => handleUpdateTool(tool.id, { metricDiameter: Number(e.target.value) })} className="h-7 text-xs" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-400 uppercase font-bold mb-0.5">Length</label>
                                    <ControlledInput type="number" value={tool.toolLength} onChange={(e) => handleUpdateTool(tool.id, { toolLength: Number(e.target.value) })} className="h-7 text-xs" />
                                </div>
                                {(tool.type === 'V-Bit' || tool.type === 'D-Bit') && (
                                    <div className="flex flex-col">
                                        <label className="text-gray-400 uppercase font-bold mb-0.5">Angle (°)</label>
                                        <ControlledInput type="number" value={tool.angle || 0} onChange={(e) => handleUpdateTool(tool.id, { angle: Number(e.target.value) })} className="h-7 text-xs" />
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <label className="text-gray-400 uppercase font-bold mb-0.5">Stepdown</label>
                                    <ControlledInput type="number" value={tool.stepdown} onChange={(e) => handleUpdateTool(tool.id, { stepdown: Number(e.target.value) })} className="h-7 text-xs" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-400 uppercase font-bold mb-0.5">Feedrate</label>
                                    <ControlledInput type="number" value={tool.feedrate} onChange={(e) => handleUpdateTool(tool.id, { feedrate: Number(e.target.value) })} className="h-7 text-xs" />
                                </div>
                                <div className="flex flex-col">
                                    <label className="text-gray-400 uppercase font-bold mb-0.5">RPM</label>
                                    <ControlledInput type="number" value={tool.spindleRPM} onChange={(e) => handleUpdateTool(tool.id, { spindleRPM: Number(e.target.value) })} className="h-7 text-xs" />
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between border-t pt-2 mt-auto">
                    <Button variant="ghost" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} aria-label="Prev tools" className="h-8 px-2">
                        <ChevronLeft size={16} aria-hidden="true" />
                    </Button>
                    <span className="text-xs font-medium text-gray-500">Page {currentPage} of {totalPages}</span>
                    <Button variant="ghost" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} aria-label="Next tools" className="h-8 px-2">
                        <ChevronRight size={16} aria-hidden="true" />
                    </Button>
                </div>
            )}
        </div>
    );
};

export default ToolDatabase;
