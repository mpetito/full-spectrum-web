import { useState } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  integer?: boolean;
}

export function NumericInput({ value, onChange, min, max, step, className, integer }: NumericInputProps) {
  const [text, setText] = useState(String(value));
  const [valid, setValid] = useState(true);
  const [prev, setPrev] = useState(value);

  if (prev !== value) {
    setPrev(value);
    setText(String(value));
    setValid(true);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const n = integer ? parseInt(raw, 10) : parseFloat(raw);
    if (raw === '' || isNaN(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
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
