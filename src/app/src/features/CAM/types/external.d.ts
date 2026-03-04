declare module 'imagetracerjs' {
    export function imageToSVG(
        url: string,
        callback: (svgString: string) => void,
        options?: {
            corsenabled?: boolean;
            ltres?: number;
            qtres?: number;
            pathomit?: number;
            [key: string]: any;
        }
    ): void;
}

declare module 'potpack' {
    export default function potpack(
        boxes: Array<{
            w: number;
            h: number;
            [key: string]: any;
        }>
    ): {
        w: number;
        h: number;
        fill: number;
    };
}
