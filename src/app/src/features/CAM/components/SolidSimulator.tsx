import React, { useEffect, useRef, useMemo } from 'react';
import { CAMTool, CAMSettings } from '../definitions';

interface SolidSimulatorProps {
    gcode?: string;
    settings: CAMSettings;
    tools: CAMTool[];
    currentLine: number;
}

const SolidSimulator = ({ gcode, settings, tools, currentLine }: SolidSimulatorProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    // Parse GCode into a structured path array for fast drawing
    const paths = useMemo(() => {
        if (!gcode) return [];
        const lines = gcode.split('\n');
        const parsed = [];
        let cx = 0, cy = 0, cz = 0;
        let toolDia = 3.175; // Default 1/8"
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Tool Change Detection
            const toolMatch = line.match(/T(\d+)/);
            if (toolMatch) {
                const tId = toolMatch[1];
                const tool = tools.find(t => t.id === tId || t.name.includes(tId));
                if (tool) toolDia = tool.metricDiameter;
            }
            
            let nx = cx, ny = cy, nz = cz;
            let move = false;
            
            const xMatch = line.match(/X([-\d.]+)/);
            if (xMatch) { nx = parseFloat(xMatch[1]); move = true; }
            
            const yMatch = line.match(/Y([-\d.]+)/);
            if (yMatch) { ny = parseFloat(yMatch[1]); move = true; }
            
            const zMatch = line.match(/Z([-\d.]+)/);
            if (zMatch) { nz = parseFloat(zMatch[1]); move = true; }
            
            if (move) {
                const isPlunged = settings.zOrigin === 'top' ? nz < 0 : nz < settings.stockThickness;
                parsed.push({ 
                    x: nx, y: ny, z: nz, 
                    isCutting: isPlunged && line.startsWith('G1'),
                    toolDia,
                    lineIdx: i 
                });
                cx = nx; cy = ny; cz = nz;
            }
        }
        return parsed;
    }, [gcode, tools, settings.zOrigin, settings.stockThickness]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !paths.length) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = settings.stockWidth;
        const h = settings.stockLength;
        
        const scale = 4;
        canvas.width = w * scale;
        canvas.height = h * scale;
        
        // Stock background
        ctx.fillStyle = '#d4a373';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        let lastPt = paths[0];
        
        for (let i = 1; i < paths.length; i++) {
            const pt = paths[i];
            if (pt.lineIdx > currentLine) break;
            
            if (pt.isCutting && lastPt) {
                const depth = settings.zOrigin === 'top' ? Math.abs(pt.z) : settings.stockThickness - pt.z;
                const maxDepth = settings.stockThickness || 10;
                const depthRatio = Math.max(0, Math.min(1, depth / maxDepth));
                
                const r = Math.floor(212 - (212 - 62) * depthRatio);
                const g = Math.floor(163 - (163 - 39) * depthRatio);
                const b = Math.floor(115 - (115 - 35) * depthRatio);
                
                ctx.strokeStyle = `rgb(${r},${g},${b})`;
                ctx.lineWidth = pt.toolDia * scale;
                
                ctx.beginPath();
                ctx.moveTo(lastPt.x * scale, (h - lastPt.y) * scale);
                ctx.lineTo(pt.x * scale, (h - pt.y) * scale);
                ctx.stroke();
            }
            lastPt = pt;
        }

    }, [paths, currentLine, settings.stockWidth, settings.stockLength, settings.zOrigin, settings.stockThickness]);

    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 p-4">
            <div className="relative shadow-2xl border-4 border-gray-800 rounded-md overflow-hidden bg-black/50" style={{
                width: '100%', 
                height: '100%',
                maxHeight: '80%',
                maxWidth: '80%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.95
            }}>
                <canvas 
                    ref={canvasRef} 
                    className="max-w-full max-h-full object-contain drop-shadow-2xl"
                />
            </div>
            <div className="absolute bottom-6 right-6 bg-black/80 px-3 py-1.5 rounded text-xs text-amber-500 font-bold tracking-widest uppercase border border-amber-500/50 backdrop-blur-sm">
                2.5D Solid Simulation
            </div>
        </div>
    );
};

export default SolidSimulator;
