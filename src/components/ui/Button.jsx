const styles = {
  primary: 'btn-primary',
  secondary: '',
  ghost: 'btn-ghost',
  danger: '',
};

export function Button({ variant = 'primary', className = '', ...props }) {
  const cls = variant === 'secondary' || variant === 'danger' ? '' : styles[variant];
  return <button {...props} className={`btn ${cls} ${className}`.trim()} />;
}
