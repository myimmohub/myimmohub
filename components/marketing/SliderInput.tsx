"use client";

import { useId } from "react";

interface SliderInputProps {
  /** Display label */
  label: string;
  /** Current value */
  value: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Step increment (default 1) */
  step?: number;
  /** Formatted display of the current value (e.g. "250.000 €") */
  displayValue?: string;
  /** Called when the user moves the slider */
  onChange: (value: number) => void;
  /** Optional CSS class for the wrapper */
  className?: string;
}

export default function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  displayValue,
  onChange,
  className,
}: SliderInputProps) {
  const id = useId();
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;

  return (
    <div className={className}>
      {/* Label row */}
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </label>
        <span className="min-w-[6rem] text-right text-sm font-medium text-slate-900 dark:text-slate-100">
          {displayValue ?? value.toLocaleString("de-DE")}
        </span>
      </div>

      {/* Slider track */}
      <div className="relative flex items-center">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={
            {
              "--pct": `${pct}%`,
            } as React.CSSProperties
          }
          className="slider-thumb w-full cursor-pointer appearance-none rounded-full bg-transparent focus:outline-none"
        />
      </div>

      {/* Min / Max labels */}
      <div className="mt-1 flex justify-between">
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {min.toLocaleString("de-DE")}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {max.toLocaleString("de-DE")}
        </span>
      </div>
    </div>
  );
}
