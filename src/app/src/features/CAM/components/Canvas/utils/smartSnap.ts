import { fabric } from 'fabric';

const snapZone = 10;

export const initSmartSnapping = (canvas: fabric.Canvas, gridSize: number, snapToGrid: boolean) => {
    canvas.on('object:moving', (options) => {
        const target = options.target;
        if (!target) return;

        let snappedX = false;
        let snappedY = false;

        if (snapToGrid) {
            target.set({
                left: Math.round((target.left || 0) / gridSize) * gridSize,
                top: Math.round((target.top || 0) / gridSize) * gridSize
            });
            return;
        }

        // Object Snapping
        const objects = canvas.getObjects().filter(obj => obj !== target && obj.visible !== false);
        const targetCenter = target.getCenterPoint();
        const targetRect = target.getBoundingRect();

        for (const obj of objects) {
            const objCenter = obj.getCenterPoint();
            const objRect = obj.getBoundingRect();

            // Center Snapping
            if (Math.abs(targetCenter.x - objCenter.x) < snapZone) {
                target.set('left', objCenter.x - (target.width! * (target.scaleX || 1)) / 2);
                snappedX = true;
            }
            if (Math.abs(targetCenter.y - objCenter.y) < snapZone) {
                target.set('top', objCenter.y - (target.height! * (target.scaleY || 1)) / 2);
                snappedY = true;
            }

            // Edge Snapping X
            if (!snappedX) {
                if (Math.abs(targetRect.left - objRect.left) < snapZone) { target.set('left', objRect.left); snappedX = true; }
                else if (Math.abs(targetRect.left + targetRect.width - (objRect.left + objRect.width)) < snapZone) { 
                    target.set('left', objRect.left + objRect.width - targetRect.width); snappedX = true; 
                }
            }

            // Edge Snapping Y
            if (!snappedY) {
                if (Math.abs(targetRect.top - objRect.top) < snapZone) { target.set('top', objRect.top); snappedY = true; }
                else if (Math.abs(targetRect.top + targetRect.height - (objRect.top + objRect.height)) < snapZone) { 
                    target.set('top', objRect.top + objRect.height - targetRect.height); snappedY = true; 
                }
            }

            if (snappedX && snappedY) break;
        }
    });
};
