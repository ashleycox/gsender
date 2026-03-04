import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../../components/Button';
import { RefreshCcw, RotateCcw, Save, Hash, Palette, Search, X, ChevronUp, ChevronDown, MousePointer2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import Switch from '../../../components/Switch';
import store from '../../../store';
import pubsub from 'pubsub-js';
import Tooltip from '../../../components/Tooltip';

interface GCodeEditorProps {
    originalGcode: string;
    onUpdate: (newGcode: string) => void;
    onClose: () => void;
}

const GCODE_COMMANDS: Record<string, string> = {
    'G0': 'Rapid positioning: Moves at maximum machine speed. Should not be used for cutting.',
    'G1': 'Linear interpolation: Controlled move at the specified feedrate (F). Used for cutting.',
    'G2': 'Clockwise arc: Circular movement in CW direction.',
    'G3': 'Counter-clockwise arc: Circular movement in CCW direction.',
    'G4': 'Dwell: Pauses the machine for a specified duration (P).',
    'G17': 'XY plane selection: Sets circular interpolation to the XY plane.',
    'G18': 'ZX plane selection: Sets circular interpolation to the ZX plane.',
    'G19': 'YZ plane selection: Sets circular interpolation to the YZ plane.',
    'G20': 'Inches mode: All subsequent coordinates are interpreted as inches.',
    'G21': 'Millimeters mode: All subsequent coordinates are interpreted as millimeters.',
    'G28': 'Home: Moves the machine to its predefined home position.',
    'G38.2': 'Probe: Moves towards target until a probe contact is detected.',
    'G40': 'Cutter compensation OFF: Standard behavior.',
    'G43': 'Tool length offset ON: Usually combined with H code.',
    'G49': 'Tool length offset OFF.',
    'G53': 'Machine coordinates: Move relative to absolute machine zero.',
    'G54': 'WCS 1: Standard work coordinate system.',
    'G55': 'WCS 2: Secondary work coordinate system.',
    'G80': 'Cancel canned cycle.',
    'G90': 'Absolute distance mode: Coordinates are relative to the origin (0,0,0).',
    'G91': 'Incremental distance mode: Coordinates are relative to current position.',
    'G94': 'Feed per minute mode.',
    'M0': 'Program stop: Pauses and waits for user interaction.',
    'M3': 'Spindle ON (Clockwise): Starts the spindle spinning CW.',
    'M4': 'Spindle ON (CCW / Laser): Starts spindle CCW or enables dynamic laser power.',
    'M5': 'Spindle OFF: Stops the spindle or laser.',
    'M6': 'Tool change: Prompt for a manual or automatic tool change.',
    'M7': 'Mist coolant ON.',
    'M8': 'Flood coolant ON.',
    'M9': 'Coolant OFF: Stops both mist and flood.',
    'M30': 'Program end & reset: Finished the job and returns to start.',
    'F': 'Feedrate: Sets the movement speed (units/min).',
    'S': 'Spindle speed: Sets RPM (spindle) or power intensity (laser).'
};

const GCodeEditor = ({ originalGcode, onUpdate, onClose }: GCodeEditorProps) => {
    // Persistent settings
    const [showLineNumbers, setShowLineNumbers] = useState(store.get('cam.editor.showLines', true));
    const [highlighting, setHighlighting] = useState(store.get('cam.editor.highlight', true));
    const [showTooltips, setShowTooltips] = useState(store.get('cam.editor.tooltips', true));

    const [code, setCode] = useState(originalGcode);
    const [isDirty, setIsDirty] = useState(false);
    
    // Search state
    const [showSearch, setShowSearch] = useState(false);
    const [searchTerm, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<number[]>([]);
    const [currentResultIdx, setCurrentResultIdx] = useState(0);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        setIsDirty(code !== originalGcode);
    }, [code, originalGcode]);

    // Keyboard Shortcuts (GSender System integration)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;
            if (isMod && e.key === 's') {
                e.preventDefault();
                handleUpdate();
            }
            if (isMod && e.key === 'f') {
                e.preventDefault();
                setShowSearch(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        const saveToken = pubsub.subscribe('cam:editor-save', () => handleUpdate());
        const searchToken = pubsub.subscribe('cam:editor-search', () => setShowSearch(prev => !prev));
        
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            pubsub.unsubscribe(saveToken);
            pubsub.unsubscribe(searchToken);
        };
    }, [code]);

    // Persist settings
    useEffect(() => {
        store.set('cam.editor.showLines', showLineNumbers);
        store.set('cam.editor.highlight', highlighting);
        store.set('cam.editor.tooltips', showTooltips);
    }, [showLineNumbers, highlighting, showTooltips]);

    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        if (preRef.current) {
            preRef.current.scrollTop = e.currentTarget.scrollTop;
            preRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleUpdate = () => {
        onUpdate(code);
        setIsDirty(false);
    };

    const handleRevert = () => {
        setCode(originalGcode);
        setIsDirty(false);
    };

    // Search Logic
    useEffect(() => {
        if (!searchTerm) {
            setSearchResults([]);
            return;
        }
        const lines = code.split('\n');
        const results: number[] = [];
        lines.forEach((line, i) => {
            if (line.toLowerCase().includes(searchTerm.toLowerCase())) {
                results.push(i);
            }
        });
        setSearchResults(results);
        setCurrentResultIdx(0);
    }, [searchTerm, code]);

    const jumpToResult = (idx: number) => {
        if (searchResults.length === 0) return;
        const lineIdx = searchResults[idx];
        const textarea = textareaRef.current;
        if (!textarea) return;

        const lines = code.split('\n');
        let charPos = 0;
        for (let i = 0; i < lineIdx; i++) {
            charPos += lines[i].length + 1;
        }
        
        textarea.focus();
        textarea.setSelectionRange(charPos, charPos + lines[lineIdx].length);
        
        // Manual scroll calculation
        const lineHeight = 20; // estimate
        textarea.scrollTop = lineIdx * lineHeight - (textarea.clientHeight / 2);
    };

    const highlightGCode = (text: string) => {
        const lines = text.split('\n');
        let currentZ = 0;
        let lastFeedrate = 0;
        let spindleRunning = false;

        return lines.map((line, i) => {
            const tokens = line.split(/(\(.*?\)|;.*|\b[GM]\d+(?:\.\d+)?|\b[XYZAIJK]-?\d*\.?\d+|\b[FS]\d+)/g);
            
            // --- SAFETY LINTER LOGIC ---
            let safetyError = null;
            const hasG0 = line.includes('G0');
            const hasG1 = line.includes('G1') || line.includes('G2') || line.includes('G3');
            const zMatch = line.match(/Z(-?\d*\.?\d+)/);
            if (zMatch) currentZ = parseFloat(zMatch[1]);
            
            const fMatch = line.match(/F(\d+)/);
            if (fMatch) lastFeedrate = parseInt(fMatch[1]);

            if (line.includes('M3') || line.includes('M4')) spindleRunning = true;
            if (line.includes('M5') || line.includes('M30')) spindleRunning = false;

            // 1. Rapid move below safety height (Negative Z)
            if (hasG0 && currentZ < 0) {
                safetyError = "CRITICAL: Rapid move (G0) detected below Z0. High risk of machine crash.";
            }
            // 2. Cutting move with no feedrate defined
            else if (hasG1 && lastFeedrate === 0) {
                safetyError = "WARNING: Cutting move (G1/2/3) with no feedrate (F) defined. Motion may be unpredictable.";
            }
            // 3. Cutting move with spindle stopped
            else if (hasG1 && !spindleRunning && !line.includes(';') && !line.includes('(')) {
                safetyError = "WARNING: Cutting move detected but spindle/laser (M3/M4) is not running.";
            }

            return (
                <div key={i} className={cn("min-h-[1.25rem] flex items-center px-1", safetyError && "bg-red-500/20")}>
                    {highlighting ? tokens.map((token, j) => {
                        if (!token) return null;
                        
                        const cmdMatch = token.match(/\b([GM]\d+(?:\.\d+)?|[FS])\b/);
                        const cmdDesc = cmdMatch ? GCODE_COMMANDS[cmdMatch[1]] : null;

                        let element = <span>{token}</span>;
                        
                        if (token.startsWith('(') || token.startsWith(';')) {
                            element = <span className="text-gray-500 italic">{token}</span>;
                        } else if (/^[GM]\d+/.test(token)) {
                            element = <span className="text-blue-500 font-bold">{token}</span>;
                        } else if (/^[XYZAIJK]/.test(token)) {
                            element = <span className="text-orange-500">{token}</span>;
                        } else if (/^[FS]/.test(token)) {
                            element = <span className="text-emerald-500 font-medium">{token}</span>;
                        }

                        // Priority: Safety Error Tooltip > Command Reference
                        const finalTooltip = (j === 0 && safetyError) ? safetyError : cmdDesc;

                        if (showTooltips && finalTooltip) {
                            return (
                                <Tooltip key={j} content={finalTooltip as any} delay={200}>
                                    {element}
                                </Tooltip>
                            );
                        }
                        return <React.Fragment key={j}>{element}</React.Fragment>;
                    }) : line}
                </div>
            );
        });
    };

    return (
        <div className="absolute inset-0 z-40 bg-white dark:bg-dark flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Toolbar */}
            <div className="flex justify-between items-center p-3 border-b bg-gray-50 dark:bg-dark-lighter shadow-sm">
                <div className="flex items-center gap-4">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        <Save size={16} className="text-blue-500" /> G-Code Editor
                    </h3>
                    
                    <div className="h-4 w-px bg-gray-300 dark:bg-gray-700 mx-2" />
                    
                    <div className="flex items-center gap-4">
                        <Tooltip content="Toggle Line Numbers">
                            <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500 cursor-pointer hover:text-blue-500 transition-colors">
                                <Hash size={12} /> Lines
                                <Switch checked={showLineNumbers} onChange={setShowLineNumbers} />
                            </label>
                        </Tooltip>
                        <Tooltip content="Enable Syntax Highlighting">
                            <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500 cursor-pointer hover:text-blue-500 transition-colors">
                                <Palette size={12} /> Syntax
                                <Switch checked={highlighting} onChange={setHighlighting} />
                            </label>
                        </Tooltip>
                        <Tooltip content="Show Command Info on Hover">
                            <label className="flex items-center gap-2 text-[10px] uppercase font-bold text-gray-500 cursor-pointer hover:text-blue-500 transition-colors">
                                <MousePointer2 size={12} /> Tips
                                <Switch checked={showTooltips} onChange={setShowTooltips} />
                            </label>
                        </Tooltip>
                    </div>

                    <Button 
                        variant="ghost" 
                        size="mini" 
                        onClick={() => setShowSearch(!showSearch)} 
                        className={cn("h-7 px-2 gap-1", showSearch && "bg-blue-100 text-blue-500")}
                    >
                        <Search size={12} /> Search (F)
                    </Button>

                    {isDirty && (
                        <div className="flex gap-2 ml-4 animate-in slide-in-from-left-2">
                            <Button variant="primary" size="xs" onClick={handleUpdate} className="gap-1 h-7">
                                <RefreshCcw size={12} /> Update (S)
                            </Button>
                            <Button variant="outline" size="xs" onClick={handleRevert} className="gap-1 h-7">
                                <RotateCcw size={12} /> Revert
                            </Button>
                        </div>
                    )}
                </div>
                <Button variant="ghost" size="mini" onClick={onClose} aria-label="Close G-Code Editor" className="hover:bg-red-50 hover:text-red-500">
                    <X size={16} />
                </Button>
            </div>

            {/* Search Bar */}
            {showSearch && (
                <div className="p-2 border-b bg-white dark:bg-dark flex items-center gap-4 animate-in slide-in-from-top-2">
                    <div className="relative flex-1 max-w-md">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="Search G-Code..." 
                            className="w-full pl-9 pr-4 py-1.5 bg-gray-100 dark:bg-dark rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') jumpToResult(currentResultIdx + 1 >= searchResults.length ? 0 : currentResultIdx + 1);
                                if (e.key === 'Escape') setShowSearch(false);
                            }}
                        />
                    </div>
                    {searchResults.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{currentResultIdx + 1} of {searchResults.length}</span>
                            <div className="flex border rounded overflow-hidden">
                                <button onClick={() => { const n = currentResultIdx > 0 ? currentResultIdx-1 : searchResults.length-1; setCurrentResultIdx(n); jumpToResult(n); }} className="p-1 hover:bg-gray-100 dark:hover:bg-dark-light border-r"><ChevronUp size={14}/></button>
                                <button onClick={() => { const n = currentResultIdx < searchResults.length-1 ? currentResultIdx+1 : 0; setCurrentResultIdx(n); jumpToResult(n); }} className="p-1 hover:bg-gray-100 dark:hover:bg-dark-light"><ChevronDown size={14}/></button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            <div className="flex-1 flex overflow-hidden relative bg-white dark:bg-[#1e1e1e]">
                {/* Line Numbers */}
                {showLineNumbers && (
                    <div className="w-12 bg-gray-50 dark:bg-dark-lighter border-r border-gray-200 dark:border-gray-700 text-right pr-3 py-4 font-mono text-[11px] text-gray-400 select-none">
                        {code.split('\n').map((_, i) => (
                            <div key={i} className="h-[1.25rem] leading-[1.25rem]">{i + 1}</div>
                        ))}
                    </div>
                )}

                <div className="flex-1 relative overflow-hidden font-mono text-[13px]">
                    {/* Syntax Highlighter Layer */}
                    <pre
                        ref={preRef}
                        className={cn(
                            "absolute inset-0 p-4 m-0 pointer-events-none whitespace-pre-wrap break-all leading-[1.25rem]",
                            "text-transparent selection:bg-blue-500/30",
                            !highlighting && "dark:text-gray-300 text-gray-800"
                        )}
                        aria-hidden="true"
                    >
                        {highlightGCode(code)}
                    </pre>

                    {/* Interaction Layer */}
                    <textarea
                        ref={textareaRef}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        onScroll={handleScroll}
                        className={cn(
                            "absolute inset-0 w-full h-full p-4 bg-transparent outline-none resize-none border-none",
                            "font-mono text-[13px] leading-[1.25rem] caret-blue-500",
                            "dark:text-gray-300 text-gray-800",
                            highlighting && "text-transparent dark:text-transparent"
                        )}
                        spellCheck={false}
                    />
                </div>
            </div>
            
            {/* Status Footer */}
            <div className="p-2 border-t bg-gray-50 dark:bg-dark-lighter flex justify-between items-center text-[10px] text-gray-500 uppercase tracking-widest px-4 font-bold shadow-inner">
                <div className="flex gap-6">
                    <span>{code.split('\n').length} Lines</span>
                    <span>{code.length} Characters</span>
                    {originalGcode !== code && (
                        <span className="text-blue-500 animate-pulse">● Modified</span>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <div className={cn("flex items-center gap-1", isDirty ? "text-orange-500" : "text-green-500")}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", isDirty ? "bg-orange-500" : "bg-green-500")} />
                        {isDirty ? "Unsaved Changes" : "In Sync"}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GCodeEditor;
