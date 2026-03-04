import potpack from 'potpack';
import { CAMFeature, CAMSettings, CAMPathingOption, CAMTool } from '../definitions';

export default class NestingEngine {
    static optimize(features: CAMFeature[], settings: CAMSettings, options: CAMPathingOption[], tools: CAMTool[]): CAMFeature[] {
        if (!features || features.length === 0) return [];
        if (!Array.isArray(options)) return features;
        
        const userSpacing = settings.nestingSpacing || 5;
        
        // Find the largest tool diameter used in the current operations
        let maxToolDia = 0;
        features.filter(f => f.selected).forEach(f => {
            const opt = options.find(o => o.featureId === f.id);
            if (opt) {
                const tool = tools.find(t => t.id === opt.toolId);
                if (tool && tool.metricDiameter > maxToolDia) maxToolDia = tool.metricDiameter;
            }
        });

        // The effective spacing must be at least the tool diameter so the bit can fit between parts
        // plus the user's requested clearance.
        const totalSpacing = maxToolDia + userSpacing;
        
        // Filter out meshes or huge objects that shouldn't be nested individually if they are parented
        const topLevelFeatures = features.filter(f => !f.parentId && f.selected);
        
        const boxes = topLevelFeatures.map(f => {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            f.points.forEach(p => {
                minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            });
            return {
                id: f.id,
                w: (maxX - minX) + totalSpacing,
                h: (maxY - minY) + totalSpacing,
                minX, minY
            };
        });

        // Potpack optimizes the layout in-place
        const { w, h } = potpack(boxes);

        const getRootId = (featureId: string): string => {
            const feature = features.find(f => f.id === featureId);
            if (!feature || !feature.parentId) return featureId;
            return getRootId(feature.parentId);
        };

        // Map the new positions back to the features
        return features.map(f => {
            const rootId = getRootId(f.id);
            const box = boxes.find(b => b.id === rootId) as any;
            if (!box) return f;

            const offsetX = box.x - box.minX;
            const offsetY = box.y - box.minY;

            return {
                ...f,
                points: f.points.map(p => ({
                    ...p,
                    x: p.x + offsetX,
                    y: p.y + offsetY
                })),
                meshVertices: f.meshVertices ? f.meshVertices.map((v, i) => {
                    if (i % 3 === 0) return v + offsetX;
                    if (i % 3 === 1) return v + offsetY;
                    return v;
                }) : undefined
            };
        });
    }
}
