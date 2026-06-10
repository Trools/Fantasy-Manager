import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-(--color-accent-primary) text-gray-950 font-semibold
    hover:bg-(--color-accent-hover) active:bg-(--color-accent-hover)
    disabled:bg-(--color-bg-elevated) disabled:text-(color:--color-text-muted)
  `,
  secondary: `
    bg-(--color-bg-elevated) text-(color:--color-text-primary) border border-(color:--color-border-default)
    hover:bg-(--color-bg-hover) active:bg-(--color-bg-hover)
    disabled:bg-(--color-bg-surface) disabled:text-(color:--color-text-muted) disabled:border-(color:--color-border-muted)
  `,
  destructive: `
    bg-red-600/20 text-red-400 border border-red-600/30
    hover:bg-red-600/30 active:bg-red-600/40
    disabled:bg-(--color-bg-surface) disabled:text-(color:--color-text-muted) disabled:border-(color:--color-border-muted)
  `,
  ghost: `
    bg-transparent text-(color:--color-text-secondary)
    hover:bg-(--color-bg-hover) hover:text-(color:--color-text-primary)
    disabled:text-(color:--color-text-muted)
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "text-sm px-3 py-1.5 rounded-md",
  md: "text-sm px-4 py-2 rounded-lg",
  lg: "text-base px-6 py-3 rounded-lg",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center gap-2 transition-colors
          focus:outline-none focus:ring-2 focus:ring-(color:--color-accent-primary)/50 focus:ring-offset-2 focus:ring-offset-(color:--color-bg-primary)
          disabled:cursor-not-allowed
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
