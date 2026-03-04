import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '../../../components/Button';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export default class CAMErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('CAM Error:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload(); // Force reload to clear potentially corrupted state
    };

    public render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full p-8 bg-gray-900 text-white text-center">
                    <AlertTriangle size={64} className="text-red-500 mb-4 animate-bounce" />
                    <h2 className="text-2xl font-bold mb-2">Unexpected CAM Failure</h2>
                    <p className="text-gray-400 max-w-md mb-6">
                        The CAM engine encountered a critical error. This can happen with extremely complex geometry or memory-intensive designs.
                    </p>
                    <div className="bg-black/50 p-4 rounded border border-red-900/30 mb-8 max-w-2xl overflow-auto text-left font-mono text-xs">
                        <p className="text-red-400 font-bold mb-2">Error Details:</p>
                        {this.state.error?.message || 'Unknown Error'}
                    </div>
                    <Button onClick={this.handleReset} className="flex items-center gap-2">
                        <RefreshCcw size={16} /> Reset CAM Session
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
