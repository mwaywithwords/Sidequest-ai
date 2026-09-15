export function StatTile({
  value,
  label,
  accent,
  mark,
}: {
  value: number | string;
  label: string;
  accent: string;
  mark?: string;
}) {
  return (
    <p
      className="token min-h-12"
      style={{ color: accent }}
    >
      {mark ? <span aria-hidden>{mark}</span> : null}
      <span className="text-on-game">{value}</span>
      <span className="text-sm font-bold tracking-wide text-muted normal-case">
        {label}
      </span>
    </p>
  );
}
