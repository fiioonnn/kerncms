"use client";

import {
  TextField,
  TextareaField,
  RichtextField,
  NumberField,
  BooleanField,
  ImageField,
  DateField,
  SelectField,
  ListField,
  RepeaterField,
} from "./fields";

function keyToLabel(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function FieldRenderer({
  fieldKey,
  value,
  schemaValue,
  onChange,
  disabled,
  hideLabel,
}: {
  fieldKey: string;
  value: unknown;
  schemaValue: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const label = hideLabel ? undefined : keyToLabel(fieldKey);

  // Simple string types
  if (schemaValue === "text") {
    return <TextField value={value as string} onChange={onChange} label={label} disabled={disabled} />;
  }
  if (schemaValue === "textarea") {
    return <TextareaField value={value as string} onChange={onChange} label={label} disabled={disabled} />;
  }
  if (schemaValue === "richtext") {
    return <RichtextField value={value as string} onChange={onChange} label={label} disabled={disabled} />;
  }
  if (schemaValue === "number") {
    return <NumberField value={value as number} onChange={onChange} label={label} disabled={disabled} />;
  }
  if (schemaValue === "boolean") {
    return <BooleanField value={value as boolean} onChange={onChange} label={label} disabled={disabled} />;
  }
  if (schemaValue === "image") {
    return <ImageField value={value as string | null} onChange={onChange} label={label} disabled={disabled} />;
  }
  if (schemaValue === "date") {
    return <DateField value={value as string} onChange={onChange} label={label} disabled={disabled} />;
  }

  // Object schema types
  if (typeof schemaValue === "object" && schemaValue !== null && !Array.isArray(schemaValue)) {
    const obj = schemaValue as Record<string, unknown>;
    if (obj.type === "select") {
      return <SelectField value={value as string} onChange={onChange} schema={obj as { options?: string[] }} label={label} disabled={disabled} />;
    }
    if (obj.type === "date") {
      return <DateField value={value as string} onChange={onChange} schema={obj as { format?: string }} label={label} disabled={disabled} />;
    }
  }

  // Array schema types
  if (Array.isArray(schemaValue)) {
    if (typeof schemaValue[0] === "string") {
      // List of primitives
      return <ListField value={value as string[]} onChange={onChange} label={label} disabled={disabled} />;
    }
    if (typeof schemaValue[0] === "object") {
      // Repeater
      return <RepeaterField value={value as Record<string, unknown>[]} onChange={onChange} schema={schemaValue as Record<string, unknown>[]} label={label} disabled={disabled} />;
    }
  }

  // Fallback
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <p className="text-xs text-muted-foreground">Unknown field type: {JSON.stringify(schemaValue)}</p>
    </div>
  );
}
