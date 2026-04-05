import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Center, Bounds } from "@react-three/drei";
import * as THREE from "three";
import { useAppState } from "../state/AppContext";
import type { LayerColorData } from "../lib/pipeline";

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** Build a 1D DataTexture mapping layer index → RGB from layer color data. */
function buildLayerTexture(
  layerColorData: LayerColorData,
  filamentColors: readonly string[],
): THREE.DataTexture {
  const { layerFilamentMap, totalLayers } = layerColorData;
  const width = Math.max(totalLayers, 1);
  const data = new Uint8Array(width * 4); // RGBA

  for (let i = 0; i < width; i++) {
    const filament = layerFilamentMap.get(i) ?? 0;
    const hex = filamentColors[filament] ?? filamentColors[0];
    const [r, g, b] = hexToRgb(hex);
    data[i * 4] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const LAYER_VERTEX_SHADER = /* glsl */ `
  varying float vModelZ;
  varying vec3 vWorldNormal;

  void main() {
    vModelZ = position.z;
    mat3 worldNormalMatrix = transpose(inverse(mat3(modelMatrix)));
    vWorldNormal = normalize(worldNormalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LAYER_FRAGMENT_SHADER = /* glsl */ `
  uniform float uZMin;
  uniform float uLayerHeight;
  uniform float uTotalLayers;
  uniform sampler2D uLayerColorTex;

  varying float vModelZ;
  varying vec3 vWorldNormal;

  void main() {
    float epsilon = uLayerHeight * 0.001;
    float layerF = floor((vModelZ - uZMin + epsilon) / uLayerHeight);
    layerF = clamp(layerF, 0.0, uTotalLayers - 1.0);

    // Sample 1D texture: center of texel
    float u = (layerF + 0.5) / uTotalLayers;
    vec3 layerColor = texture2D(uLayerColorTex, vec2(u, 0.5)).rgb;

    // Basic lighting: ambient (0.5) + directional diffuse (1.0)
    vec3 normal = normalize(vWorldNormal);
    vec3 lightDir = normalize(vec3(5.0, 10.0, 7.0));
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 color = layerColor * (0.5 + diff);

    gl_FragColor = vec4(color, 1.0);
  }
`;

function MeshGeometry() {
  const { meshData, layerColorData, filamentColors, previewMode } = useAppState();
  const { invalidate } = useThree();

  const geometry = useMemo(() => {
    if (!meshData) return null;
    const { vertices, faces, faceCount } = meshData;

    const posArr = new Float32Array(faceCount * 9);

    for (let f = 0; f < faceCount; f++) {
      const i0 = faces[f * 3];
      const i1 = faces[f * 3 + 1];
      const i2 = faces[f * 3 + 2];

      posArr[f * 9] = vertices[i0 * 3];
      posArr[f * 9 + 1] = vertices[i0 * 3 + 1];
      posArr[f * 9 + 2] = vertices[i0 * 3 + 2];

      posArr[f * 9 + 3] = vertices[i1 * 3];
      posArr[f * 9 + 4] = vertices[i1 * 3 + 1];
      posArr[f * 9 + 5] = vertices[i1 * 3 + 2];

      posArr[f * 9 + 6] = vertices[i2 * 3];
      posArr[f * 9 + 7] = vertices[i2 * 3 + 1];
      posArr[f * 9 + 8] = vertices[i2 * 3 + 2];
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(faceCount * 9), 3),
    );
    geo.computeVertexNormals();
    return geo;
  }, [meshData]);

  // Update vertex colors separately — avoids full geometry rebuild on color changes
  useEffect(() => {
    if (!geometry || !meshData) return;

    const { faceColors, defaultFilament, faceCount } = meshData;
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;

    for (let f = 0; f < faceCount; f++) {
      const filament = faceColors.get(f) ?? defaultFilament;
      const hex = filamentColors[filament] ?? filamentColors[0];
      const [r, g, b] = hexToRgb(hex);
      const base = f * 3;
      colorAttr.setXYZ(base, r, g, b);
      colorAttr.setXYZ(base + 1, r, g, b);
      colorAttr.setXYZ(base + 2, r, g, b);
    }

    colorAttr.needsUpdate = true;
    invalidate();
  }, [geometry, meshData, filamentColors, invalidate]);

  // Invalidate on preview mode switch without re-running O(faceCount) color fill
  useEffect(() => {
    invalidate();
  }, [previewMode, invalidate]);

  const shaderMaterial = useMemo(() => {
    if (
      !layerColorData ||
      layerColorData.totalLayers <= 0 ||
      !isFinite(layerColorData.zMin)
    ) {
      return null;
    }

    const tex = buildLayerTexture(layerColorData, filamentColors);

    return new THREE.ShaderMaterial({
      vertexShader: LAYER_VERTEX_SHADER,
      fragmentShader: LAYER_FRAGMENT_SHADER,
      uniforms: {
        uZMin: { value: layerColorData.zMin },
        uLayerHeight: { value: layerColorData.layerHeight },
        uTotalLayers: { value: layerColorData.totalLayers },
        uLayerColorTex: { value: tex },
      },
    });
  }, [layerColorData, filamentColors]);

  // Dispose previous shader material + texture when replaced or on unmount
  const prevMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  useEffect(() => {
    const prev = prevMaterialRef.current;
    if (prev && prev !== shaderMaterial) {
      prev.uniforms.uLayerColorTex.value.dispose();
      prev.dispose();
    }
    prevMaterialRef.current = shaderMaterial;
  }, [shaderMaterial]);

  useEffect(() => {
    return () => {
      const current = prevMaterialRef.current;
      if (current) {
        current.uniforms.uLayerColorTex.value.dispose();
        current.dispose();
        prevMaterialRef.current = null;
      }
    };
  }, []);

  if (!geometry) return null;

  if (previewMode === 'output' && shaderMaterial) {
    return <mesh geometry={geometry} material={shaderMaterial} />;
  }

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors flatShading />
    </mesh>
  );
}

/** Renders a 10mm-grid build plate sized to the model bounding box, positioned just below the model's minimum Z. */
function BuildPlateGrid() {
  const { meshData } = useAppState();
  const { invalidate } = useThree();

  const gridHelper = useMemo(() => {
    if (!meshData) return null;
    const { vertices } = meshData;
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, zMin = Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
      if (z < zMin) zMin = z;
    }
    const span = Math.max(xMax - xMin, yMax - yMin, 100) * 1.5;
    const divisions = Math.max(1, Math.ceil(span / 10));
    const size = divisions * 10;
    const grid = new THREE.GridHelper(size, divisions, 0x888888, 0x444444);
    // GridHelper is XZ plane — rotate to XY to align with model's Z-up coordinate space
    grid.rotation.x = Math.PI / 2;
    grid.position.set((xMin + xMax) / 2, (yMin + yMax) / 2, zMin - 0.01);
    return grid;
  }, [meshData]);

  useEffect(() => { invalidate(); }, [gridHelper, invalidate]);

  if (!gridHelper) return null;
  return <primitive object={gridHelper} />;
}

/** Triggers a single re-render whenever scene inputs change (demand-driven rendering). */
function SceneInvalidator({ filamentColors }: { filamentColors?: string[] }) {
  const { invalidate } = useThree();
  const { meshData, layerColorData, previewMode } = useAppState();

  useEffect(() => {
    invalidate();
  }, [meshData, layerColorData, invalidate]);

  useEffect(() => {
    invalidate();
  }, [filamentColors, previewMode, invalidate]);

  return <OrbitControls makeDefault onChange={() => invalidate()} />;
}

export function MeshViewer() {
  const { meshData, filamentColors } = useAppState();

  if (!meshData) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-600 select-none">
        <p className="text-lg">Upload a 3MF file to preview</p>
      </div>
    );
  }

  return (
    <Canvas
      className="absolute inset-0"
      frameloop="demand"
      camera={{ position: [0, 0, 100], fov: 50, near: 0.1, far: 10000 }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 7]} intensity={1} />
      <Center>
        {/* 3MF uses Z-up; Three.js uses Y-up. Rotate -90° around X to stand models upright. */}
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <Bounds fit clip observe>
            <MeshGeometry />
          </Bounds>
          <BuildPlateGrid />
        </group>
      </Center>
      <SceneInvalidator filamentColors={filamentColors} />
    </Canvas>
  );
}
