import { useRef, useEffect } from 'react';

const VS = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FS = `
  precision highp float;
  uniform float u_time; uniform vec2 u_res;
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),
               mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
  }
  float fbm(vec2 p){
    float v=0.0,a=0.5;
    for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=0.5;}
    return v;
  }
  void main(){
    vec2 uv=gl_FragCoord.xy/u_res;
    vec2 p=(uv-0.5)*vec2(u_res.x/u_res.y,1.0)*3.0;
    float t=u_time*0.05;
    vec2 q=vec2(fbm(p+t),fbm(p+vec2(3.1,1.7)-t));
    float f=fbm(p+q*2.0);
    f=smoothstep(0.15,1.0,f);
    f=floor(f*5.0)/5.0;
    vec3 amber=vec3(0.96,0.62,0.04);
    vec3 col=mix(vec3(0.039),amber,f*0.13);
    float vig=smoothstep(1.05,0.22,length(uv-0.5));
    col*=vig;
    gl_FragColor=vec4(col,1.0);
  }`;

export function ShaderBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    } catch {
      gl = null;
    }
    if (!gl) return;
    const ctx = gl;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const compile = (type: number, src: string): WebGLShader | null => {
      const s = ctx.createShader(type);
      if (!s) return null;
      ctx.shaderSource(s, src);
      ctx.compileShader(s);
      return s;
    };

    const vsh = compile(ctx.VERTEX_SHADER, VS);
    const fsh = compile(ctx.FRAGMENT_SHADER, FS);
    const prog = ctx.createProgram();
    if (!vsh || !fsh || !prog) return;
    ctx.attachShader(prog, vsh);
    ctx.attachShader(prog, fsh);
    ctx.linkProgram(prog);
    if (!ctx.getProgramParameter(prog, ctx.LINK_STATUS)) return;
    ctx.useProgram(prog);

    const buf = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    ctx.bufferData(
      ctx.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      ctx.STATIC_DRAW,
    );
    const loc = ctx.getAttribLocation(prog, 'a');
    ctx.enableVertexAttribArray(loc);
    ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);

    const uTime = ctx.getUniformLocation(prog, 'u_time');
    const uRes = ctx.getUniformLocation(prog, 'u_res');
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        ctx.viewport(0, 0, w, h);
      }
      ctx.uniform1f(uTime, (now - start) / 1000);
      ctx.uniform2f(uRes, canvas.width, canvas.height);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw(start);

    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full block" />;
}
