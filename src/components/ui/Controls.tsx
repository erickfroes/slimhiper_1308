'use client';

import React, { forwardRef } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { cx } from './utils';

type Tone = 'primary' | 'secondary' | 'ghost' | 'danger';
type NativeButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const Button = forwardRef<
  HTMLButtonElement,
  NativeButtonProps & { tone?: Tone; loading?: boolean }
>(({ tone = 'primary', loading, className, children, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cx(`btn-${tone}`, 'min-h-11 justify-center', className)}
    {...props}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
    {children}
  </button>
));
Button.displayName = 'Button';

export const IconButton = forwardRef<
  HTMLButtonElement,
  NativeButtonProps & { label: string; tone?: Tone }
>(({ label, tone = 'ghost', className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    aria-label={label}
    title={label}
    className={cx(`btn-${tone}`, 'min-h-11 min-w-11 justify-center p-2', className)}
    {...props}
  >
    {children}
  </button>
));
IconButton.displayName = 'IconButton';

const fieldClass = 'input-base min-h-11';
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cx(fieldClass, className)} {...props} />
  )
);
Input.displayName = 'Input';
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cx(fieldClass, 'min-h-24 resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select ref={ref} className={cx(fieldClass, 'appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
);
Select.displayName = 'Select';

export const SearchInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <div className="relative">
    <Search
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <Input ref={ref} type="search" className={cx('pl-9', className)} {...props} />
  </div>
));
SearchInput.displayName = 'SearchInput';

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label
      className={cx('inline-flex min-h-11 items-center gap-2 text-sm text-foreground', className)}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
        {...props}
      />
      {label}
    </label>
  );
}
export function Radio({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  return (
    <label
      className={cx('inline-flex min-h-11 items-center gap-2 text-sm text-foreground', className)}
    >
      <input
        type="radio"
        className="h-4 w-4 border-input text-primary focus:ring-2 focus:ring-ring"
        {...props}
      />
      {label}
    </label>
  );
}
export function Switch({
  label,
  checked,
  onChange,
  disabled,
  className,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cx(
        'inline-flex min-h-11 items-center gap-3 text-sm text-foreground',
        disabled && 'opacity-60',
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-6 w-11 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-surface-strong'
        )}
      >
        <span
          className={cx(
            'absolute top-1 h-4 w-4 rounded-full bg-card transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
      {label}
    </label>
  );
}

export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-xl border border-border bg-surface-subtle p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          onClick={() => onValueChange(option.value)}
          className={cx(
            'min-h-9 rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === option.value
              ? 'bg-card text-brand-deep card-shadow'
              : 'text-muted-foreground hover:bg-hover'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Checkmark({ className }: { className?: string }) {
  return <Check className={cx('h-4 w-4', className)} aria-hidden="true" />;
}
