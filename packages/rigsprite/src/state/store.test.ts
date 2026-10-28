import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYER_SPACING } from '../core/defaults';
import { createProject } from '../core/project';
import { makeImageAsset } from '../test/fixtures';
import { useEditor } from './store';

const img = (id: string, name: string) => makeImageAsset({ id, name });
const boneId = (name: string) => useEditor.getState().project.rig.bones.find((b) => b.name === name)!.id;

beforeEach(() => {
  useEditor.setState({
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
  });
  useEditor.temporal.getState().resume();
  useEditor.temporal.getState().clear();
});

describe('editor store', () => {
  it('setSpriteAxis refits all parts in one undo step', () => {
    const s = useEditor.getState();
    s.addImages([img('i1', 'head.png'), img('i2', 'torso.png')]);
    const [a, b] = useEditor.getState().project.parts;
    useEditor.getState().updatePart(a.id, { x: 99, y: 7 });
    const before = useEditor.getState().project;
    const n = useEditor.temporal.getState().pastStates.length;
    useEditor.getState().setSpriteAxis('right');
    const after = useEditor.getState().project;
    expect(after.settings.spriteAxis).toBe('right');
    expect(after.parts.map((p) => p.rotation)).toEqual([0, 0]);
    expect(after.parts[0].z).toBe(a.z);
    expect(after.parts[1].z).toBe(b.z);
    expect(useEditor.temporal.getState().pastStates.length).toBe(n + 1);
    useEditor.getState().setSpriteAxis('right');
    expect(useEditor.temporal.getState().pastStates.length).toBe(n + 1);
    useEditor.temporal.getState().undo();
    expect(useEditor.getState().project).toEqual(before);
    expect(useEditor.getState().project.parts[0].x).toBe(99);
  });

  it('attachImage uses the project sprite axis', () => {
    useEditor.getState().setSpriteAxis('up');
    useEditor.getState().addImages([img('i1', 'x.png')]);
    const id = useEditor.getState().attachImage('i1', boneId('head'));
    expect(useEditor.getState().project.parts.find((p) => p.id === id)!.rotation).toBe(90);
  });

  it('addImages auto-attaches by filename', () => {
    useEditor.getState().addImages([img('i1', 'head.png'), img('i2', 'random.png')]);
    const { project } = useEditor.getState();
    expect(Object.keys(project.images)).toHaveLength(2);
    expect(project.parts).toHaveLength(1);
    expect(project.parts[0].boneId).toBe(boneId('head'));
    expect(project.parts[0].imageId).toBe('i1');
  });

  it('removeBone cascades', () => {
    const s = useEditor.getState();
    s.addImages([img('i1', 'x.png')]);
    s.attachImage('i1', boneId('lowerArm_L'));
    s.addAnimation('a');
    useEditor.getState().setFrame(2);
    useEditor.getState().poseBone(boneId('hand_L'), { rotation: 10 });
    useEditor.getState().removeBone(boneId('upperArm_L'));
    const { project } = useEditor.getState();
    const names = project.rig.bones.map((b) => b.name);
    expect(names).not.toContain('upperArm_L');
    expect(names).not.toContain('lowerArm_L');
    expect(names).not.toContain('hand_L');
    expect(project.parts).toHaveLength(0);
    expect(Object.keys(project.animations[0].tracks)).toHaveLength(0);
  });

  it('poseBone keys current frame', () => {
    useEditor.getState().addAnimation('a');
    useEditor.getState().setFrame(4);
    useEditor.getState().poseBone(boneId('head'), { rotation: 15 });
    const anim = useEditor.getState().project.animations[0];
    expect(anim.tracks[boneId('head')].rotation).toEqual([{ frame: 4, value: 15, easing: 'linear' }]);
  });

  it('poseBone without animation is a no-op', () => {
    const before = useEditor.getState().project;
    useEditor.getState().poseBone(boneId('head'), { rotation: 15 });
    expect(useEditor.getState().project).toBe(before);
  });

  it('undo restores project but not selection', () => {
    const s = useEditor.getState();
    s.addImages([img('i1', 'x.png')]);
    useEditor.temporal.getState().clear();
    s.select(boneId('head'));
    useEditor.getState().attachImage('i1', boneId('head'));
    expect(useEditor.getState().project.parts).toHaveLength(1);
    useEditor.temporal.getState().undo();
    expect(useEditor.getState().project.parts).toHaveLength(0);
    expect(useEditor.getState().selectedBoneId).toBe(boneId('head'));
  });

  it('addAnimationFromTemplate sets animationId', () => {
    useEditor.getState().addAnimationFromTemplate('humanoid-walk');
    const { project, animationId } = useEditor.getState();
    expect(project.animations).toHaveLength(1);
    expect(animationId).toBe(project.animations[0].id);
  });

  it('addBone attaches at parent tip and keeps single root', () => {
    const parent = useEditor.getState().project.rig.bones.find((b) => b.name === 'head')!;
    const id = useEditor.getState().addBone(parent.id);
    const b = useEditor.getState().project.rig.bones.find((x) => x.id === id)!;
    expect(b).toMatchObject({ parentId: parent.id, x: parent.length, y: 0, length: 20 });
    useEditor.getState().addBone(null);
    const roots = useEditor.getState().project.rig.bones.filter((x) => x.parentId === null);
    expect(roots).toHaveLength(1);
  });

  it('removeBone refuses the root; removeImage drops parts; setFrame clamps', () => {
    const root = useEditor.getState().project.rig.bones.find((b) => b.parentId === null)!;
    useEditor.getState().removeBone(root.id);
    expect(useEditor.getState().project.rig.bones.some((b) => b.id === root.id)).toBe(true);
    useEditor.getState().addImages([img('i1', 'head.png')]);
    useEditor.getState().removeImage('i1');
    expect(useEditor.getState().project.parts).toHaveLength(0);
    useEditor.getState().addAnimation('a');
    useEditor.getState().setFrame(999);
    expect(useEditor.getState().frame).toBe(useEditor.getState().project.animations[0].length - 1);
  });

  describe('undo history semantics', () => {
    const past = () => useEditor.temporal.getState().pastStates.length;

    it('ignores UI-only and no-op actions', () => {
      const s = useEditor.getState();
      s.addAnimation('a');
      useEditor.temporal.getState().clear();
      const g = () => useEditor.getState();
      g().select(boneId('head'));
      g().setFrame(3);
      g().setView({ x: 1, y: 2, zoom: 2 });
      g().setMode('animate');
      g().setPlaying(true);
      expect(g().attachImage('nope', boneId('head'))).toBe('');
      g().updatePart('nope', { x: 1 });
      g().updateBone('nope', { length: 1 });
      g().removePart('nope');
      g().removeKeysAt(boneId('head'), 5);
      g().moveKeys(boneId('head'), 1, 2);
      g().setKeyEasing(boneId('head'), 1, 'step');
      expect(past()).toBe(0);
    });

    it('newProject/loadProject clear history', () => {
      const s = useEditor.getState();
      s.addImages([img('i1', 'x.png')]);
      s.attachImage('i1', boneId('head'));
      expect(past()).toBeGreaterThan(0);
      useEditor.getState().loadProject(createProject('quadruped'));
      expect(past()).toBe(0);
      useEditor.temporal.getState().undo();
      expect(useEditor.getState().project.rigTemplateId).toBe('quadruped');
    });

    it('compound actions create one history entry', () => {
      useEditor.getState().addAnimation('a');
      expect(past()).toBe(1);
      useEditor.getState().addAnimationFromTemplate('humanoid-walk');
      expect(past()).toBe(2);
      useEditor.getState().removeAnimation(useEditor.getState().animationId!);
      expect(past()).toBe(3);
    });
  });
});

describe('updateBone clamping', () => {
  it('clamps length >= 1 and softness >= 0', () => {
    useEditor.getState().newProject('humanoid');
    useEditor.getState().updateBone('torso', { length: -5, softness: -3 });
    const b = useEditor.getState().project.rig.bones.find((x) => x.id === 'torso')!;
    expect(b.length).toBe(1);
    expect(b.softness).toBe(0);
  });
});

describe('updateBone names', () => {
  beforeEach(() => useEditor.getState().newProject('humanoid'));
  it('rejects a name already used by another bone (no-op)', () => {
    const before = useEditor.getState().project;
    useEditor.getState().updateBone('torso', { name: 'head' });
    expect(useEditor.getState().project).toBe(before);
    expect(useEditor.getState().project.rig.bones.filter((b) => b.name === 'head')).toHaveLength(1);
  });
  it('ignores the whole patch when the name is a duplicate', () => {
    const before = useEditor.getState().project;
    useEditor.getState().updateBone('torso', { name: 'head', length: 77 });
    expect(useEditor.getState().project).toBe(before);
  });
  it('allows re-setting a bone to its own name', () => {
    useEditor.getState().updateBone('torso', { name: 'torso', length: 77 });
    expect(useEditor.getState().project.rig.bones.find((b) => b.id === 'torso')!.length).toBe(77);
  });
  it('accepts a unique name', () => {
    useEditor.getState().updateBone('torso', { name: 'chest' });
    expect(useEditor.getState().project.rig.bones.find((b) => b.id === 'torso')!.name).toBe('chest');
  });
});

describe('setProjectName', () => {
  it('renames with one undo entry and ignores unchanged names', () => {
    const s = useEditor.getState();
    s.setProjectName('Ritter');
    expect(useEditor.getState().project.name).toBe('Ritter');
    const ref = useEditor.getState().project;
    useEditor.getState().setProjectName('Ritter');
    expect(useEditor.getState().project).toBe(ref);
    useEditor.temporal.getState().undo();
    expect(useEditor.getState().project.name).toBe('Neues Projekt');
  });
});

describe('transactions', () => {
  const past = () => useEditor.temporal.getState().pastStates.length;
  const g = () => useEditor.getState();

  it('commit records exactly one history entry for many changes', () => {
    const start = g().project;
    g().beginTransaction();
    expect(g().transaction).toEqual({ startProject: start });
    g().setProjectName('a');
    g().setProjectName('b');
    g().setSpriteAxis('up');
    expect(past()).toBe(0);
    g().commitTransaction();
    expect(g().transaction).toBeNull();
    expect(past()).toBe(1);
    expect(g().project.name).toBe('b');
    g().undo();
    expect(g().project).toBe(start);
  });

  it('commit without changes records nothing', () => {
    g().beginTransaction();
    g().setProjectName(g().project.name);
    g().commitTransaction();
    expect(past()).toBe(0);
    g().setProjectName('after');
    expect(past()).toBe(1);
  });

  it('cancel restores the start project without an entry and resumes recording', () => {
    const start = g().project;
    g().beginTransaction();
    g().setProjectName('x');
    g().cancelTransaction();
    expect(g().project).toBe(start);
    expect(g().transaction).toBeNull();
    expect(past()).toBe(0);
    g().setProjectName('y');
    expect(past()).toBe(1);
  });

  it('undo, redo and camera changes are no-ops while open', () => {
    g().setProjectName('one');
    g().setProjectName('two');
    g().undo();
    expect(g().project.name).toBe('one');
    g().beginTransaction();
    g().undo();
    expect(g().project.name).toBe('one');
    g().redo();
    expect(g().project.name).toBe('one');
    g().setCameraRotation(45);
    g().rotateCamera(90);
    g().toggleMirror();
    expect(g().project.settings.cameraRotation).toBe(0);
    expect(g().project.settings.mirror).toBe(false);
    g().commitTransaction();
    g().redo();
    expect(g().project.name).toBe('two');
  });

  it('begin is a no-op while open; commit/cancel without a transaction do nothing', () => {
    const start = g().project;
    g().commitTransaction();
    g().cancelTransaction();
    g().beginTransaction();
    g().setProjectName('x');
    g().beginTransaction();
    expect(g().transaction!.startProject).toBe(start);
    g().commitTransaction();
    expect(past()).toBe(1);
  });

  it('begin stops playback', () => {
    g().addAnimation('a');
    g().setMode('animate');
    g().setPlaying(true);
    expect(g().playing).toBe(true);
    g().beginTransaction();
    expect(g().playing).toBe(false);
  });

  it('loadProject ends an open transaction and resumes recording', () => {
    g().beginTransaction();
    g().loadProject(createProject('quadruped'));
    expect(g().transaction).toBeNull();
    g().setProjectName('z');
    expect(past()).toBe(1);
  });
});

describe('edit groups', () => {
  const past = () => useEditor.temporal.getState().pastStates.length;
  const g = () => useEditor.getState();

  it('groups many changes into one undo step without blocking guarded actions', () => {
    g().beginEditGroup();
    g().setCameraRotation(4);
    g().setCameraRotation(45);
    expect(g().project.settings.cameraRotation).toBe(45);
    expect(past()).toBe(0);
    g().endEditGroup();
    expect(past()).toBe(1);
    g().undo();
    expect(g().project.settings.cameraRotation).toBe(0);
  });

  it('revert restores the start project without an undo entry', () => {
    const start = g().project;
    g().beginEditGroup();
    g().setProjectName('x');
    g().endEditGroup(true);
    expect(g().project).toBe(start);
    expect(past()).toBe(0);
  });

  it('is a no-op while a transaction is open', () => {
    g().beginTransaction();
    g().beginEditGroup();
    g().setProjectName('x');
    g().endEditGroup();
    expect(g().transaction).not.toBeNull();
    g().commitTransaction();
    expect(past()).toBe(1);
  });
});

describe('camera actions', () => {
  const rot = () => useEditor.getState().project.settings.cameraRotation;
  const past = () => useEditor.temporal.getState().pastStates.length;

  it('setCameraRotation normalizes, rounds drift and skips unchanged values', () => {
    useEditor.getState().setCameraRotation(270);
    expect(rot()).toBe(-90);
    expect(past()).toBe(1);
    useEditor.getState().setCameraRotation(-90 + 1e-9);
    expect(past()).toBe(1);
    useEditor.getState().setCameraRotation(0.1 + 0.2);
    expect(rot()).toBe(0.3);
  });

  it('rotateCamera adds to the current angle with wrap-around', () => {
    useEditor.getState().rotateCamera(90);
    useEditor.getState().rotateCamera(90);
    useEditor.getState().rotateCamera(90);
    expect(rot()).toBe(-90);
    useEditor.getState().rotateCamera(-15);
    expect(rot()).toBe(-105);
  });
});

describe('orbit, layer spacing and mirror actions', () => {
  const g = () => useEditor.getState();
  const past = () => useEditor.temporal.getState().pastStates.length;
  const mirror = () => g().project.settings.mirror;

  it('setOrbit normalizes the yaw, clamps the pitch and leaves the undo history alone', () => {
    g().setOrbit(200, 120);
    expect(g().orbit).toEqual({ yaw: -160, pitch: 90 });
    g().setOrbit(-180, -100);
    expect(g().orbit).toEqual({ yaw: 180, pitch: -90 });
    g().setOrbit(0.1 + 0.2, 12.5);
    expect(g().orbit).toEqual({ yaw: 0.3, pitch: 12.5 });
    g().setOrbit(NaN, 3);
    expect(g().orbit).toEqual({ yaw: 0.3, pitch: 12.5 });
    expect(past()).toBe(0);
  });

  it('orbitBy adds to the current orbit (wrap-around yaw, clamped pitch)', () => {
    g().orbitBy(-15, 15);
    expect(g().orbit).toEqual({ yaw: -15, pitch: 15 });
    g().orbitBy(-170, 80);
    expect(g().orbit).toEqual({ yaw: 175, pitch: 90 });
    expect(past()).toBe(0);
  });

  it('orbit is not part of the project or the undo history', () => {
    g().setProjectName('a');
    g().setOrbit(45, 30);
    g().undo();
    expect(g().orbit).toEqual({ yaw: 45, pitch: 30 });
    expect(g().project).not.toHaveProperty('orbit');
  });

  it('toggleRig flips the rig visibility without an undo entry', () => {
    expect(g().showRig).toBe(true);
    g().toggleRig();
    expect(g().showRig).toBe(false);
    g().toggleRig();
    expect(g().showRig).toBe(true);
    expect(useEditor.temporal.getState().pastStates.length).toBe(0);
  });

  it('setLayerSpacing clamps to [0, 100] and ignores NaN', () => {
    expect(g().layerSpacing).toBe(12);
    g().setLayerSpacing(-5);
    expect(g().layerSpacing).toBe(0);
    g().setLayerSpacing(500);
    expect(g().layerSpacing).toBe(100);
    g().setLayerSpacing(NaN);
    expect(g().layerSpacing).toBe(100);
    g().setLayerSpacing(20);
    expect(g().layerSpacing).toBe(20);
    expect(past()).toBe(0);
  });

  it('toggleMirror flips the project setting in exactly one undo entry; no-op during a transaction', () => {
    g().toggleMirror();
    expect(mirror()).toBe(true);
    expect(past()).toBe(1);
    g().undo();
    expect(mirror()).toBe(false);
    g().beginTransaction();
    g().toggleMirror();
    expect(mirror()).toBe(false);
    g().commitTransaction();
    expect(past()).toBe(0);
  });

  it('resetCamera resets the orbit without undo and the roll with one undo entry; mirror stays', () => {
    g().setOrbit(60, -30);
    g().resetCamera();
    expect(g().orbit).toEqual({ yaw: 0, pitch: 0 });
    expect(past()).toBe(0);
    g().toggleMirror();
    g().setCameraRotation(30);
    g().setOrbit(90, 10);
    expect(past()).toBe(2);
    g().resetCamera();
    expect(g().orbit).toEqual({ yaw: 0, pitch: 0 });
    expect(g().project.settings.cameraRotation).toBe(0);
    expect(mirror()).toBe(true);
    expect(past()).toBe(3);
    g().undo();
    expect(g().project.settings.cameraRotation).toBe(30);
  });

  it('resetCamera during a transaction resets only the orbit', () => {
    g().setCameraRotation(30);
    g().setOrbit(90, 10);
    g().beginTransaction();
    g().resetCamera();
    g().commitTransaction();
    expect(g().orbit).toEqual({ yaw: 0, pitch: 0 });
    expect(g().project.settings.cameraRotation).toBe(30);
    expect(past()).toBe(1);
  });
});

describe('playback gate', () => {
  const g = () => useEditor.getState();
  const startPlaying = () => {
    g().addAnimation('a');
    g().setMode('animate');
    g().setPlaying(true);
    expect(g().playing).toBe(true);
  };

  it('setPlaying requires animate mode and an active animation', () => {
    g().setPlaying(true);
    expect(g().playing).toBe(false);
    g().addAnimation('a');
    g().setPlaying(true);
    expect(g().playing).toBe(false);
    g().setMode('animate');
    g().setPlaying(true);
    expect(g().playing).toBe(true);
  });

  it('setMode(setup) stops playback, setMode(animate) keeps it', () => {
    startPlaying();
    g().setMode('animate');
    expect(g().playing).toBe(true);
    g().setMode('setup');
    expect(g().playing).toBe(false);
  });

  it('setAnimation(null) stops playback; switching to another animation keeps it', () => {
    startPlaying();
    const first = g().animationId;
    g().addAnimation('b');
    expect(g().playing).toBe(true);
    g().setAnimation(first);
    expect(g().playing).toBe(true);
    g().setAnimation(null);
    expect(g().playing).toBe(false);
  });

  it('removing the active animation stops playback, removing another one does not', () => {
    startPlaying();
    const first = g().animationId!;
    g().addAnimation('b');
    g().removeAnimation(first);
    expect(g().playing).toBe(true);
    g().removeAnimation(g().animationId!);
    expect(g().playing).toBe(false);
  });

  it('loadProject stops playback', () => {
    startPlaying();
    g().loadProject(createProject('humanoid'));
    expect(g().playing).toBe(false);
  });
});

describe('updateAnimation validation', () => {
  it('clamps fps to [1, 120] and length to >= 1', () => {
    useEditor.getState().addAnimation('a');
    const id = useEditor.getState().animationId!;
    useEditor.getState().updateAnimation(id, { fps: 0, length: 0 });
    expect(useEditor.getState().project.animations[0]).toMatchObject({ fps: 1, length: 1 });
    useEditor.getState().updateAnimation(id, { fps: 1000 });
    expect(useEditor.getState().project.animations[0].fps).toBe(120);
  });
});

describe('selection pruning', () => {
  const g = () => useEditor.getState();

  it('removePart and removeImage clear a part selection that no longer exists', () => {
    g().addImages([img('i1', 'head.png'), img('i2', 'torso.png')]);
    const [a, b] = g().project.parts;
    g().select(a.boneId, a.id);
    g().removePart(b.id);
    expect(g().selectedPartId).toBe(a.id);
    g().removePart(a.id);
    expect(g().selectedPartId).toBeNull();
    expect(g().selectedBoneId).toBe(a.boneId);
    g().select(b.boneId, b.id);
    g().removeImage('i2');
    expect(g().selectedPartId).toBeNull();
  });

  it('removeBone clears a selected descendant bone and its part', () => {
    g().addImages([img('i1', 'hand_L.png')]);
    const part = g().project.parts[0];
    g().select(boneId('hand_L'), part.id);
    g().removeBone(boneId('upperArm_L'));
    expect(g().selectedBoneId).toBeNull();
    expect(g().selectedPartId).toBeNull();
  });
});

describe('non-secure context (no crypto.randomUUID)', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('addImages and addAnimationFromTemplate still work', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    useEditor.getState().addImages([img('i1', 'head.png')]);
    expect(useEditor.getState().project.parts.length).toBe(1);
    useEditor.getState().addAnimationFromTemplate('humanoid-walk');
    expect(useEditor.getState().animationId).not.toBeNull();
  });
});
