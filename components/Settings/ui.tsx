"use client";

/**
 * The building blocks every Settings section is made of, so a section added
 * later looks like the ones already there.
 */

export function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 scroll-mt-4" id={id}>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <div className="surface flex flex-col gap-4 rounded-xl p-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  /**
   * The id of the control this labels, where there is exactly one.
   *
   * A real <label> rather than a paragraph, so the control has an accessible
   * name: a bare number input reads as "edit text, blank" to a screen reader,
   * and the words sitting above it are not attached to it in any way a
   * assistive technology can follow. Optional because some fields wrap a group
   * of controls, which carry their own aria-labels.
   */
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {htmlFor ? (
        <label className="mb-2 block text-sm font-medium" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <p className="mb-2 text-sm font-medium">{label}</p>
      )}
      {children}
      {hint && <p className="mt-2 text-xs text-dim">{hint}</p>}
    </div>
  );
}

/** A row of mutually exclusive options, the way units and step modes are chosen. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="grid gap-1 rounded-lg p-1"
      style={{ background: "var(--surface-2)", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className="tap rounded-md px-1 py-2 text-sm font-medium"
          style={{
            background: option.value === value ? "var(--surface)" : "transparent",
            color: option.value === value ? "var(--text)" : "var(--text-dim)",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** An on/off switch with its label beside it. */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-dim">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-6 w-6 shrink-0"
        style={{ accentColor: "var(--accent)" }}
      />
    </label>
  );
}

export function Button({
  children,
  onClick,
  tone = "plain",
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "plain" | "primary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const style =
    tone === "primary"
      ? { background: "var(--accent)", color: "var(--accent-contrast)" }
      : tone === "danger"
        ? { background: "transparent", color: "var(--danger)", border: "1px solid var(--border)" }
        : { background: "var(--surface-2)", border: "1px solid var(--border)" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="tap rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
      style={style}
    >
      {children}
    </button>
  );
}

export const inputStyle = { background: "var(--surface-2)", border: "1px solid var(--border)" } as const;
