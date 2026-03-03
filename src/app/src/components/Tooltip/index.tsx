import React from 'react';
import { TooltipContentProps } from '@radix-ui/react-tooltip';

import {
    Tooltip as TooltipWrapperOriginal,
    TooltipTrigger as TooltipTriggerOriginal,
    TooltipContent as TooltipContentOriginal,
    TooltipProvider as TooltipProviderOriginal,
} from '../shadcn/Tooltip';

const TooltipWrapper = TooltipWrapperOriginal as any;
const TooltipTrigger = TooltipTriggerOriginal as any;
const TooltipContent = TooltipContentOriginal as any;
const TooltipProvider = TooltipProviderOriginal as any;

export interface TooltipProps {
    children?: React.ReactNode;
    content?: React.ReactNode;
    side?: TooltipContentProps['side'];
    delay?: number;
}

export function Tooltip({ children, content, side, delay = 1500 }: TooltipProps) {
    return (
        <TooltipProvider delayDuration={delay}>
            <TooltipWrapper>
                <TooltipTrigger asChild>{children}</TooltipTrigger>
                <TooltipContent side={side}>{content}</TooltipContent>
            </TooltipWrapper>
        </TooltipProvider>
    );
}

export default Tooltip;
