import { newId } from '../core/id';
import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  CHANNELS,
  keyedFrames,
  createAnimation,
  moveBoneKeys,
  removeBoneKeysAt,
  sanitizeAnimationPatch,
  setKey,
  setKeyEasing,
  type Animation,
  type AnimationPatch,
  type Easing,
} from '../core/animation';
import { DEFAULT_BONE_LENGTH, DEFAULT_LAYER_SPACING, MAX_LAYER_SPACING, MIN_LAYER_SPACING } from '../core/defaults';
import { clamp } from '../core/math';
import { makePart, nextZ, type ImageAsset, type Part, type SpriteAxis } from '../core/part';
import {
  animationById,
  createProject,
  normalizeCameraAngle,
  type Project,
  type ProjectSettings,
} from '../core/project';
import { carryLinkedUpdate, linkFramesAsImages, type SourceResult } from '../core/linkedSprites';
import { addImagesAutoAttach, removeBoneCascade, withSpriteAxis } from '../core/projectOps';
import {
  boneById,
  defaultSoftness,
  sanitizeBonePatch,
  type Bone,
  type BoneOffset,
  type RigTemplateId,
} from '../core/rig';
import { ANIMATION_TEMPLATES, applyAnimationTemplate } from '../core/templates/animations';

/** An open edit transaction (e.g. a viewport drag): all project changes until commit form one undo entry. */
export interface Transaction {
  startProject: Project;
}

export interface EditorState {
  project: Project;
  mode: 'setup' | 'animate';
  selectedBoneId: string | null;
  selectedPartId: string | null;
  animationId: string | null;
  frame: number;
  playing: boolean;
  view: { x: number; y: number; zoom: number };
  /** Orbit camera angles in degrees (yaw in (-180, 180], pitch in [-90, 90]). View state: no undo, not saved. */
  orbit: { yaw: number; pitch: number };
  /** Distance between the depth layers of the orbit view (px per z rank). View state: no undo, not saved. */
  layerSpacing: number;
  /** Bones are drawn and clickable in the viewport; off shows only the sprites. View state: no undo, not saved. */
  showRig: boolean;
  /** Not part of the undo history. */
  transaction: Transaction | null;
  /** Space is held down (viewport: left-drag pans). Interaction state, not part of the undo history. */
  spaceHeld: boolean;
  /** A pan happened during the current Space press, so releasing Space does not toggle playback. */
  spacePanned: boolean;

  newProject(t: RigTemplateId): void;
  loadProject(p: Project): void;
  setMode(m: 'setup' | 'animate'): void;
  select(boneId: string | null, partId?: string | null): void;
  setView(v: { x: number; y: number; zoom: number }): void;
  setSpaceHeld(b: boolean): void;
  setSpacePanned(b: boolean): void;

  /** Undo / redo one project change; no-ops while a transaction is open. */
  undo(): void;
  redo(): void;
  /** Starts recording project changes as one undo step and stops playback; no-op if one is already open. */
  beginTransaction(): void;
  /** Ends the transaction with exactly one undo entry, or none if the project is unchanged. */
  commitTransaction(): void;
  /** Ends the transaction, restoring the project from its start, without an undo entry. */
  cancelTransaction(): void;
  /**
   * Groups the project changes of one text-field edit into one undo step. Unlike a transaction it
   * does not block guarded actions (the field applies its value through them); no-op while a
   * transaction or another edit group is open.
   */
  beginEditGroup(): void;
  /** Ends the edit group with one undo entry (none if unchanged); `revert` restores the start project instead. */
  endEditGroup(revert?: boolean): void;

  addImages(images: ImageAsset[]): void;
  /**
   * Links the frames of a Klexel project as new images (auto-attached by name). A normal edit: one undo entry.
   * Returns the ids of the added images (empty if every frame is linked already).
   */
  linkSource(projectId: string, source: SourceResult): string[];
  /**
   * Sets the result of refreshing linked images (computed on the current project) WITHOUT an undo entry:
   * refreshing mirrors Klexel and is not a user edit here, so undo must neither revert it nor bring stale pixels
   * back. The update is therefore also carried into every history entry (and an open transaction / edit group),
   * see carryLinkedUpdate. The change is still reported like any other (autosave). No-op if unchanged.
   */
  applyLinkedUpdate(project: Project): void;
  attachImage(imageId: string, boneId: string): string;
  updatePart(id: string, patch: Partial<Omit<Part, 'id'>>): void;
  removePart(id: string): void;
  removeImage(id: string): void;

  updateBone(id: string, patch: Partial<Omit<Bone, 'id' | 'parentId'>>): void;
  addBone(parentId: string | null): string;
  removeBone(id: string): void;

  addAnimation(name: string): void;
  addAnimationFromTemplate(templateId: string): void;
  updateAnimation(id: string, patch: AnimationPatch): void;
  removeAnimation(id: string): void;
  setAnimation(id: string | null): void;
  setFrame(n: number): void;
  setPlaying(b: boolean): void;

  poseBone(boneId: string, offset: Partial<BoneOffset>, easing?: Easing): void;
  removeKeysAt(boneId: string, frame: number): void;
  moveKeys(boneId: string, from: number, to: number): void;
  setKeyEasing(boneId: string, frame: number, easing: Easing): void;

  setSpriteAxis(axis: SpriteAxis): void;
  setSettings(patch: Partial<ProjectSettings>): void;
  setProjectName(name: string): void;
  /** Sets the camera rotation (normalized, drift rounded); one undo entry unless unchanged; no-op during a transaction. */
  setCameraRotation(deg: number): void;
  /** Turns the camera by `delta` degrees (see setCameraRotation). */
  rotateCamera(delta: number): void;
  /** Sets the orbit (yaw normalized and drift rounded, pitch clamped to [-90, 90]); non-finite input is ignored. No undo. */
  setOrbit(yaw: number, pitch: number): void;
  /** Turns the orbit by the given degrees (see setOrbit). */
  orbitBy(dYaw: number, dPitch: number): void;
  /** Sets the layer spacing, clamped to [MIN_LAYER_SPACING, MAX_LAYER_SPACING]; NaN is ignored. No undo. */
  setLayerSpacing(px: number): void;
  /** Shows / hides the rig overlay (view state). */
  toggleRig(): void;
  /** Toggles the mirror setting; one undo entry; no-op during a transaction. */
  toggleMirror(): void;
  /**
   * Resets the orbit to 0 / 0 (no undo) and the roll to 0 (one undo entry, only if it is not 0 and no
   * transaction is open). The mirror is left alone.
   */
  resetCamera(): void;
}

type PlaybackContext = Pick<EditorState, 'project' | 'mode' | 'animationId'>;

/** The single playback gate: playing requires animate mode and an existing active animation. */
const gatePlaying = (wanted: boolean, s: PlaybackContext): boolean =>
  wanted && s.mode === 'animate' && !!animationById(s.project, s.animationId);

const freshSession = (project: Project) => {
  const session = {
    project,
    mode: 'setup' as const,
    selectedBoneId: null,
    selectedPartId: null,
    animationId: project.animations[0]?.id ?? null,
    frame: 0,
    transaction: null,
  };
  return { ...session, playing: gatePlaying(false, session) };
};

const nextBoneName = (bones: Bone[]): string => {
  const names = new Set(bones.map((b) => b.name));
  let n = bones.length + 1;
  while (names.has(`bone_${n}`)) n++;
  return `bone_${n}`;
};

/** True if `name` is given and already used by a bone other than `id`. */
export const isBoneNameTaken = (bones: Bone[], id: string, name: string | undefined): boolean =>
  name !== undefined && bones.some((b) => b.id !== id && b.name === name);

const mapAnimation = (p: Project, id: string, fn: (a: Animation) => Animation): Project => {
  const cur = animationById(p, id);
  if (!cur) return p;
  const next = fn(cur);
  return next === cur ? p : { ...p, animations: p.animations.map((a) => (a.id === id ? next : a)) };
};

/** Drops the bone / part selection if it no longer exists in `project`. */
const pruneSelection = (s: Pick<EditorState, 'selectedBoneId' | 'selectedPartId'>, project: Project) => ({
  selectedBoneId: boneById(project.rig, s.selectedBoneId) ? s.selectedBoneId : null,
  selectedPartId: project.parts.some((x) => x.id === s.selectedPartId) ? s.selectedPartId : null,
});

/** The animation selected in the timeline, if any. */
export const selectActiveAnimation = (s: Pick<EditorState, 'project' | 'animationId'>): Animation | undefined =>
  animationById(s.project, s.animationId);

export const useEditor = create<EditorState>()(
  temporal(
    (set, get) => {
      const history = () => useEditor.temporal.getState();
      /** Project at the start of the open edit group (see beginEditGroup), or null. */
      let editGroupStart: Project | null = null;
      const patchProject = (fn: (p: Project) => Project) => set((s) => ({ project: fn(s.project) }));
      /** Applies `fn` to the active animation; unchanged results leave the project (and history) alone. */
      const mutateActiveAnimation = (fn: (a: Animation) => Animation) => {
        const { animationId } = get();
        if (animationId === null) return;
        patchProject((p) => mapAnimation(p, animationId, fn));
      };
      /** Adds `anim` and makes it the active animation at frame 0. */
      const appendAnimation = (anim: Animation) =>
        set((s) => {
          const project = { ...s.project, animations: [...s.project.animations, anim] };
          const next = { project, mode: s.mode, animationId: anim.id };
          return { ...next, frame: 0, playing: gatePlaying(s.playing, next) };
        });
      const clampFrame = (n: number, anim: Animation | undefined) =>
        anim ? clamp(Math.round(n), 0, Math.max(anim.length - 1, 0)) : 0;
      /** Starts a fresh session; ends any open transaction and clears the history. */
      const startSession = (project: Project) => {
        editGroupStart = null;
        set(freshSession(project));
        history().resume();
        history().clear();
      };

      return {
        project: createProject('humanoid'),
        mode: 'setup',
        selectedBoneId: null,
        selectedPartId: null,
        animationId: null,
        frame: 0,
        playing: false,
        view: { x: 0, y: 0, zoom: 1 },
        orbit: { yaw: 0, pitch: 0 },
        layerSpacing: DEFAULT_LAYER_SPACING,
        showRig: true,
        transaction: null,
        spaceHeld: false,
        spacePanned: false,

        newProject: (t) => startSession(createProject(t)),
        loadProject: (p) => startSession(p),
        setMode: (mode) => set((s) => ({ mode, playing: gatePlaying(s.playing, { ...s, mode }) })),
        select: (boneId, partId = null) => set({ selectedBoneId: boneId, selectedPartId: partId }),
        setView: (view) => set({ view }),
        setSpaceHeld: (spaceHeld) => {
          if (get().spaceHeld !== spaceHeld) set({ spaceHeld });
        },
        setSpacePanned: (spacePanned) => {
          if (get().spacePanned !== spacePanned) set({ spacePanned });
        },

        undo: () => {
          if (!get().transaction) history().undo();
        },
        redo: () => {
          if (!get().transaction) history().redo();
        },
        beginTransaction: () => {
          if (get().transaction) return;
          history().pause();
          set((s) => ({ transaction: { startProject: s.project }, playing: false }));
        },
        commitTransaction: () => {
          const { transaction, project: endProject } = get();
          if (!transaction) return;
          // Recording is paused: rewind to the start, resume, then set the end state → one history entry
          // (none if unchanged, since the history compares projects by reference).
          set({ project: transaction.startProject });
          history().resume();
          set({ project: endProject, transaction: null });
        },
        cancelTransaction: () => {
          const { transaction } = get();
          if (!transaction) return;
          set({ project: transaction.startProject, transaction: null });
          history().resume();
        },

        beginEditGroup: () => {
          if (get().transaction || editGroupStart) return;
          editGroupStart = get().project;
          history().pause();
        },
        endEditGroup: (revert = false) => {
          const start = editGroupStart;
          if (!start) return;
          editGroupStart = null;
          const end = revert ? start : get().project;
          // Same trick as commitTransaction: rewind while paused, resume, then set the end state.
          set({ project: start });
          history().resume();
          set({ project: end });
        },

        addImages: (images) => patchProject((p) => addImagesAutoAttach(p, images)),
        linkSource: (projectId, source) => {
          const r = linkFramesAsImages(get().project, projectId, source);
          if (r.project !== get().project) set({ project: r.project });
          return r.added;
        },
        applyLinkedUpdate: (project) => {
          const before = get().project;
          if (project === before) return;
          const carry = (q: Project) => (q === before ? project : carryLinkedUpdate(q, before, project));
          const h = history();
          // Paused already during a transaction / edit group: leave that pause in place.
          const tracking = h.isTracking;
          if (tracking) h.pause();
          try {
            const carryStates = (states: Partial<{ project: Project }>[]) =>
              states.map((st) => (st.project ? { ...st, project: carry(st.project) } : st));
            // Compute everything first, then write: a throw leaves project and history untouched
            const pastStates = carryStates(h.pastStates);
            const futureStates = carryStates(h.futureStates);
            const groupStart = editGroupStart ? carry(editGroupStart) : null;
            const tx = get().transaction;
            const transaction = tx ? { startProject: carry(tx.startProject) } : null;
            set({ project, transaction });
            if (groupStart) editGroupStart = groupStart;
            useEditor.temporal.setState({ pastStates, futureStates });
          } finally {
            // Always resume, so a failed update never leaves the history switched off
            if (tracking) h.resume();
          }
        },
        attachImage: (imageId, boneId) => {
          const { project } = get();
          const image = project.images[imageId];
          const bone = boneById(project.rig, boneId);
          if (!image || !bone) return '';
          const part = makePart(image, bone, project.settings.spriteAxis, nextZ(project.parts));
          patchProject((p) => ({ ...p, parts: [...p.parts, part] }));
          return part.id;
        },
        updatePart: (id, patch) =>
          patchProject((p) =>
            p.parts.some((x) => x.id === id)
              ? { ...p, parts: p.parts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }
              : p,
          ),
        removePart: (id) =>
          set((s) => {
            if (!s.project.parts.some((x) => x.id === id)) return s;
            const project = { ...s.project, parts: s.project.parts.filter((x) => x.id !== id) };
            return { project, ...pruneSelection(s, project) };
          }),
        removeImage: (id) =>
          set((s) => {
            if (!s.project.images[id]) return s;
            const images = { ...s.project.images };
            delete images[id];
            const project = { ...s.project, images, parts: s.project.parts.filter((x) => x.imageId !== id) };
            return { project, ...pruneSelection(s, project) };
          }),

        updateBone: (id, patch) =>
          patchProject((p) =>
            p.rig.bones.some((b) => b.id === id) && !isBoneNameTaken(p.rig.bones, id, patch.name)
              ? {
                  ...p,
                  rig: { bones: p.rig.bones.map((b) => (b.id === id ? { ...b, ...sanitizeBonePatch(patch) } : b)) },
                }
              : p,
          ),
        addBone: (parentId) => {
          const id = newId();
          patchProject((p) => {
            const bones = p.rig.bones;
            const root = bones.find((b) => b.parentId === null);
            const parent = boneById(p.rig, parentId) ?? root;
            const bone: Bone = {
              id,
              name: nextBoneName(bones),
              parentId: parent ? parent.id : null,
              x: parent ? parent.length : 0,
              y: 0,
              rotation: 0,
              length: DEFAULT_BONE_LENGTH,
              softness: defaultSoftness(DEFAULT_BONE_LENGTH),
            };
            return { ...p, rig: { bones: [...bones, bone] } };
          });
          return id;
        },
        removeBone: (id) =>
          set((s) => {
            const project = removeBoneCascade(s.project, id);
            return project === s.project ? s : { project, ...pruneSelection(s, project) };
          }),

        addAnimation: (name) => appendAnimation(createAnimation(name)),
        addAnimationFromTemplate: (templateId) => {
          const t = ANIMATION_TEMPLATES.find((x) => x.id === templateId);
          if (t) appendAnimation(applyAnimationTemplate(t, get().project.rig));
        },
        updateAnimation: (id, patch) =>
          set((s) => {
            if (!animationById(s.project, id)) return s;
            const clean = sanitizeAnimationPatch(patch);
            const project = mapAnimation(s.project, id, (a) => ({ ...a, ...clean }));
            const anim = selectActiveAnimation({ project, animationId: s.animationId });
            return { project, frame: id === s.animationId ? clampFrame(s.frame, anim) : s.frame };
          }),
        removeAnimation: (id) =>
          set((s) => {
            if (!animationById(s.project, id)) return s;
            const project = { ...s.project, animations: s.project.animations.filter((a) => a.id !== id) };
            if (s.animationId !== id) return { project };
            const next = { project, mode: s.mode, animationId: null };
            return { ...next, frame: 0, playing: gatePlaying(s.playing, next) };
          }),
        setAnimation: (id) => set((s) => ({ animationId: id, frame: 0, playing: gatePlaying(s.playing, { ...s, animationId: id }) })),
        setFrame: (n) => set((s) => ({ frame: clampFrame(n, selectActiveAnimation(s)) })),
        setPlaying: (playing) => set((s) => ({ playing: gatePlaying(playing, s) })),

        poseBone: (boneId, offset, easing = 'linear') => {
          const { frame } = get();
          mutateActiveAnimation((a) => {
            let next = a;
            for (const c of CHANNELS) {
              const value = offset[c];
              if (value !== undefined) next = setKey(next, boneId, c, { frame, value, easing });
            }
            return next;
          });
        },
        removeKeysAt: (boneId, frame) =>
          mutateActiveAnimation((a) => (keyedFrames(a, boneId).includes(frame) ? removeBoneKeysAt(a, boneId, frame) : a)),
        moveKeys: (boneId, from, to) =>
          mutateActiveAnimation((a) =>
            from !== to && keyedFrames(a, boneId).includes(from) ? moveBoneKeys(a, boneId, from, to) : a,
          ),
        setKeyEasing: (boneId, frame, easing) => mutateActiveAnimation((a) => setKeyEasing(a, boneId, frame, easing)),

        setProjectName: (name) => patchProject((p) => (p.name === name ? p : { ...p, name })),
        setSpriteAxis: (axis) => patchProject((p) => withSpriteAxis(p, axis)),
        setSettings: (patch) => patchProject((p) => ({ ...p, settings: { ...p.settings, ...patch } })),
        setCameraRotation: (deg) => {
          if (get().transaction) return;
          const cameraRotation = normalizeCameraAngle(deg);
          if (cameraRotation !== get().project.settings.cameraRotation) get().setSettings({ cameraRotation });
        },
        rotateCamera: (delta) => get().setCameraRotation(get().project.settings.cameraRotation + delta),
        setOrbit: (yaw, pitch) => {
          if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
          set({ orbit: { yaw: normalizeCameraAngle(yaw), pitch: clamp(pitch, -90, 90) } });
        },
        orbitBy: (dYaw, dPitch) => {
          const { yaw, pitch } = get().orbit;
          get().setOrbit(yaw + dYaw, pitch + dPitch);
        },
        setLayerSpacing: (px) => {
          if (Number.isNaN(px)) return;
          set({ layerSpacing: clamp(px, MIN_LAYER_SPACING, MAX_LAYER_SPACING) });
        },
        toggleRig: () => set((s) => ({ showRig: !s.showRig })),
        toggleMirror: () => {
          if (get().transaction) return;
          get().setSettings({ mirror: !get().project.settings.mirror });
        },
        resetCamera: () => {
          const { yaw, pitch } = get().orbit;
          if (yaw !== 0 || pitch !== 0) set({ orbit: { yaw: 0, pitch: 0 } });
          get().setCameraRotation(0);
        },
      };
    },
    { partialize: (s) => ({ project: s.project }), limit: 100, equality: (a, b) => a.project === b.project },
  ),
);

/** Imperative access to the current editor state (for event handlers; components subscribe via `useEditor`). */
export const editor = (): EditorState => useEditor.getState();
