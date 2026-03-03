import React, { useState, useMemo } from 'react';
import { Button } from '../../../components/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/shadcn/Select';
import { ControlledInput } from '../../../components/ControlledInput';
import Switch from '../../../components/Switch';
import FileParser from '../utils/FileParser';
import CAMAccessibility from '../utils/CAMAccessibility';
import { CAMFeature, CAMSettings } from '../definitions';
import { X, Wand2, AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical } from 'lucide-react';
import RangeSlider from '../../../components/RangeSlider';

interface ParametricWizardsProps {
    features: CAMFeature[];
    settings: CAMSettings;
    onGenerate: (features: CAMFeature[]) => void;
    onClose: () => void;
}

const WizardInputRow = ({ label, control, description }: { label: string, control: React.ReactNode, description: string }) => (
    <div className="flex flex-col gap-2 p-3 border-b border-gray-200 dark:border-gray-700 last:border-0">
        <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 shrink-0">{label}</label>
            <div className="flex-1 flex justify-end">{control}</div>
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 italic leading-tight">{description}</p>
    </div>
);

const ParametricWizards = ({ features, settings, onGenerate, onClose }: ParametricWizardsProps) => {
    const [wizard, setWizard] = useState<'surfacing' | 'clock' | 'box' | 'text' | 'spoilboard' | 'finger' | 'dovetail' | 'inlay' | 'bolt' | 'gear' | 'dish' | 'keyhole' | 'sign' | 'ruler'>('surfacing');
    
    // Position states
    const [posX, setPosX] = useState(0);
    const [posY, setPosY] = useState(0);
    const [relativeToId, setRelativeToId] = useState<string>('stock');

    // Wizard-specific states
    const [surfW, setSurfW] = useState(100);
    const [surfL, setSurfL] = useState(100);
    
    const [clockDia, setClockDia] = useState(250);
    const [clockHole, setClockHole] = useState(8);
    const [clockStyle, setClockStyle] = useState<'ticks' | 'numbers'>('ticks');
    const [clockTicks, setClockTicks] = useState({ hours: true, minutes: true });
    
    const [boxW, setBoxW] = useState(100);
    const [boxL, setBoxL] = useState(100);
    const [boxWall, setBoxWall] = useState(15);
    const [boxLid, setBoxLid] = useState<'none' | 'stepped' | 'hinged'>('none');
    const [boxType, setBoxType] = useState<'pocket' | 'flat-pack'>('pocket');
    const [boxShape, setBoxShape] = useState<'rect' | 'circle' | 'square'>('rect');
    
    const [textContent, setTextContent] = useState('GSENDER');
    const [textSize, setTextSize] = useState(20);
    const [textRadius, setTextRadius] = useState(0);
    
    const [sbW, setSbW] = useState(400);
    const [sbL, setSbL] = useState(400);
    const [sbCountX, setSbCountX] = useState(5);
    const [sbCountY, setSbCountY] = useState(5);
    const [sbSpacing, setSbSpacing] = useState(75);
    const [sbHoleDia, setSbHoleDia] = useState(8);
    
    const [fjW, setFjW] = useState(100);
    const [fjH, setFjH] = useState(50);
    const [fjThickness, setFjThickness] = useState(12);
    const [fjFingers, setFjFingers] = useState(5);
    
    const [dtWidth, setDtWidth] = useState(100);
    const [dtTails, setDtTails] = useState(3);
    const [dtThickness, setDtThickness] = useState(15);
    const [dtAngle, setDtAngle] = useState(10);
    
    const [inlayShape, setInlayShape] = useState<'circle' | 'star'>('circle');
    const [inlaySize, setInlaySize] = useState(50);
    const [inlayTol, setInlayTol] = useState(0.2);
    
    const [bpPcd, setBpPcd] = useState(100);
    const [bpHoles, setBpHoles] = useState(6);
    const [bpHoleDia, setBpHoleDia] = useState(10);
    const [bpBore, setBpBore] = useState(0);
    
    const [gearTeeth, setGearTeeth] = useState(20);
    const [gearModule, setGearModule] = useState(2);
    const [gearBore, setGearBore] = useState(10);
    
    const [dishW, setDishW] = useState(150);
    const [dishL, setDishL] = useState(150);
    const [dishDepth, setDishDepth] = useState(10);
    const [dishShape, setDishShape] = useState<'rect' | 'circle'>('circle');
    
    const [keyLength, setKeyLength] = useState(20);
    const [keyCount, setKeyCount] = useState(1);
    
    const [signW, setSignW] = useState(300);
    const [signL, setSignL] = useState(150);
    const [signStyle, setSignStyle] = useState<'french' | 'scalloped' | 'plaque'>('french');
    
    const [rulerLength, setRulerLength] = useState(300);
    const [rulerMajor, setRulerMajor] = useState(10);
    const [rulerMinor, setRulerMinor] = useState(1);

    const glyphs: Record<string, string> = {
        'G': 'M 8 2 A 6 8 0 1 0 8 14 L 8 8 L 5 8', 'S': 'M 8 2 C 2 2 2 8 8 8 C 14 8 14 14 8 14 C 2 14 2 14 2 14',
        'E': 'M 8 2 L 2 2 L 2 14 L 8 14 M 2 8 L 6 8', 'N': 'M 2 14 L 2 2 L 8 14 L 8 2', 'D': 'M 2 2 L 2 14 C 10 14 10 2 2 2',
        'R': 'M 2 14 L 2 2 L 6 2 C 10 2 10 8 6 8 L 2 8 M 6 8 L 9 14', '0': 'M 5 2 A 4 6 0 1 0 5 14 A 4 6 0 1 0 5 2',
        '1': 'M 3 5 L 5 2 L 5 14', '2': 'M 2 5 C 2 0 8 0 8 5 C 8 10 2 10 2 14 L 8 14', '3': 'M 2 2 L 8 2 L 5 8 L 8 8 C 10 8 10 14 5 14 L 2 14',
        '4': 'M 6 14 L 6 2 L 2 10 L 8 10', '5': 'M 8 2 L 2 2 L 2 8 L 8 8 C 10 8 10 14 2 14', '6': 'M 8 2 L 2 8 L 2 14 L 8 14 L 8 8 L 2 8',
        '7': 'M 2 2 L 8 2 L 4 14', '8': 'M 5 8 C 10 8 10 2 5 2 C 0 2 0 8 5 8 C 10 8 10 14 5 14 C 0 14 0 8 5 8', '9': 'M 2 8 L 8 8 L 8 2 L 2 2 L 2 8 L 8 14'
    };

    const referenceBounds = useMemo(() => {
        if (relativeToId === 'stock') return { x: 0, y: 0, width: settings.stockWidth, height: settings.stockLength };
        const ref = features.find(f => f.id === relativeToId);
        if (!ref) return { x: 0, y: 0, width: 0, height: 0 };
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        ref.points.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }, [relativeToId, features, settings]);

    const applyOffsets = (generated: CAMFeature[]) => {
        const offsetFeatures = generated.map(f => ({
            ...f,
            points: f.points.map(p => ({ x: p.x + referenceBounds.x + posX, y: p.y + referenceBounds.y + posY })),
            meshVertices: f.meshVertices ? f.meshVertices.map((v, i) => {
                if (i % 3 === 0) return v + referenceBounds.x + posX;
                if (i % 3 === 1) return v + referenceBounds.y + posY;
                return v;
            }) : undefined
        }));
        onGenerate(offsetFeatures);
    };

    const generateSVG = (svgString: string) => {
        const generated = FileParser.parseSVGString(svgString, settings);
        applyOffsets(generated);
    };

    const handleSurfacing = () => {
        const w = Math.max(1, surfW), l = Math.max(1, surfL);
        const generated: CAMFeature[] = [{
            id: `surf-${Math.random().toString(36).substring(2,9)}`,
            name: 'Surfacing Area', type: 'rectangle', selected: true,
            points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: l }, { x: 0, y: l }, { x: 0, y: 0 }]
        }];
        applyOffsets(generated);
    };

    const handleText = () => {
        const textToRender = textContent || ' ';
        const totalW = Math.max(10, textRadius > 0 ? textRadius * 3 : textToRender.length * textSize * 1.5);
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalW}">`;
        let ox = 5;
        for (let i = 0; i < textToRender.toUpperCase().length; i++) {
            const char = textToRender.toUpperCase()[i];
            const path = glyphs[char] || 'M 2 2 L 8 14 M 8 2 L 2 14';
            if (textRadius > 0) {
                const angle = (i / textToRender.length) * Math.PI - Math.PI/2;
                const tx = Math.cos(angle) * textRadius + textRadius, ty = Math.sin(angle) * textRadius + textRadius, rot = (angle * 180 / Math.PI) + 90;
                svg += `<g transform="translate(${tx}, ${ty}) rotate(${rot}) scale(${textSize / 10})"><path d="${path}" fill="none" stroke="black" stroke-width="1"/></g>`;
            } else {
                svg += `<g transform="translate(${ox}, 5) scale(${textSize / 10})"><path d="${path}" fill="none" stroke="black" stroke-width="1"/></g>`;
            }
            ox += textSize;
        }
        svg += `</svg>`; generateSVG(svg);
    };

    const handleBox = () => {
        const sw = Math.max(5, boxW), sl = Math.max(5, boxShape === 'square' ? boxW : boxL), swall = Math.max(1, boxWall);
        if (boxType === 'flat-pack') {
            let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw * 4} ${sl * 3}">`;
            for(let i=0; i<6; i++) {
                const ox = (i % 3) * (sw + 20), oy = Math.floor(i / 3) * (sl + 20);
                svg += `<g transform="translate(${ox + 10}, ${oy + 10})"><rect x="0" y="0" width="${sw}" height="${sl}" fill="none" stroke="black"/></g>`;
            }
            svg += `</svg>`; generateSVG(svg); return;
        }
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sw * 2.5} ${sl * 2}">`;
        const iw = Math.max(0.1, sw - (swall * 2)), il = Math.max(0.1, sl - (swall * 2));
        if (boxShape !== 'circle') {
            svg += `<rect x="10" y="10" width="${sw}" height="${sl}" fill="none" stroke="black" />`;
            if (iw > 0.1 && il > 0.1) svg += `<rect x="${10 + swall}" y="${10 + swall}" width="${iw}" height="${il}" fill="none" stroke="black" />`;
            if (boxLid !== 'none') {
                const lx = sw + 30; svg += `<rect x="${lx}" y="10" width="${sw}" height="${sl}" fill="none" stroke="black" />`;
                if (boxLid === 'stepped' && iw > 1) svg += `<rect x="${lx + swall + 0.5}" y="${10 + swall + 0.5}" width="${Math.max(0.1, iw - 1)}" height="${Math.max(0.1, il - 1)}" fill="none" stroke="black" />`;
                else if (boxLid === 'hinged') { const hw = Math.min(20, sw - 10); svg += `<rect x="${10 + sw/2 - hw/2}" y="${10 + sl - 5}" width="${hw}" height="5" fill="none" stroke="black" /><rect x="${lx + sw/2 - hw/2}" y="10" width="${hw}" height="5" fill="none" stroke="black" />`; }
            }
        } else {
            const r = sw / 2, ir = Math.max(0.1, r - swall);
            svg += `<circle cx="${10 + r}" cy="${10 + r}" r="${r}" fill="none" stroke="black" />`;
            if (ir > 0.1) svg += `<circle cx="${10 + r}" cy="${10 + r}" r="${ir}" fill="none" stroke="black" />`;
            if (boxLid !== 'none') {
                const lx = sw + 30 + r; svg += `<circle cx="${lx}" cy="${10 + r}" r="${r}" fill="none" stroke="black" />`;
                if (boxLid === 'stepped' && ir > 0.6) svg += `<circle cx="${lx}" cy="${10 + r}" r="${ir - 0.5}" fill="none" stroke="black" />`;
            }
        }
        svg += `</svg>`; generateSVG(svg);
    };

    const handleDovetail = () => {
        const w = Math.max(20, dtWidth), t = Math.max(5, dtThickness), tails = Math.max(2, dtTails), angleRad = dtAngle * (Math.PI / 180);
        const segmentW = w / tails, tailOffset = Math.tan(angleRad) * t; 
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * 2.5} ${w + t * 2}">`;
        let dTails = `M 10 10 `;
        for (let i = 0; i < tails; i++) {
            const sx = 10 + i * segmentW, ex = 10 + (i + 1) * segmentW, gap = segmentW * 0.4, actualTailOffset = Math.min(tailOffset, segmentW * 0.3 - 0.1);
            const px1 = sx + gap/2 - actualTailOffset, px2 = sx + gap/2, px3 = ex - gap/2, px4 = ex - gap/2 + actualTailOffset;
            dTails += `L ${px1} 10 L ${px2} ${10 + t} L ${px3} ${10 + t} L ${px4} 10 `;
        }
        dTails += `L ${10 + w} 10 L ${10 + w} ${10 + w} L 10 ${10 + w} Z`;
        svg += `<path d="${dTails}" fill="none" stroke="black" />`;
        const ox = 20 + w; let dPins = `M ${ox} ${10 + t} `;
        for (let i = 0; i < tails; i++) {
            const sx = ox + i * segmentW, ex = ox + (i + 1) * segmentW, gap = segmentW * 0.4, actualTailOffset = Math.min(tailOffset, segmentW * 0.3 - 0.1);
            const px1 = sx + gap/2 - actualTailOffset, px2 = sx + gap/2, px3 = ex - gap/2, px4 = ex - gap/2 + actualTailOffset;
            dPins += `L ${px1} ${10 + t} L ${px2} 10 L ${px3} 10 L ${px4} ${10 + t} `;
        }
        dPins += `L ${ox + w} ${10 + t} L ${ox + w} ${10 + w} L ${ox} ${10 + w} Z`;
        svg += `<path d="${dPins}" fill="none" stroke="black" />`;
        svg += `</svg>`; generateSVG(svg);
    };

    const handleClock = () => {
        const r = clockDia / 2, sw_markR = Math.max(1, r - 15);
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-r} ${-r} ${clockDia} ${clockDia}"><circle cx="0" cy="0" r="${r}" fill="none" stroke="black" />`;
        if (clockHole > 0) svg += `<circle cx="0" cy="0" r="${clockHole / 2}" fill="none" stroke="black" />`;
        for (let i = 0; i < 60; i++) {
            const angle = (i * 6 - 90) * (Math.PI / 180), isHour = i % 5 === 0;
            if (isHour && clockTicks.hours) {
                if (clockStyle === 'ticks') svg += `<line x1="${Math.cos(angle)*(sw_markR-10)}" y1="${Math.sin(angle)*(sw_markR-10)}" x2="${Math.cos(angle)*sw_markR}" y2="${Math.sin(angle)*sw_markR}" stroke="black" stroke-width="2" />`;
                else {
                    const h = i / 5 === 0 ? 12 : i / 5, size = clockDia * 0.04, n = h.toString();
                    let tox = Math.cos(angle)*sw_markR - (n.length * size)/2;
                    for(let char of n) { if(glyphs[char]) svg += `<g transform="translate(${tox}, ${Math.sin(angle)*sw_markR - size}) scale(0.5)"><path d="${glyphs[char]}" fill="none" stroke="black"/></g>`; tox += size * 1.2; }
                }
            } else if (!isHour && clockTicks.minutes) svg += `<line x1="${Math.cos(angle)*(sw_markR-3)}" y1="${Math.sin(angle)*(sw_markR-3)}" x2="${Math.cos(angle)*sw_markR}" y2="${Math.sin(angle)*sw_markR}" stroke="black" stroke-width="1" />`;
        }
        svg += `</svg>`; generateSVG(svg);
    };

    const handleSpoilboard = () => {
        const w = Math.max(10, sbW), l = Math.max(10, sbL), cx = Math.max(1, sbCountX), cy = Math.max(1, sbCountY), sp = Math.max(1, sbSpacing), hdia = Math.max(0.1, sbHoleDia);
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${l}"><rect x="0" y="0" width="${w}" height="${l}" fill="none" stroke="gray" stroke-dasharray="2,2" />`;
        const startX = (w - (cx - 1) * sp) / 2, startY = (l - (cy - 1) * sp) / 2;
        for (let y = 0; y < cy; y++) for (let x = 0; x < cx; x++) svg += `<circle cx="${startX + x * sp}" cy="${startY + y * sp}" r="${hdia / 2}" fill="none" stroke="black" />`;
        svg += `</svg>`; generateSVG(svg);
    };

    const handleFinger = () => {
        const w = Math.max(10, fjW), h = Math.max(10, fjH), t = Math.max(1, fjThickness), f = Math.max(2, fjFingers), fw = w / f;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w * 2.5} ${h + t * 2}">`;
        let d = `M 10 10 `; for (let i = 0; i < f; i++) d += (i % 2 === 0) ? `L ${10 + i*fw} 10 L ${10 + i*fw} ${10 + t} L ${10 + (i+1)*fw} ${10 + t} L ${10 + (i+1)*fw} 10 ` : `L ${10 + (i+1)*fw} 10 `;
        d += `L ${10 + w} ${10 + h + t} L 10 ${10 + h + t} Z`; svg += `<path d="${d}" fill="none" stroke="black" />`;
        let db = `M ${20 + w} 10 `; for (let i = 0; i < f; i++) db += (i % 2 !== 0) ? `L ${20 + w + i*fw} 10 L ${20 + w + i*fw} ${10 + t} L ${20 + w + (i+1)*fw} ${10 + t} L ${20 + w + (i+1)*fw} 10 ` : `L ${20 + w + (i+1)*fw} 10 `;
        db += `L ${20 + 2*w} ${10 + h + t} L ${20 + w} ${10 + h + t} Z`; svg += `<path d="${db}" fill="none" stroke="black" /></svg>`;
        generateSVG(svg);
    };

    const handleInlay = () => {
        const s = Math.max(5, inlaySize), r = s / 2;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s * 2.5} ${s * 1.5}">`;
        if (inlayShape === 'circle') {
            svg += `<circle cx="${10 + r}" cy="${10 + r}" r="${r}" fill="none" stroke="black" /><circle cx="${20 + s + r}" cy="${10 + r}" r="${Math.max(0.1, r - inlayTol)}" fill="none" stroke="black" />`;
        } else {
            const getStar = (cx: number, cy: number, or: number, ir: number) => {
                let pts = ''; for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2; pts += `${cx + Math.cos(a) * (i % 2 === 0 ? or : ir)},${cy + Math.sin(a) * (i % 2 === 0 ? or : ir)} `; }
                return pts;
            };
            svg += `<polygon points="${getStar(10+r, 10+r, r, r/2.5)}" fill="none" stroke="black" /><polygon points="${getStar(20+s+r, 10+r, Math.max(0.1, r-inlayTol), Math.max(0.1, (r-inlayTol)/2.5))}" fill="none" stroke="black" />`;
        }
        svg += `</svg>`; generateSVG(svg);
    };

    const handleBolt = () => {
        const pcd = Math.max(1, bpPcd), ts = pcd + Math.max(bpHoleDia, bpBore) + 20, cx = ts/2, cy = ts/2, r = pcd/2;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ts} ${ts}">`;
        if (bpBore > 0) svg += `<circle cx="${cx}" cy="${cy}" r="${bpBore / 2}" fill="none" stroke="black" />`;
        for (let i = 0; i < bpHoles; i++) { const a = i * (Math.PI * 2 / bpHoles) - Math.PI / 2; svg += `<circle cx="${cx + Math.cos(a)*r}" cy="${cy + Math.sin(a)*r}" r="${bpHoleDia / 2}" fill="none" stroke="black" />`; }
        svg += `</svg>`; generateSVG(svg);
    };

    const handleGear = () => {
        const teeth = Math.max(3, gearTeeth), mod = Math.max(0.1, gearModule), pitchDia = teeth * mod, outerDia = pitchDia + 2 * mod, rootDia = Math.max(gearBore + 5, pitchDia - 2.5 * mod), ts = outerDia + 20, cx = ts/2, cy = ts/2;
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ts} ${ts}">`;
        if (gearBore > 0) svg += `<circle cx="${cx}" cy="${cy}" r="${gearBore / 2}" fill="none" stroke="black" />`;
        let d = `M ${cx + outerDia/2} ${cy} `; for (let i = 0; i < teeth; i++) {
            const a1 = (i*2*Math.PI)/teeth, a2 = ((i+0.25)*2*Math.PI)/teeth, a3 = ((i+0.5)*2*Math.PI)/teeth, a4 = ((i+0.75)*2*Math.PI)/teeth;
            d += `L ${cx + Math.cos(a1)*outerDia/2} ${cy + Math.sin(a1)*outerDia/2} L ${cx + Math.cos(a2)*outerDia/2} ${cy + Math.sin(a2)*outerDia/2} L ${cx + Math.cos(a3)*rootDia/2} ${cy + Math.sin(a3)*rootDia/2} L ${cx + Math.cos(a4)*rootDia/2} ${cy + Math.sin(a4)*rootDia/2} `;
        }
        svg += `<path d="${d} Z" fill="none" stroke="black" /></svg>`; generateSVG(svg);
    };

    const handleDish = () => {
        const w = Math.max(5, dishW), l = dishShape === 'circle' ? w : Math.max(5, dishL), depth = Math.max(0.1, dishDepth), res = Math.max(0.5, Math.max(w/200, l/200, (settings.curveTolerance || 0.01)*10)), vertices: number[] = [], cx = w/2, cy = l/2, r = w/2;
        const getZ = (x: number, y: number) => {
            if (dishShape === 'circle') { const d = Math.hypot(x-cx, y-cy); return d >= r ? 0 : -depth * (1 - (d/r)**2); }
            const dx = Math.abs(x-cx)/(w/2), dy = Math.abs(y-cy)/(l/2), m = Math.max(dx,dy); return m >= 1 ? 0 : -depth * (1 - m**2);
        };
        for (let rIdx = 0; rIdx < Math.ceil(l/res); rIdx++) for (let cIdx = 0; cIdx < Math.ceil(w/res); cIdx++) {
            const x0 = cIdx*res, y0 = rIdx*res, x1 = (cIdx+1)*res, y1 = (rIdx+1)*res, z00 = getZ(x0, y0), z10 = getZ(x1, y0), z01 = getZ(x0, y1), z11 = getZ(x1, y1);
            vertices.push(x0, y0, z00, x1, y0, z10, x0, y1, z01, x1, y0, z10, x1, y1, z11, x0, y1, z01);
        }
        applyOffsets([{ id: `mesh-${Math.random().toString(36).substring(2,9)}`, name: `Generated Dish`, type: 'mesh', points: [{x:0, y:0}, {x:w, y:0}, {x:w, y:l}, {x:0, y:l}], meshVertices: vertices, selected: true } as any]);
    };

    const handleKeyhole = () => {
        const kLen = Math.max(1, keyLength), kCount = Math.max(1, keyCount);
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${kLen * 5} ${kCount * 30}">`;
        for (let i = 0; i < kCount; i++) svg += `<path d="M 10 ${20+i*30} L ${10+kLen} ${20+i*30} L 10 ${20+i*30}" fill="none" stroke="black" stroke-width="1" />`;
        generateSVG(svg + `</svg>`);
    };

    const handleSign = () => {
        const w = Math.max(10, signW), l = Math.max(10, signL), r = Math.min(20, w/2, l/2); let d = '';
        if (signStyle === 'french') d = `M 10 ${10+r} L 10 ${10+l-r} L ${10+r} ${10+l} L ${10+w-r} ${10+l} L ${10+w} ${10+l-r} L ${10+w} ${10+r} L ${10+w-r} 10 L ${10+r} 10 Z`;
        else if (signStyle === 'scalloped') d = `M 10 ${10+r} Q 10 10 ${10+r} 10 L ${10+w-r} 10 Q ${10+w} 10 ${10+w} ${10+r} L ${10+w} ${10+l-r} Q ${10+w} ${10+l} ${10+w-r} ${10+l} L ${10+r} ${10+l} Q 10 ${10+l} 10 ${10+l-r} Z`;
        else { const cp = Math.max(5, l/4); d = `M 10 ${10+l/2} C 10 ${10+l/2-cp} ${10+w/2-cp} 10 ${10+w/2} 10 C ${10+w/2+cp} 10 ${10+w} ${10+l/2-cp} ${10+w} ${10+l/2} C ${10+w} ${10+l/2+cp} ${10+w/2+cp} ${10+l} ${10+w/2} ${10+l} C ${10+w/2-cp} ${10+l} 10 ${10+l/2+cp} 10 ${10+l/2} Z`; }
        generateSVG(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w+20} ${l+20}"><path d="${d}" fill="none" stroke="black" /></svg>`);
    };

    const handleRuler = () => {
        const rl = Math.max(10, rulerLength), rMaj = Math.max(1, rulerMajor), rMin = Math.max(0.1, rulerMinor);
        let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rl+20} 50">`;
        for (let i = 0; i <= rl; i += rMin) {
            let h = Math.abs(i % rMaj) < 0.001 ? 15 : (Math.abs(i % (rMaj/2)) < 0.001 ? 10 : 5);
            svg += `<line x1="${10+i}" y1="10" x2="${10+i}" y2="${10+h}" stroke="black" stroke-width="0.5" />`;
            if (Math.abs(i % rMaj) < 0.001 && i < rl) {
                const txt = Math.round(i).toString(); let tox = 10+i-(txt.length*2);
                for(let c of txt) { if(glyphs[c]) svg += `<g transform="translate(${tox}, 30) scale(0.5)"><path d="${glyphs[c]}" fill="none" stroke="black"/></g>`; tox += 5; }
            }
        }
        generateSVG(svg + `</svg>`);
    };

    const menu = [
        { id: 'surfacing', label: 'Surfacing' }, { id: 'clock', label: 'Clock' }, { id: 'box', label: 'Box' },
        { id: 'text', label: 'Text' }, { id: 'spoilboard', label: 'Spoilboard' }, { id: 'finger', label: 'Finger' },
        { id: 'dovetail', label: 'Dovetail' }, { id: 'inlay', label: 'Inlay' }, { id: 'bolt', label: 'Bolt' },
        { id: 'gear', label: 'Gear' }, { id: 'dish', label: 'Dish' }, { id: 'keyhole', label: 'Keyhole' },
        { id: 'sign', label: 'Sign' }, { id: 'ruler', label: 'Ruler' }
    ];

    const currentWizardFeatures = features.filter(f => !f.parentId);

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
            <div className="bg-white dark:bg-dark-lighter rounded-lg shadow-2xl max-w-4xl w-full border border-gray-200 dark:border-gray-700 p-6 flex flex-col max-h-[95vh]">
                <div className="flex justify-between items-center mb-6">
                    <h2 id="wizard-title" className="text-xl font-bold flex items-center gap-2 text-blue-500"><Wand2 aria-hidden="true" /> Parametric Creator</h2>
                    <Button variant="ghost" size="mini" onClick={onClose} aria-label="Close Wizard"><X size={20} /></Button>
                </div>

                <div className="flex flex-1 overflow-hidden gap-6">
                    <div className="w-2/3 flex flex-col overflow-hidden">
                        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4 flex-wrap" role="tablist">
                            {menu.map(btn => (
                                <Button key={btn.id} variant={wizard === btn.id ? 'primary' : 'outline'} size="xs" onClick={() => { setWizard(btn.id as any); CAMAccessibility.announce(`Switched to ${btn.label} wizard.`); }} role="tab" aria-selected={wizard === btn.id}>{btn.label}</Button>
                            ))}
                        </div>

                        <div className="space-y-4 flex-1 overflow-y-auto pr-2" role="tabpanel">
                            {wizard === 'surfacing' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Width" description="Width of area to surface." control={<ControlledInput type="number" value={surfW} onChange={e=>setSurfW(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Length" description="Length of area to surface." control={<ControlledInput type="number" value={surfL} onChange={e=>setSurfL(Number(e.target.value))}/>}/>
                            </div>}
                            {wizard === 'text' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Text" description="Content to engrave." control={<ControlledInput type="text" value={textContent} onChange={e=>setTextContent(e.target.value)}/>}/>
                                <WizardInputRow label="Font Size" description="Height of characters." control={<ControlledInput type="number" value={textSize} onChange={e=>setTextSize(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Curve Radius" description="Set > 0 to wrap text." control={<ControlledInput type="number" value={textRadius} onChange={e=>setTextRadius(Number(e.target.value))}/>}/>
                            </div>}
                            {wizard === 'box' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Box Shape" description="Geometry of base." control={<Select value={boxShape} onValueChange={(v:any)=>setBoxShape(v)}><SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="rect">Rectangle</SelectItem><SelectItem value="circle">Circle</SelectItem><SelectItem value="square">Square</SelectItem></SelectContent></Select>}/>
                                <WizardInputRow label="Type" description="Pocket tray or flat-pack." control={<Select value={boxType} onValueChange={(v:any)=>setBoxType(v)}><SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="pocket">Pocket</SelectItem><SelectItem value="flat-pack">Flat-Pack</SelectItem></SelectContent></Select>}/>
                                <WizardInputRow label="Width/Dia" description="Outer horizontal dimension." control={<ControlledInput type="number" value={boxW} onChange={e=>setBoxW(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Length" description="Outer vertical dimension (ignored for circle/square)." control={<ControlledInput type="number" value={boxL} onChange={e=>setBoxL(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Wall Thick" description="Thickness of side walls." control={<ControlledInput type="number" value={boxWall} onChange={e=>setBoxWall(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Lid Type" description="Optional lid style." control={<Select value={boxLid} onValueChange={(v:any)=>setBoxLid(v)}><SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="stepped">Stepped</SelectItem><SelectItem value="hinged">Hinged</SelectItem></SelectContent></Select>}/>
                            </div>}
                            {wizard === 'clock' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Diameter" description="Clock face diameter." control={<ControlledInput type="number" value={clockDia} onChange={e=>setClockDia(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Style" description="Numbers or ticks." control={<Select value={clockStyle} onValueChange={(v:any)=>setClockStyle(v)}><SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="ticks">Ticks</SelectItem><SelectItem value="numbers">Numbers</SelectItem></SelectContent></Select>}/>
                                <WizardInputRow label="Hole" description="Center shaft hole." control={<ControlledInput type="number" value={clockHole} onChange={e=>setClockHole(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Marks" description="Toggle hour and minute markers." control={<div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer"><Switch checked={clockTicks.hours} onChange={c=>setClockTicks({...clockTicks, hours:c})}/> Hour</label>
                                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer"><Switch checked={clockTicks.minutes} onChange={c=>setClockTicks({...clockTicks, minutes:c})}/> Minute</label>
                                </div>}/>
                            </div>}
                            {wizard === 'spoilboard' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Board W" control={<ControlledInput type="number" value={sbW} onChange={e=>setSbW(Number(e.target.value))}/>} description="Width of wasteboard." />
                                <WizardInputRow label="Board L" control={<ControlledInput type="number" value={sbL} onChange={e=>setSbL(Number(e.target.value))}/>} description="Length of wasteboard." />
                                <WizardInputRow label="Holes X" control={<ControlledInput type="number" value={sbCountX} onChange={e=>setSbCountX(Number(e.target.value))}/>} description="Mounting holes X." />
                                <WizardInputRow label="Holes Y" control={<ControlledInput type="number" value={sbCountY} onChange={e=>setSbCountY(Number(e.target.value))}/>} description="Mounting holes Y." />
                                <WizardInputRow label="Spacing" control={<ControlledInput type="number" value={sbSpacing} onChange={e=>setSbSpacing(Number(e.target.value))}/>} description="Hole spacing." />
                                <WizardInputRow label="Hole Dia" control={<ControlledInput type="number" value={sbHoleDia} onChange={e=>setSbHoleDia(Number(e.target.value))}/>} description="Hole diameter." />
                            </div>}
                            {wizard === 'finger' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Width" description="The outer dimension of the joint interface." control={<ControlledInput type="number" value={fjW} onChange={e=>setFjW(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Height" description="The height of the parts being joined." control={<ControlledInput type="number" value={fjH} onChange={e=>setFjH(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Thickness" description="Depth of the interlocking fingers (usually material thickness)." control={<ControlledInput type="number" value={fjThickness} onChange={e=>setFjThickness(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Fingers" description="Total number of alternating tabs." control={<ControlledInput type="number" value={fjFingers} onChange={e=>setFjFingers(Number(e.target.value))}/>}/>
                            </div>}
                            {wizard === 'dovetail' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Total Width" description="Width of jointed edge." control={<ControlledInput type="number" value={dtWidth} onChange={e=>setDtWidth(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Tail Count" description="Number of dovetails." control={<ControlledInput type="number" value={dtTails} onChange={e=>setDtTails(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Thickness" description="Material thickness." control={<ControlledInput type="number" value={dtThickness} onChange={e=>setDtThickness(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Angle" description="Joint angle (8-14 typical)." control={<ControlledInput type="number" value={dtAngle} onChange={e=>setDtAngle(Number(e.target.value))}/>}/>
                            </div>}
                            {wizard === 'keyhole' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Slot Length" description="The distance the bit travels after plunging to create the hanging slot." control={<ControlledInput type="number" value={keyLength} onChange={e=>setKeyLength(Number(e.target.value))}/>}/>
                                <WizardInputRow label="Count" description="Number of keyhole slots to generate." control={<ControlledInput type="number" value={keyCount} onChange={e=>setKeyCount(Number(e.target.value))}/>}/>
                            </div>}
                            {wizard === 'inlay' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Shape" control={<Select value={inlayShape} onValueChange={(v:any)=>setInlayShape(v)}><SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="circle">Circle</SelectItem><SelectItem value="star">Star</SelectItem></SelectContent></Select>} description="Inlay geometry." />
                                <WizardInputRow label="Size" control={<ControlledInput type="number" value={inlaySize} onChange={e=>setInlaySize(Number(e.target.value))}/>} description="Feature size." />
                                <WizardInputRow label="Tolerance" control={<ControlledInput type="number" value={inlayTol} onChange={e=>setInlayTol(Number(e.target.value))}/>} description="Plug clearance." />
                            </div>}
                            {wizard === 'bolt' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="PCD" control={<ControlledInput type="number" value={bpPcd} onChange={e=>setBpPcd(Number(e.target.value))}/>} description="Pitch Circle Diameter." />
                                <WizardInputRow label="Holes" control={<ControlledInput type="number" value={bpHoles} onChange={e=>setBpHoles(Number(e.target.value))}/>} description="Number of holes." />
                                <WizardInputRow label="Hole Dia" control={<ControlledInput type="number" value={bpHoleDia} onChange={e=>setBpHoleDia(Number(e.target.value))}/>} description="Hole diameter." />
                                <WizardInputRow label="Bore Dia" control={<ControlledInput type="number" value={bpBore} onChange={e=>setBpBore(Number(e.target.value))}/>} description="Optional center hole." />
                            </div>}
                            {wizard === 'gear' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Teeth" control={<ControlledInput type="number" value={gearTeeth} onChange={e=>setGearTeeth(Number(e.target.value))}/>} description="Number of teeth." />
                                <WizardInputRow label="Module" control={<ControlledInput type="number" value={gearModule} onChange={e=>setGearModule(Number(e.target.value))}/>} description="Tooth size." />
                                <WizardInputRow label="Bore" control={<ControlledInput type="number" value={gearBore} onChange={e=>setGearBore(Number(e.target.value))}/>} description="Center hole." />
                            </div>}
                            {wizard === 'dish' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Design Shape" control={<Select value={dishShape} onValueChange={(v:any)=>setDishShape(v)}><SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="circle">Circle</SelectItem><SelectItem value="rect">Rectangle</SelectItem></SelectContent></Select>} description="Dish profile." />
                                <WizardInputRow label="Depth" control={<ControlledInput type="number" value={dishDepth} onChange={e=>setDishDepth(Number(e.target.value))}/>} description="Bowl depth." />
                                <WizardInputRow label="Width" control={<ControlledInput type="number" value={dishW} onChange={e=>setDishW(Number(e.target.value))}/>} description="Outer width." />
                                <WizardInputRow label="Length" control={<ControlledInput type="number" value={dishL} onChange={e=>setDishL(Number(e.target.value))}/>} description="Outer length." />
                            </div>}
                            {wizard === 'sign' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Width" control={<ControlledInput type="number" value={signW} onChange={e=>setSignW(Number(e.target.value))}/>} description="Sign width." />
                                <WizardInputRow label="Height" control={<ControlledInput type="number" value={signL} onChange={e=>setSignL(Number(e.target.value))}/>} description="Sign height." />
                                <WizardInputRow label="Style" control={<Select value={signStyle} onValueChange={(v:any)=>setSignStyle(v)}><SelectTrigger className="h-8 w-24 text-[10px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="french">French</SelectItem><SelectItem value="scalloped">Scalloped</SelectItem><SelectItem value="plaque">Plaque</SelectItem></SelectContent></Select>} description="Corner style." />
                            </div>}
                            {wizard === 'ruler' && <div className="flex flex-col bg-white dark:bg-dark-darker rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                                <WizardInputRow label="Total Len" control={<ControlledInput type="number" value={rulerLength} onChange={e=>setRulerLength(Number(e.target.value))}/>} description="Scale length." />
                                <WizardInputRow label="Major Tick" control={<ControlledInput type="number" value={rulerMajor} onChange={e=>setRulerMajor(Number(e.target.value))}/>} description="Number interval." />
                                <WizardInputRow label="Minor Tick" control={<ControlledInput type="number" value={rulerMinor} onChange={e=>setRulerMinor(Number(e.target.value))}/>} description="Tick interval." />
                            </div>}
                        </div>
                    </div>

                    <div className="w-1/3 flex flex-col bg-gray-50 dark:bg-black/20 rounded-md border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="text-xs font-bold uppercase text-gray-500 mb-4">Positioning & Alignment</h3>
                        <div className="space-y-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold uppercase text-gray-400">Relative To</label>
                                <Select value={relativeToId} onValueChange={setRelativeToId}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="stock">Machine Stock (0,0)</SelectItem>{currentWizardFeatures.map(f => (<SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>))}</SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center"><label className="text-[10px] font-bold uppercase text-gray-400">X Offset</label>
                                        <div className="flex gap-1">
                                            <Button variant="outline" size="mini" className="h-5 px-1 text-[8px]" onClick={() => setPosX(0)}><AlignLeft size={10}/></Button>
                                            <Button variant="outline" size="mini" className="h-5 px-1 text-[8px]" onClick={() => setPosX(referenceBounds.width / 2)}><AlignCenter size={10}/></Button>
                                            <Button variant="outline" size="mini" className="h-5 px-1 text-[8px]" onClick={() => setPosX(referenceBounds.width)}><AlignRight size={10}/></Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2"><RangeSlider min={-500} max={500} percentage={[posX]} value={String(posX)} showText={false} onChange={(v) => setPosX(v[0])} className="flex-1" /><ControlledInput type="number" value={posX} onChange={e => setPosX(Number(e.target.value))} className="w-14 h-7 text-xs" /></div>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center"><label className="text-[10px] font-bold uppercase text-gray-400">Y Offset</label>
                                        <div className="flex gap-1">
                                            <Button variant="outline" size="mini" className="h-5 px-1 text-[8px]" onClick={() => setPosY(0)}><AlignStartVertical size={10}/></Button>
                                            <Button variant="outline" size="mini" className="h-5 px-1 text-[8px]" onClick={() => setPosY(referenceBounds.height / 2)}><AlignCenterVertical size={10}/></Button>
                                            <Button variant="outline" size="mini" className="h-5 px-1 text-[8px]" onClick={() => setPosY(referenceBounds.height)}><AlignEndVertical size={10}/></Button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2"><RangeSlider min={-500} max={500} percentage={[posY]} value={String(posY)} showText={false} onChange={(v) => setPosY(v[0])} className="flex-1" /><ControlledInput type="number" value={posY} onChange={e => setPosY(Number(e.target.value))} className="w-14 h-7 text-xs" /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button variant="primary" onClick={() => {
                        const w: any = wizard; CAMAccessibility.announce(`Generating ${w} design.`);
                        if (w === 'surfacing') handleSurfacing(); else if (w === 'clock') handleClock(); else if (w === 'box') handleBox(); else if (w === 'text') handleText(); else if (w === 'spoilboard') handleSpoilboard(); else if (w === 'finger') handleFinger(); else if (w === 'dovetail') handleDovetail(); else if (w === 'inlay') handleInlay(); else if (w === 'bolt') handleBolt(); else if (w === 'gear') handleGear(); else if (w === 'dish') handleDish(); else if (w === 'keyhole') handleKeyhole(); else if (w === 'sign') handleSign(); else if (w === 'ruler') handleRuler();
                        onClose();
                    }}>Generate Design</Button>
                </div>
            </div>
        </div>
    );
};

export default ParametricWizards;
