import { cosSinDeg } from '../core/math';
import { WEBGL2_UNSUPPORTED } from '../core/messages';
import type { Layer } from './layers';
import { depthOffset, projectionMatrix, type ViewTransform } from './view';

export { screenToWorld, worldToScreen, type ViewTransform } from './view';

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
uniform vec3 u_view;   // zoom, offsetX, offsetY (screen px)
uniform vec2 u_rot;    // cos, sin of the camera rotation
uniform mat2 u_proj;   // orbit projection and mirror (view.ts projectionMatrix)
uniform vec2 u_depth;  // screen offset of the layer depth (view.ts depthOffset)
uniform vec2 u_size;   // viewport size (px)
out vec2 v_uv;
void main() {
  // The front view has u_proj = ±identity and u_depth = 0: bit-identical to plain roll / zoom / pan.
  vec2 p = u_proj * a_position;
  vec2 rotated = vec2(p.x * u_rot.x - p.y * u_rot.y, p.x * u_rot.y + p.y * u_rot.x);
  vec2 screen = rotated * u_view.x + u_view.yz + u_depth;
  vec2 clip = screen / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_uv;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 outColor;
void main() {
  outColor = texture(u_texture, v_uv);
}`;

type Rgba = [number, number, number, number];

function parseColor(css: string): Rgba {
  let hex = css.trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return [0, 0, 0, 1];
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const a = hex.length === 8 ? n(6) : 1;
  // premultiplied
  return [n(0) * a, n(2) * a, n(4) * a, a];
}

/** The background rarely changes: remember the last parsed colour. */
let lastColor: { css: string; rgba: Rgba } | null = null;
function parseColorCached(css: string): Rgba {
  if (lastColor?.css !== css) lastColor = { css, rgba: parseColor(css) };
  return lastColor.rgba;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader-Fehler: ${log}`);
  }
  return shader;
}

export class SkinRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private positionBuffer: WebGLBuffer;
  private uvBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private uView: WebGLUniformLocation | null;
  private uSize: WebGLUniformLocation | null;
  private uRot: WebGLUniformLocation | null;
  private uProj: WebGLUniformLocation | null;
  private uDepth: WebGLUniformLocation | null;
  private textures = new Map<string, WebGLTexture>();

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true }) as
      | WebGL2RenderingContext
      | null;
    if (!gl) throw new Error(WEBGL2_UNSUPPORTED);
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.bindAttribLocation(program, 1, 'a_uv');
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Programm-Fehler: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;
    this.uView = gl.getUniformLocation(program, 'u_view');
    this.uSize = gl.getUniformLocation(program, 'u_size');
    this.uRot = gl.getUniformLocation(program, 'u_rot');
    this.uProj = gl.getUniformLocation(program, 'u_proj');
    this.uDepth = gl.getUniformLocation(program, 'u_depth');

    this.vao = gl.createVertexArray()!;
    this.positionBuffer = gl.createBuffer()!;
    this.uvBuffer = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
  }

  setImage(id: string, img: TexImageSource, pixelArt: boolean): void {
    const gl = this.gl;
    let tex = this.textures.get(id);
    if (!tex) {
      tex = gl.createTexture()!;
      this.textures.set(id, tex);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    this.applyFilter(pixelArt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** Switches nearest / linear filtering of an uploaded image without re-uploading it. */
  setFilter(id: string, pixelArt: boolean): void {
    const tex = this.textures.get(id);
    if (!tex) return;
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.applyFilter(pixelArt);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  /** Sets min/mag filter of the bound texture. */
  private applyFilter(pixelArt: boolean): void {
    const gl = this.gl;
    const filter = pixelArt ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }

  removeImage(id: string): void {
    const tex = this.textures.get(id);
    if (!tex) return;
    this.gl.deleteTexture(tex);
    this.textures.delete(id);
  }

  /** Draws the layers in the given order, each shifted by its depth. `clear = null` clears to transparent. */
  render(layers: Layer[], view: ViewTransform, clear: string | null): void {
    const gl = this.gl;
    gl.viewport(0, 0, view.width, view.height);
    const [r, g, b, a] = clear === null ? [0, 0, 0, 0] : parseColorCached(clear);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.program);
    gl.uniform3f(this.uView, view.zoom, view.width / 2 + view.x, view.height / 2 + view.y);
    gl.uniform2f(this.uSize, view.width, view.height);
    const { cos, sin } = cosSinDeg(view.rotation);
    gl.uniform2f(this.uRot, cos, sin);
    // Column-major mat2: the first four Mat2D entries (a, b, c, d) are exactly its columns.
    gl.uniformMatrix2fv(this.uProj, false, projectionMatrix(view).slice(0, 4));
    // Mirror and back views flip the triangle winding: never cull.
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.vao);

    for (const { item, depth } of layers) {
      const tex = this.textures.get(item.imageId);
      if (!tex) continue;
      const offset = depthOffset(view, depth);
      gl.uniform2f(this.uDepth, offset.x, offset.y);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, item.positions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, item.uvs, gl.DYNAMIC_DRAW);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, item.indices, gl.DYNAMIC_DRAW);
      gl.drawElements(gl.TRIANGLES, item.indices.length, gl.UNSIGNED_SHORT, 0);
    }

    gl.bindVertexArray(null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /** `loseContext` also frees the GL context itself; only for throwaway canvases (a reused canvas would stay lost). */
  dispose(loseContext = false): void {
    const gl = this.gl;
    for (const tex of this.textures.values()) gl.deleteTexture(tex);
    this.textures.clear();
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.uvBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    if (loseContext) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
