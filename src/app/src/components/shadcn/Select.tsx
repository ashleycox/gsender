// https://ui.shadcn.com/docs/components/select

'use client';

import * as React from 'react';
import * as SelectPrimitiveOriginal from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

import cx from 'classnames';

const SelectPrimitive: any = SelectPrimitiveOriginal;

const Select: any = SelectPrimitive.Root;

const SelectGroup: any = SelectPrimitive.Group;

const SelectValue: any = SelectPrimitive.Value;

const SelectTrigger: any = React.forwardRef<
    any,
    any
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
        ref={ref}
        className={cx(
            'dark:bg-dark dark:text-white flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-2 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1',
            className,
        )}
        {...props}
    >
        {children}
        <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 opacity-50" />
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
));

const SelectScrollUpButton: any = React.forwardRef<
    any,
    any
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollUpButton
        ref={ref}
        className={cx(
            'flex cursor-default items-center justify-center py-1',
            className,
        )}
        {...props}
        aria-label="Scroll up"
    >
        <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
));

const SelectScrollDownButton: any = React.forwardRef<
    any,
    any
>(({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollDownButton
        ref={ref}
        className={cx(
            'flex cursor-default items-center justify-center py-1',
            className,
        )}
        {...props}
        aria-label="Scroll down"
    >
        <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
));

const SelectContent: any = React.forwardRef<
    any,
    any
>(({ className, children, position = 'popper', ...props }, ref) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            ref={ref}
            className={cx(
                'relative z-40 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 dark:text-white dark:bg-dark',
                position === 'popper' &&
                    'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
                className,
            )}
            position={position}
            {...props}
        >
            <SelectScrollUpButton />
            <SelectPrimitive.Viewport
                className={cx(
                    'p-1',
                    position === 'popper' &&
                        'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
                )}
            >
                {children}
            </SelectPrimitive.Viewport>
            <SelectScrollDownButton />
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
));

const SelectLabel: any = React.forwardRef<
    any,
    any
>(({ className, ...props }, ref) => (
    <SelectPrimitive.Label
        ref={ref}
        className={cx('py-1.5 pl-8 pr-2 text-sm font-semibold', className)}
        {...props}
    />
));

const SelectItem: any = React.forwardRef<
    any,
    any
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
        ref={ref}
        className={cx(
            'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:bg-dark dark:text-white',
            className,
        )}
        {...props}
    >
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
            <SelectPrimitive.ItemIndicator>
                <Check className="h-4 w-4" />
            </SelectPrimitive.ItemIndicator>
        </span>

        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));

const SelectSeparator: any = React.forwardRef<
    any,
    any
>(({ className, ...props }, ref) => (
    <SelectPrimitive.Separator
        ref={ref}
        className={cx('-mx-1 my-1 h-px bg-muted', className)}
        {...props}
    />
));

export {
    Select,
    SelectGroup,
    SelectValue,
    SelectTrigger,
    SelectContent,
    SelectLabel,
    SelectItem,
    SelectSeparator,
    SelectScrollUpButton,
    SelectScrollDownButton,
};
