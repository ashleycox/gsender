import occtImportJs from 'occt-import-js';

self.onmessage = async (e) => {
    const { buffer, settings } = e.data;
    try {
        const occt = await occtImportJs();
        
        // 5. Configurable Tesselation (Smoothness Control)
        let linearDeflection = 0.1;
        let angularDeflection = 0.1;
        
        if (settings?.stepTesselationQuality === 'low') { linearDeflection = 0.5; angularDeflection = 0.5; }
        else if (settings?.stepTesselationQuality === 'high') { linearDeflection = 0.05; angularDeflection = 0.05; }
        else if (settings?.stepTesselationQuality === 'ultra') { linearDeflection = 0.01; angularDeflection = 0.01; }

        const result = occt.ReadStepFile(new Uint8Array(buffer), {
            linearDeflection,
            angularDeflection,
            returnBoundingBox: true
        });

        if (!result || !result.success) {
            self.postMessage({ success: false, error: 'Failed to parse STEP file geometry.' });
            return;
        }

        const featuresToReturn = [];
        let featureIdCounter = 0;

        // 6. Assembly Hierarchy Management
        result.meshes.forEach((m, partIndex) => {
            const vertices = Array.from(m.attributes.position.array);
            const normals = m.attributes.normal ? Array.from(m.attributes.normal.array) : [];
            
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < vertices.length; i += 3) {
                const x = vertices[i], y = vertices[i+1];
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }

            const bounds = [
                { x: minX, y: minY }, { x: maxX, y: minY },
                { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY }
            ];

            const parentId = `step-part-${partIndex}`;
            const childIds = [];

            // 2. Individual Face Selection & 4. "Undercut" Safety Analysis
            // We partition the mesh into "Faces" based on normal directions for demonstration.
            // In a real OCCT binding, you'd iterate TopoDS_Face. Here we group triangles by normal.
            const topFaces = [];
            const sideFaces = [];
            const undercutFaces = []; // Faces pointing down

            for (let i = 0; i < normals.length; i += 9) {
                // Average normal of the triangle
                const nz = (normals[i+2] + normals[i+5] + normals[i+8]) / 3;
                if (nz > 0.9) topFaces.push(i/3 * 3); // Top flat
                else if (nz < -0.1 && settings?.analyzeUndercuts) undercutFaces.push(i/3 * 3); // Pointing down = undercut
                else sideFaces.push(i/3 * 3);
            }

            // Create sub-feature for Undercuts (Safety Analysis)
            if (undercutFaces.length > 0) {
                const ucId = `step-uc-${partIndex}`;
                childIds.push(ucId);
                const ucVertices = [];
                undercutFaces.forEach(idx => {
                    ucVertices.push(vertices[idx], vertices[idx+1], vertices[idx+2], vertices[idx+3], vertices[idx+4], vertices[idx+5], vertices[idx+6], vertices[idx+7], vertices[idx+8]);
                });
                featuresToReturn.push({
                    id: ucId,
                    parentId: parentId,
                    name: `⚠️ Undercut Faces`,
                    type: 'face',
                    color: '#ff0000', // Highlight red
                    points: bounds,
                    meshVertices: ucVertices,
                    selected: false,
                    isFace: true
                });
            }

            // 1. Intelligent Hole & Pocket Recognition (Smart Boring)
            // Mock: If bounds are square-ish and small, it might be a cylindrical hole.
            // In reality, we'd use OCCT BRepAdaptor_Surface to mathematically check if it's a cylinder.
            const w = maxX - minX, h = maxY - minY;
            const isCylindrical = Math.abs(w - h) < 0.1 && w < 50; 
            if (isCylindrical) {
                const holeId = `step-hole-${partIndex}`;
                childIds.push(holeId);
                featuresToReturn.push({
                    id: holeId,
                    parentId: parentId,
                    name: `Detected Hole (${(w).toFixed(1)}mm)`,
                    type: 'hole',
                    points: [{x: minX+w/2, y: minY+h/2}],
                    cylinderRadius: w/2,
                    selected: true,
                    isFace: true
                });
            }

            // 3. Automated Edge Extraction (2D-from-3D)
            const edgeId = `step-edge-${partIndex}`;
            childIds.push(edgeId);
            featuresToReturn.push({
                id: edgeId,
                parentId: parentId,
                name: `2D Profile Edge`,
                type: 'path',
                points: bounds, // Using bounds as a proxy for the 2D projected edge
                selected: false,
                isEdge: true
            });

            // The main body
            featuresToReturn.push({
                id: parentId,
                name: m.name || `Assembly Part ${partIndex + 1}`,
                type: 'mesh',
                points: bounds,
                meshVertices: vertices,
                selected: true,
                children: childIds
            });
        });

        self.postMessage({ success: true, features: featuresToReturn });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        self.postMessage({ success: false, error: msg || 'Worker error during STEP parsing.' });
    }
};
