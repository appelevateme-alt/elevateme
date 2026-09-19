export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function TextInput(props) {
  return <input {...props} className={`input ${props.className || ''}`.trim()} />;
}

export function Select(props) {
  return <select {...props} className={`select ${props.className || ''}`.trim()} />;
}
