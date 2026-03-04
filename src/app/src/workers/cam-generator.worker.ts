import GCodeGenerator from '../features/CAM/utils/GCodeGenerator';

// A Web Worker to handle the heavy lifting of GCode path calculation
self.onmessage = (e) => {
    try {
        const { features, pathingOptions, settings, tools, machineSettings } = e.data;
        
        // 1. Generate the full combined G-Code for the visualizer
        const generator = new GCodeGenerator(features, pathingOptions, settings, tools, machineSettings);
        const { gcode, estimatedTime } = generator.generate();
        
        let multiFiles;
        
        // 2. Generate separate files per tool if requested
        if (settings.exportSplitByTool) {
            multiFiles = [];
            
            // Determine the unique tools used in the selected features
            const usedToolIds = new Set<string>();
            features.filter((f: any) => f.selected).forEach((f: any) => {
                const opt = pathingOptions.find((o: any) => o.featureId === f.id);
                if (opt && opt.toolId) usedToolIds.add(opt.toolId);
            });
            
            const usedToolsArray = Array.from(usedToolIds);
            
            // For each tool, create a filtered copy of options, and run the generator
            usedToolsArray.forEach((toolId, index) => {
                const toolOptions = pathingOptions.filter((o: any) => o.toolId === toolId);
                const toolObj = tools.find((t: any) => t.id === toolId) || { name: `Tool_${toolId}` };
                
                // Only include features that have a matching option for this tool
                const toolFeatures = features.filter((f: any) => toolOptions.some((o: any) => o.featureId === f.id));
                
                if (toolFeatures.length > 0) {
                    const singleToolGen = new GCodeGenerator(toolFeatures, toolOptions, settings, tools, machineSettings);
                    const res = singleToolGen.generate();
                    
                    const safeName = toolObj.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    multiFiles.push({
                        name: `${index + 1}_${safeName}.gcode`,
                        gcode: res.gcode,
                        estimatedTime: res.estimatedTime
                    });
                }
            });
        }
        
        self.postMessage({ success: true, gcode, estimatedTime, multiFiles });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        self.postMessage({ success: false, error: msg });
    }
};
