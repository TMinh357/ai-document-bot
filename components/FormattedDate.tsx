"use client";

import { useEffect, useState } from "react";

type FormattedDateProps = {
  value: string | Date | null | undefined;
  dateOnly?: boolean;
};

export default function FormattedDate({ value, dateOnly = false }: FormattedDateProps) {
  const [formatted, setFormatted] = useState<string>("");

  useEffect(() => {
    if (!value) {
      setFormatted("");
      return;
    }
    const date =
      typeof value === "string" || typeof value === "number"
        ? new Date(value)
        : value;
    setFormatted(dateOnly ? date.toLocaleDateString() : date.toLocaleString());
  }, [value, dateOnly]);

  if (!value) return null;
  return <span suppressHydrationWarning>{formatted}</span>;
}
