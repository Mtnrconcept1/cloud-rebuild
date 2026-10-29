type Row = { r: number; z: number };
type Surface = { v: Float32Array; i: Uint16Array };
type Mesh = { vbo: WebGLBuffer; ibo: WebGLBuffer; count: number };
export type TokSaturnScene = { render: (seconds: number) => void; dispose: () => void };
const TAU = Math.PI * 2;

// Quad strips with evenly spaced radial loops and subdivided round bevels.
// Each quad becomes two triangles only when sent to WebGL; no folded fan caps.
function lathe(rows: Row[], count = 96): Surface {
  const vertices: number[] = [], indices: number[] = [];
  rows.forEach((p, k) => {
    const a = rows[Math.max(0, k - 1)], b = rows[Math.min(rows.length - 1, k + 1)];
    const dr = b.r - a.r, dz = b.z - a.z, length = Math.hypot(dr, dz) || 1;
    for (let j = 0; j <= count; j++) {
      const theta = TAU * j / count, c = Math.cos(theta), s = Math.sin(theta);
      vertices.push(p.r * c, p.r * s, p.z, dz / length * c, dz / length * s, -dr / length, j / count, k / (rows.length - 1));
      if (k && j) {
        const x = (k - 1) * (count + 1) + j - 1, y = k * (count + 1) + j - 1;
        indices.push(x, y, x + 1, y, y + 1, x + 1);
      }
    }
  });
  return { v: new Float32Array(vertices), i: new Uint16Array(indices) };
}
function metallicBody(): Surface {
  const rows: Row[] = [];
  for (let i = 0; i <= 8; i++) rows.push({ r: 0.002 + 0.678 * i / 8, z: -0.143 });
  for (let i = 1; i <= 12; i++) {
    const a = Math.PI * i / 24;
    rows.push({ r: 0.68 + 0.12 * Math.sin(a), z: -0.043 - 0.10 * Math.cos(a) });
  }
  rows.push({ r: 0.80, z: 0.043 });
  for (let i = 1; i <= 12; i++) {
    const a = Math.PI * i / 24;
    rows.push({ r: 0.68 + 0.12 * Math.cos(a), z: 0.043 + 0.10 * Math.sin(a) });
  }
  for (let i = 7; i >= 0; i--) rows.push({ r: Math.max(0.002, 0.68 * i / 8), z: 0.143 });
  return lathe(rows);
}
function torus(radius: number, tube: number): Surface {
  const count = 160, sides = 10, v: number[] = [], indices: number[] = [];
  for (let i = 0; i <= count; i++) {
    const a = TAU * i / count, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j <= sides; j++) {
      const b = TAU * j / sides, cb = Math.cos(b), sb = Math.sin(b);
      v.push((radius + tube * cb) * ca, (radius + tube * cb) * sa, tube * sb,
        cb * ca, cb * sa, sb, i / count, j / sides);
      if (i && j) {
        const x = (i - 1) * (sides + 1) + j - 1, y = i * (sides + 1) + j - 1;
        indices.push(x, y, x + 1, y, y + 1, x + 1);
      }
    }
  }
  return { v: new Float32Array(v), i: new Uint16Array(indices) };
}
function officialFront(): Surface {
  // Original transparent TOK/Miamz artwork on a single textured quad.
  // The opposite face is only polished orange metal.
  const z = 0.163;
  return {
    v: new Float32Array([
      -1.16, -0.87, z, 0, 0, 1, 0, 0,
      1.52, -0.87, z, 0, 0, 1, 1, 0,
      1.52, 0.87, z, 0, 0, 1, 1, 1,
      -1.16, 0.87, z, 0, 0, 1, 0, 1,
    ]),
    i: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}
const VERTEX_SHADER = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uModel;
uniform mat4 uVP;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 p = uModel * vec4(aPos, 1.0);
  vNormal = normalize(mat3(uModel) * aNormal);
  vWorld = p.xyz;
  vUv = aUv;
  gl_Position = uVP * p;
}`;
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uLogo;
uniform vec3 uColor;
uniform float uMode;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNormal);
  vec3 light = normalize(vec3(0.65 + sin(uTime * 0.6) * 0.24, 0.75, 1.2));
  vec3 fill = normalize(vec3(-0.9, -0.2, -1.0));
  vec3 eye = normalize(vec3(0.0, 0.0, 4.15) - vWorld);
  float lambert = max(dot(n, light), 0.0) * 0.53 + max(dot(n, fill), 0.0) * 0.28;
  float gloss = pow(max(dot(n, normalize(light + eye)), 0.0), 50.0) * 1.05
              + pow(max(dot(n, normalize(fill + eye)), 0.0), 26.0) * 0.5;
  float rim = pow(1.0 - max(dot(n, eye), 0.0), 3.0);
  if (uMode > 1.5) {
    float glint = pow(max(cos(vUv.x * 18.84956 - uTime * 2.3), 0.0), 22.0);
    vec3 beam = uColor * (1.3 + glint * 1.6) + vec3(1.0, 0.76, 0.34) * (gloss + 0.26);
    gl_FragColor = vec4(min(beam, vec3(1.0)), 0.94);
  } else if (uMode > 0.5) {
    vec4 tex = texture2D(uLogo, vUv);
    if (tex.a < 0.025) discard;
    vec3 front = tex.rgb * (0.93 + lambert * 0.16) + vec3(1.0, 0.69, 0.4) * gloss * 0.12;
    gl_FragColor = vec4(min(front, vec3(1.0)), tex.a);
  } else {
    vec3 metal = uColor * (0.58 + lambert * 0.62)
               + vec3(1.0, 0.82, 0.56) * gloss * 0.83
               + vec3(0.96, 0.29, 0.05) * rim * 0.35;
    gl_FragColor = vec4(min(metal, vec3(1.0)), 1.0);
  }
}`;
type Mat4 = Float32Array;
function matrixMultiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) o[4 * col + row] += a[4 * k + row] * b[4 * col + k];
  return o;
}
const xRot = (a: number): Mat4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
};
const yRot = (a: number): Mat4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
};
const zRot = (a: number): Mat4 => {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
};
function viewProjection(aspect: number): Mat4 {
  const near = 0.1, far = 12, f = 1 / Math.tan(52 * Math.PI / 360);
  const p = new Float32Array([
    f / aspect, 0, 0, 0, 0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, 2 * near * far / (near - far), 0,
  ]);
  const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -4.15, 1]);
  return matrixMultiply(p, view);
}
function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const s = gl.createShader(type);
  if (!s) throw new Error("Shader unavailable");
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    throw new Error("Shader compile failed");
  }
  return s;
}
function upload(gl: WebGLRenderingContext, surface: Surface): Mesh {
  const vbo = gl.createBuffer(), ibo = gl.createBuffer();
  if (!vbo || !ibo) throw new Error("Buffer unavailable");
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, surface.v, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, surface.i, gl.STATIC_DRAW);
  return { vbo, ibo, count: surface.i.length };
}

export function createTokSaturnScene(
  canvas: HTMLCanvasElement,
  logoUrl: string,
  onReady: () => void,
): TokSaturnScene | null {
  if (typeof window === "undefined" || !("WebGLRenderingContext" in window)) return null;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    // Hardened browsers and old mobile GPUs can throw instead of returning null.
    return null;
  }
  if (!gl) return null;
  let disposed = false, logoReady = false, program: WebGLProgram | null = null;
  let texture: WebGLTexture | null = null;
  const meshes: Mesh[] = [];
  try {
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error("Program unavailable");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Program link failed");
    gl.useProgram(program);
    const pos = gl.getAttribLocation(program, "aPos");
    const norm = gl.getAttribLocation(program, "aNormal");
    const uv = gl.getAttribLocation(program, "aUv");
    if ([pos, norm, uv].some((index) => index < 0)) throw new Error("Attributes unavailable");
    const uModel = gl.getUniformLocation(program, "uModel");
    const uVP = gl.getUniformLocation(program, "uVP");
    const uColor = gl.getUniformLocation(program, "uColor");
    const uMode = gl.getUniformLocation(program, "uMode");
    const uTime = gl.getUniformLocation(program, "uTime");
    const body = upload(gl, metallicBody()), logo = upload(gl, officialFront());
    const ringA = upload(gl, torus(1.24, 0.012)), ringB = upload(gl, torus(1.14, 0.008));
    meshes.push(body, logo, ringA, ringB);
    texture = gl.createTexture();
    if (!texture) throw new Error("Texture unavailable");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(program, "uLogo"), 0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const picture = new Image();
    picture.decoding = "async";
    picture.onload = () => {
      if (disposed) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
        logoReady = true;
        onReady();
      } catch {
        // Leave the CSS fallback visible when a texture cannot upload.
      }
    };
    picture.onerror = () => {
      // The logo must never disappear because the GPU is unavailable.
    };
    picture.src = logoUrl;

    function draw(m: Mesh, model: Mat4, vp: Mat4, color: number[], mode: number, time: number) {
      gl.uniformMatrix4fv(uModel, false, model);
      gl.uniformMatrix4fv(uVP, false, vp);
      gl.uniform3fv(uColor, color);
      gl.uniform1f(uMode, mode);
      gl.uniform1f(uTime, time);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.enableVertexAttribArray(pos);
      gl.enableVertexAttribArray(norm);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(norm, 3, gl.FLOAT, false, 32, 12);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 32, 24);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
    }

    return {
      render(seconds) {
        if (disposed || !logoReady || !canvas.width || !canvas.height) return;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        const vp = viewProjection(canvas.width / canvas.height);
        // True three-dimensional orbits, centered on the logo at (0, 0, 0).
        const orbitA = matrixMultiply(yRot(seconds * 0.32), matrixMultiply(xRot(1.12), zRot(-0.23)));
        const orbitB = matrixMultiply(yRot(-seconds * 0.24), matrixMultiply(xRot(0.97), zRot(0.28)));
        draw(ringA, orbitA, vp, [1.0, 0.43, 0.07], 2, seconds);
        draw(ringB, orbitB, vp, [0.96, 0.69, 0.22], 2, -seconds * 0.7);
        // 6.5-second revolution: faster, with a single official face.
        const turn = matrixMultiply(yRot(seconds * TAU / 6.5 - 0.25), xRot(0.09));
        draw(body, turn, vp, [1.0, 0.255, 0.01], 0, seconds);
        gl.depthMask(false);
        // Prevent the printed front artwork from appearing behind the solid back.
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        draw(logo, turn, vp, [1, 1, 1], 1, seconds);
        gl.disable(gl.CULL_FACE);
        gl.depthMask(true);
      },
      dispose() {
        disposed = true;
        picture.onload = null;
        picture.onerror = null;
        meshes.forEach((m) => { gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo); });
        gl.deleteTexture(texture);
        gl.deleteProgram(program);
      },
    };
  } catch {
    meshes.forEach((m) => { gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo); });
    if (texture) gl.deleteTexture(texture);
    if (program) gl.deleteProgram(program);
    return null;
  }
}