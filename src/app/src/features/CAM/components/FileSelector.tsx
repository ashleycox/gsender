import React, { useRef } from 'react';
import { Button } from '../../../components/Button';

interface FileSelectorProps {
    onFileSelect: (file: File) => void;
}

const FileSelector = ({ onFileSelect }: FileSelectorProps) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileSelect(file);
        }
        event.target.value = ''; // Reset input to allow re-uploading the same file
    };

    return (
        <div className="flex items-center gap-4">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".svg,.dxf,.stl,.step,.stp,.png,.jpg,.jpeg"
                className="hidden"
                aria-label="Upload design file"
            />
            <Button onClick={() => fileInputRef.current?.click()}>
                Upload Design (SVG, DXF, STL, STEP, Image)
            </Button>
            <span className="text-sm italic" aria-live="polite">
                Select a file to begin
            </span>
        </div>
    );
};

export default FileSelector;
