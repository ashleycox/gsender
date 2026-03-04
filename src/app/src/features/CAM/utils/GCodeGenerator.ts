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

    // Kinematic Tracking
    private currentX = 0;
    private currentY = 0;
    private currentZ = 0;
    private estimatedTimeSeconds = 0;
    private lineNumber = 10;
    private lastG0Pos = { x: -Infinity, y: -Infinity, z: -Infinity };
    private zOffset = 0;
    private scaleFactor = 1;

    // Machine-Aware Kinematics
    private accelXY = 500;
    private accelZ = 50;

    constructor(features: CAMFeature[], options: CAMPathingOption[], settings: CAMSettings, tools: CAMTool[], machineSettings?: Record<string, string>) {
        this.features = features;
        this.options = options;
        this.settings = settings;
        this.tools = tools;

        if (machineSettings) {
            this.accelXY = Math.min(parseFloat(machineSettings['$120'] || '500'), parseFloat(machineSettings['$121'] || '500'));
            this.accelZ = parseFloat(machineSettings['$122'] || '50');
        }

        this.currentZ = this.settings.safeZ;
        this.zOffset = this.settings.zOrigin === 'bed' ? this.settings.stockThickness : 0;
        
        this.scaleFactor = this.settings.scalingType === 'percentage' ? this.settings.scalePercentage / 100 : 1;
        const selectedFeatures = this.features.filter(f => f.selected);
        if (selectedFeatures.length > 0) {
            const globalBounds = this.getBounds(selectedFeatures.flatMap(f => f.points));
            if (this.settings.scalingType === 'dimensions' && this.settings.targetWidth > 0 && this.settings.targetHeight > 0 && globalBounds.width > 0 && globalBounds.height > 0) {
                this.scaleFactor = Math.min(this.settings.targetWidth / globalBounds.width, this.settings.targetHeight / globalBounds.height);
            }
        }
    }

    private getBounds(pts: {x: number, y: number}[]) {
        if (!pts || pts.length === 0) return { width: 0, height: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
        return { width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY), minX, maxX, minY, maxY };
    }

    private updateTime(x: number, y: number, z: number, feedrate: number) {
        const dx = x - this.currentX, dy = y - this.currentY, dz = z - this.currentZ;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > 0.001) {
            const f = feedrate > 0 ? feedrate : 3000;
            const vMax = f / 60;
            const a = Math.abs(dz) > Math.abs(dx) && Math.abs(dz) > Math.abs(dy) ? this.accelZ : this.accelXY;
            const tAccel = vMax / a;
            const dAccel = 0.5 * a * tAccel * tAccel;
            if (dist >= 2 * dAccel) this.estimatedTimeSeconds += (2 * tAccel) + ((dist - 2 * dAccel) / vMax);
            else this.estimatedTimeSeconds += 2 * Math.sqrt(dist / a);
        }
        this.currentX = x; this.currentY = y; this.currentZ = z;
    }

    private formatLine(line: string, nx?: number, ny?: number, nz?: number, f?: number): string | null {
        let finalLine = line;

        if (finalLine.startsWith('G0') && !finalLine.includes(';') && !finalLine.includes('(')) {
            const isZ = finalLine.includes('Z'), isXY = finalLine.includes('X') || finalLine.includes('Y');
            if (isZ && !isXY && nz !== undefined && Math.abs(nz - this.lastG0Pos.z) < 0.001) return null;
            if (isXY && !isZ && nx !== undefined && ny !== undefined && Math.abs(nx - this.lastG0Pos.x) < 0.001 && Math.abs(ny - this.lastG0Pos.y) < 0.001) return null;

            if (nz !== undefined) this.lastG0Pos.z = nz;
            if (nx !== undefined && ny !== undefined) { this.lastG0Pos.x = nx; this.lastG0Pos.y = ny; }
        } else if (finalLine.startsWith('G1')) {
            this.lastG0Pos = { x: -Infinity, y: -Infinity, z: -Infinity };
        }

        if (this.settings.gcodeComments === false) {
            finalLine = finalLine.replace(/\(.*\)/g, '').replace(/;.*$/, '').trim();
        }

        if (!finalLine) return null;

        if (this.settings.gcodeLineNumbers) {
            finalLine = `N${this.lineNumber} ${finalLine}`;
            this.lineNumber += 10;
        }

        const isComment = finalLine.startsWith('(') || finalLine.startsWith(';');
        if (!isComment && nx !== undefined && ny !== undefined && nz !== undefined) {
            this.updateTime(nx, ny, nz, f || 0);
        }

        return finalLine;
    }

    private generateHeader(): string[] {
        const lines: string[] = [];
        const push = (l: string, nx?: number, ny?: number, nz?: number, f?: number) => {
            const res = this.formatLine(l, nx, ny, nz, f);
            if (res) lines.push(res);
        };

        push('(--- gSender CAM Generated G-Code ---)');
        push(`(STOCK_BOX: W=${this.settings.stockWidth}, L=${this.settings.stockLength}, T=${this.settings.stockThickness}, Z_REF=${this.settings.zOrigin})`);
        
        const vSafeZ = this.settings.safeZ + this.zOffset + 50; 
        push(`(G0 Z${vSafeZ.toFixed(3)})`, 0, 0, vSafeZ);
        push(`(G0 X0 Y0)`, 0, 0, vSafeZ);
        push(`(G0 X${this.settings.stockWidth} Y0)`, this.settings.stockWidth, 0, vSafeZ);
        push(`(G0 X${this.settings.stockWidth} Y${this.settings.stockLength})`, this.settings.stockWidth, this.settings.stockLength, vSafeZ);
        push(`(G0 X0 Y${this.settings.stockLength})`, 0, this.settings.stockLength, vSafeZ);
        push(`(G0 X0 Y0)`, 0, 0, vSafeZ);

        push('(ORIGIN_TRIPOD: X=Red, Y=Green, Z=Blue)');
        push(`(G0 X0 Y0 Z${this.zOffset})`, 0, 0, this.zOffset);
        push(`(G0 X10 Y0)`, 10, 0, this.zOffset);
        push(`(G0 X0 Y0)`, 0, 0, this.zOffset);
        push(`(G0 X0 Y10)`, 0, 10, this.zOffset);
        push(`(G0 X0 Y0)`, 0, 0, this.zOffset);
        push(`(G0 X0 Y0 Z${this.zOffset + 10})`, 0, 0, this.zOffset + 10);
        push(`G0 Z${(this.settings.safeZ + this.zOffset).toFixed(3)}`, 0, 0, this.settings.safeZ + this.zOffset);

        if (this.settings.startGcode) {
            push('\n(--- START CUSTOM G-CODE ---)');
            this.settings.startGcode.split('\n').forEach(l => push(l));
            push('(--- END CUSTOM G-CODE ---)\n');
        }

        push(this.settings.units === 'mm' ? 'G21' : 'G20');
        push('G90\nG17');
        
        return lines;
    }

    private generateFooter(): string[] {
        const lines: string[] = [];
        const push = (l: string, nx?: number, ny?: number, nz?: number, f?: number) => {
            const res = this.formatLine(l, nx, ny, nz, f);
            if (res) lines.push(res);
        };

        push('\n(Footer)');
        push('M5 ; spindle off');
        if (this.settings.mist || this.settings.flood) push('M9 ; coolant off');
        push(`G0 X0 Y0 ; return home`, 0, 0, this.currentZ, 0);

        if (this.settings.endGcode) {
            push('\n(--- START CUSTOM END G-CODE ---)');
            this.settings.endGcode.split('\n').forEach(l => push(l));
            push('(--- END CUSTOM END G-CODE ---)\n');
        }

        push('M30 ; end of program');
        push('(--- END OF PROGRAM ---)');
        return lines;
    }

    public generate(): { gcode: string, estimatedTime: number } {
        const gcodeLines = [...this.generateHeader()];
        const pushLine = (l: string, nx?: number, ny?: number, nz?: number, f?: number) => {
            const res = this.formatLine(l, nx, ny, nz, f);
            if (res) gcodeLines.push(res);
        };

        const selectedFeatures = this.features.filter(f => f.selected);
        const globalBounds = this.getBounds(selectedFeatures.flatMap(f => f.points));
        const designWidth = globalBounds.width * this.scaleFactor;
        const designHeight = globalBounds.height * this.scaleFactor;

        const operations = selectedFeatures.map(feature => {
            const option = Array.isArray(this.options) ? this.options.find(o => o.featureId === feature.id) : undefined;
            const tool = option ? [...DEFAULT_TOOLS, ...this.tools].find(t => t.id === option.toolId) : undefined;
            return { feature, option, tool };
        }).filter(op => op.option && op.tool);

        const typePriority: Record<string, number> = { 'pocket': 0, 'inside': 1, 'on-line': 2, 'outside': 3, '3d-raster': 4 };
        operations.sort((a, b) => {
            const orderA = a.feature.order ?? 9999;
            const orderB = b.feature.order ?? 9999;
            if (orderA !== orderB) return orderA - orderB;
            if (a.tool!.id !== b.tool!.id) return a.tool!.id.localeCompare(b.tool!.id);
            return (typePriority[a.option!.type] || 0) - (typePriority[b.option!.type] || 0);
        });

        if (operations.length === 0) {
            return { gcode: gcodeLines.join('\n'), estimatedTime: 0 };
        }

        const initialRPM = operations[0]?.tool?.spindleRPM || 10000;
        pushLine('\n(--- MAIN PROGRAM ---)');
        pushLine(`(Z-Origin: ${this.settings.zOrigin.toUpperCase()})`);

        if (this.settings.collisionDetection?.enabled) {
            pushLine(`(--- COLLISION DETECTION ENABLED ---)`);
            pushLine(`(Collet Dia: ${this.settings.collisionDetection.colletDiameter}mm, Collet Len: ${this.settings.collisionDetection.colletLength}mm)`);
            operations.forEach(op => {
                if (op.option!.depth > op.tool!.toolLength) {
                    pushLine(`(WARNING: Tool ${op.tool!.name} cutting deeper than tool length! Collet collision highly likely.)`);
                }
            });
        }

        if (operations[0]?.tool?.type === 'Laser') {
            pushLine(`M4 S0`);
        } else {
            pushLine(`${this.settings.spindle} S${initialRPM}`);
        }
        
        if (this.settings.mist) pushLine('M7');
        if (this.settings.flood) pushLine('M8');
        pushLine(`G0 Z${(this.settings.safeZ + this.zOffset).toFixed(3)}`, this.currentX, this.currentY, this.settings.safeZ + this.zOffset, 0);

        let currentToolId: string | null = null;
        let currentTileId: string | null = null;
        const totalNestX = this.settings.nestingType === 'true-shape' ? 1 : Math.max(1, this.settings.nestingX);
        const totalNestY = this.settings.nestingType === 'true-shape' ? 1 : Math.max(1, this.settings.nestingY);

        let optimizedOperations = [...operations];
        if (this.settings.optimizePath && optimizedOperations.length > 1) {
            // Group by tool first, as tool changes are the most expensive
            const toolGroups = new Map<string, typeof operations>();
            optimizedOperations.forEach(op => {
                const arr = toolGroups.get(op.tool!.id) || [];
                arr.push(op);
                toolGroups.set(op.tool!.id, arr);
            });

            const result: typeof operations = [];
            let currentPos = { x: 0, y: 0 };

            for (const [toolId, group] of toolGroups.entries()) {
                // Initialize with Greedy Nearest-Neighbor
                let route = [];
                let remaining = [...group];
                let pos = { ...currentPos };

                while (remaining.length > 0) {
                    let bestIdx = 0;
                    let minDist = Infinity;
                    for (let i = 0; i < remaining.length; i++) {
                        const pt = remaining[i].feature.points[0] || { x: 0, y: 0 };
                        const d = Math.hypot(pt.x - pos.x, pt.y - pos.y);
                        if (d < minDist) { minDist = d; bestIdx = i; }
                    }
                    const best = remaining.splice(bestIdx, 1)[0];
                    route.push(best);
                    pos = best.feature.points[best.feature.points.length - 1] || pos;
                }

                // Apply 2-opt refinement
                let improved = true;
                const getDist = (a: any, b: any) => {
                    const p1 = a.feature.points[a.feature.points.length - 1] || { x: 0, y: 0 };
                    const p2 = b.feature.points[0] || { x: 0, y: 0 };
                    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
                };

                while (improved) {
                    improved = false;
                    for (let i = 0; i < route.length - 1; i++) {
                        for (let k = i + 2; k < route.length; k++) {
                            const currentDist = getDist(route[i], route[i+1]) + (k+1 < route.length ? getDist(route[k], route[k+1]) : 0);
                            const newDist = getDist(route[i], route[k]) + (k+1 < route.length ? getDist(route[i+1], route[k+1]) : 0);
                            
                            if (newDist < currentDist) {
                                // Reverse the segment
                                const rev = route.slice(i+1, k+1).reverse();
                                route.splice(i+1, rev.length, ...rev);
                                improved = true;
                            }
                        }
                    }
                }

                result.push(...route);
                const lastOp = route[route.length - 1];
                currentPos = lastOp.feature.points[lastOp.feature.points.length - 1] || currentPos;
            }
            optimizedOperations = result;
        }

        const handleRetract = (nextX?: number, nextY?: number) => {
            if (this.settings.stayDownRapids?.enabled && nextX !== undefined && nextY !== undefined) {
                const dist = Math.hypot(nextX - this.currentX, nextY - this.currentY);
                if (dist <= this.settings.stayDownRapids.maxDistance) {
                    const skimZ = this.zOffset + this.settings.stayDownRapids.skimHeight;
                    pushLine(`G0 Z${skimZ.toFixed(3)} ; Stay-down rapid`, this.currentX, this.currentY, skimZ, 0);
                    return;
                }
            }
            pushLine(`G0 Z${(this.settings.safeZ + this.zOffset).toFixed(3)}`, this.currentX, this.currentY, this.settings.safeZ + this.zOffset, 0);
        };

        optimizedOperations.forEach(({ feature, option, tool }, index) => {
            if (!option || !tool) return;

            if (currentToolId !== tool.id) {
                pushLine(`\n(--- Tool Change: ${tool.name} ---)`);
                pushLine(`(Tool Length: ${tool.toolLength}mm, Type: ${tool.type})`);
                pushLine(`M5 ; Stop Spindle`);
                pushLine(`G0 Z${(this.settings.safeZ + this.zOffset).toFixed(3)} ; Retract to Safe Z`);
                pushLine(`G28 Z ; Home Z-axis for tool clearance`);
                const numericToolId = parseInt(tool.id.replace(/\D/g, '')) || 1;
                pushLine(`T${numericToolId} M6 ; Request Tool ${numericToolId}`);
                pushLine(`${this.settings.spindle} S${tool.spindleRPM} ; Start Spindle`);
                pushLine(`G4 P2.0 ; Dwell for spin-up`);
                currentToolId = tool.id;
            }

            for (let ny = 0; ny < totalNestY; ny++) {
                for (let nx = 0; nx < totalNestX; nx++) {
                    const offsetX = nx * (designWidth + this.settings.nestingSpacing);
                    const offsetY = ny * (designHeight + this.settings.nestingSpacing);
                    
                    let paths = this.calculateToolpaths(feature, option, tool, feature);
                    let activeSetup = this.settings.setups?.find(s => s.id === this.settings.activeSetupId);
                    const orientation = activeSetup?.orientation || 'top';
                    if (orientation === 'bottom' || this.settings.millingSide === 'bottom') {
                        const bounds = this.getBounds(feature.points);
                        paths = paths.map(path => path.map(p => ({ ...p, x: bounds.maxX - (p.x - bounds.minX) })));
                    }

                    paths = paths.map(path => path.map(p => ({ 
                        x: (p.x * this.scaleFactor) + offsetX, 
                        y: (p.y * this.scaleFactor) + offsetY,
                        z: p.z !== undefined ? (p.z * this.scaleFactor) : undefined
                    })));

                    pushLine(`\n(Feature: ${feature.name} | Nest: ${nx},${ny})`);

                    if (feature.type === 'hole' && option.type === 'inside' && option.helicalBoring) {
                        const center = this.calculateCenter(paths[0]);
                        const holeRadius = this.calculateRadius(paths[0], center);
                        const cutRadius = Math.max(0.00001, holeRadius - (tool.metricDiameter / 2));
                        pushLine(`G0 X${(center.x + cutRadius).toFixed(3)} Y${center.y.toFixed(3)}`, center.x + cutRadius, center.y, this.currentZ, 0);
                        pushLine(`G0 Z${(this.zOffset + 1.0).toFixed(3)}`, this.currentX, this.currentY, this.zOffset + 1.0, 0);
                        
                        const safeStepdown = Math.max(0.00001, tool.stepdown);
                        let depth = 0;
                        while (depth < option.depth) {
                            depth = Math.min(depth + safeStepdown, option.depth);
                            pushLine(`G3 X${(center.x + cutRadius).toFixed(3)} Y${center.y.toFixed(3)} Z${(this.zOffset - depth).toFixed(3)} I-${cutRadius.toFixed(3)} J0 F${tool.feedrate}`, this.currentX, this.currentY, this.zOffset - depth, tool.feedrate);
                        }
                        pushLine(`G3 X${(center.x + cutRadius).toFixed(3)} Y${center.y.toFixed(3)} I-${cutRadius.toFixed(3)} J0 F${tool.feedrate}`, this.currentX, this.currentY, this.currentZ, tool.feedrate);
                        const nextOp = optimizedOperations[index + 1];
                        handleRetract(nextOp?.feature.points[0]?.x, nextOp?.feature.points[0]?.y);
                        continue;
                    }

                    paths.forEach((path, pathIdx) => {
                        if (path.length === 0) return;
                        if (this.settings.tiling?.enabled) {
                            const start = path[0];
                            const tileX = Math.floor(start.x / this.settings.tiling.tileWidth);
                            const tileY = Math.floor(start.y / this.settings.tiling.tileHeight);
                            const tileId = `${tileX},${tileY}`;
                            if (currentTileId !== null && currentTileId !== tileId) {
                                pushLine(`\n(--- TILE SHIFT REQUIRED ---)`);
                                pushLine(`G0 Z${(this.settings.safeZ + this.zOffset + 50).toFixed(3)} ; Safe lift for material slide`);
                                pushLine(`M0 ; PAUSE: Slide material to Tile ${tileX}, ${tileY}`);
                                pushLine(`G0 Z${(this.settings.safeZ + this.zOffset).toFixed(3)}`);
                            }
                            currentTileId = tileId;
                        }

                        const isLaser = tool.type === 'Laser';
                        if (option.type === '3d-raster' && !isLaser) {
                            const start = path[0];
                            pushLine(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`, start.x, start.y, this.currentZ, 0);
                            pushLine(`G0 Z${(this.zOffset + 1.0).toFixed(3)}`, this.currentX, this.currentY, this.zOffset + 1.0, 0);
                            let pathMaxZ = -Infinity;
                            path.forEach(p => { if(p.z !== undefined && p.z > pathMaxZ) pathMaxZ = p.z; });
                            for (let i = 0; i < path.length; i++) {
                                const pt = path[i];
                                const normalizedZ = pt.z !== undefined ? pt.z - pathMaxZ : 0; 
                                const zDepth = this.zOffset + Math.max(-option.depth, normalizedZ); 
                                pushLine(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} Z${zDepth.toFixed(3)} F${tool.feedrate}`, pt.x, pt.y, zDepth, tool.feedrate);
                            }
                            const nextPath = paths[pathIdx + 1];
                            const nextOp = optimizedOperations[index + 1];
                            handleRetract(nextPath?.[0]?.x || nextOp?.feature.points[0]?.x, nextPath?.[0]?.y || nextOp?.feature.points[0]?.y);
                            return;
                        }

                        const start = path[0];
                        if (option.type === 'v-carve' || option.type === 'v-carve-inlay') {
                            pushLine(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`, start.x, start.y, this.currentZ, 0);
                            if (!isLaser) pushLine(`G0 Z${(this.zOffset + 1.0).toFixed(3)}`, this.currentX, this.currentY, this.zOffset + 1.0, 0);
                            for (let i = 0; i < path.length; i++) {
                                const pt = path[i];
                                const tz = this.zOffset + (pt.z || 0);
                                if (i === 0 && !isLaser) pushLine(`G1 Z${tz.toFixed(3)} F${tool.plungeRate}`, this.currentX, this.currentY, tz, tool.plungeRate);
                                else if (isLaser && i === 0) pushLine(`M4 S${tool.spindleRPM}`);
                                if (isLaser) pushLine(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${tool.feedrate}`, pt.x, pt.y, this.currentZ, tool.feedrate);
                                else pushLine(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} Z${tz.toFixed(3)} F${tool.feedrate}`, pt.x, pt.y, tz, tool.feedrate);
                            }
                            if (isLaser) pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} F${tool.feedrate}`, start.x, start.y, this.currentZ, tool.feedrate);
                            else pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} Z${(this.zOffset + (start.z || 0)).toFixed(3)} F${tool.feedrate}`, start.x, start.y, this.zOffset + (start.z || 0), tool.feedrate);
                            if (isLaser) pushLine(`M5`);
                            const nextPath = paths[pathIdx + 1];
                            const nextOp = optimizedOperations[index + 1];
                            handleRetract(nextPath?.[0]?.x || nextOp?.feature.points[0]?.x, nextPath?.[0]?.y || nextOp?.feature.points[0]?.y);
                            return;
                        }

                        pushLine(`G0 X${start.x.toFixed(3)} Y${start.y.toFixed(3)}`, start.x, start.y, this.currentZ, 0);
                        if (!isLaser) pushLine(`G0 Z${(this.zOffset + 1.0).toFixed(3)}`, this.currentX, this.currentY, this.zOffset + 1.0, 0);
                        const safeStepdown = Math.max(0.00001, tool.stepdown);
                        let currentPassDepth = 0;

                        // Tab Logic Preparation
                        let tabCenters: number[] = [];
                        if (option.tabs?.enabled && option.tabs.count > 0) {
                            let totalLen = 0;
                            const segments = [];
                            for (let i = 1; i < path.length; i++) {
                                const p1 = path[i-1], p2 = path[i];
                                const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                                totalLen += len;
                                segments.push({ startDist: totalLen - len, len, center: totalLen - (len/2) });
                            }
                            
                            if (option.tabs.smartTabs) {
                                // Smart Tabs: pick the longest segments and place tabs in their centers
                                segments.sort((a, b) => b.len - a.len);
                                const selectedSegments = segments.slice(0, option.tabs.count);
                                tabCenters = selectedSegments.map(s => s.center).sort((a, b) => a - b);
                            } else {
                                // Even distance distribution
                                const spacing = totalLen / option.tabs.count;
                                let curLen = 0;
                                for (let i = 1; i < path.length; i++) {
                                    const segLen = Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
                                    while (curLen + segLen > tabCenters.length * spacing + (spacing/2)) {
                                        tabCenters.push(curLen + (tabCenters.length * spacing + (spacing/2) - curLen));
                                    }
                                    curLen += segLen;
                                }
                            }
                        }

                        while (currentPassDepth < option.depth) {
                            currentPassDepth = Math.min(currentPassDepth + safeStepdown, option.depth);
                            const targetZ = this.zOffset - currentPassDepth;
                            const isFinalPass = currentPassDepth >= option.depth - 0.001;

                            if (isLaser) pushLine(`M4 S${tool.spindleRPM}`);
                            else {
                                if (path.length > 1) {
                                    const nextPt = path[1];
                                    if (option.leadIn?.type === 'linear') {
                                        const dist = option.leadIn.distance || 5;
                                        const dx = start.x - nextPt.x, dy = start.y - nextPt.y, l = Math.hypot(dx, dy) || 1;
                                        const lx = start.x + (dx/l) * dist, ly = start.y + (dy/l) * dist;
                                        pushLine(`G0 X${lx.toFixed(3)} Y${ly.toFixed(3)}`, lx, ly, this.currentZ, 0);
                                        pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} Z${targetZ.toFixed(3)} F${tool.plungeRate} ; Lead-In Linear`, start.x, start.y, targetZ, tool.plungeRate);
                                    } else if (option.leadIn?.type === 'arc') {
                                        const dist = option.leadIn.distance || 5;
                                        const dx = start.x - nextPt.x, dy = start.y - nextPt.y, l = Math.hypot(dx, dy) || 1;
                                        const nx = dy/l, ny = -dx/l;
                                        const cx = start.x + nx * (dist/2), cy = start.y + ny * (dist/2);
                                        const startX = start.x + nx * dist, startY = start.y + ny * dist;
                                        pushLine(`G0 X${startX.toFixed(3)} Y${startY.toFixed(3)}`, startX, startY, this.currentZ, 0);
                                        pushLine(`G1 Z${targetZ.toFixed(3)} F${tool.plungeRate}`, startX, startY, targetZ, tool.plungeRate);
                                        pushLine(`G3 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} I${(cx - startX).toFixed(3)} J${(cy - startY).toFixed(3)} F${tool.feedrate} ; Lead-In Arc`, start.x, start.y, targetZ, tool.feedrate);
                                    } else if (option.leadIn?.type === 'helical') {
                                        const dist = option.leadIn.distance || 5;
                                        const dx = start.x - nextPt.x, dy = start.y - nextPt.y, l = Math.hypot(dx, dy) || 1;
                                        const nx = dy/l, ny = -dx/l;
                                        const cx = start.x + nx * (dist/2), cy = start.y + ny * (dist/2);
                                        const startX = start.x + nx * dist, startY = start.y + ny * dist;
                                        pushLine(`G0 X${startX.toFixed(3)} Y${startY.toFixed(3)}`, startX, startY, this.currentZ, 0);
                                        pushLine(`G3 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} Z${targetZ.toFixed(3)} I${(cx - startX).toFixed(3)} J${(cy - startY).toFixed(3)} F${tool.plungeRate} ; Lead-In Helical`, start.x, start.y, targetZ, tool.plungeRate);
                                    } else {
                                        const rampX = start.x + (nextPt.x - start.x) * 0.1, rampY = start.y + (nextPt.y - start.y) * 0.1;
                                        pushLine(`G1 X${rampX.toFixed(3)} Y${rampY.toFixed(3)} Z${targetZ.toFixed(3)} F${tool.plungeRate} ; Ramping`, rampX, rampY, targetZ, tool.plungeRate);
                                    }
                                } else pushLine(`G1 Z${targetZ.toFixed(3)} F${tool.plungeRate}`, this.currentX, this.currentY, targetZ, tool.plungeRate);
                            }

                            let curDistance = 0;
                            for (let i = 1; i < path.length; i++) {
                                const p1 = path[i-1], p2 = path[i];
                                const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                                
                                if (isFinalPass && option.tabs?.enabled) {
                                    const halfTab = option.tabs.width / 2;
                                    const tabHeightZ = targetZ + option.tabs.height;
                                    
                                    // Check if this segment contains any tab centers
                                    for (const center of tabCenters) {
                                        if (center > curDistance - halfTab && center < curDistance + segLen + halfTab) {
                                            // Split segment if needed to include tab lift/drop
                                            const tabStart = Math.max(0, center - halfTab - curDistance);
                                            const tabEnd = Math.min(segLen, center + halfTab - curDistance);
                                            
                                            if (tabStart > 0) {
                                                const tx = p1.x + (p2.x - p1.x) * (tabStart / segLen);
                                                const ty = p1.y + (p2.y - p1.y) * (tabStart / segLen);
                                                pushLine(`G1 X${tx.toFixed(3)} Y${ty.toFixed(3)} F${tool.feedrate}`, tx, ty, targetZ, tool.feedrate);
                                            }
                                            
                                            const tsx = p1.x + (p2.x - p1.x) * (tabStart / segLen);
                                            const tsy = p1.y + (p2.y - p1.y) * (tabStart / segLen);
                                            pushLine(`G1 Z${tabHeightZ.toFixed(3)} F${tool.plungeRate} ; Tab Start`, tsx, tsy, tabHeightZ, tool.plungeRate);
                                            
                                            const tex = p1.x + (p2.x - p1.x) * (tabEnd / segLen);
                                            const tey = p1.y + (p2.y - p1.y) * (tabEnd / segLen);
                                            pushLine(`G1 X${tex.toFixed(3)} Y${tey.toFixed(3)} F${tool.feedrate}`, tex, tey, tabHeightZ, tool.feedrate);
                                            pushLine(`G1 Z${targetZ.toFixed(3)} F${tool.plungeRate} ; Tab End`, tex, tey, targetZ, tool.plungeRate);
                                        }
                                    }
                                }
                                
                                pushLine(`G1 X${p2.x.toFixed(3)} Y${p2.y.toFixed(3)} F${tool.feedrate}`, p2.x, p2.y, targetZ, tool.feedrate);
                                curDistance += segLen;
                            }
                            if (['circle', 'rectangle', 'hole'].includes(feature.type)) pushLine(`G1 X${start.x.toFixed(3)} Y${start.y.toFixed(3)} F${tool.feedrate}`, start.x, start.y, targetZ, tool.feedrate);
                            if (isLaser) { pushLine(`M5`); break; }
                        }
                        const nextPath = paths[pathIdx + 1];
                        const nextOp = optimizedOperations[index + 1];
                        handleRetract(nextPath?.[0]?.x || nextOp?.feature.points[0]?.x, nextPath?.[0]?.y || nextOp?.feature.points[0]?.y);
                    });
                }
            }
        });

        gcodeLines.push(...this.generateFooter());
        return { gcode: gcodeLines.join('\n'), estimatedTime: this.estimatedTimeSeconds / 60 };
    }

    private calculateToolpaths(f: CAMFeature, o: CAMPathingOption, t: CAMTool, raw?: CAMFeature) {
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
            const dir = isMale ? 1 : -1;
            const initialOffset = startDepth > 0 ? dir * (startDepth * Math.tan((angle / 2) * Math.PI / 180)) : dir * 0.1;
            let cur = initialOffset;
            const step = Math.max(0.00001, t.metricDiameter * (t.stepover / 100));

            const distToSegment = (p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}) => {
                const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
                if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
                let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
                t = Math.max(0, Math.min(1, t));
                return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
            };

            const minDistanceToBoundary = (pt: {x:number, y:number}) => {
                let minDist = Infinity;
                for (let i = 0; i < f.points.length; i++) {
                    const d = distToSegment(pt, f.points[i], f.points[(i+1)%f.points.length]);
                    if (d < minDist) minDist = d;
                }
                return minDist;
            };

            for (let p = 0; p < 50; p++) {
                const op = this.offsetPath(f.points, cur)[0];
                if (!op || op.length === 0) break;
                let minX = Infinity, maxX = -Infinity; op.forEach(pt => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); });
                if (maxX - minX < 0.1 || op.length < 3) break;
                
                vPaths.push(op.map(pt => {
                    // True Dynamic V-Carve: Z varies based on exact distance to closest boundary wall
                    const exactDist = minDistanceToBoundary(pt);
                    let dynDepth = Math.min(exactDist / Math.tan((angle / 2) * Math.PI / 180), flatDepth);
                    if (startDepth > 0 && dynDepth < startDepth) dynDepth = startDepth;
                    return { ...pt, z: -dynDepth };
                }));
                cur += (dir * step);
            }
            return vPaths.reverse();
        }

        if ((o.type === 'inside' || o.type === 'outside') && o.dogbones?.enabled && paths.length > 0) {
            const offset = (t.metricDiameter / 2) + (o.dogbones.toolDiameterOffset || 0.1);
            paths = paths.map(path => {
                const newPath = [];
                let area = 0;
                for (let i = 0; i < path.length; i++) {
                    const p1 = path[i], p2 = path[(i + 1) % path.length];
                    area += (p2.x - p1.x) * (p2.y + p1.y);
                }
                const isClockwise = area > 0;
                for (let i = 0; i < path.length; i++) {
                    const p1 = path[(i - 1 + path.length) % path.length], p2 = path[i], p3 = path[(i + 1) % path.length];
                    newPath.push(p2);
                    const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
                    const isInternalCorner = isClockwise ? cross < -0.01 : cross > 0.01;
                    const isExternalCorner = isClockwise ? cross > 0.01 : cross < -0.01;
                    const needsDogbone = (o.type === 'inside' && isInternalCorner) || (o.type === 'outside' && isExternalCorner);
                    if (needsDogbone) {
                        const v1x = p1.x - p2.x, v1y = p1.y - p2.y, l1 = Math.hypot(v1x, v1y) || 1;
                        const v2x = p3.x - p2.x, v2y = p3.y - p2.y, l2 = Math.hypot(v2x, v2y) || 1;
                        const n1x = v1x/l1, n1y = v1y/l1, n2x = v2x/l2, n2y = v2y/l2;
                        if (o.dogbones.type === 'dogbone') {
                            const bx = n1x + n2x, by = n1y + n2y, bl = Math.hypot(bx, by) || 1;
                            const dirX = o.type === 'inside' ? -bx/bl : bx/bl;
                            const dirY = o.type === 'inside' ? -by/bl : by/bl;
                            newPath.push({ x: p2.x + dirX * offset, y: p2.y + dirY * offset });
                            newPath.push(p2);
                        } else if (o.dogbones.type === 't-bone') {
                            const dirX = o.type === 'inside' ? -n1x : n1x, dirY = o.type === 'inside' ? -n1y : n1y;
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

    private generateRasterPath(points: {x: number, y: number, z?: number}[], tool: CAMTool, feature?: CAMFeature, option?: CAMPathingOption): {x: number, y: number, z?: number}[][] {
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
                    else if (tool.type === 'V-Bit') dz = dist * Math.tan((90 - ((tool.angle || 60) / 2)) * Math.PI / 180) - tR;
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
            const positions = [{ x: minX, y: my }, { x: maxX, y: my }, { x: mx, y: minY }, { x: mx, y: maxY }];
            positions.forEach(pos => {
                const sR = Math.max(0, getGC(pos.x - tw, pos.y - tw).r), eR = Math.min(rows - 1, getGC(pos.x + tw, pos.y + tw).r);
                const sC = Math.max(0, getGC(pos.x - tw, pos.y - tw).c), eC = Math.min(cols - 1, getGC(pos.x + tw, pos.y + tw).c);
                for (let r = sR; r <= eR; r++) {
                    for (let c = sC; c <= eC; c++) {
                        const idx = r * cols + c;
                        const tabZ = minZ + th;
                        if (comp[idx] < tabZ) comp[idx] = tabZ;
                    }
                }
            });
        }

        const modelHeight = maxZ - minZ;
        let alignmentOffsetZ = 0;
        if (threeDAlignment === 'top') alignmentOffsetZ = -maxZ;
        else if (threeDAlignment === 'center') alignmentOffsetZ = -maxZ + (modelHeight / 2) - (stockThickness / 2);
        else if (threeDAlignment === 'bottom') alignmentOffsetZ = -minZ - stockThickness;
        alignmentOffsetZ -= threeDZOffset;

        const strategy = option?.threeDStrategy || 'raster-x';
        const finalPaths = [];

        const generateRaster = (isY: boolean) => {
            const step = Math.max(res, tool.metricDiameter * (tool.stepover / 100));
            const path = []; let primary = isY ? minX : minY, maxPrimary = isY ? maxX : maxY, goingRight = true;
            while (primary <= maxPrimary) {
                const lp = []; let secondary = isY ? minY : minX, maxSecondary = isY ? maxY : maxX;
                while (secondary <= maxSecondary) {
                    const cx = isY ? primary : secondary, cy = isY ? secondary : primary;
                    const r = Math.min(rows - 1, Math.max(0, Math.floor((cy - minY) / res))), c = Math.min(cols - 1, Math.max(0, Math.floor((cx - minX) / res)));
                    const rawZ = comp[r * cols + c];
                    lp.push({ x: cx, y: cy, z: (rawZ <= minZ - 9 ? minZ : rawZ) + alignmentOffsetZ });
                    secondary += res;
                }
                if (lp.length > 0) { if (!goingRight) lp.reverse(); path.push(...lp); }
                goingRight = !goingRight; primary += step;
            }
            return path;
        };

        if (strategy === 'raster-x') finalPaths.push(generateRaster(false));
        else if (strategy === 'raster-y') finalPaths.push(generateRaster(true));
        else if (strategy === 'cross-hatch') { finalPaths.push(generateRaster(false)); finalPaths.push(generateRaster(true)); }

        return finalPaths;
    }

    private offsetPath(pts: {x: number, y: number, z?: number}[], dist: number) {
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
            if (isClockwise) { nx1 = -dy1 / l1; ny1 = dx1 / l1; nx2 = -dy2 / l2; ny2 = dx2 / l2; }
            else { nx1 = dy1 / l1; ny1 = -dx1 / l1; nx2 = dy2 / l2; ny2 = -dx2 / l2; }
            const nx = (nx1 + nx2) / 2, ny = (ny1 + ny2) / 2, l = Math.sqrt(nx * nx + ny * ny) || 0.0001;
            const miterDist = Math.min(Math.abs(dist / l), Math.abs(dist) * 5) * Math.sign(dist);
            res.push({ x: c.x + (nx / l) * miterDist, y: c.y + (ny / l) * miterDist, z: c.z });
        }
        return [res];
    }

    private generatePocketToolpaths(pts: {x: number, y: number, z?: number}[], tool: CAMTool, featureType: string) {
        if (!pts || pts.length === 0) return [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
        const toolRadius = tool.metricDiameter / 2, step = Math.max(0.00001, tool.metricDiameter * (tool.stepover / 100));
        if (featureType === 'rectangle') {
            const startX = minX + toolRadius, endX = maxX - toolRadius, startY = minY + toolRadius, endY = maxY - toolRadius;
            if (endX < startX || endY < startY) return [[{x: (minX + maxX) / 2, y: (minY + maxY) / 2}]];
            const paths = [], zigZagPath = []; let curY = startY, goingRight = true;
            while (curY <= endY) {
                if (goingRight) { zigZagPath.push({ x: startX, y: curY }); zigZagPath.push({ x: endX, y: curY }); }
                else { zigZagPath.push({ x: endX, y: curY }); zigZagPath.push({ x: startX, y: curY }); }
                curY = (curY < endY && curY + step > endY) ? endY : curY + step;
                goingRight = !goingRight;
            }
            paths.push(zigZagPath); return paths;
        }
        const paths = []; let cur = -toolRadius; 
        for (let p = 0; p < 100; p++) {
            const op = this.offsetPath(pts, cur)[0];
            let oMinX = Infinity, oMaxX = -Infinity, oMinY = Infinity, oMaxY = -Infinity; 
            op.forEach(pt => { oMinX = Math.min(oMinX, pt.x); oMaxX = Math.max(oMaxX, pt.x); oMinY = Math.min(oMinY, pt.y); oMaxY = Math.max(oMaxY, pt.y); });
            if ((oMaxX - oMinX) < tool.metricDiameter && (oMaxY - oMinY) < tool.metricDiameter) { if (op.length > 0) paths.push(op); break; }
            let area = 0;
            for (let i = 0; i < op.length; i++) { const p1 = op[i], p2 = op[(i + 1) % op.length]; area += (p2.x - p1.x) * (p2.y + p1.y); }
            if (area <= 0) break;
            paths.push(op); cur -= step;
        }
        return paths.reverse();
    }

    private calculateCenter(pts: {x: number, y: number}[]) { 
        if (!pts || pts.length === 0) return { x: 0, y: 0 };
        let sx = 0, sy = 0; pts.forEach(p => { sx += p.x; sy += p.y; }); return { x: sx / pts.length, y: sy / pts.length }; 
    }
    private calculateRadius(pts: {x: number, y: number}[], c: {x: number, y: number}) { return pts.length ? Math.hypot(pts[0].x - c.x, pts[0].y - c.y) : 0; }
}
