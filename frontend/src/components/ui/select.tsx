/**
 * Dark-theme-safe select component.
 * Native <select> options inherit the OS/browser default (white) background in dark mode.
 * This wrapper applies colorScheme="dark" and consistent dark styling everywhere.
 */
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      style={{ colorScheme: "dark" }}
      className={cn(
        "w-full bg-[#111] border border-white/10 text-white rounded-lg px-3 py-2 text-sm",
        "focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "appearance-none",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
)
Select.displayName = "Select"
