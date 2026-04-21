import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-cyan-500/15 text-cyan-50 border border-cyan-400/40 hover:bg-cyan-500/25 hover:border-cyan-400/60 active:bg-cyan-500/35 shadow-[0_0_0_1px_rgba(34,211,238,0.1)_inset]',
  secondary:
    'bg-white/[0.04] text-white border border-white/10 hover:bg-white/[0.08] hover:border-white/20 active:bg-white/[0.12]',
  ghost:
    'bg-transparent text-white/70 border border-transparent hover:bg-white/[0.06] hover:text-white',
  danger:
    'bg-red-500/10 text-red-200 border border-red-500/40 hover:bg-red-500/20 hover:border-red-400/60 active:bg-red-500/30',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-sm gap-2.5 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'secondary', size = 'md', leftIcon, rightIcon, loading, fullWidth, disabled, children, className = '', ...rest },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-medium tracking-tight
          transition-all duration-150
          disabled:opacity-50 disabled:pointer-events-none
          ${variants[variant]}
          ${sizes[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        {...rest}
      >
        {loading ? (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        {children && <span>{children}</span>}
        {!loading && rightIcon}
      </button>
    );
  }
);

Button.displayName = 'Button';
