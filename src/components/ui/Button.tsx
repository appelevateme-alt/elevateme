import type { ButtonHTMLAttributes, Ref } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-[#1d4ed8] text-white border-[#1d4ed8] hover:bg-[#1e40af]",
  secondary: "bg-white text-gray-900 border-gray-300 hover:bg-gray-50",
  ghost: "bg-transparent text-gray-700 border-transparent hover:bg-gray-100",
  danger: "bg-white text-red-700 border-gray-300 hover:bg-red-50",
};

export function Button({
  variant = "primary",
  className = "",
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
