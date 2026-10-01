import type { FxKind, Position } from "../library";

export const FX_LABEL: Record<FxKind, string> = {
  shell: "礼花弹",
  roman: "罗马烛光",
  fan: "扇形架",
  cold: "冷焰火",
  cake: "连发盆花",
};

export const FX_COLOR: Record<FxKind, string> = {
  shell: "#dc2626",
  roman: "#f59e0b",
  fan: "#1d4ed8",
  cold: "#0ea5e9",
  cake: "#7c3aed",
};

export const FX_KINDS = Object.keys(FX_LABEL) as FxKind[];

export function parsePositions(text: string): Position[] {
  return text
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [x, y] = p.split(/[,，]/).map((n) => Number(n.trim()));
      return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
    });
}

export function formatPositions(ps: Position[]): string {
  return ps.map((p) => `${p.x},${p.y}`).join("; ");
}
