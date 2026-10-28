import { clamp, dist, TAU, type Mat2D } from '../core/math';
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

/** Draws each bone as a screen-space triangle from origin to tip, selection highlighted (drawn last). */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  rig: Rig,
  world: Record<string, Mat2D>,
  view: ViewTransform,
  selectedBoneId: string | null,
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
    const half = clamp(len * HALF_WIDTH_FACTOR, MIN_HALF_WIDTH_PX, MAX_HALF_WIDTH_PX);
    const nx = len > 0 ? -dy / len : 0;
    const ny = len > 0 ? dx / len : 0;
    const bx = o.x + dx * BASE_OFFSET;
    const by = o.y + dy * BASE_OFFSET;

    ctx.fillStyle = selected ? SELECTED_FILL : BONE_FILL;
    ctx.strokeStyle = selected ? SELECTED_STROKE : BONE_STROKE;
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
  ctx.restore();
}
