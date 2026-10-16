import { useEffect, useState } from "react";
import { parseNum } from "@/lib/pli";

/** Champ numérique tolérant (virgule, point, apostrophe). */
export function NumInput({
  value,
  onChange,
  className = "",
  allowEmpty = false,
  ...rest
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
  allowEmpty?: boolean;
  "aria-label"?: string;
  placeholder?: string;
}) {
  const show = (v: number | null) => (v === null || isNaN(v) ? "" : String(v).replace(".", ","));
  const [txt, setTxt] = useState(show(value));
  useEffect(() => {
    if (parseNum(txt) !== value) setTxt(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode="decimal"
      className={`field num w-full ${className}`}
      value={txt}
      onChange={(e) => {
        setTxt(e.target.value);
        const n = parseNum(e.target.value);
        if (!isNaN(n)) onChange(n);
        else if (allowEmpty && e.target.value.trim() === "") onChange(null);
      }}
      onBlur={() => setTxt(show(value))}
      {...rest}
    />
  );
}
