import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const BASE =
  "btn-tactile inline-flex rounded-[0.7rem] font-extrabold tracking-tight";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-tactile-primary",
  secondary: "btn-tactile-secondary",
  ghost: "btn-tactile-ghost",
};

const SIZES: Record<Size, string> = {
  md: "btn-tactile-md",
  lg: "btn-tactile-lg",
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
