import { useId, type ComponentProps } from "react";
import { CircleAlert } from "lucide-react";
import "./controls.css";

// Text-like input types only. Checkbox, radio, range, and file inputs are not offered.
export type TextFieldType = "text" | "password" | "search" | "url" | "email" | "number" | "tel";

type TextFieldProps = Omit<ComponentProps<"input">, "className" | "style" | "type" | "id" | "aria-describedby" | "aria-invalid"> & {
  label: string;
  type?: TextFieldType;
  hint?: string;
  error?: string;
};

// A labelled field. The hint and the error are read with the field through aria-describedby.
export function TextField({ label, hint, error, type = "text", ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : undefined, hint ? hintId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={id}>{label}</label>
      <input
        {...rest}
        id={id}
        type={type}
        className="ui-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? <p className="ui-field-hint" id={hintId}>{hint}</p> : null}
      {error ? (
        <p className="ui-field-error" id={errorId}>
          <CircleAlert aria-hidden="true" size={16} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
