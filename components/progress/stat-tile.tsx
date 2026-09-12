import { Card } from "@/components/ui/card";

export function StatTile({
  value,
  label,
  accent,
}: {
  value: number | string;
  label: string;
  accent: string;
}) {
  return (
    <Card className="p-5">
      <p
        className="font-display text-4xl font-extrabold leading-none tracking-tight"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-2 text-xs text-muted">{label}</p>
    </Card>
  );
}
