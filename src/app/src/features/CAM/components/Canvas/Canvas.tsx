import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import ClipperLib from 'js-clipper';
import ImageTracer from 'imagetracerjs';
import { 
    Pencil, MousePointer2, Square, Circle, Type, Trash2, Undo2, Redo2, 
    Download, Upload, Plus, Maximize, Minimize, Move, RotateCw, 
    ArrowUpRight, Hexagon, Minus, Grid3X3, BoxSelect, History, Save, X, 
    CheckCircle2, ChevronUp, ChevronDown, Copy, AlignLeft, AlignCenter, 
    AlignRight, AlignVerticalSpaceAround, AlignHorizontalSpaceAround, 
    Layers, Hand, Combine, Scissors, ScanLine, CircleDot, ImageIcon, Ruler, Edit3, Library,
    GripHorizontal, Grip, Spline, QrCode, CornerDownRight, MapPin, HelpCircle
} from 'lucide-react';
import { Button } from '../../../../components/Button';
import { ControlledInput } from '../../../../components/ControlledInput';
import { CAMFeature, CAMSettings } from '../../definitions';
import { v4 as uuid } from 'uuid';
import { toast } from '../../../../lib/toaster';
import cx from 'classnames';
import { initSmartSnapping } from './utils/smartSnap';
import { enableNodeEditing } from './utils/nodeEdit';
import { createLinearArray, createCircularArray, smoothPath, generateQRCode, applyDogbones, applyFillet, applyChamfer } from './utils/proTools';

interface CanvasProps {
    settings: CAMSettings;
    existingFeatures: CAMFeature[];
    canvasState: string | null;
    focusedFeatureId: string | null;
    onSaveCanvasState: (json: string | null) => void;
    onAddFeatures: (features: CAMFeature[]) => void;
    onClose: () => void;
}

type Tool = 'select' | 'pan' | 'pencil' | 'line' | 'arrow' | 'rect' | 'circle' | 'polygon' | 'text' | 'arc' | 'measure' | 'tabs';

// Accessibility Helper: Numeric Input with increment/decrement
const NumericInputWithControls = ({ 
    label, value, onChange, step = 1, unit = 'mm', min = -9999, ariaLabel 
}: { 
    label: string, value: number, onChange: (val: number) => void, step?: number, unit?: string, min?: number, ariaLabel?: string
}) => (
    <div className="flex flex-col gap-1 w-full text-gray-700 dark:text-gray-300">
        <label className="text-[10px] font-bold text-gray-500 uppercase flex justify-between items-center px-1">
            {label}
            <span className="text-[8px] opacity-60 font-normal normal-case">{unit}</span>
        </label>
        <div className="flex items-center gap-1 group">
            <div className="relative flex-1">
                <ControlledInput 
                    value={value} 
                    onChange={(e) => onChange(Number(e.target.value))}
                    type="number"
                    min={min}
                    className="h-8 text-xs pr-2 focus-visible:ring-2 focus-visible:ring-robin-500 transition-all border-gray-200 dark:border-gray-700 bg-white dark:bg-dark"
                    aria-label={ariaLabel || label}
                />
            </div>
            <div className="flex flex-col gap-0.5">
                <button 
                    onClick={() => onChange(value + step)}
                    className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-robin-500 focus:outline-none"
                    aria-label={`Increase ${label}`}
                >
                    <ChevronUp size={12} />
                </button>
                <button 
                    onClick={() => onChange(Math.max(min, value - step))}
                    className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-robin-500 focus:outline-none"
                    aria-label={`Decrease ${label}`}
                >
                    <ChevronDown size={12} />
                </button>
            </div>
        </div>
    </div>
);

const Canvas: React.FC<CanvasProps> = ({ 
    settings, 
    existingFeatures, 
    canvasState, 
    focusedFeatureId, 
    onSaveCanvasState, 
    onAddFeatures, 
    onClose 
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvas = useRef<fabric.Canvas | null>(null);
    const [activeTool, setActiveTool] = useState<Tool>('select');
    const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
    const [snapToGrid, setSnapToGrid] = useState(false);
    const [gridSize, setGridSize] = useState(settings.units === 'inch' ? 0.25 : 5);
    const [canvasSize, setCanvasSize] = useState({ 
        width: settings.stockWidth || 500, 
        height: settings.stockLength || 500,
        thickness: settings.stockThickness || 10
    });
    
    // History & Layers
    const [history, setHistory] = useState<string[]>([]);
    const [historyIdx, setHistoryIdx] = useState(-1);
    const [layerObjects, setLayerObjects] = useState<fabric.Object[]>([]);
    const [activeSidebarTab, setActiveSidebarTab] = useState<'properties' | 'layers' | 'library'>('properties');
    
    // Help Mode
    const [showHelp, setShowHelp] = useState(false);
    
    // Popup Menus
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    const toggleMenu = (name: string) => {
        setActiveMenu(activeMenu === name ? null : name);
    };

    // Measurement Tool
    const [measureText, setMeasureText] = useState<string | null>(null);
    const [measurePos, setMeasurePos] = useState({ x: 0, y: 0 });
    
    // Smart Snapping
    const [smartSnap, setSmartSnap] = useState(true);

    // Component Library
    const [library, setLibrary] = useState<{name: string, data: string}[]>([]);
    
    // Node Editing
    const [isNodeEditing, setIsNodeEditing] = useState(false);

    const toggleNodeEdit = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (!active || !(active instanceof fabric.Polygon || active instanceof fabric.Polyline)) {
            toast.warning("Select a polygon or polyline to edit nodes");
            return;
        }
        
        enableNodeEditing(fabricCanvas.current, active as fabric.Polygon | fabric.Polyline);
        setIsNodeEditing(active.edit === true);
        announce(active.edit ? "Node editing enabled" : "Node editing disabled");
    };

    useEffect(() => {
        const savedLibrary = localStorage.getItem('gsender-canvas-library');
        if (savedLibrary) {
            try { setLibrary(JSON.parse(savedLibrary)); } catch (e) {}
        }
    }, []);

    const saveToLibrary = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (!active) {
            toast.warning("Select an object to save to the library");
            return;
        }
        
        const name = prompt("Enter a name for this component:", "Component " + (library.length + 1));
        if (!name) return;
        
        const data = JSON.stringify(active.toJSON());
        const newLibrary = [...library, { name, data }];
        setLibrary(newLibrary);
        localStorage.setItem('gsender-canvas-library', JSON.stringify(newLibrary));
        toast.success(`Saved "${name}" to library`);
    };

    const loadFromLibrary = (data: string) => {
        if (!fabricCanvas.current) return;
        fabricCanvas.current.loadFromJSON(data, () => {
            fabricCanvas.current?.renderAll();
            saveHistory();
            toast.success("Component loaded");
        });
    };

    // Context Menu
    const [contextMenu, setContextMenu] = useState<{x: number, y: number, visible: boolean}>({ x: 0, y: 0, visible: false });

    // ARIA Announcements
    const [announcement, setAnnouncement] = useState('');

    const announce = (msg: string) => {
        setAnnouncement(msg);
        setTimeout(() => setAnnouncement(''), 1000);
    };

    const updateLayers = () => {
        if (fabricCanvas.current) {
            setLayerObjects([...fabricCanvas.current.getObjects()].reverse());
        }
    };

    const saveHistory = () => {
        if (!fabricCanvas.current) return;
        const json = JSON.stringify(fabricCanvas.current.toJSON());
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIdx + 1);
            return [...newHistory, json];
        });
        setHistoryIdx(prev => prev + 1);
        updateLayers();
        onSaveCanvasState(json); // Architectural Fix 1: Persistent Redux JSON
    };

    const setupKeyboardListeners = useCallback(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!fabricCanvas.current) return;
            const canvas = fabricCanvas.current;
            const activeObject = canvas.getActiveObject();

            if (activeObject && !(activeObject instanceof fabric.IText && (activeObject as any).isEditing)) {
                const moveStep = e.shiftKey ? gridSize * 2 : gridSize / 5 || 1;
                
                switch (e.key) {
                    case 'ArrowLeft': activeObject.set('left', (activeObject.left || 0) - moveStep); e.preventDefault(); break;
                    case 'ArrowRight': activeObject.set('left', (activeObject.left || 0) + moveStep); e.preventDefault(); break;
                    case 'ArrowUp': activeObject.set('top', (activeObject.top || 0) - moveStep); e.preventDefault(); break;
                    case 'ArrowDown': activeObject.set('top', (activeObject.top || 0) + moveStep); e.preventDefault(); break;
                    case 'Delete':
                    case 'Backspace': deleteSelected(); e.preventDefault(); break;
                    case 'd': if (e.ctrlKey || e.metaKey) { duplicateSelected(); e.preventDefault(); } break;
                    case 'a': if (e.ctrlKey || e.metaKey) { 
                        canvas.discardActiveObject();
                        const sel = new fabric.ActiveSelection(canvas.getObjects(), { canvas: canvas });
                        canvas.setActiveObject(sel);
                        canvas.requestRenderAll();
                        e.preventDefault(); 
                    } break;
                    case 'z': if (e.ctrlKey || e.metaKey) { if (e.shiftKey) redo(); else undo(); e.preventDefault(); } break;
                }
                canvas.setCoords();
                canvas.renderAll();
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) saveHistory();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gridSize, history, historyIdx]);

    useEffect(() => {
        if (!canvasRef.current) return;

        fabricCanvas.current = new fabric.Canvas(canvasRef.current, {
            width: canvasSize.width,
            height: canvasSize.height,
            backgroundColor: settings.visualTheme === 'high-contrast' ? '#000000' : '#ffffff',
            stopContextMenu: true,
            fireRightClick: true,
            preserveObjectStacking: true
        });

        const canvas = fabricCanvas.current;

        canvas.on('selection:created', (e) => setSelectedObject(e.selected?.[0] || null));
        canvas.on('selection:updated', (e) => setSelectedObject(e.selected?.[0] || null));
        canvas.on('selection:cleared', () => setSelectedObject(null));
        canvas.on('object:modified', () => saveHistory());
        canvas.on('object:added', () => updateLayers());
        canvas.on('object:removed', () => updateLayers());

        // Pan & Zoom logic
        canvas.on('mouse:wheel', function(opt) {
            const evt = opt.e as WheelEvent;
            let zoom = canvas.getZoom();
            zoom *= 0.999 ** evt.deltaY;
            if (zoom > 20) zoom = 20;
            if (zoom < 0.1) zoom = 0.1;
            canvas.zoomToPoint({ x: evt.offsetX, y: evt.offsetY }, zoom);
            opt.e.preventDefault();
            opt.e.stopPropagation();
        });

        let isDragging = false;
        let lastPosX = 0;
        let lastPosY = 0;
        let measureLine: fabric.Line | null = null;
        let startMeasurePoint = { x: 0, y: 0 };

        canvas.on('mouse:down', function(opt) {
            const evt = opt.e as MouseEvent;

            if (activeTool === 'tabs') {
                const pointer = canvas.getPointer(evt);
                const tabMarker = new fabric.Circle({
                    left: pointer.x,
                    top: pointer.y,
                    radius: 4,
                    fill: '#ff0000',
                    originX: 'center',
                    originY: 'center',
                    selectable: true,
                    hasControls: false,
                    name: 'holding-tab'
                });
                canvas.add(tabMarker);
                canvas.requestRenderAll();
                saveHistory();
                return;
            }

            if (activeTool === 'measure') {
                const pointer = canvas.getPointer(evt);
                startMeasurePoint = { x: pointer.x, y: pointer.y };
                measureLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
                    stroke: '#ff0000',
                    strokeWidth: 2,
                    selectable: false,
                    evented: false,
                    strokeDashArray: [5, 5]
                });
                canvas.add(measureLine);
                return;
            }

            if (evt.altKey === true || evt.button === 1 || activeTool === 'pan') {
                isDragging = true;
                canvas.selection = false;
                lastPosX = evt.clientX;
                lastPosY = evt.clientY;
            } else if (evt.button === 2) {
                // Right click context menu
                const pointer = canvas.getPointer(evt);
                setContextMenu({ x: evt.clientX, y: evt.clientY, visible: true });
                evt.preventDefault();
            } else {
                setContextMenu(prev => ({...prev, visible: false}));
            }
        });

        canvas.on('mouse:move', function(opt) {
            if (activeTool === 'measure' && measureLine) {
                const pointer = canvas.getPointer(opt.e);
                measureLine.set({ x2: pointer.x, y2: pointer.y });
                
                const dx = pointer.x - startMeasurePoint.x;
                const dy = pointer.y - startMeasurePoint.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                setMeasureText(`${distance.toFixed(2)} ${settings.units}`);
                setMeasurePos({ x: opt.e.clientX + 15, y: opt.e.clientY + 15 });
                
                canvas.requestRenderAll();
                return;
            }

            if (isDragging) {
                const e = opt.e as MouseEvent;
                const vpt = canvas.viewportTransform;
                if (vpt) {
                    vpt[4] += e.clientX - lastPosX;
                    vpt[5] += e.clientY - lastPosY;
                    canvas.requestRenderAll();
                }
                lastPosX = e.clientX;
                lastPosY = e.clientY;
            }
        });

        canvas.on('mouse:up', function(opt) {
            if (activeTool === 'measure') {
                if (measureLine) {
                    canvas.remove(measureLine);
                    measureLine = null;
                }
                setMeasureText(null);
                canvas.requestRenderAll();
                return;
            }

            if (isDragging && canvas.viewportTransform) {
                canvas.setViewportTransform(canvas.viewportTransform);
                isDragging = false;
                canvas.selection = true;
            }
        });

        // Smart Snap Init
        if (smartSnap) {
            initSmartSnapping(canvas, gridSize, snapToGrid);
        } else {
            // Basic snap
            canvas.on('object:moving', (options) => {
                if (snapToGrid && options.target) {
                    options.target.set({
                        left: Math.round((options.target.left || 0) / gridSize) * gridSize,
                        top: Math.round((options.target.top || 0) / gridSize) * gridSize
                    });
                }
            });
        }

        canvas.isDrawingMode = false;
        canvas.freeDrawingBrush.width = 2;
        canvas.freeDrawingBrush.color = settings.visualTheme === 'high-contrast' ? '#ffff00' : '#000000';

        // Load persistent session if available
        if (canvasState) {
            canvas.loadFromJSON(canvasState, () => {
                canvas.renderAll();
                updateLayers();
                
                // Architectural Fix 2: Selection-Aware Sync
                if (focusedFeatureId) {
                    const objects = canvas.getObjects();
                    const featureIdx = existingFeatures.findIndex(f => f.id === focusedFeatureId);
                    if (featureIdx !== -1 && objects[featureIdx]) {
                        canvas.setActiveObject(objects[featureIdx]);
                        canvas.renderAll();
                    }
                }
            });
        } else if (existingFeatures.length > 0) {
            importFeaturesFromDesign(false);
        }

        saveHistory();
        const cleanup = setupKeyboardListeners();

        return () => {
            canvas.dispose();
            cleanup();
        };
    }, [settings.visualTheme]);

    useEffect(() => {
        const cleanup = setupKeyboardListeners();
        return cleanup;
    }, [gridSize, history, historyIdx]);

    // Architectural Fix 4: Reactive Stock Sync
    useEffect(() => {
        setCanvasSize({
            width: settings.stockWidth || 500,
            height: settings.stockLength || 500,
            thickness: settings.stockThickness || 10
        });
        if (fabricCanvas.current) {
            fabricCanvas.current.setDimensions({
                width: settings.stockWidth || 500,
                height: settings.stockLength || 500
            });
        }
    }, [settings.stockWidth, settings.stockLength, settings.stockThickness]);

    // Alignment Tools
    const alignSelected = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const activeObject = canvas.getActiveObject();
        if (!activeObject || activeObject.type !== 'activeSelection') {
            toast.warning("Select multiple objects to align them.");
            return;
        }
        
        const group = activeObject as fabric.ActiveSelection;
        const bound = group.getBoundingRect();
        
        group.forEachObject(obj => {
            const objBound = obj.getBoundingRect();
            switch(alignment) {
                case 'left': obj.set('left', (obj.left || 0) - (objBound.left - bound.left)); break;
                case 'center': obj.set('left', (obj.left || 0) + (bound.left + bound.width/2) - (objBound.left + objBound.width/2)); break;
                case 'right': obj.set('left', (obj.left || 0) + (bound.left + bound.width) - (objBound.left + objBound.width)); break;
                case 'top': obj.set('top', (obj.top || 0) - (objBound.top - bound.top)); break;
                case 'middle': obj.set('top', (obj.top || 0) + (bound.top + bound.height/2) - (objBound.top + objBound.height/2)); break;
                case 'bottom': obj.set('top', (obj.top || 0) + (bound.top + bound.height) - (objBound.top + objBound.height)); break;
            }
            obj.setCoords();
        });
        canvas.requestRenderAll();
        saveHistory();
        announce(`Aligned objects to ${alignment}`);
    };

    const getClipperPaths = (obj: fabric.Object): any[][] => {
        // Convert Fabric object to Clipper paths
        const points: any[] = [];
        if (obj instanceof fabric.Rect) {
            const bound = obj.getBoundingRect();
            points.push({ X: bound.left, Y: bound.top });
            points.push({ X: bound.left + bound.width, Y: bound.top });
            points.push({ X: bound.left + bound.width, Y: bound.top + bound.height });
            points.push({ X: bound.left, Y: bound.top + bound.height });
        } else if (obj instanceof fabric.Circle) {
            const radius = obj.getRadiusX();
            const center = obj.getCenterPoint();
            for (let i = 0; i < 36; i++) {
                const angle = (i * 10 * Math.PI) / 180;
                points.push({ 
                    X: center.x + radius * Math.cos(angle), 
                    Y: center.y + radius * Math.sin(angle) 
                });
            }
        } else if (obj instanceof fabric.Polygon) {
            const matrix = obj.calcTransformMatrix();
            obj.points?.forEach(p => {
                const pt = fabric.util.transformPoint(p, matrix);
                points.push({ X: pt.x, Y: pt.y });
            });
        }
        
        // Scale for precision
        const scaled = points.map(p => ({ X: Math.round(p.X * 1000), Y: Math.round(p.Y * 1000) }));
        return [scaled];
    };

    const booleanOperation = (type: 'union' | 'subtract' | 'intersect') => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type !== 'activeSelection') {
            toast.warning("Select multiple objects to perform a boolean operation.");
            return;
        }
        
        const selection = active as fabric.ActiveSelection;
        const objects = selection.getObjects();
        if (objects.length < 2) return;

        try {
            const clipper = new ClipperLib.Clipper();
            let subjectPaths: any[][] = getClipperPaths(objects[0]);
            
            for (let i = 1; i < objects.length; i++) {
                const clipPaths = getClipperPaths(objects[i]);
                const solution: any[][] = [];
                let op;
                switch(type) {
                    case 'union': op = ClipperLib.ClipType.ctUnion; break;
                    case 'subtract': op = ClipperLib.ClipType.ctDifference; break;
                    case 'intersect': op = ClipperLib.ClipType.ctIntersection; break;
                    default: op = ClipperLib.ClipType.ctUnion;
                }
                clipper.AddPaths(subjectPaths, ClipperLib.PolyType.ptSubject, true);
                clipper.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
                clipper.Execute(op, solution, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
                subjectPaths = solution;
                clipper.Clear();
            }

            // Convert back to Fabric Path
            if (subjectPaths.length > 0) {
                const svgPath = subjectPaths.map(path => {
                    return 'M ' + path.map(p => `${p.X / 1000} ${p.Y / 1000}`).join(' L ') + ' Z';
                }).join(' ');

                const resultPath = new fabric.Path(svgPath, {
                    fill: 'transparent',
                    stroke: settings.visualTheme === 'high-contrast' ? '#ffff00' : '#000000',
                    strokeWidth: 2
                });

                canvas.remove(...objects);
                canvas.discardActiveObject();
                canvas.add(resultPath);
                canvas.setActiveObject(resultPath);
                canvas.requestRenderAll();
                saveHistory();
                toast.success(`Boolean ${type} successful`);
            }
        } catch (err) {
            console.error(err);
            toast.error("Boolean operation failed. Ensure shapes are closed and valid.");
        }
    };

    const addDogbones = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (active instanceof fabric.Polygon) {
            const diameter = parseFloat(prompt("Enter tool diameter:", "3.175") || "0");
            if (diameter > 0) {
                applyDogbones(fabricCanvas.current, active, diameter);
                saveHistory();
            }
        } else {
            toast.warning("Select a polygon to add dogbones.");
        }
    };

    const runFillet = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (active instanceof fabric.Polygon || active instanceof fabric.Polyline) {
            const radius = parseFloat(prompt("Enter fillet radius:", "5") || "0");
            if (radius > 0) {
                applyFillet(fabricCanvas.current, active, radius);
                saveHistory();
                toast.success("Fillet applied");
            }
        } else {
            toast.warning("Select a polygon or polyline to fillet.");
        }
    };

    const runChamfer = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (active instanceof fabric.Polygon) {
            const distance = parseFloat(prompt("Enter chamfer distance:", "5") || "0");
            if (distance > 0) {
                applyChamfer(fabricCanvas.current, active, distance);
                saveHistory();
                toast.success("Chamfer applied");
            }
        } else {
            toast.warning("Select a polygon to chamfer.");
        }
    };

    const traceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fabricCanvas.current) return;

        const reader = new FileReader();
        reader.onload = (f) => {
            const data = f.target?.result;
            if (typeof data === 'string') {
                toast.info("Tracing image... please wait.");
                ImageTracer.imageToSVG(data, (svgString: string) => {
                    fabric.loadSVGFromString(svgString, (objects, options) => {
                        const obj = fabric.util.groupSVGElements(objects, options);
                        const center = fabricCanvas.current!.getVpCenter();
                        obj.set({ left: center.x, top: center.y });
                        // Scale to fit if too large
                        if (obj.width! > canvasSize.width || obj.height! > canvasSize.height) {
                            const scale = Math.min(canvasSize.width / obj.width!, canvasSize.height / obj.height!) * 0.8;
                            obj.scale(scale);
                        }
                        fabricCanvas.current?.add(obj).renderAll();
                        saveHistory();
                        toast.success("Image traced to vector successfully");
                    });
                }, 'posterized2');
            }
        };
        reader.readAsDataURL(file);
    };

    const distributeObjects = (direction: 'horizontal' | 'vertical') => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const activeSelection = canvas.getActiveObject() as fabric.ActiveSelection;
        if (!activeSelection || activeSelection.type !== 'activeSelection') {
            toast.warning("Select 3 or more objects to distribute.");
            return;
        }
        
        const objects = activeSelection.getObjects();
        if (objects.length < 3) return;

        if (direction === 'horizontal') {
            objects.sort((a, b) => (a.left || 0) - (b.left || 0));
            const first = objects[0];
            const last = objects[objects.length - 1];
            const totalWidth = (last.left || 0) - (first.left || 0);
            const step = totalWidth / (objects.length - 1);
            
            objects.forEach((obj, i) => {
                obj.set('left', (first.left || 0) + (i * step));
                obj.setCoords();
            });
        } else {
            objects.sort((a, b) => (a.top || 0) - (b.top || 0));
            const first = objects[0];
            const last = objects[objects.length - 1];
            const totalHeight = (last.top || 0) - (first.top || 0);
            const step = totalHeight / (objects.length - 1);
            
            objects.forEach((obj, i) => {
                obj.set('top', (first.top || 0) + (i * step));
                obj.setCoords();
            });
        }
        
        canvas.requestRenderAll();
        saveHistory();
        announce(`Distributed objects ${direction}`);
    };

    const offsetPath = (delta: number) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (!active || active.type === 'activeSelection') {
            toast.warning("Select a single object to offset.");
            return;
        }

        try {
            const paths = getClipperPaths(active);
            const offset = new ClipperLib.ClipperOffset();
            const solution: any[][] = [];
            
            offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
            offset.Execute(solution, delta * 1000); // delta in mm scaled

            if (solution.length > 0) {
                const svgPath = solution.map(path => {
                    return 'M ' + path.map(p => `${p.X / 1000} ${p.Y / 1000}`).join(' L ') + ' Z';
                }).join(' ');

                const resultPath = new fabric.Path(svgPath, {
                    fill: 'transparent',
                    stroke: settings.visualTheme === 'high-contrast' ? '#00ff00' : '#0000ff',
                    strokeWidth: 1,
                    dashArray: [5, 5]
                });

                canvas.add(resultPath);
                canvas.setActiveObject(resultPath);
                canvas.requestRenderAll();
                saveHistory();
                toast.success(`Offset created (${delta > 0 ? '+' : ''}${delta}${settings.units})`);
            }
        } catch (err) {
            console.error(err);
            toast.error("Offset failed. Ensure shape is a valid closed polygon.");
        }
    };

    const importFeaturesFromDesign = (showToast = true) => {
        if (!fabricCanvas.current || !existingFeatures.length) return;
        const canvas = fabricCanvas.current;
        const color = settings.visualTheme === 'high-contrast' ? '#ffff00' : '#000000';
        
        existingFeatures.forEach(feature => {
            let obj: fabric.Object | null = null;
            if (feature.type === 'rectangle' && feature.points.length >= 4) {
                const xs = feature.points.map(p => p.x);
                const ys = feature.points.map(p => p.y);
                obj = new fabric.Rect({
                    left: Math.min(...xs), top: Math.min(...ys),
                    width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
                    fill: 'transparent', stroke: feature.color || color, strokeWidth: 2,
                });
            } else if (feature.type === 'circle' && feature.cylinderRadius) {
                obj = new fabric.Circle({
                    left: feature.points[0].x - feature.cylinderRadius,
                    top: feature.points[0].y - feature.cylinderRadius,
                    radius: feature.cylinderRadius,
                    fill: 'transparent', stroke: feature.color || color, strokeWidth: 2,
                });
            } else if (feature.points.length > 1) {
                obj = new fabric.Polygon(feature.points.map(p => ({ x: p.x, y: p.y })), {
                    left: Math.min(...feature.points.map(p => p.x)),
                    top: Math.min(...feature.points.map(p => p.y)),
                    fill: 'transparent', stroke: feature.color || color, strokeWidth: 2,
                });
            }
            if (obj) canvas.add(obj);
        });

        canvas.renderAll();
        saveHistory();
        if (showToast) {
            toast.success(`Imported ${existingFeatures.length} features from design`);
            announce(`Imported ${existingFeatures.length} features`);
        }
    };

    const duplicateSelected = () => {
        if (!fabricCanvas.current) return;
        const canvas = fabricCanvas.current;
        const activeObject = canvas.getActiveObject();
        if (!activeObject) return;

        activeObject.clone((cloned: fabric.Object) => {
            canvas.discardActiveObject();
            cloned.set({ left: (cloned.left || 0) + 10, top: (cloned.top || 0) + 10, evented: true });
            if (cloned instanceof fabric.ActiveSelection) {
                cloned.canvas = canvas;
                cloned.forEachObject((obj) => canvas.add(obj));
                cloned.setCoords();
            } else {
                canvas.add(cloned);
            }
            canvas.setActiveObject(cloned);
            canvas.requestRenderAll();
            saveHistory();
            announce("Object duplicated");
        });
    };

    const undo = () => {
        if (historyIdx > 0 && fabricCanvas.current) {
            const prev = historyIdx - 1;
            setHistoryIdx(prev);
            fabricCanvas.current.loadFromJSON(history[prev], () => {
                fabricCanvas.current?.renderAll();
                updateLayers();
                announce("Undo successful");
            });
        }
    };

    const redo = () => {
        if (historyIdx < history.length - 1 && fabricCanvas.current) {
            const next = historyIdx + 1;
            setHistoryIdx(next);
            fabricCanvas.current.loadFromJSON(history[next], () => {
                fabricCanvas.current?.renderAll();
                updateLayers();
                announce("Redo successful");
            });
        }
    };

    const setTool = (tool: Tool) => {
        setActiveTool(tool);
        if (!fabricCanvas.current) return;
        fabricCanvas.current.isDrawingMode = tool === 'pencil';
        fabricCanvas.current.selection = tool === 'select';
        
        if (tool === 'pan') {
            fabricCanvas.current.defaultCursor = 'grab';
        } else {
            fabricCanvas.current.defaultCursor = 'default';
        }

        if (tool !== 'select') {
            fabricCanvas.current.discardActiveObject().renderAll();
        }
        announce(`Tool changed to ${tool}`);
    };

    const addShape = (type: Tool) => {
        if (!fabricCanvas.current) return;
        const canvas = fabricCanvas.current;
        const center = canvas.getVpCenter();
        const color = settings.visualTheme === 'high-contrast' ? '#ffff00' : '#000000';
        
        let object: fabric.Object;
        switch (type) {
            case 'rect': object = new fabric.Rect({ left: center.x, top: center.y, width: 100, height: 100, fill: 'transparent', stroke: color, strokeWidth: 2 }); break;
            case 'circle': object = new fabric.Circle({ left: center.x, top: center.y, radius: 50, fill: 'transparent', stroke: color, strokeWidth: 2 }); break;
            case 'line': object = new fabric.Line([0, 0, 100, 100], { left: center.x, top: center.y, stroke: color, strokeWidth: 2 }); break;
            case 'text': object = new fabric.IText('Text', { left: center.x, top: center.y, fontSize: 20, fill: color }); break;
            default: return;
        }
        
        canvas.add(object);
        canvas.setActiveObject(object);
        setTool('select');
        saveHistory();
        announce(`${type} added to canvas`);
    };

    const addRegularPolygon = (sides: number = 6) => {
        if (!fabricCanvas.current) return;
        const canvas = fabricCanvas.current;
        const center = canvas.getVpCenter();
        const color = settings.visualTheme === 'high-contrast' ? '#ffff00' : '#000000';
        const radius = 50;
        const points = [];
        for (let i = 0; i < sides; i++) {
            points.push({
                x: center.x + radius * Math.cos((i * 2 * Math.PI) / sides),
                y: center.y + radius * Math.sin((i * 2 * Math.PI) / sides)
            });
        }
        const polygon = new fabric.Polygon(points, {
            left: center.x - radius, top: center.y - radius, fill: 'transparent', stroke: color, strokeWidth: 2
        });
        canvas.add(polygon);
        canvas.setActiveObject(polygon);
        saveHistory();
        announce(`${sides}-sided polygon added`);
    };

    const deleteSelected = () => {
        if (!fabricCanvas.current) return;
        const activeObjects = fabricCanvas.current.getActiveObjects();
        if (activeObjects.length === 0) return;
        fabricCanvas.current.remove(...activeObjects);
        fabricCanvas.current.discardActiveObject().renderAll();
        saveHistory();
        announce(`Deleted ${activeObjects.length} objects`);
    };

    const importSVG = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !fabricCanvas.current) return;
        const reader = new FileReader();
        reader.onload = (f) => {
            const data = f.target?.result;
            if (typeof data === 'string') {
                fabric.loadSVGFromString(data, (objects, options) => {
                    const obj = fabric.util.groupSVGElements(objects, options);
                    const center = fabricCanvas.current!.getVpCenter();
                    obj.set({ left: center.x, top: center.y });
                    fabricCanvas.current?.add(obj).renderAll();
                    saveHistory();
                    announce("SVG imported");
                });
            }
        };
        reader.readAsText(file);
    };

    const exportToSVG = () => {
        if (!fabricCanvas.current) return;
        const svg = fabricCanvas.current.toSVG();
        const blob = new Blob([svg], { type: 'image/xml+svg' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = 'canvas-drawing.svg'; link.click();
        URL.revokeObjectURL(url);
        announce("Design exported as SVG");
    };

    const convertToCAMFeatures = () => {
        if (!fabricCanvas.current) return;
        const objects = fabricCanvas.current.getObjects();
        const camFeatures: CAMFeature[] = [];

        objects.forEach((obj, index) => {
            const id = uuid();
            let points: { x: number, y: number }[] = [];
            let type: CAMFeature['type'] = 'path';

            if (obj instanceof fabric.Rect) {
                type = 'rectangle';
                const width = obj.getScaledWidth(); const height = obj.getScaledHeight();
                const left = obj.left!; const top = obj.top!;
                points = [
                    { x: left, y: top }, { x: left + width, y: top },
                    { x: left + width, y: top + height }, { x: left, y: top + height }, { x: left, y: top }
                ];
            } else if (obj instanceof fabric.Circle) {
                type = 'circle';
                const radius = obj.getRadiusX();
                points = [{ x: obj.left! + radius, y: obj.top! + radius }];
            } else if (obj instanceof fabric.Polygon || obj instanceof fabric.Polyline) {
                type = 'path';
                const matrix = obj.calcTransformMatrix();
                points = (obj.points || []).map(p => {
                    const point = fabric.util.transformPoint(p, matrix);
                    return { x: point.x, y: point.y };
                });
            } else {
                const bound = obj.getBoundingRect();
                points = [
                    { x: bound.left, y: bound.top }, { x: bound.left + bound.width, y: bound.top },
                    { x: bound.left + bound.width, y: bound.top + bound.height }, { x: bound.left, y: bound.top + bound.height }, { x: bound.left, y: bound.top }
                ];
            }

            camFeatures.push({
                id, 
                name: (obj as any).name || `Canvas Shape ${index + 1}`, 
                type, 
                points, 
                selected: true,
                cylinderRadius: obj instanceof fabric.Circle ? obj.getRadiusX() : undefined,
                canvasObjectData: {
                    name: (obj as any).name,
                    type: obj.type
                }
            });
        });

        onAddFeatures(camFeatures);
        toast.success(existingFeatures.length > 0 ? "Design updated successfully" : `Created ${camFeatures.length} new features`);
        onClose();
    };

    const resetZoomPan = () => {
        if (!fabricCanvas.current) return;
        fabricCanvas.current.setViewportTransform([1, 0, 0, 1, 0, 0]);
        fabricCanvas.current.requestRenderAll();
    };

    const zoomToFit = () => {
        if (!fabricCanvas.current) return;
        const canvas = fabricCanvas.current;
        
        const scaleX = canvas.getWidth() / canvasSize.width;
        const scaleY = canvas.getHeight() / canvasSize.height;
        const zoom = Math.min(scaleX, scaleY) * 0.8;
        
        canvas.setZoom(zoom);
        const vpt = canvas.viewportTransform;
        if (vpt) {
            vpt[4] = canvas.getWidth() / 2 - (canvasSize.width * zoom) / 2;
            vpt[5] = canvas.getHeight() / 2 - (canvasSize.height * zoom) / 2;
        }
        canvas.requestRenderAll();
        announce("Canvas zoomed to fit stock");
    };

    const generateQR = () => {
        const text = prompt("Enter text or URL for QR Code:", "https://sienci.com");
        if (text && fabricCanvas.current) {
            const center = fabricCanvas.current.getVpCenter();
            generateQRCode(fabricCanvas.current, text, center.x, center.y);
            saveHistory();
            announce("QR Code generated");
        }
    };

    const applyLinearArray = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (!active) { toast.warning("Select an object to array."); return; }
        
        const rows = parseInt(prompt("Rows:", "3") || "1", 10);
        const cols = parseInt(prompt("Columns:", "3") || "1", 10);
        const spacingX = parseFloat(prompt("X Spacing:", "50") || "0");
        const spacingY = parseFloat(prompt("Y Spacing:", "50") || "0");
        
        createLinearArray(fabricCanvas.current, active, rows, cols, spacingX, spacingY);
        saveHistory();
        announce("Linear array created");
    };

    const applyCircularArray = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (!active) { toast.warning("Select an object to array."); return; }
        
        const count = parseInt(prompt("Number of copies:", "6") || "1", 10);
        const radius = parseFloat(prompt("Radius:", "100") || "0");
        const center = fabricCanvas.current.getVpCenter();
        
        createCircularArray(fabricCanvas.current, active, count, radius, center.x, center.y);
        saveHistory();
        announce("Circular array created");
    };

    const smoothSelectedPath = () => {
        if (!fabricCanvas.current) return;
        const active = fabricCanvas.current.getActiveObject();
        if (active instanceof fabric.Polygon || active instanceof fabric.Polyline) {
            smoothPath(fabricCanvas.current, active, 2);
            saveHistory();
            announce("Path smoothed");
        } else {
            toast.warning("Select a polygon or polyline to smooth.");
        }
    };

    const addVisualTab = () => {
        setTool('tabs');
        toast.info("Click anywhere near a shape to drop a holding tab.");
    };

    const centerToStock = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const active = canvas.getActiveObject();
        if (active) {
            active.center();
            active.setCoords();
            canvas.requestRenderAll();
            saveHistory();
            toast.success("Centered object to stock");
        } else {
            toast.warning("Select an object to center");
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 dark:bg-dark border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden relative shadow-2xl" onClick={() => setActiveMenu(null)}>
            {/* Screen Reader Announcements */}
            <div className="sr-only" aria-live="polite">{announcement}</div>

            {/* Toolbar Top */}
            <div className="flex flex-col border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-light shadow-sm z-10">
                <div className="flex items-center justify-between p-2 flex-wrap gap-2">
                    <div className="flex items-center gap-1">
                        {/* 1. SELECTION & VIEW */}
                        <div className="flex items-center gap-1 pr-2 border-r border-gray-200 dark:border-gray-700">
                            <div className="flex flex-col items-center">
                                <Button variant={activeTool === 'select' ? 'alt' : 'outline'} size="sm" onClick={() => setTool('select')} aria-label="Selection Tool" tooltip={{ content: "Select (V)" }}><MousePointer2 size={16} /></Button>
                                {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Select</span>}
                            </div>
                            <div className="flex flex-col items-center">
                                <Button variant={activeTool === 'pan' ? 'alt' : 'outline'} size="sm" onClick={() => setTool('pan')} aria-label="Pan Tool" tooltip={{ content: "Pan (Space+Drag)" }}><Hand size={16} /></Button>
                                {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Pan</span>}
                            </div>
                            <div className="flex flex-col items-center">
                                <Button variant={activeTool === 'measure' ? 'alt' : 'outline'} size="sm" onClick={() => setTool('measure')} aria-label="Measure Tool" tooltip={{ content: "Caliper Tool" }}><Ruler size={16} /></Button>
                                {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Measure</span>}
                            </div>
                        </div>

                        {/* 2. CREATION MENU */}
                        <div className="relative flex flex-col items-center ml-1">
                            <Button 
                                variant="outline" size="sm" className="gap-2 px-3" 
                                onClick={(e) => { e.stopPropagation(); toggleMenu('create'); }} 
                                aria-label="Create Menu: Add Shapes, Text, or QR Codes"
                                tooltip={{ content: "Add shapes, text, or QR codes" }}
                            >
                                <Plus size={16} /> Create
                            </Button>
                            {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Add</span>}
                            {activeMenu === 'create' && (
                                <div className="absolute top-full left-0 mt-2 bg-white dark:bg-dark-light border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[60] flex flex-col gap-1 min-w-[160px] animate-in slide-in-from-top-2 duration-200">
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => addShape('rect')} aria-label="Add Rectangle"><Square size={14} /> Rectangle</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => addShape('circle')} aria-label="Add Circle"><Circle size={14} /> Circle</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => addShape('line')} aria-label="Add Line"><Minus size={14} /> Line</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => addRegularPolygon(6)} aria-label="Add Hexagon"><Hexagon size={14} /> Hexagon</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => addShape('text')} aria-label="Add Text"><Type size={14} /> Text</Button>
                                    <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={generateQR} aria-label="Add QR Code"><QrCode size={14} /> QR Code</Button>
                                    <label className="cursor-pointer">
                                        <input type="file" className="hidden" accept="image/*" onChange={traceImage} />
                                        <div className="inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-3 w-full" role="button" aria-label="Trace Image to Vector">
                                            <ImageIcon size={14} /> Trace Image
                                        </div>
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* 3. EDIT MENU (LAYOUT & PATHS) */}
                        <div className="relative flex flex-col items-center">
                            <Button 
                                variant="outline" size="sm" className="gap-2 px-3" 
                                onClick={(e) => { e.stopPropagation(); toggleMenu('edit'); }} 
                                aria-label="Edit Menu: Alignment and Path Operations"
                                tooltip={{ content: "Modify and align objects" }}
                            >
                                <Combine size={16} /> Edit
                            </Button>
                            {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Modify</span>}
                            {activeMenu === 'edit' && (
                                <div className="absolute top-full left-0 mt-2 bg-white dark:bg-dark-light border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[60] flex flex-col gap-1 min-w-[200px] animate-in slide-in-from-top-2 duration-200">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase p-1">Alignment</div>
                                    <div className="grid grid-cols-3 gap-1 px-1 pb-2 border-b border-gray-100 dark:border-gray-800 mb-1">
                                        <Button variant="ghost" size="sm" onClick={() => alignSelected('left')} aria-label="Align Left"><AlignLeft size={14} /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => alignSelected('center')} aria-label="Align Center"><AlignCenter size={14} /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => alignSelected('right')} aria-label="Align Right"><AlignRight size={14} /></Button>
                                    </div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase p-1">Pathing</div>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => booleanOperation('union')} aria-label="Merge Shapes (Union)"><Combine size={14} /> Union (Merge)</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => booleanOperation('subtract')} aria-label="Subtract Shapes"><Scissors size={14} /> Subtract</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => offsetPath(5)} aria-label="Offset Path Outer 5mm"><Plus size={14} /> Offset (Out 5mm)</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => offsetPath(-5)} aria-label="Offset Path Inner 5mm"><Minus size={14} /> Offset (In 5mm)</Button>
                                    <Button variant={isNodeEditing ? 'alt' : 'ghost'} size="sm" className="justify-start gap-3 w-full" onClick={toggleNodeEdit} aria-label="Edit Individual Nodes"><Edit3 size={14} /> Node Editing</Button>
                                </div>
                            )}
                        </div>

                        {/* 4. CNC TOOLS MENU */}
                        <div className="relative flex flex-col items-center">
                            <Button 
                                variant="outline" size="sm" className="gap-2 px-3 font-bold text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900" 
                                onClick={(e) => { e.stopPropagation(); toggleMenu('cnc'); }} 
                                aria-label="CNC Menu: Dogbones, Fillets, and Tabs"
                                tooltip={{ content: "CNC Specific features" }}
                            >
                                <CircleDot size={16} /> CNC
                            </Button>
                            {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Machine</span>}
                            {activeMenu === 'cnc' && (
                                <div className="absolute top-full left-0 mt-2 bg-white dark:bg-dark-light border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[60] flex flex-col gap-1 min-w-[180px] animate-in slide-in-from-top-2 duration-200">
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={addDogbones} aria-label="Add Corner Dogbones"><CircleDot size={14} /> Corner Dogbones</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={runFillet} aria-label="Fillet/Round Corners"><CornerDownRight size={14} /> Fillet Corners</Button>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={runChamfer} aria-label="Chamfer/Angle Corners"><Scissors size={14} className="transform rotate-90" /> Chamfer Corners</Button>
                                    <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                                    <Button variant={activeTool === 'tabs' ? 'alt' : 'ghost'} size="sm" className="justify-start gap-3 w-full" onClick={addVisualTab} aria-label="Drop Holding Tab Bridge"><MapPin size={14} className="text-red-500" /> Drop Visual Tab</Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* UNDO / REDO / DELETE */}
                    <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-2">
                        <div className="flex flex-col items-center">
                            <Button variant="outline" size="sm" onClick={undo} disabled={historyIdx <= 0} aria-label="Undo last action" tooltip={{ content: "Undo (Ctrl+Z)" }}><Undo2 size={16} /></Button>
                            {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Undo</span>}
                        </div>
                        <div className="flex flex-col items-center">
                            <Button variant="outline" size="sm" onClick={redo} disabled={historyIdx >= history.length - 1} aria-label="Redo last action" tooltip={{ content: "Redo (Ctrl+Y)" }}><Redo2 size={16} /></Button>
                            {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Redo</span>}
                        </div>
                        <div className="flex flex-col items-center">
                            <Button variant="outline" size="sm" onClick={deleteSelected} disabled={!selectedObject} aria-label="Delete selected object" tooltip={{ content: "Delete (Del)" }}><Trash2 size={16} className="text-red-500" /></Button>
                            {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Delete</span>}
                        </div>
                    </div>

                    {/* PROJECT ACTIONS */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex flex-col items-center">
                            <Button 
                                variant="outline" size="sm" className="gap-2 px-3" 
                                onClick={(e) => { e.stopPropagation(); toggleMenu('file'); }} 
                                aria-label="File Menu: Import and Export"
                                tooltip={{ content: "Import/Export design" }}
                            >
                                <Save size={16} /> File
                            </Button>
                            {showHelp && <span className="text-[8px] text-gray-500 mt-0.5">Project</span>}
                            {activeMenu === 'file' && (
                                <div className="absolute top-full right-0 mt-2 bg-white dark:bg-dark-light border border-gray-200 dark:border-gray-700 shadow-xl rounded-lg p-2 z-[60] flex flex-col gap-1 min-w-[180px] animate-in slide-in-from-top-2 duration-200">
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={() => importFeaturesFromDesign()} aria-label="Reload original design from visualizer"><History size={14} /> Reload Original</Button>
                                    <label className="cursor-pointer">
                                        <input type="file" className="hidden" accept=".svg" onChange={importSVG} />
                                        <div className="inline-flex items-center justify-start rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-9 px-3 gap-3 w-full" role="button" aria-label="Import SVG Design">
                                            <Upload size={14} /> Import SVG
                                        </div>
                                    </label>
                                    <Button variant="ghost" size="sm" className="justify-start gap-3 w-full" onClick={exportToSVG} aria-label="Export drawing as SVG image"><Download size={14} /> Export as SVG</Button>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col items-center">
                            <Button variant="alt" size="sm" onClick={convertToCAMFeatures} className="gap-2 font-bold" aria-label="Finish and Apply Changes to Project" tooltip={{ content: "Finish and apply changes" }}><CheckCircle2 size={16} /> Apply Changes</Button>
                            {showHelp && <span className="text-[8px] text-robin-500 font-bold mt-0.5">Apply</span>}
                        </div>
                        <div className="flex flex-col items-center">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setShowHelp(!showHelp); }} aria-label="Toggle Help Labels" tooltip={{ content: "Help Mode" }} className={showHelp ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-inner" : ""}><HelpCircle size={16} /></Button>
                            {showHelp && <span className="text-[8px] text-blue-500 font-bold mt-0.5">Help {showHelp ? 'ON' : ''}</span>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Exit Canvas" tooltip={{ content: "Exit Canvas" }}><X size={16} /></Button>
                    </div>
                </div>
                {showHelp && (
                    <div className="px-4 py-1 text-[10px] text-blue-600 dark:text-blue-400 italic bg-blue-50/30 dark:bg-blue-900/10 border-t border-blue-100/50 dark:border-blue-900/20">
                        Help Mode Active: Access all tools via menus. Use the Properties panel on the right for precise adjustments.
                    </div>
                )}
            </div>

            <div className="flex flex-1 overflow-hidden bg-gray-50 dark:bg-dark">
                {/* Left Tool Sidebar */}
                <div className="w-14 bg-white dark:bg-dark-light border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4 gap-4 overflow-y-auto no-scrollbar shadow-sm">
                    <div className="flex flex-col items-center gap-1">
                        <Button variant={snapToGrid ? 'alt' : 'ghost'} size="sm" className="p-2 h-auto" onClick={() => { setSnapToGrid(!snapToGrid); }} aria-label="Toggle Grid Snapping" tooltip={{ content: "Snap to Grid" }}><Grid3X3 size={20} /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500">Snap</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Button variant="ghost" size="sm" className="p-2 h-auto" onClick={duplicateSelected} disabled={!selectedObject} aria-label="Duplicate selected object" tooltip={{ content: "Duplicate (Ctrl+D)" }}><Copy size={20} /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500">Clone</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Button variant="ghost" size="sm" className="p-2 h-auto" onClick={centerToStock} disabled={!selectedObject} aria-label="Center object to material origin" tooltip={{ content: "Center on Stock" }}><Maximize size={20} /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500 text-center leading-[8px]">Center Stock</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Button variant="ghost" size="sm" className="p-2 h-auto" onClick={zoomToFit} aria-label="Zoom to fit the material bounds" tooltip={{ content: "Zoom to Fit Stock" }}><Minimize size={20} /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500 text-center leading-[8px]">Zoom Fit</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Button variant="ghost" size="sm" className="p-2 h-auto" onClick={resetZoomPan} aria-label="Reset zoom and panning to default" tooltip={{ content: "Reset View (1:1)" }}><Move size={20} /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500">Reset</span>}
                    </div>
                    <div className="w-8 h-px bg-gray-200 dark:bg-gray-700" />
                    <div className="flex flex-col items-center gap-1">
                        <Button variant="ghost" size="sm" className="p-2 h-auto" onClick={applyLinearArray} disabled={!selectedObject} aria-label="Create multiple copies in a grid" tooltip={{ content: "Linear Array (Grid)" }}><GripHorizontal size={20} className="text-blue-500" /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500 text-center leading-[8px]">Grid Array</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Button variant="ghost" size="sm" className="p-2 h-auto" onClick={applyCircularArray} disabled={!selectedObject} aria-label="Create multiple copies in a circle" tooltip={{ content: "Circular Array (Radial)" }}><CircleDot size={20} className="text-blue-500" /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500 text-center leading-[8px]">Radial Array</span>}
                    </div>
                    <div className="w-8 h-px bg-gray-200 dark:bg-gray-700" />
                    <div className="flex flex-col items-center gap-1">
                        <Button variant="ghost" size="sm" className="p-2 h-auto" onClick={smoothSelectedPath} disabled={!selectedObject} aria-label="Smooth and simplify the selected path" tooltip={{ content: "Smooth and Simplify Path" }}><Spline size={20} className="text-purple-500" /></Button>
                        {showHelp && <span className="text-[8px] text-gray-500">Smooth</span>}
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setTool('pencil')} 
                            aria-label="Freehand pencil tool" 
                            tooltip={{ content: "Freehand Pencil" }} 
                            className={cx("p-2 h-auto", activeTool === 'pencil' ? "text-robin-500 bg-robin-50/10" : "")}
                        >
                            <Pencil size={20} />
                        </Button>
                        {showHelp && <span className="text-[8px] text-gray-500">Pencil</span>}
                    </div>
                </div>

                {/* Main Canvas Area */}
                <div className="flex-1 overflow-auto p-8 flex justify-center items-start no-scrollbar bg-gray-200 dark:bg-dark pattern-grid-lg relative shadow-inner">
                    <div 
                        className={cx("shadow-2xl bg-white border border-gray-300 relative", snapToGrid && "pattern-grid-sm")}
                        style={{ 
                            backgroundImage: snapToGrid ? `radial-gradient(circle, #ccc 1px, transparent 1px)` : 'none',
                            backgroundSize: snapToGrid ? `${gridSize}px ${gridSize}px` : 'auto'
                        }}
                    >
                        <canvas ref={canvasRef} />
                        <div className="sr-only">Canvas size {canvasSize.width} by {canvasSize.height}.</div>
                    </div>

                    {measureText && (
                        <div 
                            className="absolute bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded shadow-lg pointer-events-none z-50 transform -translate-x-1/2 -translate-y-full mt-[-10px]"
                            style={{ left: measurePos.x, top: measurePos.y }}
                        >
                            {measureText}
                        </div>
                    )}

                    {/* Context Menu */}
                    {contextMenu.visible && (
                        <div 
                            className="absolute bg-white dark:bg-dark-light border border-gray-200 dark:border-gray-700 shadow-xl rounded-md py-1 z-50 min-w-[150px] animate-in fade-in zoom-in-95 duration-100"
                            style={{ top: contextMenu.y, left: contextMenu.x }}
                        >
                            <button className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors" onClick={duplicateSelected}>Duplicate</button>
                            <button className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors" onClick={() => alignSelected('center')}>Align Center</button>
                            <button className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors" onClick={() => booleanOperation('union')}>Union (Merge)</button>
                            <button className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900 transition-colors" onClick={() => booleanOperation('subtract')}>Subtract</button>
                            <hr className="my-1 border-gray-200 dark:border-gray-700" />
                            <button className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" onClick={deleteSelected}>Delete</button>
                        </div>
                    )}
                </div>

                {/* Right Properties/Layers Sidebar */}
                <div className="w-72 bg-gray-50 dark:bg-dark-light border-l border-gray-200 dark:border-gray-700 flex flex-col overflow-y-auto no-scrollbar shadow-sm">
                    <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-light sticky top-0 z-10">
                        <button className={cx("flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-all", activeSidebarTab === 'properties' ? "border-b-2 border-robin-500 text-robin-500 bg-blue-50/30 dark:bg-blue-900/10" : "text-gray-500 hover:text-gray-700")} onClick={() => setActiveSidebarTab('properties')} aria-label="Show Properties Panel"><BoxSelect size={12} className="inline mr-1" />Props</button>
                        <button className={cx("flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-all", activeSidebarTab === 'layers' ? "border-b-2 border-robin-500 text-robin-500 bg-blue-50/30 dark:bg-blue-900/10" : "text-gray-500 hover:text-gray-700")} onClick={() => setActiveSidebarTab('layers')} aria-label="Show Layers Panel"><Layers size={12} className="inline mr-1" />Layers</button>
                        <button className={cx("flex-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-all", activeSidebarTab === 'library' ? "border-b-2 border-robin-500 text-robin-500 bg-blue-50/30 dark:bg-blue-900/10" : "text-gray-500 hover:text-gray-700")} onClick={() => setActiveSidebarTab('library')} aria-label="Show Library Panel"><Library size={12} className="inline mr-1" />Library</button>
                    </div>

                    {activeSidebarTab === 'properties' ? (
                        <>
                            <div className="p-4 border-b border-gray-200 dark:border-gray-700 min-h-[250px]">
                                {!selectedObject ? (
                                    <div className="text-sm text-gray-500 italic py-8 text-center bg-white/50 dark:bg-dark/20 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">Select an object to edit</div>
                                ) : (
                                    <div className="flex flex-col gap-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <NumericInputWithControls label="X" value={Math.round(selectedObject.left || 0)} onChange={(val) => { selectedObject.set('left', val); fabricCanvas.current?.renderAll(); saveHistory(); }} unit={settings.units} step={gridSize} />
                                            <NumericInputWithControls label="Y" value={Math.round(selectedObject.top || 0)} onChange={(val) => { selectedObject.set('top', val); fabricCanvas.current?.renderAll(); saveHistory(); }} unit={settings.units} step={gridSize} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <NumericInputWithControls label="W" value={Math.round((selectedObject.width || 0) * (selectedObject.scaleX || 1))} onChange={(val) => { selectedObject.set('scaleX', val / (selectedObject.width || 1)); fabricCanvas.current?.renderAll(); saveHistory(); }} unit={settings.units} step={gridSize} />
                                            <NumericInputWithControls label="H" value={Math.round((selectedObject.height || 0) * (selectedObject.scaleY || 1))} onChange={(val) => { selectedObject.set('scaleY', val / (selectedObject.height || 1)); fabricCanvas.current?.renderAll(); saveHistory(); }} unit={settings.units} step={gridSize} />
                                        </div>
                                        <NumericInputWithControls label="Rotation" value={Math.round(selectedObject.angle || 0)} onChange={(val) => { selectedObject.set('angle', val); fabricCanvas.current?.renderAll(); saveHistory(); }} unit="deg" step={15} />
                                        
                                        {selectedObject.type === 'i-text' && (
                                            <div className="flex flex-col gap-1 w-full pt-2 border-t border-gray-100 dark:border-gray-700">
                                                <label className="text-[10px] font-bold text-gray-500 uppercase flex justify-between items-center">
                                                    Font Family
                                                </label>
                                                <select 
                                                    className="w-full text-xs h-8 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-robin-500 px-2 outline-none"
                                                    value={(selectedObject as fabric.IText).fontFamily || 'Arial'}
                                                    aria-label="Font Family"
                                                    onChange={(e) => {
                                                        (selectedObject as fabric.IText).set('fontFamily', e.target.value);
                                                        fabricCanvas.current?.renderAll();
                                                        saveHistory();
                                                    }}
                                                >
                                                    <option value="Arial">Arial</option>
                                                    <option value="Courier New">Courier New</option>
                                                    <option value="Times New Roman">Times New Roman</option>
                                                    <option value="Georgia">Georgia</option>
                                                    <option value="Verdana">Verdana</option>
                                                    <option value="Trebuchet MS">Trebuchet MS</option>
                                                    <option value="Impact">Impact</option>
                                                    <option value="Comic Sans MS">Comic Sans MS</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="p-4 bg-white/30 dark:bg-dark/10">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Maximize size={12} /> Canvas Dimensions</h3>
                                <div className="flex flex-col gap-4">
                                    <NumericInputWithControls label="Stock Width (X)" value={canvasSize.width} onChange={(val) => { setCanvasSize(prev => ({ ...prev, width: val })); fabricCanvas.current?.setWidth(val); }} unit={settings.units} step={10} min={10} />
                                    <NumericInputWithControls label="Stock Length (Y)" value={canvasSize.height} onChange={(val) => { setCanvasSize(prev => ({ ...prev, height: val })); fabricCanvas.current?.setHeight(val); }} unit={settings.units} step={10} min={10} />
                                    <div className="mt-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                                        <NumericInputWithControls label="Grid Size" value={gridSize} onChange={(val) => setGridSize(Math.max(1, val))} unit={settings.units} step={settings.units === 'inch' ? 0.0625 : 1} min={1} />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : activeSidebarTab === 'layers' ? (
                        <div className="p-2 flex flex-col gap-1 overflow-y-auto h-full">
                            {layerObjects.length === 0 ? (
                                <div className="text-sm text-gray-500 italic p-8 text-center bg-white/50 dark:bg-dark/20 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 m-2">No objects on canvas</div>
                            ) : (
                                layerObjects.map((obj, i) => (
                                    <div 
                                        key={i} 
                                        className={cx("flex items-center justify-between p-2 rounded cursor-pointer text-sm transition-colors border", selectedObject === obj ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 shadow-sm" : "hover:bg-white dark:hover:bg-dark border-transparent")}
                                        onClick={() => { fabricCanvas.current?.setActiveObject(obj); fabricCanvas.current?.renderAll(); }}
                                    >
                                        <span className="capitalize flex items-center gap-2 font-medium">
                                            {obj.type === 'rect' && <Square size={14} className="text-blue-500" />}
                                            {obj.type === 'circle' && <Circle size={14} className="text-blue-500" />}
                                            {obj.type === 'i-text' && <Type size={14} className="text-blue-500" />}
                                            {(obj.type === 'polygon' || obj.type === 'polyline' || obj.type === 'path') && <Hexagon size={14} className="text-blue-500" />}
                                            {obj.type || 'Object'} {layerObjects.length - i}
                                        </span>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="mini" className="p-1 h-auto" onClick={(e) => { e.stopPropagation(); obj.set('visible', !obj.visible); fabricCanvas.current?.renderAll(); }} aria-label={obj.visible === false ? "Show layer" : "Hide layer"}><Maximize size={12} className={obj.visible === false ? 'opacity-30' : 'text-blue-500'}/></Button>
                                            <Button variant="ghost" size="mini" className="p-1 h-auto" onClick={(e) => { e.stopPropagation(); fabricCanvas.current?.remove(obj); saveHistory(); }} aria-label="Remove layer"><Trash2 size={12} className="text-red-400" /></Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="p-4 flex flex-col gap-4 h-full">
                            <Button variant="alt" size="sm" className="w-full gap-2 border-dashed" onClick={saveToLibrary} aria-label="Save selection to library"><Plus size={14} /> Save to Library</Button>
                            
                            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
                                {library.length === 0 ? (
                                    <div className="text-sm text-gray-500 italic py-12 text-center bg-white/50 dark:bg-dark/20 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">Your component library is empty.<br/><br/>Select an object and click above to save it as a reusable template.</div>
                                ) : (
                                    library.map((item, i) => (
                                        <div key={i} className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-dark shadow-sm hover:shadow-md transition-shadow">
                                            <div className="bg-gray-50 dark:bg-dark-light p-2 text-xs font-bold flex justify-between items-center border-b border-gray-200 dark:border-gray-700">
                                                <span className="truncate max-w-[180px]">{item.name}</span>
                                                <Button variant="ghost" size="mini" className="p-1 h-auto text-red-500" onClick={() => {
                                                    const newLib = library.filter((_, idx) => idx !== i);
                                                    setLibrary(newLib);
                                                    localStorage.setItem('gsender-canvas-library', JSON.stringify(newLib));
                                                }} aria-label={`Delete ${item.name} from library`}><Trash2 size={12} /></Button>
                                            </div>
                                            <div className="p-2">
                                                <Button variant="primary" size="xs" className="w-full text-[10px] h-7" onClick={() => loadFromLibrary(item.data)} aria-label={`Insert ${item.name} into canvas`}>Insert into Canvas</Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Canvas;