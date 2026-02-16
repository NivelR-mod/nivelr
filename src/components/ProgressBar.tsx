interface ProgressBarProps {
  ratio: number;
  label?: string;
}

export default function ProgressBar({ ratio, label }: ProgressBarProps): JSX.Element {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  return (
    <div className="progress-wrap">
      {label ? <div className="progress-label">{label}</div> : null}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${safeRatio * 100}%` }} />
      </div>
    </div>
  );
}
