import { fabric } from 'fabric';
import ClipperLib from 'js-clipper';
// @ts-ignore
import simplify from 'simplify-js';
// @ts-ignore
import QRCode from 'qrcode-svg';
import { toast } from '../../../../../lib/toaster';

// --- Linear & Circular Arrays ---
export const createLinearArray = (
    canvas: fabric.Canvas, 
    sourceObj: fabric.Object, 
    rows: number, 
    cols: number, 
    spacingX: number, 
    spacingY: number
) => {
    const clones: fabric.Object[] = [];
    
    const cloneNext = (r: number, c: number) => {
        if (r >= rows) {
            canvas.add(...clones);
            canvas.requestRenderAll();
            return;
        }
        
        if (r === 0 && c === 0) {
            cloneNext(r, c + 1);
            return;
        }

        sourceObj.clone((cloned: fabric.Object) => {
            cloned.set({
                left: (sourceObj.left || 0) + (c * spacingX),
                top: (sourceObj.top || 0) + (r * spacingY),
                evented: true
            });
            clones.push(cloned);
            
            let nextC = c + 1;
            let nextR = r;
            if (nextC >= cols) {
                nextC = 0;
                nextR++;
            }
            cloneNext(nextR, nextC);
        });
    };

    cloneNext(0, 0);
};

export const createCircularArray = (
    canvas: fabric.Canvas, 
    sourceObj: fabric.Object, 
    count: number, 
    radius: number, 
    centerX: number, 
    centerY: number
) => {
    const clones: fabric.Object[] = [];
    const angleStep = (Math.PI * 2) / count;

    const cloneNext = (i: number) => {
        if (i >= count) {
            canvas.add(...clones);
            canvas.requestRenderAll();
            return;
        }
        
        if (i === 0) {
            sourceObj.set({
                left: centerX + radius * Math.cos(0) - ((sourceObj.width || 0) * (sourceObj.scaleX || 1)) / 2,
                top: centerY + radius * Math.sin(0) - ((sourceObj.height || 0) * (sourceObj.scaleY || 1)) / 2,
                angle: (0 * 180) / Math.PI + 90
            });
            sourceObj.setCoords();
            cloneNext(i + 1);
            return;
        }

        sourceObj.clone((cloned: fabric.Object) => {
            const angle = i * angleStep;
            cloned.set({
                left: centerX + radius * Math.cos(angle) - ((cloned.width || 0) * (cloned.scaleX || 1)) / 2,
                top: centerY + radius * Math.sin(angle) - ((cloned.height || 0) * (cloned.scaleY || 1)) / 2,
                angle: (angle * 180) / Math.PI + 90,
                evented: true
            });
            clones.push(cloned);
            cloneNext(i + 1);
        });
    };

    cloneNext(0);
};

// --- Path Smoothing ---
export const smoothPath = (canvas: fabric.Canvas, poly: fabric.Polygon | fabric.Polyline, tolerance: number = 2) => {
    if (!poly.points || poly.points.length < 3) return;

    const points = poly.points.map(p => ({ x: p.x, y: p.y }));
    const simplifiedPoints = simplify(points, tolerance, true);
    
    let smoothedObj: fabric.Object;
    const options = {
        left: poly.left,
        top: poly.top,
        fill: poly.fill,
        stroke: poly.stroke,
        strokeWidth: poly.strokeWidth
    };

    if (poly instanceof fabric.Polygon) {
        smoothedObj = new fabric.Polygon(simplifiedPoints, options);
    } else {
        smoothedObj = new fabric.Polyline(simplifiedPoints, options);
    }

    canvas.remove(poly);
    canvas.add(smoothedObj);
    canvas.setActiveObject(smoothedObj);
    canvas.requestRenderAll();
};

// --- QR Code Generator ---
export const generateQRCode = (canvas: fabric.Canvas, text: string, x: number, y: number) => {
    try {
        const qrcode = new QRCode({ content: text, padding: 0, width: 200, height: 200, join: true });
        const svgString = qrcode.svg();
        
        fabric.loadSVGFromString(svgString, (objects, options) => {
            const obj = fabric.util.groupSVGElements(objects, options);
            obj.set({
                left: x,
                top: y,
                originX: 'center',
                originY: 'center'
            });
            canvas.add(obj);
            canvas.setActiveObject(obj);
            canvas.requestRenderAll();
        });
    } catch (e) {
        console.error("QR Code generation failed", e);
    }
};

// --- Advanced Corner Wizard (Fillet & Chamfer) ---
export const applyFillet = (canvas: fabric.Canvas, poly: fabric.Polygon | fabric.Polyline, radius: number) => {
    if (!poly.points || poly.points.length < 3) return;
    
    try {
        const points = poly.points.map(p => ({ X: Math.round(p.x * 1000), Y: Math.round(p.y * 1000) }));
        const offset = new ClipperLib.ClipperOffset();
        let solution: any[][] = [];
        
        offset.AddPath(points, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
        offset.Execute(solution, radius * 1000);
        
        const offset2 = new ClipperLib.ClipperOffset();
        const solution2: any[][] = [];
        offset2.AddPaths(solution, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
        offset2.Execute(solution2, -radius * 1000);
        
        if (solution2.length > 0) {
            const svgPath = solution2.map(path => {
                return 'M ' + path.map((p: any) => `${p.X / 1000} ${p.Y / 1000}`).join(' L ') + ' Z';
            }).join(' ');

            const filletObj = new fabric.Path(svgPath, {
                fill: 'transparent',
                stroke: poly.stroke,
                strokeWidth: poly.strokeWidth,
                left: poly.left,
                top: poly.top
            });

            canvas.remove(poly);
            canvas.add(filletObj);
            canvas.setActiveObject(filletObj);
            canvas.requestRenderAll();
        }
    } catch (e) {
        console.error("Fillet failed", e);
    }
};

export const applyChamfer = (canvas: fabric.Canvas, poly: fabric.Polygon, distance: number) => {
    if (!poly.points) return;
    
    try {
        const points = poly.points.map(p => ({ X: Math.round(p.x * 1000), Y: Math.round(p.y * 1000) }));
        const offset = new ClipperLib.ClipperOffset();
        let solution: any[][] = [];
        
        offset.AddPath(points, ClipperLib.JoinType.jtSquare, ClipperLib.EndType.etClosedPolygon);
        offset.Execute(solution, distance * 1000);
        
        const offset2 = new ClipperLib.ClipperOffset();
        const solution2: any[][] = [];
        offset2.AddPaths(solution, ClipperLib.JoinType.jtSquare, ClipperLib.EndType.etClosedPolygon);
        offset2.Execute(solution2, -distance * 1000);

        if (solution2.length > 0) {
            const svgPath = solution2.map(path => {
                return 'M ' + path.map((p: any) => `${p.X / 1000} ${p.Y / 1000}`).join(' L ') + ' Z';
            }).join(' ');

            const chamferObj = new fabric.Path(svgPath, {
                fill: 'transparent',
                stroke: poly.stroke,
                strokeWidth: poly.strokeWidth
            });

            canvas.remove(poly);
            canvas.add(chamferObj);
            canvas.requestRenderAll();
        }
    } catch (e) {}
};

// --- CNC Dogbones ---
export const applyDogbones = (canvas: fabric.Canvas, poly: fabric.Polygon, toolDiameter: number) => {
    if (!poly.points || poly.points.length < 3) return;
    
    const r = (toolDiameter / 2);
    const points = poly.points;
    const matrix = poly.calcTransformMatrix();
    
    const gPoints = points.map(p => fabric.util.transformPoint(p as fabric.Point, matrix));

    for (let i = 0; i < gPoints.length; i++) {
        const p1 = gPoints[i === 0 ? gPoints.length - 1 : i - 1];
        const p2 = gPoints[i];
        const p3 = gPoints[(i + 1) % gPoints.length];

        const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
        const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

        const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
        const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
        const u1 = { x: v1.x / mag1, y: v1.y / mag1 };
        const u2 = { x: v2.x / mag2, y: v2.y / mag2 };

        const bisector = { x: u1.x + u2.x, y: u1.y + u2.y };
        const bMag = Math.sqrt(bisector.x * bisector.x + bisector.y * bisector.y);
        
        if (bMag > 0.001) {
            const uB = { x: bisector.x / bMag, y: bisector.y / bMag };
            const cross = u1.x * u2.y - u1.y * u2.x;
            
            if (cross > 0) { 
                const angle = Math.acos(u1.x * u2.x + u1.y * u2.y);
                const dist = r / Math.sin(angle / 2);
                
                const boneX = p2.x + uB.x * dist;
                const boneY = p2.y + uB.y * dist;
                
                const circle = new fabric.Circle({
                    left: boneX,
                    top: boneY,
                    radius: r,
                    fill: 'transparent',
                    stroke: poly.stroke,
                    strokeWidth: 1,
                    originX: 'center',
                    originY: 'center',
                    selectable: false,
                    evented: false
                });
                canvas.add(circle);
            }
        }
    }
    
    canvas.requestRenderAll();
    toast.success("Dogbones added to concave corners");
};
