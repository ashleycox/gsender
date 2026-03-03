import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { CAMFeature } from '../definitions';
// @ts-ignore
import ImageTracer from 'imagetracerjs';

export default class FileParser {
    static async parseSVG(file: File, settings?: any): Promise<CAMFeature[]> {
        const text = await file.text();
        return this.parseSVGString(text, settings);
    }

    static parseSVGString(svgString: string, settings?: any): CAMFeature[] {
        const loader = new SVGLoader();
        const svgData = loader.parse(svgString);
        const features: CAMFeature[] = [];
        const tolerance = settings?.curveTolerance || 0.01;

        svgData.paths.forEach((path, index) => {
            path.subPaths.forEach((subPath, subIndex) => {
                // Determine resolution based on subPath length and tolerance
                // SVGLoader doesn't give us a direct way to use chordal error easily, 
                // but we can estimate the number of points.
                const points = subPath.getPoints(Math.max(12, Math.min(2000, 100 / tolerance)));
                const color = path.userData?.style?.stroke || path.userData?.style?.fill || '#ffffff';
                if (points.length > 1) {
                    const mappedPoints = points.map((p: any) => ({ x: p.x, y: p.y })); // Removed negation here, we'll handle coordinate space in the SVG generation
                    
                    // Simple check if it's a rectangle
                    let type: 'path' | 'rectangle' | 'circle' = 'path';
                    if (subPath.curves.length === 4 && subPath.autoClose) {
                        type = 'rectangle';
                    }

                    features.push({
                        id: `svg-path-${Math.random().toString(36).substr(2,9)}`,
                        name: `Part ${index + 1}-${subIndex + 1}`,
                        type: type,
                        color: color,
                        points: mappedPoints,
                        selected: true
                    });
                }
            });
        });

        return features;
    }

    static async parseImage(file: File, settings?: any): Promise<CAMFeature[]> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imgUrl = e.target?.result as string;
                ImageTracer.imageToSVG(imgUrl, (svgString: string) => {
                    resolve(this.parseSVGString(svgString, settings));
                }, { corsenabled: false, ltres: 1, qtres: 1, pathomit: 8 });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    static async parseDXF(file: File, settings?: any): Promise<CAMFeature[]> {
        const text = await file.text();
        const features: CAMFeature[] = [];
        const lines = text.split(/\r?\n/);
        let inEntities = false;
        const tolerance = settings?.curveTolerance || 0.01;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line === 'ENTITIES') inEntities = true;
            if (line === 'ENDSEC') inEntities = false;

            if (inEntities && line === '0') {
                const type = lines[i+1]?.trim();
                if (type === 'LINE' || type === 'CIRCLE' || type === 'LWPOLYLINE') {
                    const feature: CAMFeature = {
                        id: `dxf-${features.length}`,
                        name: `${type} ${features.length + 1}`,
                        type: type === 'CIRCLE' ? 'circle' : 'path',
                        points: [],
                        selected: true
                    };

                    let j = i + 1;
                    let radius = 0;
                    while (j < lines.length && lines[j].trim() !== '0') {
                        const code = lines[j].trim();
                        if (code === '10') feature.points.push({ x: parseFloat(lines[j+1]), y: 0 });
                        if (code === '20' && feature.points.length > 0) feature.points[feature.points.length-1].y = parseFloat(lines[j+1]);
                        if (code === '40') radius = parseFloat(lines[j+1]);
                        j++;
                    }
                    
                    if (type === 'CIRCLE' && feature.points.length === 1 && radius > 0) {
                        const cx = feature.points[0].x, cy = feature.points[0].y;
                        const cPts = [];
                        
                        // Adaptive resolution: n = pi / arccos(1 - tolerance/radius)
                        // This ensures the error never exceeds the tolerance.
                        let steps = 36; // Minimum 36 segments
                        if (radius > tolerance) {
                            steps = Math.ceil(Math.PI / Math.acos(1 - (tolerance / radius)));
                        }
                        
                        // Clamp steps between 16 and 5000 to prevent memory crashes on glitchy data
                        steps = Math.max(16, Math.min(5000, steps));

                        for(let s = 0; s < steps; s++) {
                            const a = (s / steps) * Math.PI * 2;
                            cPts.push({x: cx + Math.cos(a)*radius, y: cy + Math.sin(a)*radius});
                        }
                        feature.points = cPts;
                    }
                    
                    if (feature.points.length > 0) features.push(feature);
                }
            }
        }
        return features;
    }

    static async parseSTL(file: File): Promise<CAMFeature[]> {
        const arrayBuffer = await file.arrayBuffer();
        const loader = new STLLoader();
        const geometry = loader.parse(arrayBuffer);
        
        const features: CAMFeature[] = [];
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;

        if (box) {
            let vertices: number[] = [];
            if (geometry.attributes.position) {
                vertices = Array.from(geometry.attributes.position.array);
            }

            features.push({
                id: 'stl-mesh',
                name: file.name,
                type: 'mesh',
                points: [
                    { x: box.min.x, y: box.min.y },
                    { x: box.max.x, y: box.min.y },
                    { x: box.max.x, y: box.max.y },
                    { x: box.min.x, y: box.max.y },
                    { x: box.min.x, y: box.min.y }
                ],
                meshVertices: vertices,
                selected: true
            });
        }
        
        return features;
    }

    static async parseSTEP(file: File, settings?: any): Promise<CAMFeature[]> {
        const arrayBuffer = await file.arrayBuffer();
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL('../../workers/cam-step.worker.ts', import.meta.url), { type: 'module' });
            worker.onmessage = (e) => {
                if (e.data.success) {
                    resolve(e.data.features);
                } else {
                    reject(new Error(e.data.error));
                }
                worker.terminate();
            };
            worker.onerror = (err) => {
                reject(err);
                worker.terminate();
            };
            worker.postMessage({ buffer: arrayBuffer, settings });
        });
    }

    static generatePreviewGcode(features: CAMFeature[]): string {
        const lines: string[] = ['(Design Ghost Preview)', 'G21', 'G90'];
        features.forEach(f => {
            if (f.points.length < 2) return;
            lines.push(`(Feature: ${f.name})`);
            lines.push(`G0 Z10.000`); 
            lines.push(`G0 X${f.points[0].x.toFixed(3)} Y${f.points[0].y.toFixed(3)}`);
            f.points.forEach(p => {
                lines.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} F2000`);
            });
            if (['circle', 'rectangle', 'hole'].includes(f.type)) {
                lines.push(`G1 X${f.points[0].x.toFixed(3)} Y${f.points[0].y.toFixed(3)}`);
            }
        });
        return lines.join('\n');
    }
}
