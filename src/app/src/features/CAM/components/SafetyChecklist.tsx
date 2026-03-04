import { useState } from 'react';
import { Button } from '../../../components/Button';
import Switch from '../../../components/Switch';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';
import { Checkbox } from '../../../components/shadcn/Checkbox';

interface SafetyChecklistProps {
    onConfirm: (skipForever: boolean) => void;
    onCancel: () => void;
}

const SafetyChecklist = ({ onConfirm, onCancel }: SafetyChecklistProps) => {
    const [checks, setChecks] = useState({
        clamped: false,
        bitInstalled: false,
        zZero: false,
        colletTight: false,
        clearPath: false,
    });
    const [skipForever, setSkipForever] = useState(false);

    const allChecked = Object.values(checks).every(Boolean);

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="safety-title">
            <div className="bg-white dark:bg-dark-lighter rounded-lg shadow-2xl max-w-md w-full border border-gray-200 dark:border-gray-700 p-6 relative">
                <Button variant="ghost" size="mini" className="absolute top-4 right-4" onClick={onCancel} aria-label="Close dialog">
                    <X size={20} />
                </Button>

                <div className="flex items-center gap-3 mb-4 text-orange-500">
                    <AlertTriangle size={24} aria-hidden="true" />
                    <h2 id="safety-title" className="text-xl font-bold">Pre-Flight Safety Check</h2>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 italic">
                    Forgetting a single step can lead to a machine crash. Please confirm your setup:
                </p>

                <div className="space-y-2 mb-8">
                    {[
                        { id: 'clamped', label: 'Material is SECURELY clamped to the bed.' },
                        { id: 'bitInstalled', label: 'The CORRECT tool is installed in the spindle.' },
                        { id: 'zZero', label: 'WCS Z-Zero has been set (Surface vs Bed).' },
                        { id: 'colletTight', label: 'Collet and tool are tightened (Hand + Wrench).' },
                        { id: 'clearPath', label: 'Gantry travel is clear of clamps and wires.' },
                    ].map(item => (
                        <div 
                            key={item.id} 
                            className="flex items-center gap-3 p-3 rounded-md bg-gray-50 dark:bg-dark border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-light transition-colors group"
                            onClick={() => setChecks({...checks, [item.id]: !checks[item.id as keyof typeof checks]})}
                        >
                            <Checkbox 
                                checked={checks[item.id as keyof typeof checks]} 
                                onCheckedChange={(val) => setChecks({...checks, [item.id]: !!val})}
                            />
                            <span className="text-sm font-medium group-hover:text-blue-500 dark:group-hover:text-blue-400 select-none">
                                {item.label}
                            </span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between p-2 rounded bg-gray-100 dark:bg-dark border border-dashed border-gray-300 dark:border-gray-700">
                        <span className="text-[10px] uppercase font-bold text-gray-500">Never show this checklist again</span>
                        <Switch checked={skipForever} onChange={setSkipForever} aria-label="Skip checklist in future" />
                    </div>

                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
                        <Button 
                            variant="primary" 
                            className="flex-1 gap-2" 
                            disabled={!allChecked}
                            onClick={() => onConfirm(skipForever)}
                        >
                            <CheckCircle size={16} aria-hidden="true" /> Load to Workspace
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SafetyChecklist;
