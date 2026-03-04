import GCodeGenerator from '../features/CAM/utils/GCodeGenerator';

// A Web Worker to handle the heavy lifting of GCode path calculation
self.onmessage = (e) => {
    try {
        const { features, pathingOptions, settings, tools, machineSettings } = e.data;
        const generator = new GCodeGenerator(features, pathingOptions, settings, tools, machineSettings);
        const { gcode, estimatedTime } = generator.generate();
        self.postMessage({ success: true, gcode, estimatedTime });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        self.postMessage({ success: false, error: msg });
    }
};
