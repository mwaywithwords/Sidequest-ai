import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime " +
  "disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.98]";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-lime text-void hover:bg-lime/90 shadow-[0_8px_30px_-10px_rgba(200,255,77,0.6)]",
  secondary: "bg-raised text-cream ring-1 ring-hair hover:bg-hover hover:ring-hair-strong",
  ghost: "text-muted hover:text-cream hover:bg-raised",
};

/** Both sizes clear a 48px touch target, which is the tablet-first floor. */
const SIZES: Record<Size, string> = {
  md: "min-h-12 px-5 text-[0.95rem]",
  lg: "min-h-14 px-7 text-base sm:text-lg",
};

function classes(variant: Variant, size: Size, className?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={classes(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: Variant;
  size?: Size;
};

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={classes(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
