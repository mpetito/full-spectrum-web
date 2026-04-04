/** Tests for 3MF reading and writing. */
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { read3mf, write3mf, ThreeMFError } from '../threemf';

function makeMinimal3mf(triangleAttrs = '', modelAttrs = ''): ArrayBuffer {
  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ${modelAttrs} unit="millimeter">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0"/>
          <vertex x="1" y="0" z="0"/>
          <vertex x="0" y="1" z="0"/>
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" ${triangleAttrs}/>
        </triangles>
      </mesh>
    </object>
  </resources>
  <build><item objectid="1"/></build>
</model>`;

  const files: Record<string, Uint8Array> = {
    '3D/3dmodel.model': strToU8(modelXml),
    '[Content_Types].xml': strToU8(
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    ),
    '_rels/.rels': strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>',
    ),
  };
  const zipped = zipSync(files);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength);
}

describe('read3mf', () => {
  it('reads a minimal 3MF with 3 vertices and 1 face', () => {
    const data = makeMinimal3mf();
    const result = read3mf(data);
    expect(result.vertexCount).toBe(3);
    expect(result.faceCount).toBe(1);
    expect(result.vertices.length).toBe(9);
    expect(result.faces.length).toBe(3);
    expect(result.faceColors.size).toBe(0);
    expect(result.defaultFilament).toBe(1);
  });

  it('reads paint_color attribute', () => {
    const data = makeMinimal3mf('paint_color="4"');
    const result = read3mf(data);
    expect(result.faceColors.size).toBe(1);
    // "4" hex → filament 1
    expect(result.faceColors.get(0)).toBe(1);
  });

  // happy-dom's DOMParser doesn't support getAttributeNS with custom namespaces;
  // this test works in real browsers but is skipped in the Node test environment.
  it.skip('reads slic3rpe mmu_segmentation attribute', () => {
    const data = makeMinimal3mf(
      'slic3rpe:mmu_segmentation="8"',
      'xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06"',
    );
    const result = read3mf(data);
    expect(result.faceColors.size).toBe(1);
    // "8" hex → filament 2
    expect(result.faceColors.get(0)).toBe(2);
  });

  it('throws ThreeMFError for non-ZIP data', () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    expect(() => read3mf(garbage)).toThrow(ThreeMFError);
    expect(() => read3mf(garbage)).toThrow('Cannot open 3MF');
  });
});

describe('write3mf → read3mf round-trip', () => {
  it('writes and reads back vertices, faces, and colors', () => {
    const vertices = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const faces = new Uint32Array([0, 1, 2]);
    const faceColors = ['4']; // filament 1

    const zippedBytes = write3mf(vertices, faces, 3, 1, faceColors, 1, 'both');
    const result = read3mf(zippedBytes.buffer);

    expect(result.vertexCount).toBe(3);
    expect(result.faceCount).toBe(1);
    expect(result.faceColors.size).toBe(1);
    expect(result.faceColors.get(0)).toBe(1);

    // Vertex coordinates should match
    expect(result.vertices[0]).toBeCloseTo(0);
    expect(result.vertices[3]).toBeCloseTo(1);
    expect(result.vertices[7]).toBeCloseTo(1);
  });
});

describe('write3mf validation', () => {
  it('rejects mismatched faceColors length', () => {
    const vertices = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const faces = new Uint32Array([0, 1, 2]);
    const faceColors = ['4', '8']; // length 2 but faceCount is 1

    expect(() => write3mf(vertices, faces, 3, 1, faceColors)).toThrow(ThreeMFError);
    expect(() => write3mf(vertices, faces, 3, 1, faceColors)).toThrow('faceColors length');
  });
});
