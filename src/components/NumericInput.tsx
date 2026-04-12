import { useState, useEffect } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  integer?: boolean;
}

// Complete numeric literal patterns — excludes intermediates like "0.", "-", ""
const INTEGER_RE = /^-?\d+$/;
const FLOAT_RE = /^-?\d+(\.\d+)?$/;

export function NumericInput({ value, onChange, min, max, step, className, integer }: NumericInputProps) {
  const [text, setText] = useState(String(value));
  const [valid, setValid] = useState(true);

  // Sync display text when external value prop changes
  useEffect(() => {
    setText(String(value));
    setValid(true);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);

    const pattern = integer ? INTEGER_RE : FLOAT_RE;
    if (!pattern.test(raw)) {
      setValid(false);
      return;
    }

    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (isNaN(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
      setValid(false);
    } else {
      setValid(true);
      onChange(n);
    }
  };

  const handleBlur = () => {
    if (!valid) {
      setText(String(value));
      setValid(true);
    }
  };

  return (
    <input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      step={step}
      className={`${className ?? ''} ${!valid ? 'border-red-500' : ''}`}
    />
  );
}
