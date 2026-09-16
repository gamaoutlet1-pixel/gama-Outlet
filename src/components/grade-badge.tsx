import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  A: "bg-grade-a/20 text-grade-a border-grade-a/40",
  B: "bg-grade-b/20 text-grade-b border-grade-b/40",
  C: "bg-grade-c/20 text-grade-c border-grade-c/40",
  D: "bg-grade-d/20 text-grade-d border-grade-d/40",
  E: "bg-grade-e/20 text-grade-e border-grade-e/40",
  F: "bg-grade-f/20 text-grade-f border-grade-f/40",
  UN: "bg-grade-un/20 text-foreground border-grade-un/40",
};

export function GradeBadge({ grade }: { grade: string | null | undefined }) {
  const g = (grade ?? "UN").toUpperCase();
  const cls = STYLES[g] ?? STYLES.UN;
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center rounded border px-1.5 text-xs font-semibold",
        cls,
      )}
    >
      {g}
    </span>
  );
}
