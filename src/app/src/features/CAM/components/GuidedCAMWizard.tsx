import { useState } from 'react';
import { Button } from '../../../components/Button';
import { CAMFeature, CAMSettings, CAMTool, CAMPathingOption } from '../definitions';
import FileSelector from './FileSelector';
import FeatureList from './FeatureList';
import GlobalSettings from './GlobalSettings';
import ToolpathSettings from './ToolpathSettings';
import CAMAccessibility from '../utils/CAMAccessibility';

interface GuidedCAMWizardProps {
    file: File | null;
    features: CAMFeature[];
    settings: CAMSettings;
    tools: CAMTool[];
    pathingOptions: CAMPathingOption[];
    onFileSelect: (file: File) => void;
    onToggleFeature: (id: string) => void;
    onSettingsChange: (settings: CAMSettings) => void;
    onPathingChange: (options: CAMPathingOption[]) => void;
    onGenerate: () => void;
    onExit: () => void;
}

const GuidedCAMWizard = ({
    file,
    features,
    settings,
    tools,
    pathingOptions,
    onFileSelect,
    onToggleFeature,
    onSettingsChange,
    onPathingChange,
    onGenerate,
    onExit
}: GuidedCAMWizardProps) => {
    const [step, setStep] = useState(1);

    const nextStep = () => {
        setStep(prev => prev + 1);
        CAMAccessibility.announce(`Step ${step + 1} of 5.`);
    };
    const prevStep = () => {
        setStep(prev => prev - 1);
        CAMAccessibility.announce(`Step ${step - 1} of 5.`);
    };

    const steps = [
        {
            title: "1. Upload File",
            description: "Choose an SVG, DXF, STL, STEP, or Image file from your computer.",
            content: <FileSelector onFileSelect={onFileSelect} />,
            canContinue: !!file
        },
        {
            title: "2. Set Stock Dimensions",
            description: "Define the size and thickness of your material.",
            content: <GlobalSettings settings={settings} onChange={onSettingsChange} />,
            canContinue: settings.stockWidth > 0 && settings.stockLength > 0
        },
        {
            title: "3. Select Features",
            description: "Choose which parts of the design you want to cut.",
            content: <FeatureList features={features} onToggleFeature={onToggleFeature} onReorder={() => {}} settings={settings} />,
            canContinue: features.filter(f => f.selected).length > 0
        },
        {
            title: "4. Configure Toolpaths",
            description: "Choose cut type, depth, and tools for each feature.",
            content: (
                <ToolpathSettings 
                    features={features.filter(f => f.selected)}
                    options={pathingOptions}
                    tools={tools}
                    onChange={onPathingChange}
                    settings={settings}
                />
            ),
            canContinue: true
        },
        {
            title: "5. Generate G-Code",
            description: "Confirm all settings and generate the file.",
            content: (
                <div className="p-4 border rounded bg-gray-50 dark:bg-gray-800">
                    <p className="mb-4">Ready to generate G-Code for {features.filter(f => f.selected).length} features.</p>
                    <Button onClick={onGenerate} className="w-full h-12 text-lg">Generate Now</Button>
                </div>
            ),
            canContinue: false // The generate button handles this
        }
    ];

    const currentStep = steps[step - 1];

    return (
        <div className="flex flex-col h-full w-full max-w-2xl mx-auto p-4 bg-white dark:bg-gray-900 rounded-lg shadow-lg border">
            <header className="mb-6 flex justify-between items-center border-b pb-4">
                <div>
                    <h2 className="text-2xl font-bold">{currentStep.title}</h2>
                    <p className="text-gray-500">{currentStep.description}</p>
                </div>
                <Button variant="outline" onClick={onExit}>Exit Wizard</Button>
            </header>

            <main className="flex-1 overflow-y-auto mb-6 focus:outline-none" tabIndex={0} aria-label={`Step ${step} content`}>
                {currentStep.content}
            </main>

            <footer className="flex justify-between mt-auto pt-4 border-t">
                <Button onClick={prevStep} disabled={step === 1}>Previous Step</Button>
                <div className="flex items-center gap-2 text-sm font-medium">
                    Step {step} of 5
                </div>
                {step < 5 ? (
                    <Button onClick={nextStep} disabled={!currentStep.canContinue}>Next Step</Button>
                ) : (
                    <Button variant="outline" onClick={onExit}>Done</Button>
                )}
            </footer>
        </div>
    );
};

export default GuidedCAMWizard;
