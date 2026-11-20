export type RoutingMode = "auto" | "manual";

export function parseRoutingMode(value: string | null): RoutingMode {
  return value === "manual" ? "manual" : "auto";
}

export function shouldAutoCommit(mode: RoutingMode, candidateCount: number): boolean {
  return candidateCount === 1 || (mode === "auto" && candidateCount > 0);
}
