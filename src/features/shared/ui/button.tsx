import type { ComponentProps, ReactNode } from "react";
import "./controls.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "icon" | "danger";

export function buttonClass(variant: ButtonVariant): string {
  return `ui-button ui-button--${variant}`;
}

type NativeButton = Omit<ComponentProps<"button">, "className" | "style">;

// An icon button has no visible text, so its accessible name is required.
export type ButtonProps =
  | (NativeButton & { variant?: Exclude<ButtonVariant, "icon">; icon?: ReactNode })
  | (NativeButton & { variant: "icon"; "aria-label": string; icon?: never });

export function Button({ variant = "secondary", icon, type = "button", children, ...rest }: ButtonProps) {
  return (
    <button {...rest} type={type} className={buttonClass(variant)}>
      {icon}
      {children}
    </button>
  );
}

type NativeLink = Omit<ComponentProps<"a">, "className" | "style">;

// A link that looks like a button, for actions that change the route.
export function ButtonLink({ variant = "secondary", icon, children, ...rest }: NativeLink & { variant?: ButtonVariant; icon?: ReactNode }) {
  return (
    <a {...rest} className={buttonClass(variant)}>
      {icon}
      {children}
    </a>
  );
}
