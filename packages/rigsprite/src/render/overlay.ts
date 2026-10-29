import { clamp, dist, TAU, type Mat2D, type Vec2 } from '../core/math';
import { boneOrigin, boneTip, type Rig } from '../core/rig';
import { worldToScreen, type ViewTransform } from './view';

const BONE_FILL = 'rgba(200, 210, 230, 0.35)';
const BONE_STROKE = 'rgba(230, 236, 250, 0.9)';
const SELECTED_FILL = 'rgba(255, 170, 40, 0.55)';
const SELECTED_STROKE = 'rgb(255, 190, 70)';
/** Half width of the bone triangle as a share of its screen length, clamped to [MIN, MAX] px. */
const HALF_WIDTH_FACTOR = 0.12;
const MIN_HALF_WIDTH_PX = 2;
const MAX_HALF_WIDTH_PX = 8;
/** The triangle's base sits this share along the bone, so the joint circle stays visible. */
const BASE_OFFSET = 0.15;
const JOINT_RADIUS_PX = { normal: 3, selected: 4 };
const LINE_WIDTH_PX = { normal: 1, selected: 2 };

/** `#rrggbb` as an rgba() string, or null if it is not a valid colour. */
function hexAlpha(hex: string | undefined, alpha: number): string | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Draws each bone as a screen-space triangle from origin to tip, selection highlighted (drawn last). */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  world: Record<string, Mat2D>,
  view: ViewTransform,
  selectedBoneId: string | null,
  handle: { pos: Vec2; dir: Vec2 } | null = null,
): void {
  const ordered = [...rig.bones].sort((a, b) => Number(a.id === selectedBoneId) - Number(b.id === selectedBoneId));
  ctx.save();
  ctx.lineJoin = 'round';
  for (const bone of ordered) {
    const m = world[bone.id];
    if (!m) continue;
    const selected = bone.id === selectedBoneId;
    const o = worldToScreen(view, boneOrigin(m));
    const t = worldToScreen(view, boneTip(m, bone));
    const dx = t.x - o.x;
    const dy = t.y - o.y;
    const len = dist(o, t);
    const half = bone.thickness !== undefined
      ? Math.max(MIN_HALF_WIDTH_PX, (bone.thickness / 2) * view.zoom)
      : clamp(len * HALF_WIDTH_FACTOR, MIN_HALF_WIDTH_PX, MAX_HALF_WIDTH_PX);
    const nx = len > 0 ? -dy / len : 0;
    const ny = len > 0 ? dx / len : 0;
    const bx = o.x + dx * BASE_OFFSET;
    const by = o.y + dy * BASE_OFFSET;

    // A bone colour tints the (semi-transparent) body; the selection keeps its orange outline
    ctx.fillStyle = hexAlpha(bone.color, selected ? 0.65 : 0.45) ?? (selected ? SELECTED_FILL : BONE_FILL);
    ctx.strokeStyle = selected ? SELECTED_STROKE : (hexAlpha(bone.color, 0.95) ?? BONE_STROKE);
    ctx.lineWidth = selected ? LINE_WIDTH_PX.selected : LINE_WIDTH_PX.normal;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(bx + nx * half, by + ny * half);
    ctx.lineTo(t.x, t.y);
    ctx.lineTo(bx - nx * half, by - ny * half);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(o.x, o.y, selected ? JOINT_RADIUS_PX.selected : JOINT_RADIUS_PX.normal, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  if (handle) drawTiltHandle(ctx, handle.pos, handle.dir);
  ctx.restore();
}

const HANDLE_RADIUS_PX = 8;
const HANDLE_ARROW_PX = 5;

/** The tilt handle: a circle with a double arrow along the bone (drag towards the tip = tip comes forward). */
function drawTiltHandle(ctx: CanvasRenderingContext2D, pos: Vec2, dir: Vec2): void {
  ctx.fillStyle = SELECTED_FILL;
  ctx.strokeStyle = SELECTED_STROKE;
  ctx.lineWidth = LINE_WIDTH_PX.selected;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, HANDLE_RADIUS_PX, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = LINE_WIDTH_PX.normal;
  ctx.beginPath();
  for (const sign of [-1, 1]) {
    const tipX = pos.x + dir.x * sign * HANDLE_ARROW_PX;
    const tipY = pos.y + dir.y * sign * HANDLE_ARROW_PX;
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(tipX, tipY);
    ctx.moveTo(tipX + (-dir.x * sign + dir.y) * 2, tipY + (-dir.y * sign - dir.x) * 2);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX + (-dir.x * sign - dir.y) * 2, tipY + (-dir.y * sign + dir.x) * 2);
  }
  ctx.stroke();
}
