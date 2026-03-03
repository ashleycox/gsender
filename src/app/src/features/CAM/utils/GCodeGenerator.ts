import { CAMFeature, CAMPathingOption, CAMSettings, CAMTool } from '../definitions';

const DEFAULT_TOOLS: CAMTool[] = [
    { id: '1', name: '1/8" Endmill', type: 'Endmill', metricDiameter: 3.175, imperialDiameter: 0.125, flutes: 2, stepover: 40, stepdown: 1.5, feedrate: 1000, plungeRate: 300, spindleRPM: 18000, toolLength: 30 },
    { id: '2', name: '1/4" Endmill', type: 'Endmill', metricDiameter: 6.35, imperialDiameter: 0.25, flutes: 2, stepover: 40, stepdown: 3, feedrate: 1500, plungeRate: 400, spindleRPM: 16000, toolLength: 35 },
    { id: '3', name: '60deg V-Bit', type: 'V-Bit', metricDiameter: 6.35, imperialDiameter: 0.25, flutes: 1, stepover: 10, stepdown: 1, feedrate: 800, plungeRate: 200, spindleRPM: 20000, toolLength: 25, angle: 60 },
];

export default class GCodeGenerator {
    features: CAMFeature[];
    options: CAMPathingOption[];
    settings: CAMSettings;
    tools: CAMTool[];

    constructor(features: CAMFeature[], options: CAMPathingOption[], settings: CAMSettings, tools: CAMTool[]) {
        this.features = features;
        this.options = options;
        this.settings = settings;
        this.tools = tools;
    }

    generate(): { gcode: string, estimatedTime: number } {
        const { 
            units, zOrigin, millingSide, safeZ, spindle, mist, flood, 
            scalingType, scalePercentage, targetWidth, targetHeight, 
            nestingX, nestingY, nestingSpacing, nestingType, 
            stockThickness, stockWidth, stockLength,
            startGcode, endGcode, gcodeComments, gcodeLineNumbers,
            optimizePath, stayDownRapids, collisionDetection, setups, activeSetupId, tiling
        } = this.settings;
        const gcodeLines: string[] = [];
        let estimatedTimeSeconds = 0;
        let currentX = 0, currentY = 0, currentZ = safeZ;
        let lineNumber = 10;

        const zOffset = zOrigin === 'bed' ? stockThickness : 0;

        // Kinematic Estimation parameters (assumed typical GRBL defaults if not provided)
        const accelXY = 500; // mm/s^2
        const accelZ = 50; // mm/s^2

        const updateTime = (x: number, y: number, z: number, feedrate: number) => {
            const dx = x - currentX, dy = y - currentY, dz = z - currentZ;
            const dist = Math.hypot(dx, dy, dz);
            if (dist > 0.001) {
                const f = feedrate > 0 ? feedrate : 3000;
                const vMax = f / 60; // mm/s
                const a = Math.abs(dz) > Math.abs(dx) && Math.abs(dz) > Math.abs(dy) ? accelZ : accelXY;
                const tAccel = vMax / a;
                const dAccel = 0.5 * a * tAccel * tAccel;
                if (dist >= 2 * dAccel) estimatedTimeSeconds += (2 * tAccel) + ((dist - 2 * dAccel) / vMax);
                else estimatedTimeSeconds += 2 * Math.sqrt(dist / a);
            }
            currentX = x; currentY = y; currentZ = z;
        };

        let lastG0X = -Infinity, lastG0Y = -Infinity, lastG0Z = -Infinity;

        const pushLine = (line: string, nx?: number, ny?: number, nz?: number, f?: number) => {
            let finalLine = line;
            
            // --- AIR-TIME OPTIMIZER: Redundant G0 Removal ---
            if (finalLine.startsWith('G0')) {
                const isZMove = finalLine.includes('Z');
                const isXYMove = finalLine.includes('X') || finalLine.includes('Y');
                
                // Only filter simple positional G0s
                if (!finalLine.includes(';') && !finalLine.includes('(')) {
                    if (isZMove && !isXYMove && nz !== undefined) {
                        if (Math.abs(nz - lastG0Z) < 0.001) return; // Skip redundant Z
                        lastG0Z = nz;
                    }
                    if (isXYMove && !isZMove && nx !== undefined && ny !== undefined) {
                        if (Math.abs(nx - lastG0X) < 0.001 && Math.abs(ny - lastG0Y) < 0.001) return; // Skip redundant XY
                        lastG0X = nx; lastG0Y = ny;
                    }
                }
            } else if (finalLine.startsWith('G1')) {
                // If we make a cutting move, invalidate the G0 cache so the next G0 is forced
                lastG0X = -Infinity; lastG0Y = -Infinity; lastG0Z = -Infinity;
            }

            // Handle Comments
            if (gcodeComments === false) {
                finalLine = finalLine.replace(/\(.*\)/g, '').replace(/;.*$/, '').trim();
            }
            
            if (finalLine) {
                // Handle Line Numbers
                if (gcodeLineNumbers) {
                    finalLine = `N${lineNumber} ${finalLine}`;
                    lineNumber += 10;
                }
                gcodeLines.push(finalLine);
            }
            
            if (nx !== undefined && ny !== undefined && nz !== undefined) updateTime(nx, ny, nz, f || 0);
        };

        let scaleFactor = scalingType === 'percentage' ? scalePercentage / 100 : 1;
        let designWidth = 0, designHeight = 0;
        
        const getBounds = (pts: {x: number, y: number}[]) => {
            if (!pts || pts.length === 0) return { width: 0, height: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
            return { width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY), minX, maxX, minY, maxY };
        };

        const selectedFeatures = this.features.filter(f => f.selected);
        if (selectedFeatures.length > 0) {
            const globalBounds = getBounds(selectedFeatures.flatMap(f => f.points));
            if (scalingType === 'dimensions' && targetWidth > 0 && targetHeight > 0 && globalBounds.width > 0 && globalBounds.height > 0) {
                scaleFactor = Math.min(targetWidth / globalBounds.width, targetHeight / globalBounds.height);
            }
            designWidth = globalBounds.width * scaleFactor;
            designHeight = globalBounds.height * scaleFactor;
        }

        // --- VISUALIZER OVERLAYS ---
        pushLine('(--- VISUALIZER OVERLAYS ---)');
        pushLine(`(STOCK_BOX: W=${stockWidth}, L=${stockLength}, T=${stockThickness}, Z_REF=${zOrigin})`);
        
        const vSafeZ = safeZ + zOffset + 50; 
        pushLine(`G0 Z${vSafeZ.toFixed(3)}`);
        pushLine(`G0 X0 Y0`);
        pushLine(`G0 X${stockWidth} Y0`);
        pushLine(`G0 X${stockWidth} Y${stockLength}`);
        pushLine(`G0 X0 Y${stockLength}`);
        pushLine(`G0 X0 Y0`);

        pushLine('(ORIGIN_TRIPOD: X=Red, Y=Green, Z=Blue)');
        pushLine(`G0 X0 Y0 Z${zOffset}`);
        pushLine(`G0 X10 Y0`);
        pushLine(`G0 X0 Y0`);
        pushLine(`G0 X0 Y10`);
        pushLine(`G0 X0 Y0`);
        pushLine(`G0 X0 Y0 Z${zOffset + 10}`);
        pushLine(`G0 Z${(safeZ + zOffset).toFixed(3)}`);

        // --- START G-CODE INJECTION ---
        if (startGcode) {
            pushLine('\n(--- START CUSTOM G-CODE ---)');
            startGcode.split('\n').forEach(line => pushLine(line));
            pushLine('(--- END CUSTOM G-CODE ---)\n');
        }

        // --- ACTUAL OPERATIONS ---
        const operations = selectedFeatures.map(feature => {
            const option = this.options.find(o => o.featureId === feature.id);
            const tool = option ? [...DEFAULT_TOOLS, ...this.tools].find(t => t.id === option.toolId) : undefined;
            return { feature, option, tool };
        }).filter(op => op.option && op.tool);

        const typePriority: Record<string, number> = { 'pocket': 0, 'inside': 1, 'on-line': 2, 'outside': 3, '3d-raster': 4 };
        operations.sort((a, b) => {
            // Primary sort by user-defined order
            const orderA = a.feature.order ?? 9999;
            const orderB = b.feature.order ?? 9999;
            if (orderA !== orderB) return orderA - orderB;

            // Secondary sort by tool
            if (a.tool!.id !== b.tool!.id) return a.tool!.id.localeCompare(b.tool!.id);
            
            // Tertiary sort by strategy
            return (typePriority[a.option!.type] || 0) - (typePriority[b.option!.type] || 0);
        });

        const initialRPM = operations[0]?.tool?.spindleRPM || 10000;

        pushLine('\n(--- MAIN PROGRAM ---)');
        pushLine(`(Z-Origin: ${zOrigin.toUpperCase()})`);

        if (collisionDetection?.enabled) {
            pushLine(`(--- COLLISION DETECTION ENABLED ---)`);
            pushLine(`(Collet Dia: ${collisionDetection.colletDiameter}mm, Collet Len: ${collisionDetection.colletLength}mm)`);
            operations.forEach(op => {
                if (op.option!.depth > op.tool!.toolLength) {
                    pushLine(`(WARNING: Tool ${op.tool!.name} cutting deeper than tool length! Collet collision highly likely.)`);
                }
            });
        }

        pushLine(units === 'mm' ? 'G21' : 'G20');
        pushLine('G90\nG17');
        
        // Post-Processor Spindle Start
        if (operations[0]?.tool?.type === 'Laser') {
            pushLine(`M4 S0`); // Dynamic laser power
        } else {
            pushLine(`${spindle} S${initialRPM}`);
        }
        
        if (mist) pushLine('M7');
        if (flood) pushLine('M8');
        pushLine(`G0 Z${(safeZ + zOffset).toFixed(3)}`, currentX, currentY, safeZ + zOffset, 0);

        let currentToolId: string | null = null;
        let currentTileId: string | null = null;
        const totalNestX = nestingType === 'true-shape' ? 1 : Math.max(1, nestingX);
        const totalNestY = nestingType === 'true-shape' ? 1 : Math.max(1, nestingY);

        // Path Optimization (Nearest Neighbor)
        let optimizedOperations = [...operations];
        if (optimizePath) {
            const result: typeof operations = [];
            let currentPos = { x: 0, y: 0 };
            const remaining = [...operations];

            while (remaining.length > 0) {
                let bestIdx = -1;
                let minDist = Infinity;

                for (let i = 0; i < remaining.length; i++) {
                    const op = remaining[i];
                    if (currentToolId && op.tool!.id !== currentToolId) continue;
                    const startPt = op.feature.points[0] || { x: 0, y: 0 };
                    const dist = Math.hypot(startPt.x - currentPos.x, startPt.y - currentPos.y);
                    if (dist < minDist) { minDist = dist; bestIdx = i; }
                }

                if (bestIdx === -1) {
                    minDist = Infinity;
                    for (let i = 0; i < remaining.length; i++) {
                        const op = remaining[i];
                        const startPt = op.feature.points[0] || { x: 0, y: 0 };
                        const dist = Math.hypot(startPt.x - currentPos.x, startPt.y - currentPos.y);
                        if (dist < minDist) { minDist = dist; bestIdx = i; }
                    }
                }

                const bestOp = remaining.splice(bestIdx, 1)[0];
                result.push(bestOp);
                const endPt = bestOp.feature.points[bestOp.feature.points.length - 1] || { x: 0, y: 0 };
                currentPos = { x: endPt.x, y: endPt.y };
                currentToolId = bestOp.tool!.id;
            }
            optimizedOperations = result;
        }

        const handleRetract = (nextX?: number, nextY?: number) => {
            if (stayDownRapids?.enabled && nextX !== undefined && nextY !== undefined) {
                const dist = Math.hypot(nextX - currentX, nextY - currentY);
                if (dist <= stayDownRapids.maxDistance) {
                    const skimZ = zOffset + stayDownRapids.skimHeight;
                    pushLine(`G0 Z${skimZ.toFixed(3)} ; Stay-down rapid`, currentX, currentY, skimZ, 0);
                    return;
                }
            }
            pushLine(`G0 Z${(safeZ + zOffset).toFixed(3)}`, currentX, currentY, safeZ + zOffset, 0);
        };

        optimizedOperations.forEach(({ feature, option, tool }, index) => {
            if (!option || !tool) return;

            if (currentToolId !== tool.id) {
                pushLine(`\n(--- Tool Change: ${tool.name} ---)`);
                pushLine(`(Tool Length: ${tool.toolLength}mm, Type: ${tool.type})`);
                pushLine(`M5 ; Stop Spindle`);
                
                // Smart Tool-Change Orchestrator: Safe Change Zone
                pushLine(`G0 Z${(safeZ + zOffset).toFixed(3)} ; Retract to Safe Z`);
                // Move to a safe location for tool change (e.g. machine front-center or home)
                pushLine(`G28 Z ; Home Z-axis for tool clearance`);
                pushLine(`G28 X Y ; Optional: Move to tool change position (Home XY)`);
                
                const numericToolId = parseInt(tool.id.replace(/\D/g, '')) || 1;
                pushLine(`T${numericToolId} M6 ; Request Tool ${numericToolId}`);
                
                // Return from tool change
                pushLine(`(Tool Change Complete. Returning to work area...)`);
                
                pushLine(`${spindle} S${tool.spindleRPM} ; Start Spindle`);
                pushLine(`G4 P2.0 ; Dwell for spin-up`);
                currentToolId = tool.id;
            }

            for (let ny = 0; ny < totalNestY; ny++) {
                for (let nx = 0; nx < totalNestX; nx++) {
                    const offsetX = nx * (designWidth + nestingSpacing);
                    const offsetY = ny * (designHeight + nestingSpacing);
                    
                    let paths = this.calculateToolpaths(feature, option, tool, feature);
                    
                    // Setup Transformation
                    let activeSetup = setups?.find(s => s.id === activeSetupId);
                    const orientation = activeSetup?.orientation || 'top';
                    if (orientation === 'bottom' || millingSide === 'bottom') {
                        const bounds = getBounds(feature.points);
                        paths = paths.map(path => path.map(p => ({ ...p, x: bounds.maxX - (p.x - bounds.minX) })));
                    } else if (orientation === 'left') {
                        paths = paths.map(path => path.map(p => ({ x: -p.z || 0, y: p.y, z: p.x })));
                    } else if (orientation === 'right') {
                        paths = paths.map(path => path.map(p => ({ x: p.z || 0, y: p.y, z: -p.x })));
                    } else if (orientation === 'front') {
                        paths = paths.map(path => path.map(p => ({ x: p.x, y: p.z || 0, z: -p.y })));
                    } else if (orientation === 'back') {
                        paths = paths.map(path => path.map(p => ({ x: p.x, y: -p.z || 0, z: p.y })));
                    }

                    paths = paths.map(path => path.map(p => ({ 
                        x: (p.x * scaleFactor) + offsetX, 
                        y: (p.y * scaleFactor) + offsetY,
                        z: p.z !== undefined ? (p.z * scaleFactor) : undefined
                    })));

                    pushLine(`\n(Feature: ${feature.name} | Nest: ${nx},${ny})`);

                    if (feature.type === 'hole' && option.type === 'inside' && option.helicalBoring) {
                        const center = this.calculateCenter(paths[0]);
                        const holeRadius = this.calculateRadius(paths[0], center);
                        const cutRadius = Math.max(0.00001, holeRadius - (tool.metricDiameter / 2));
                        pushLine(`G0 X${(center.x + cutRadius).toFixed(3)} Y${center.y.toFixed(3)}`, center.x + cutRadius, center.y, currentZ, 0);
                        pushLine(`G0 Z${(zOffset + 1.0).toFixed(3)}`, currentX, currentY, zOffset + 1.0, 0);
                        
                        const safeStepdown = Math.max(0.00001, tool.stepdown);
                        let depth = 0;
                        while (depth < option.depth) {
                            depth = Math.min(depth + safeStepdown, option.depth);
                            pushLine(`G3 X${(center.x + cutRadius).toFixed(3)} Y${center.y.toFixed(3)} Z${(zOffset - depth).toFixed(3)} I-${cutRadius.toFixed(3)} J0 F${tool.feedrate}`, currentX, currentY, zOffset - depth, tool.feedrate);
                        }
                        pushLine(`G3 X${(center.x + cutRadius).toFixed(3)} Y${center.y.toFixed(3)} I-${cutRadius.toFixed(3)} J0 F${tool.feedrate}`, currentX, currentY, currentZ, tool.feedrate);
                        
                        const nextOp = optimizedOperations[index + 1];
                        handleRetract(nextOp?.feature.points[0]?.x, nextOp?.feature.points[0]?.y);
                        continue;
                    }

                    paths.forEach((path, pathIdx) => {
                        if (path.length === 0) return;
                        
                        // Check Tiling
                        if (tiling?.enabled) {
                            const start = path[0];
                            const tileX = Math.floor(start.x / tiling.tileWidth);
                            const tileY = Math.floor(start.y / tiling.tileHeight);
                            const tileId = `${tileX},${tileY}`;
                            if (currentTileId !== null && currentTileId !== tileId) {
                                pushLine(`\n(--- TILE SHIFT REQUIRED ---)`);
                                pushLine(`G0 Z${(safeZ + zOffset + 50).toFixed(3)} ; Safe lift for material slide`);
                                pushLine(`M0 ; PAUSE: Slide material to Tile ${tileX}, ${tileY}`);
                                pushLine(`G0 Z${(safeZ + zOffset).toFixed(3)}`);
                            }
                            currentTileId = tileId;
                        }

                        const isLaser = tool.type === 'Laser';

                        if (option.type === '3d-raster' && !isLaser) {
                            const start = path[0];
                            pushLine(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`, start.x, start.y, currentZ, 0);
                            pushLine(`G0 Z${(zOffset + 1.0).toFixed(3)}`, currentX, currentY, zOffset + 1.0, 0);
                            let pathMaxZ = -Infinity;
                            path.forEach(p => { if(p.z !== undefined && p.z > pathMaxZ) pathMaxZ = p.z; });
                            for (let i = 0; i < path.length; i++) {
                                const pt = path[i];
                                const normalizedZ = pt.z !== undefined ? pt.z - pathMaxZ : 0; 
                                const zDepth = zOffset + Math.max(-option.depth, normalizedZ); 
                                pushLine(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} Z${zDepth.toFixed(3)} F${tool.feedrate}`, pt.x, pt.y, zDepth, tool.feedrate);
                            }
                            const nextPath = paths[pathIdx + 1];
                            const nextOp = optimizedOperations[index + 1];
                            handleRetract(nextPath?.[0]?.x || nextOp?.feature.points[0]?.x, nextPath?.[0]?.y || nextOp?.feature.points[0]?.y);
                            return;
                        }

                        const start = path[0];
                        
                        if (option.type === 'v-carve' || option.type === 'v-carve-inlay') {
                            pushLine(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`, start.x, start.y, currentZ, 0);
                            if (!isLaser) pushLine(`G0 Z${(zOffset + 1.0).toFixed(3)}`, currentX, currentY, zOffset + 1.0, 0);
                            for (let i = 0; i < path.length; i++) {
                                const pt = path[i];
                                const tz = zOffset + (pt.z || 0);
                                if (i === 0 && !isLaser) pushLine(`G1 Z${tz.toFixed(3)} F${tool.plungeRate}`, currentX, currentY, tz, tool.plungeRate);
                                else if (isLaser && i === 0) pushLine(`M4 S${tool.spindleRPM}`); // Start burn
                                
                                if (isLaser) pushLine(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${tool.feedrate}`, pt.x, pt.y, currentZ, tool.feedrate);
                                else pushLine(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} Z${tz.toFixed(3)} F${tool.feedrate}`, pt.x, pt.y, tz, tool.feedrate);
                            }
                            if (isLaser) pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} F${tool.feedrate}`, start.x, start.y, currentZ, tool.feedrate);
                            else pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} Z${(zOffset + (start.z || 0)).toFixed(3)} F${tool.feedrate}`, start.x, start.y, zOffset + (start.z || 0), tool.feedrate);
                            
                            if (isLaser) pushLine(`M5`); // Stop burn
                            const nextPath = paths[pathIdx + 1];
                            const nextOp = optimizedOperations[index + 1];
                            handleRetract(nextPath?.[0]?.x || nextOp?.feature.points[0]?.x, nextPath?.[0]?.y || nextOp?.feature.points[0]?.y);
                            return;
                        }

                        pushLine(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`, start.x, start.y, currentZ, 0);
                        if (!isLaser) pushLine(`G0 Z${(zOffset + 1.0).toFixed(3)}`, currentX, currentY, zOffset + 1.0, 0);
                        
                        const safeStepdown = Math.max(0.00001, tool.stepdown);
                        let currentPassDepth = 0;
                        while (currentPassDepth < option.depth) {
                            currentPassDepth = Math.min(currentPassDepth + safeStepdown, option.depth);
                            const targetZ = zOffset - currentPassDepth;
                            
                            if (isLaser) {
                                pushLine(`M4 S${tool.spindleRPM}`);
                            } else {
                                if (path.length > 1) {
                                    const nextPt = path[1];
                                    if (option.leadIn?.type === 'linear') {
                                        const dist = option.leadIn.distance || 5;
                                        const dx = start.x - nextPt.x, dy = start.y - nextPt.y, l = Math.hypot(dx, dy) || 1;
                                        const lx = start.x + (dx/l) * dist, ly = start.y + (dy/l) * dist;
                                        pushLine(`G0 X${lx.toFixed(3)} Y${ly.toFixed(3)}`, lx, ly, currentZ, 0);
                                        pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} Z${targetZ.toFixed(3)} F${tool.plungeRate} ; Lead-In Linear`, start.x, start.y, targetZ, tool.plungeRate);
                                    } else if (option.leadIn?.type === 'arc') {
                                        const dist = option.leadIn.distance || 5;
                                        const dx = start.x - nextPt.x, dy = start.y - nextPt.y, l = Math.hypot(dx, dy) || 1;
                                        const nx = dy/l, ny = -dx/l;
                                        const cx = start.x + nx * (dist/2), cy = start.y + ny * (dist/2);
                                        const startX = start.x + nx * dist, startY = start.y + ny * dist;
                                        pushLine(`G0 X${startX.toFixed(3)} Y${startY.toFixed(3)}`, startX, startY, currentZ, 0);
                                        pushLine(`G1 Z${targetZ.toFixed(3)} F${tool.plungeRate}`, startX, startY, targetZ, tool.plungeRate);
                                        pushLine(`G3 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} I${(cx - startX).toFixed(3)} J${(cy - startY).toFixed(3)} F${tool.feedrate} ; Lead-In Arc`, start.x, start.y, targetZ, tool.feedrate);
                                    } else if (option.leadIn?.type === 'helical') {
                                        const dist = option.leadIn.distance || 5;
                                        const dx = start.x - nextPt.x, dy = start.y - nextPt.y, l = Math.hypot(dx, dy) || 1;
                                        const nx = dy/l, ny = -dx/l;
                                        const cx = start.x + nx * (dist/2), cy = start.y + ny * (dist/2);
                                        const startX = start.x + nx * dist, startY = start.y + ny * dist;
                                        pushLine(`G0 X${startX.toFixed(3)} Y${startY.toFixed(3)}`, startX, startY, currentZ, 0);
                                        pushLine(`G3 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} Z${targetZ.toFixed(3)} I${(cx - startX).toFixed(3)} J${(cy - startY).toFixed(3)} F${tool.plungeRate} ; Lead-In Helical`, start.x, start.y, targetZ, tool.plungeRate);
                                    } else {
                                        const rampX = start.x + (nextPt.x - start.x) * 0.1, rampY = start.y + (nextPt.y - start.y) * 0.1;
                                        pushLine(`G1 X${rampX.toFixed(3)} Y${rampY.toFixed(3)} Z${targetZ.toFixed(3)} F${tool.plungeRate} ; Ramping`, rampX, rampY, targetZ, tool.plungeRate);
                                    }
                                } else {
                                    pushLine(`G1 Z${targetZ.toFixed(3)} F${tool.plungeRate}`, currentX, currentY, targetZ, tool.plungeRate);
                                }
                            }
                            
                            for (let i = 1; i < path.length; i++) {
                                const pt = path[i];
                                pushLine(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${tool.feedrate}`, pt.x, pt.y, currentZ, tool.feedrate);
                            }
                            
                            // Auto-close shapes if they are drawn from basic geometry
                            if (['circle', 'rectangle', 'hole'].includes(feature.type)) {
                                pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} F${tool.feedrate}`, start.x, start.y, currentZ, tool.feedrate);
                            }
                            
                            if (isLaser) {
                                pushLine(`M5`);
                                break;
                            }
                        }
                        
                        const nextPath = paths[pathIdx + 1];
                        const nextOp = optimizedOperations[index + 1];
                        handleRetract(nextPath?.[0]?.x || nextOp?.feature.points[0]?.x, nextPath?.[0]?.y || nextOp?.feature.points[0]?.y);
                    });
                }
            }
        });

        pushLine('\n(Footer)');
        pushLine('M5 ; spindle off');
        if (mist || flood) pushLine('M9 ; coolant off');
        pushLine('G0 X0 Y0 ; return home', 0, 0, currentZ, 0);

        // --- END G-CODE INJECTION ---
        if (endGcode) {
            pushLine('\n(--- START CUSTOM G-CODE ---)');
            endGcode.split('\n').forEach(line => pushLine(line));
            pushLine('(--- END CUSTOM G-CODE ---)\n');
        }

        pushLine('M30 ; end of program');

        return { gcode: gcodeLines.join('\n'), estimatedTime: estimatedTimeSeconds / 60 };
    }

    calculateToolpaths(f: CAMFeature, o: CAMPathingOption, t: CAMTool, raw?: CAMFeature) {
        if (o.type === '3d-raster') return this.generateRasterPath(f.points, t, raw, o);
        let paths = [f.points];
        if (o.type === 'outside') paths = this.offsetPath(f.points, t.metricDiameter / 2);
        else if (o.type === 'inside') paths = this.offsetPath(f.points, -t.metricDiameter / 2);
        else if (o.type === 'pocket') paths = this.generatePocketToolpaths(f.points, t, f.type);
        else if (o.type === 'v-carve' || o.type === 'v-carve-inlay') {
            const vPaths = [];
            const angle = Math.max(1, t.angle || 60);
            const flatDepth = o.vCarveFlatDepth || o.depth;
            const isMale = o.type === 'v-carve-inlay' && o.vCarveInlay?.mode === 'male-plug';
            const startDepth = isMale ? (o.vCarveInlay?.startDepth || 0) : 0;
            
            // For male plug, we cut OUTSIDE the line. For female, we cut INSIDE.
            // Negative distance shrinks (inside), positive expands (outside).
            const dir = isMale ? 1 : -1;
            const initialOffset = startDepth > 0 ? dir * (startDepth * Math.tan((angle / 2) * Math.PI / 180)) : dir * 0.1;
            let cur = initialOffset;
            const step = Math.max(0.00001, t.metricDiameter * (t.stepover / 100));
            
            for (let p = 0; p < 50; p++) {
                const op = this.offsetPath(f.points, cur)[0];
                let minX = Infinity, maxX = -Infinity; op.forEach(pt => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); });
                if (maxX - minX < 0.1 || op.length < 3) break;
                
                // Depth calculation
                let depth = Math.min(Math.abs(cur) / Math.tan((angle / 2) * Math.PI / 180), flatDepth);
                if (startDepth > 0 && depth < startDepth) depth = startDepth; // Don't cut above startDepth for plugs
                
                vPaths.push(op.map(pt => ({ ...pt, z: -depth })));
                cur += (dir * step);
            }
            return vPaths.reverse();
        }

        if ((o.type === 'inside' || o.type === 'outside') && o.dogbones?.enabled && paths.length > 0) {
            const offset = (t.metricDiameter / 2) + (o.dogbones.toolDiameterOffset || 0.1);
            paths = paths.map(path => {
                const newPath = [];
                
                // Determine winding order
                let area = 0;
                for (let i = 0; i < path.length; i++) {
                    const p1 = path[i], p2 = path[(i + 1) % path.length];
                    area += (p2.x - p1.x) * (p2.y + p1.y);
                }
                const isClockwise = area > 0;
                
                for (let i = 0; i < path.length; i++) {
                    const p1 = path[(i - 1 + path.length) % path.length], p2 = path[i], p3 = path[(i + 1) % path.length];
                    newPath.push(p2);
                    
                    // Cross product to determine angle direction
                    const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
                    
                    // For an inside cut, an internal corner has a specific cross product sign based on winding
                    const isInternalCorner = isClockwise ? cross < -0.01 : cross > 0.01;
                    const isExternalCorner = isClockwise ? cross > 0.01 : cross < -0.01;
                    
                    // Dogbones are needed on internal corners for inside cuts, and external corners for outside cuts
                    const needsDogbone = (o.type === 'inside' && isInternalCorner) || (o.type === 'outside' && isExternalCorner);
                    
                    if (needsDogbone) {
                        // Vector from p2 to p1
                        const v1x = p1.x - p2.x, v1y = p1.y - p2.y, l1 = Math.hypot(v1x, v1y) || 1;
                        // Vector from p2 to p3
                        const v2x = p3.x - p2.x, v2y = p3.y - p2.y, l2 = Math.hypot(v2x, v2y) || 1;
                        
                        // Normalized vectors
                        const n1x = v1x/l1, n1y = v1y/l1;
                        const n2x = v2x/l2, n2y = v2y/l2;
                        
                        if (o.dogbones.type === 'dogbone') {
                            // Bisector vector (points directly into the corner)
                            const bx = n1x + n2x, by = n1y + n2y;
                            const bl = Math.hypot(bx, by) || 1;
                            
                            // Dogbone direction is opposite to the bisector (pointing OUT of the shape for inside cut)
                            // Since path is already offset, we push the tool further into the corner
                            const dirX = o.type === 'inside' ? -bx/bl : bx/bl;
                            const dirY = o.type === 'inside' ? -by/bl : by/bl;
                            
                            newPath.push({ x: p2.x + dirX * offset, y: p2.y + dirY * offset });
                            newPath.push(p2);
                        } else if (o.dogbones.type === 't-bone') {
                            // T-Bone pushes along one of the edges
                            const dirX = o.type === 'inside' ? -n1x : n1x;
                            const dirY = o.type === 'inside' ? -n1y : n1y;
                            
                            newPath.push({ x: p2.x + dirX * offset, y: p2.y + dirY * offset });
                            newPath.push(p2);
                        }
                    }
                }
                return newPath;
            });
        }

        return paths;
    }

    generateRasterPath(points: {x: number, y: number, z?: number}[], tool: CAMTool, feature?: CAMFeature, option?: CAMPathingOption): {x: number, y: number, z?: number}[][] {
        const { rasterResolution, millingSide, threeDAlignment = 'top', threeDZOffset = 0, stockThickness, customResolutionValue } = this.settings;
        
        if (!feature || !feature.meshVertices || feature.meshVertices.length === 0) {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
            const step = tool.metricDiameter * (tool.stepover / 100);
            const path = []; let y = minY, goingRight = true;
            while (y <= maxY) {
                if (goingRight) { path.push({ x: minX, y: y, z: 0 }); path.push({ x: maxX, y: y, z: 0 }); }
                else { path.push({ x: maxX, y: y, z: 0 }); path.push({ x: minX, y: y, z: 0 }); }
                goingRight = !goingRight; y += step;
            }
            return [path];
        }

        const vertices = feature.meshVertices;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < vertices.length; i += 3) {
            let x = vertices[i], y = vertices[i+1], z = vertices[i+2];
            if (millingSide === 'bottom') { x = -x; z = -z; }
            minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }

        let res = Math.max(0.00001, tool.metricDiameter / 10);
        if (rasterResolution === 'standard') res = 0.5;
        if (rasterResolution === 'high') res = 0.1;
        if (rasterResolution === 'custom') res = Math.max(0.05, customResolutionValue || 0.1);

        // Apply boundary if selected
        let bMinX = minX, bMaxX = maxX, bMinY = minY, bMaxY = maxY;
        if (option?.threeDBoundaryId) {
            const boundaryFeature = this.features.find(f => f.id === option.threeDBoundaryId);
            if (boundaryFeature) {
                bMinX = Infinity; bMaxX = -Infinity; bMinY = Infinity; bMaxY = -Infinity;
                boundaryFeature.points.forEach(p => { bMinX = Math.min(bMinX, p.x); bMaxX = Math.max(bMaxX, p.x); bMinY = Math.min(bMinY, p.y); bMaxY = Math.max(bMaxY, p.y); });
                minX = Math.max(minX, bMinX); maxX = Math.min(maxX, bMaxX); minY = Math.max(minY, bMinY); maxY = Math.min(maxY, bMaxY);
            }
        }

        const cols = Math.ceil((maxX - minX) / res) + 1, rows = Math.ceil((maxY - minY) / res) + 1;
        const zBuffer = new Float32Array(cols * rows).fill(minZ - 10);
        const getGC = (x: number, y: number) => ({ c: Math.floor((x - minX) / res), r: Math.floor((y - minY) / res) });

        for (let i = 0; i < vertices.length; i += 9) {
            let v0x = vertices[i], v0y = vertices[i+1], v0z = vertices[i+2], v1x = vertices[i+3], v1y = vertices[i+4], v1z = vertices[i+5], v2x = vertices[i+6], v2y = vertices[i+7], v2z = vertices[i+8];
            if (millingSide === 'bottom') { v0x = -v0x; v0z = -v0z; v1x = -v1x; v1z = -v1z; v2x = -v2x; v2z = -v2z; }
            const tMinX = Math.min(v0x, v1x, v2x), tMaxX = Math.max(v0x, v1x, v2x), tMinY = Math.min(v0y, v1y, v2y), tMaxY = Math.max(v0y, v1y, v2y);
            const sC = Math.max(0, getGC(tMinX, tMinY).c), eC = Math.min(cols - 1, getGC(tMaxX, tMinY).c), sR = Math.max(0, getGC(tMinX, tMinY).r), eR = Math.min(rows - 1, getGC(tMinX, tMaxY).r);
            for (let r = sR; r <= eR; r++) {
                for (let c = sC; c <= eC; c++) {
                    const px = minX + c * res + (res / 2), py = minY + r * res + (res / 2);
                    const denom = (v1y - v2y) * (v0x - v2x) + (v2x - v1x) * (v0y - v2y);
                    if (denom === 0) continue;
                    const w1 = ((v1y - v2y) * (px - v2x) + (v2x - v1x) * (py - v2y)) / denom, w2 = ((v2y - v0y) * (px - v2x) + (v0x - v2x) * (py - v2y)) / denom, w3 = 1 - w1 - w2;
                    if (w1 >= -0.01 && w2 >= -0.01 && w3 >= -0.01) { const pz = w1 * v0z + w2 * v1z + w3 * v2z; const idx = r * cols + c; if (pz > zBuffer[idx]) zBuffer[idx] = pz; }
                }
            }
        }

        const comp = new Float32Array(zBuffer.length);
        const tR = tool.metricDiameter / 2, tRC = Math.ceil(tR / res), kernel = [];
        for (let dr = -tRC; dr <= tRC; dr++) {
            for (let dc = -tRC; dc <= tRC; dc++) {
                const dist = Math.hypot(dc * res, dr * res);
                if (dist <= tR) {
                    let dz = 0;
                    if (tool.type === 'Ballnose') dz = Math.sqrt(tR * tR - dist * dist) - tR;
                    else if (tool.type === 'V-Bit') {
                        const angle = tool.angle || 60;
                        dz = dist * Math.tan((90 - (angle / 2)) * Math.PI / 180) - tR;
                    }
                    kernel.push({ dc, dr, dz });
                }
            }
        }
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let maxZ_val = minZ - 10;
                for (const k of kernel) {
                    const kr = r + k.dr, kc = c + k.dc;
                    if (kr >= 0 && kr < rows && kc >= 0 && kc < cols) {
                        const sz = zBuffer[kr * cols + kc] - k.dz;
                        if (sz > maxZ_val) maxZ_val = sz;
                    }
                }
                comp[r * cols + c] = maxZ_val;
            }
        }

        // 3D Holding Tabs
        if (option?.threeDTabs?.enabled) {
            const tw = option.threeDTabs.width, th = option.threeDTabs.height;
            const mx = (maxX + minX) / 2, my = (maxY + minY) / 2;
            const positions = [
                { x: minX, y: my, dx: tw, dy: tw },
                { x: maxX, y: my, dx: tw, dy: tw },
                { x: mx, y: minY, dx: tw, dy: tw },
                { x: mx, y: maxY, dx: tw, dy: tw },
            ];
            positions.forEach(pos => {
                const sR = Math.max(0, getGC(pos.x - pos.dx, pos.y - pos.dy).r);
                const eR = Math.min(rows - 1, getGC(pos.x + pos.dx, pos.y + pos.dy).r);
                const sC = Math.max(0, getGC(pos.x - pos.dx, pos.y - pos.dy).c);
                const eC = Math.min(cols - 1, getGC(pos.x + pos.dx, pos.y + pos.dy).c);
                for (let r = sR; r <= eR; r++) {
                    for (let c = sC; c <= eC; c++) {
                        const idx = r * cols + c;
                        const tabZ = minZ + th;
                        if (comp[idx] < tabZ) comp[idx] = tabZ;
                    }
                }
            });
        }

        // Rest Machining (Pencil Milling) Logic
        let prevComp: Float32Array | null = null;
        if (option?.threeDRestMachining?.enabled) {
            const prevTool = [...DEFAULT_TOOLS, ...this.tools].find(t => t.id === option.threeDRestMachining!.previousToolId);
            if (prevTool) {
                prevComp = new Float32Array(zBuffer.length);
                const pR = prevTool.metricDiameter / 2, pRC = Math.ceil(pR / res), pKernel = [];
                for (let dr = -pRC; dr <= pRC; dr++) {
                    for (let dc = -pRC; dc <= pRC; dc++) {
                        const dist = Math.hypot(dc * res, dr * res);
                        if (dist <= pR) {
                            let dz = 0;
                            if (prevTool.type === 'Ballnose') dz = Math.sqrt(pR * pR - dist * dist) - pR;
                            else if (prevTool.type === 'V-Bit') dz = dist * Math.tan((90 - ((prevTool.angle || 60) / 2)) * Math.PI / 180) - pR;
                            pKernel.push({ dc, dr, dz });
                        }
                    }
                }
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        let maxZ_val = minZ - 10;
                        for (const k of pKernel) {
                            const kr = r + k.dr, kc = c + k.dc;
                            if (kr >= 0 && kr < rows && kc >= 0 && kc < cols) {
                                const sz = zBuffer[kr * cols + kc] - k.dz;
                                if (sz > maxZ_val) maxZ_val = sz;
                            }
                        }
                        prevComp[r * cols + c] = maxZ_val;
                    }
                }
            }
        }

        // Apply Global Z-Alignment and Offset
        const modelHeight = maxZ - minZ;
        let alignmentOffsetZ = 0;
        if (threeDAlignment === 'top') {
            alignmentOffsetZ = -maxZ; // normalize top to 0
        } else if (threeDAlignment === 'center') {
            alignmentOffsetZ = -maxZ + (modelHeight / 2) - (stockThickness / 2);
        } else if (threeDAlignment === 'bottom') {
            alignmentOffsetZ = -minZ - stockThickness;
        }
        alignmentOffsetZ -= threeDZOffset;

        const generateRaster = (isY: boolean) => {
            const step = Math.max(res, tool.metricDiameter * (tool.stepover / 100));
            const path = []; 
            let primary = isY ? minX : minY, maxPrimary = isY ? maxX : maxY, goingRight = true;
            
            while (primary <= maxPrimary) {
                const lp = [];
                let secondary = isY ? minY : minX, maxSecondary = isY ? maxY : maxX;
                
                while (secondary <= maxSecondary) {
                    const cx = isY ? primary : secondary;
                    const cy = isY ? secondary : primary;
                    const r = Math.min(rows - 1, Math.max(0, Math.floor((cy - minY) / res)));
                    const c = Math.min(cols - 1, Math.max(0, Math.floor((cx - minX) / res)));
                    const idx = r * cols + c;
                    
                    let rawZ = comp[idx];
                    if (rawZ <= minZ - 9) rawZ = minZ; // Default to bottom if out of bounds
                    
                    // Rest machining filter: skip if current tool can't go significantly deeper than prev tool
                    if (prevComp) {
                        let prevRawZ = prevComp[idx];
                        if (prevRawZ <= minZ - 9) prevRawZ = minZ;
                        if (Math.abs(prevRawZ - rawZ) < 0.1) {
                            secondary += res;
                            continue;
                        }
                    }

                    const adjustedZ = rawZ + alignmentOffsetZ;

                    lp.push({ x: cx, y: cy, z: adjustedZ });
                    secondary += res;
                }
                if (lp.length > 0) {
                    if (!goingRight) lp.reverse();
                    path.push(...lp);
                }
                goingRight = !goingRight;
                primary += step;
            }
            return path;
        };

        const strategy = option?.threeDStrategy || 'raster-x';
        const finalPaths = [];

        // 3D Roughing Pass Logic
        if (option?.threeDRoughing?.enabled) {
            const roughTool = [...DEFAULT_TOOLS, ...this.tools].find(t => t.id === option.threeDRoughing!.toolId) || tool;
            const roughStepdown = Math.max(0.00001, option.threeDRoughing.stepdown);
            let currentDepth = -roughStepdown;
            const targetMinZ = minZ + alignmentOffsetZ;
            
            while (currentDepth > targetMinZ) {
                const roughStep = Math.max(res, roughTool.metricDiameter * (roughTool.stepover / 100));
                const rPath = []; let y = minY, goingRight = true;
                while (y <= maxY) {
                    const r = Math.min(rows - 1, Math.max(0, Math.floor((y - minY) / res))), lp = []; let x = minX;
                    while (x <= maxX) {
                        let rawZ = comp[r * cols + Math.min(cols - 1, Math.max(0, Math.floor((x - minX) / res)))];
                        let adjustedZ = rawZ + alignmentOffsetZ + option.threeDRoughing.stockToLeave;
                        if (adjustedZ > currentDepth) adjustedZ = currentDepth; // Slice at currentDepth
                        if (adjustedZ <= currentDepth) lp.push({ x, y, z: adjustedZ });
                        x += res;
                    }
                    if (lp.length > 0) {
                        if (!goingRight) lp.reverse(); rPath.push(...lp);
                    }
                    goingRight = !goingRight; y += roughStep;
                }
                if (rPath.length > 0) finalPaths.push(rPath);
                currentDepth -= roughStepdown;
            }
        }

        // Finishing Pass
        if (strategy === 'raster-x') finalPaths.push(generateRaster(false));
        else if (strategy === 'raster-y') finalPaths.push(generateRaster(true));
        else if (strategy === 'cross-hatch') {
            finalPaths.push(generateRaster(false));
            finalPaths.push(generateRaster(true));
        }

        return finalPaths;
    }

    offsetPath(pts: {x: number, y: number, z?: number}[], dist: number) {
        if (!pts || pts.length < 3) return [pts || []];
        
        let area = 0;
        for (let i = 0; i < pts.length; i++) {
            const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
            area += (p2.x - p1.x) * (p2.y + p1.y);
        }
        const isClockwise = area > 0;
        
        const res = [];
        for (let i = 0; i < pts.length; i++) {
            const p = pts[(i - 1 + pts.length) % pts.length], c = pts[i], n = pts[(i + 1) % pts.length];
            const dx1 = c.x - p.x, dy1 = c.y - p.y, dx2 = n.x - c.x, dy2 = n.y - c.y;
            const l1 = Math.hypot(dx1, dy1) || 1, l2 = Math.hypot(dx2, dy2) || 1;
            
            let nx1, ny1, nx2, ny2;
            if (isClockwise) {
                // Outward normal for CW is left normal (-dy, dx)
                nx1 = -dy1 / l1; ny1 = dx1 / l1;
                nx2 = -dy2 / l2; ny2 = dx2 / l2;
            } else {
                // Outward normal for CCW is right normal (dy, -dx)
                nx1 = dy1 / l1; ny1 = -dx1 / l1;
                nx2 = dy2 / l2; ny2 = -dx2 / l2;
            }
            
            const nx = (nx1 + nx2) / 2, ny = (ny1 + ny2) / 2;
            const lSq = nx * nx + ny * ny;
            const l = Math.sqrt(lSq) || 0.0001;
            
            // Limit miter to prevent massive spikes on sharp inner corners
            const miterDist = Math.min(Math.abs(dist / l), Math.abs(dist) * 5) * Math.sign(dist);
            
            res.push({ x: c.x + (nx / l) * miterDist, y: c.y + (ny / l) * miterDist, z: c.z });
        }
        return [res];
    }

    generatePocketToolpaths(pts: {x: number, y: number, z?: number}[], tool: CAMTool, featureType: string) {
        if (!pts || pts.length === 0) return [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
        
        const toolRadius = tool.metricDiameter / 2;
        const step = Math.max(0.00001, tool.metricDiameter * (tool.stepover / 100));
        
        // --- RECTANGULAR ZIG-ZAG (For Surfacing and Boxes) ---
        if (featureType === 'rectangle') {
            const startX = minX + toolRadius;
            const endX = maxX - toolRadius;
            const startY = minY + toolRadius;
            const endY = maxY - toolRadius;

            if (endX < startX || endY < startY) {
                return [[{x: (minX + maxX) / 2, y: (minY + maxY) / 2}]];
            }

            const paths = [];
            const zigZagPath = [];
            let curY = startY;
            let goingRight = true;

            while (curY <= endY) {
                if (goingRight) {
                    zigZagPath.push({ x: startX, y: curY });
                    zigZagPath.push({ x: endX, y: curY });
                } else {
                    zigZagPath.push({ x: endX, y: curY });
                    zigZagPath.push({ x: startX, y: curY });
                }
                
                if (curY < endY && curY + step > endY) {
                    curY = endY;
                } else {
                    curY += step;
                }
                goingRight = !goingRight;
            }
            paths.push(zigZagPath);
            return paths;
        }
        
        // --- CONCENTRIC OFFSET (For arbitrary shapes, circles, etc) ---
        const paths = []; 
        let cur = -toolRadius; 
        
        for (let p = 0; p < 100; p++) {
            const op = this.offsetPath(pts, cur)[0];
            let oMinX = Infinity, oMaxX = -Infinity, oMinY = Infinity, oMaxY = -Infinity; 
            op.forEach(pt => { 
                oMinX = Math.min(oMinX, pt.x); oMaxX = Math.max(oMaxX, pt.x); 
                oMinY = Math.min(oMinY, pt.y); oMaxY = Math.max(oMaxY, pt.y); 
            });
            
            // Break if the remaining area is smaller than the tool diameter
            if ((oMaxX - oMinX) < tool.metricDiameter && (oMaxY - oMinY) < tool.metricDiameter) {
                // Push one final center pass to clear the very middle if it's a tight squeeze
                if (op.length > 0) paths.push(op);
                break;
            }
            
            // Detect if the polygon collapsed on itself (area inverted)
            let area = 0;
            for (let i = 0; i < op.length; i++) {
                const p1 = op[i], p2 = op[(i + 1) % op.length];
                area += (p2.x - p1.x) * (p2.y + p1.y);
            }
            // An inward offset of a CW polygon (area > 0) should remain CW. 
            // If it becomes CCW (area < 0), it collapsed.
            if (area <= 0) break;

            paths.push(op); 
            cur -= step;
        }
        
        return paths.reverse(); // Cut from inside out
    }

    calculateCenter(pts: {x: number, y: number}[]) { 
        if (!pts || pts.length === 0) return { x: 0, y: 0 };
        let sx = 0, sy = 0; pts.forEach(p => { sx += p.x; sy += p.y; }); return { x: sx / pts.length, y: sy / pts.length }; 
    }
    calculateRadius(pts: {x: number, y: number}[], c: {x: number, y: number}) { return pts.length ? Math.hypot(pts[0].x - c.x, pts[0].y - c.y) : 0; }
}
