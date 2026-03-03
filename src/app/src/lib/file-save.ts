import { saveAs } from 'file-saver';
import isElectron from 'is-electron';

export interface FileFilter {
    description: string;
    accept: Record<string, string[]>;
}

/**
 * Professional 'Save As' dialog handler.
 * Uses native Electron dialogs when available, or falls back to browser downloads.
 */
export const saveAsDialog = async (
    content: string | Blob,
    defaultName: string,
    filters: FileFilter[] = []
) => {
    if (isElectron()) {
        try {
            // @ts-ignore
            const remote = window.require ? window.require('@electron/remote') : require('@electron/remote');
            // @ts-ignore
            const fs = window.require ? window.require('fs') : require('fs');
            
            const electronFilters = filters.map(f => {
                const extensions = Object.values(f.accept).flat().map(ext => ext.replace(/^\./, ''));
                return { name: f.description, extensions };
            });

            const { filePath, canceled } = await remote.dialog.showSaveDialog({
                defaultPath: defaultName,
                filters: electronFilters,
                properties: ['showOverwriteConfirmation', 'createDirectory']
            });

            if (!canceled && filePath) {
                const data = content instanceof Blob 
                    ? Buffer.from(await content.arrayBuffer()) 
                    : content;
                fs.writeFileSync(filePath, data);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Native save dialog failed, falling back to browser download', err);
        }
    }

    // Modern Web 'Save As' (showSaveFilePicker)
    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: defaultName,
                types: filters
            });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            return true;
        } catch (err) {
            if ((err as any).name === 'AbortError') return false;
            console.warn('showSaveFilePicker failed or was cancelled', err);
        }
    }

    // Legacy Web Fallback (Direct Download)
    const blob = content instanceof Blob 
        ? content 
        : new Blob([content], { type: 'text/plain;charset=utf-8' });
    
    saveAs(blob, defaultName);
    return true;
};
