import { CAMFeature, CAMSettings, CAMPathingOption, CAMTool } from '../definitions';
import pubsub from 'pubsub-js';

export default class CAMAccessibility {
    static generateNarrative(features: CAMFeature[], options: CAMPathingOption[], tools: CAMTool[], settings: CAMSettings): string {
        const selectedOps = features
            .filter(f => f.selected)
            .map(f => ({ feature: f, option: options.find(o => o.featureId === f.id) }))
            .filter(op => op.option);

        if (selectedOps.length === 0) return "No operations selected for cutting.";

        let narrative = `Toolpath Narrative for ${settings.units === 'mm' ? 'Metric' : 'Imperial'} job. `;
        narrative += `Stock is ${settings.stockWidth} by ${settings.stockLength} by ${settings.stockThickness}. `;
        narrative += `Z-Zero is set to the ${settings.zOrigin}. `;

        selectedOps.forEach((op, index) => {
            const tool = tools.find(t => t.id === op.option!.toolId);
            narrative += `\n\nOperation ${index + 1}: ${op.feature.name} using ${tool?.name || 'unknown tool'}. `;
            narrative += `Strategy: ${op.option!.type}. `;
            narrative += `Total depth: ${op.option!.depth} ${settings.units}. `;

            if (op.option!.type === '3d-raster') {
                narrative += `This is a 3D surface operation that will follow the model's contours. `;
            } else if (op.option!.type === 'v-carve') {
                narrative += `This is a V-carving operation that will vary depth to reach sharp corners. `;
            } else {
                const stepdown = tool?.stepdown || 1;
                const passes = Math.ceil(op.option!.depth / stepdown);
                narrative += `This will be cut in ${passes} vertical passes of ${stepdown} ${settings.units} each. `;
            }

            if (op.option!.tabs?.enabled) {
                narrative += `There are ${op.option!.tabs.count} holding tabs configured to keep the part attached. `;
            }

            if (op.option!.dogbones?.enabled) {
                narrative += `Automatic corner fillets are enabled for this joinery cut. `;
            }
        });

        narrative += `\n\nEnd of narrative. Total of ${selectedOps.length} operations.`;
        return narrative;
    }

    static announce(message: string) {
        pubsub.publish('cam:announce', message);
    }

    static describeFeatures(features: CAMFeature[], settings: CAMSettings) {
        if (features.length === 0) return "No features detected.";
        
        const count = features.length;
        const selectedCount = features.filter(f => f.selected).length;
        
        return `${count} features detected. ${selectedCount} selected for cutting. Design units are ${settings.units}.`;
    }

    static getFeatureAudit(feature: CAMFeature, settings: CAMSettings): string {
        if (feature.points.length === 0) return `${feature.name} has no geometry data.`;

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        feature.points.forEach((p: {x: number, y: number, z?: number}) => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });

        const width = (maxX - minX).toFixed(2);
        const height = (maxY - minY).toFixed(2);
        const centerX = ((minX + maxX) / 2).toFixed(2);
        const centerY = ((minY + maxY) / 2).toFixed(2);

        let description = `${feature.name}, a ${feature.type}. `;
        description += `Size: ${width} by ${height} ${settings.units}. `;
        description += `Located at center X ${centerX}, Y ${centerY}. `;

        // Relative to stock
        const distLeft = minX.toFixed(2);
        const distTop = (settings.stockLength - maxY).toFixed(2);
        description += `${distLeft} ${settings.units} from left edge, ${distTop} ${settings.units} from back edge.`;

        return description;
    }

    static checkFit(feature: CAMFeature, option: CAMPathingOption, tool: CAMTool): string | null {
        if (!feature.points || feature.points.length === 0) return null;
        if (option.type === 'inside' || option.type === 'pocket') {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            feature.points.forEach((p: {x: number, y: number, z?: number}) => {
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
            
            const featureWidth = maxX - minX;
            const featureHeight = maxY - minY;
            const toolDiameter = tool.metricDiameter;

            if (toolDiameter > featureWidth || toolDiameter > featureHeight) {
                return `Tool too wide for ${feature.name}`;
            }
        }
        return null;
    }

    static checkDepth(feature: CAMFeature, option: CAMPathingOption, tool: CAMTool): string | null {
        if (option.depth > tool.toolLength) {
            return `Depth (${option.depth}) exceeds tool length (${tool.toolLength})`;
        }
        return null;
    }

    static getFeatureWarnings(feature: CAMFeature, options: CAMPathingOption[], tools: CAMTool[]): string[] {
        const warnings: string[] = [];
        const option = options.find(o => o.featureId === feature.id);
        if (!option) return warnings;

        const tool = tools.find(t => t.id === option.toolId);
        if (!tool) return warnings;

        const fitError = this.checkFit(feature, option, tool);
        if (fitError) warnings.push(fitError);

        const depthError = this.checkDepth(feature, option, tool);
        if (depthError) warnings.push(depthError);

        if ((option.type === 'inside' || option.type === 'pocket') && !option.tabs?.enabled) {
            warnings.push("No tabs on cutout - part may fly loose");
        }

        return warnings;
    }
}
