// Script to create 3MF fixtures for E2E tests.
// Run with: node --experimental-strip-types e2e/create-fixture.ts

import { writeFileSync } from 'fs';
import { zipSync, strToU8 } from 'fflate';

const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
</Types>`;

const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

function buildZip(model: string): Uint8Array {
    return zipSync({
        '[Content_Types].xml': strToU8(contentTypes),
        '_rels/.rels': strToU8(rels),
        '3D/3dmodel.model': strToU8(model),
    });
}

// ── Cube: 12 triangles, no paint ────────────────────────────────────────────

const cubeModel = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
          <vertex x="0" y="0" z="0" />
          <vertex x="10" y="0" z="0" />
          <vertex x="10" y="10" z="0" />
          <vertex x="0" y="10" z="0" />
          <vertex x="0" y="0" z="10" />
          <vertex x="10" y="0" z="10" />
          <vertex x="10" y="10" z="10" />
          <vertex x="0" y="10" z="10" />
        </vertices>
        <triangles>
          <triangle v1="0" v2="1" v3="2" />
          <triangle v1="0" v2="2" v3="3" />
          <triangle v1="4" v2="6" v3="5" />
          <triangle v1="4" v2="7" v3="6" />
          <triangle v1="0" v2="4" v3="5" />
          <triangle v1="0" v2="5" v3="1" />
          <triangle v1="1" v2="5" v3="6" />
          <triangle v1="1" v2="6" v3="2" />
          <triangle v1="2" v2="6" v3="7" />
          <triangle v1="2" v2="7" v3="3" />
          <triangle v1="3" v2="7" v3="4" />
          <triangle v1="3" v2="4" v3="0" />
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

// ── Painted cylinder: 200 side faces (all painted) + caps ───────────────────
// Tall enough (5mm) with faces spanning multiple 0.1mm layers → boundary faces.
// All side faces painted filament 2 (hex "8") to trigger the parallel worker path.

function buildPaintedCylinder(segments: number, rings: number, height: number): string {
    const radius = 5;
    const vertices: string[] = [];
    const triangles: string[] = [];

    // Bottom center vertex
    vertices.push(`          <vertex x="0" y="0" z="0" />`);
    const bottomCenter = 0;

    // Ring vertices: rings+1 levels, each with `segments` vertices
    for (let r = 0; r <= rings; r++) {
        const z = (r / rings) * height;
        for (let s = 0; s < segments; s++) {
            const angle = (2 * Math.PI * s) / segments;
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            vertices.push(`          <vertex x="${x.toFixed(4)}" y="${y.toFixed(4)}" z="${z.toFixed(4)}" />`);
        }
    }

    // Top center vertex
    const topCenter = 1 + (rings + 1) * segments;
    vertices.push(`          <vertex x="0" y="0" z="${height}" />`);

    // Helper to get vertex index for ring r, segment s
    const ringVert = (r: number, s: number) => 1 + r * segments + (s % segments);

    // Bottom cap (unpainted — default filament)
    for (let s = 0; s < segments; s++) {
        const s1 = ringVert(0, s);
        const s2 = ringVert(0, s + 1);
        triangles.push(`          <triangle v1="${bottomCenter}" v2="${s2}" v3="${s1}" />`);
    }

    // Side faces: between consecutive rings (all painted filament 2 = hex "8")
    for (let r = 0; r < rings; r++) {
        for (let s = 0; s < segments; s++) {
            const a = ringVert(r, s);
            const b = ringVert(r, s + 1);
            const c = ringVert(r + 1, s + 1);
            const d = ringVert(r + 1, s);
            // Two triangles per quad, painted with slic3rpe:mmu_segmentation="8"
            triangles.push(`          <triangle v1="${a}" v2="${b}" v3="${c}" slic3rpe:mmu_segmentation="8" />`);
            triangles.push(`          <triangle v1="${a}" v2="${c}" v3="${d}" slic3rpe:mmu_segmentation="8" />`);
        }
    }

    // Top cap (unpainted — default filament)
    for (let s = 0; s < segments; s++) {
        const s1 = ringVert(rings, s);
        const s2 = ringVert(rings, s + 1);
        triangles.push(`          <triangle v1="${topCenter}" v2="${s1}" v3="${s2}" />`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:slic3rpe="http://schemas.slic3r.org/3mf/2017/06">
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${vertices.join('\n')}
        </vertices>
        <triangles>
${triangles.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;
}

// 16 segments × 4 rings = 128 side quads = 256 side triangles (all painted)
// Plus 32 cap triangles. Most side faces span layers → well above 100 boundary faces.
const cylinderModel = buildPaintedCylinder(16, 4, 5);

writeFileSync('e2e/fixtures/cube.3mf', buildZip(cubeModel));
console.log('Created e2e/fixtures/cube.3mf');

writeFileSync('e2e/fixtures/painted-cylinder.3mf', buildZip(cylinderModel));
console.log('Created e2e/fixtures/painted-cylinder.3mf');
