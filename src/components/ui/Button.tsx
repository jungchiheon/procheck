'use client';
import React from 'react';
import clsx from 'clsx';

type Variant =
  | 'subtle'         // 기본: 소프트 회색 배경
  | 'outline'        // 테두리만
  | 'ghost'          // 호버만 살짝
  | 'neutral'        // 잉크(짙은 회색) 솔리드 – 필요한 곳만
  | 'successSoft'    // 파스텔 그린
  | 'dangerSoft';    // 파스텔 레드

type Size = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
}

const base =
  'inline-flex items-center justify-center rounded-xl transition whitespace-nowrap select-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-300';

const sizeStyles: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
};

const variantStyles: Record<Variant, string> = {
  subtle:     'bg-slate-100 text-slate-800 hover:bg-slate-200',
  outline:    'border border-slate-300 text-slate-800 hover:bg-slate-100 bg-white',
  ghost:      'text-slate-800 hover:bg-slate-100',
  neutral:    'bg-ink-800 text-white hover:bg-ink-700',            // 진한 색이 꼭 필요할 때만
  successSoft:'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200',
  dangerSoft: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'subtle', size = 'md', leftIcon, rightIcon, loading, className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(base, sizeStyles[size], variantStyles[variant], className)}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      <span className={clsx(loading && 'opacity-70')}>{children}</span>
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  )
);
Button.displayName = 'Button';
