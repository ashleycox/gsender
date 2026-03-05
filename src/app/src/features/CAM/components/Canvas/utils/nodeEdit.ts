import { fabric } from 'fabric';

export const enableNodeEditing = (canvas: fabric.Canvas, poly: fabric.Polygon | fabric.Polyline) => {
    canvas.setActiveObject(poly);
    
    // Hide default controls
    poly.edit = !poly.edit;
    if (poly.edit) {
        let lastControl = poly.points!.length - 1;
        poly.cornerStyle = 'circle';
        poly.cornerColor = 'rgba(0,0,255,0.5)';
        poly.controls = poly.points!.reduce((acc: any, point, index) => {
            acc['p' + index] = new fabric.Control({
                positionHandler: (dim, finalMatrix, fabricObject) => {
                    const x = (fabricObject as any).points[index].x - (fabricObject.pathOffset?.x || 0);
                    const y = (fabricObject as any).points[index].y - (fabricObject.pathOffset?.y || 0);
                    return fabric.util.transformPoint({ x, y } as fabric.Point, fabric.util.multiplyTransformMatrices(
                        fabricObject.canvas!.viewportTransform!,
                        fabricObject.calcTransformMatrix()
                    ));
                },
                actionHandler: (eventData, transform, x, y) => {
                    const polygon = transform.target as fabric.Polygon;
                    const currentControl = polygon.controls[polygon.__corner!];
                    const mouseLocalPosition = polygon.toLocalPoint(new fabric.Point(x, y), 'center', 'center');
                    
                    const polygonBaseSize = polygon._getNonTransformedDimensions();
                    const size = polygon._getTransformedDimensions(0, 0);
                    const finalPointPosition = {
                        x: mouseLocalPosition.x * polygonBaseSize.x / size.x + (polygon.pathOffset?.x || 0),
                        y: mouseLocalPosition.y * polygonBaseSize.y / size.y + (polygon.pathOffset?.y || 0)
                    };
                    
                    polygon.points![index] = finalPointPosition as any;
                    return true;
                },
                cursorStyle: 'pointer',
                actionName: 'modifyPolygon'
            });
            return acc;
        }, {});
    } else {
        poly.cornerColor = 'rgb(178,204,255)';
        poly.cornerStyle = 'rect';
        poly.controls = fabric.Object.prototype.controls;
    }
    
    poly.hasBorders = !poly.edit;
    canvas.requestRenderAll();
};
