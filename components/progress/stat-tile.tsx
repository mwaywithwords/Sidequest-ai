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
    <Card className="p-4 sm:p-5">
      <p
        className="font-display text-3xl font-extrabold leading-none tracking-tight sm:text-4xl"
        style={{ color: accent }}
      >
        {value}
      </p>
      <p className="mt-2 text-[0.7rem] leading-snug text-muted sm:text-xs">
        {label}
      </p>
    </Card>
  );
}
