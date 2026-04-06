/** 3MF ZIP archive reading and writing. */

import { unzipSync, zipSync, strToU8 } from 'fflate';
import {
  hexToFilament,
  isSubPainted,
  decodeBisectionTree,
  type BisectionNode,
} from './encoding';

// ── Namespaces ──────────────────────────────────────────────────────────────

export const NS_CORE = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
export const NS_SLIC3RPE = 'http://schemas.slic3r.org/3mf/2017/06';
export const NS_P = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';

// ── Static XML templates ────────────────────────────────────────────────────

const CONTENT_TYPES_XML = `\
<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;

const RELS_XML = `\
<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0"
    Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

interface ConfigXmlOptions {
  defaultFilament: number;
  filamentColors?: string[];
  layerHeight?: number;
}

function configXml(options: ConfigXmlOptions): string {
  const { defaultFilament, filamentColors, layerHeight } = options;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n`;
  xml += `  <object id="1">\n`;
  xml += `    <metadata type="object" key="extruder" value="${defaultFilament}"/>\n`;
  xml += `  </object>\n`;

  if (layerHeight !== undefined) {
    xml += `  <plate>\n`;
    xml += `    <metadata key="layer_height" value="${layerHeight}"/>\n`;
    xml += `    <metadata key="initial_layer_height" value="${layerHeight * 2}"/>\n`;
    xml += `  </plate>\n`;
  }

  if (filamentColors && filamentColors.length > 1) {
    for (let i = 1; i < filamentColors.length; i++) {
      xml += `  <filament id="${i}">\n`;
      xml += `    <metadata key="display_color" value="${filamentColors[i]}"/>\n`;
      xml += `  </filament>\n`;
    }
  }

  xml += `</config>`;
  return xml;
}

// ── Error ────────────────────────────────────────────────────────────────────

export class ThreeMFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThreeMFError';
  }
}

// ── Data types ──────────────────────────────────────────────────────────────

export interface ThreeMFData {
  vertices: Float64Array;   // flat (V*3): x0,y0,z0,x1,y1,z1,...
  faces: Uint32Array;       // flat (F*3): v0,v1,v2 per triangle
  vertexCount: number;
  faceCount: number;
  faceColors: Map<number, number>;  // face_index → 1-based filament
  defaultFilament: number;
  filamentColors?: string[];
  layerHeight?: number;
  initialLayerHeight?: number;
  dither3dConfig?: Record<string, unknown>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Find the most common leaf state in a bisection tree via iterative DFS. */
export function dominantFilament(tree: BisectionNode): number {
  const counts = new Map<number, number>();
  const stack: BisectionNode[] = [tree];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.kind === 'leaf') {
      counts.set(node.state, (counts.get(node.state) ?? 0) + 1);
    } else {
      for (const child of node.children) {
        stack.push(child);
      }
    }
  }
  let bestState = 0;
  let bestCount = -1;
  for (const [state, count] of counts) {
    if (count > bestCount || (count === bestCount && state > bestState)) {
      bestState = state;
      bestCount = count;
    }
  }
  return bestState;
}

/** Decode a UTF-8 Uint8Array to string. */
function decodeText(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

/** Query elements by namespace + local name from a parent element. */
function getElementsByNS(parent: Element, ns: string, localName: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(ns, localName));
}

/** Get first element by namespace + local name, or null. */
function getElementByNS(parent: Element, ns: string, localName: string): Element | null {
  const list = parent.getElementsByTagNameNS(ns, localName);
  return list.length > 0 ? list[0] : null;
}

// ── Read ────────────────────────────────────────────────────────────────────

/**
 * Find the `<mesh>` element, resolving component references if needed.
 *
 * BambuStudio uses a component-based layout where the main 3dmodel.model
 * contains `<object><components><component p:path="..."/></object>` and the
 * actual mesh lives in a separate .model file inside the ZIP.
 */
function findMeshElement(
  root: Element,
  entries: Record<string, Uint8Array>,
): Element {
  const parser = new DOMParser();

  // Gather all <object> elements
  let objects = getElementsByNS(root, NS_CORE, 'object');
  // If filtering by type="model" yields results, prefer those
  const modelObjects = objects.filter(o => o.getAttribute('type') === 'model');
  if (modelObjects.length > 0) {
    objects = modelObjects;
  }
  if (objects.length === 0) {
    throw new ThreeMFError('No <object> elements found in 3MF model');
  }

  // Find objects that contain a direct <mesh>
  const meshObjects = objects.filter(o => getElementByNS(o, NS_CORE, 'mesh') !== null);
  if (meshObjects.length > 1) {
    throw new ThreeMFError(
      `Multiple objects with meshes found (${meshObjects.length}). ` +
      'Only single-object 3MF files are supported in this version.',
    );
  }
  if (meshObjects.length === 1) {
    return getElementByNS(meshObjects[0], NS_CORE, 'mesh')!;
  }

  // No direct mesh — look for component references
  for (const obj of objects) {
    const componentsEl = getElementByNS(obj, NS_CORE, 'components');
    if (!componentsEl) continue;
    for (const comp of getElementsByNS(componentsEl, NS_CORE, 'component')) {
      let compPath = comp.getAttributeNS(NS_P, 'path');
      if (!compPath) continue;
      // Normalize: strip leading slash
      compPath = compPath.replace(/^\//, '');
      const compBytes = entries[compPath];
      if (!compBytes) continue;
      try {
        const compDoc = parser.parseFromString(decodeText(compBytes), 'application/xml');
        const compRoot = compDoc.documentElement;
        for (const compObj of getElementsByNS(compRoot, NS_CORE, 'object')) {
          const meshEl = getElementByNS(compObj, NS_CORE, 'mesh');
          if (meshEl) {
            console.warn(
              'Using first component mesh found; multi-component files may lose geometry',
            );
            return meshEl;
          }
        }
      } catch {
        continue;
      }
    }
  }

  throw new ThreeMFError('No <mesh> element found in object or its components');
}

/**
 * Parse default filament from slicer config metadata if present.
 *
 * Checks Slic3r_PE_model.config (PrusaSlicer) and model_settings.config
 * (BambuStudio/OrcaSlicer).
 */
function parseDefaultFilament(entries: Record<string, Uint8Array>): number {
  const parser = new DOMParser();
  for (const name of Object.keys(entries)) {
    const lower = name.toLowerCase();
    if (lower.includes('slic3r_pe_model.config') || lower.includes('model_settings.config')) {
      try {
        const configDoc = parser.parseFromString(decodeText(entries[name]), 'application/xml');
        const metaEls = configDoc.getElementsByTagName('metadata');
        for (let i = 0; i < metaEls.length; i++) {
          const meta = metaEls[i];
          if (meta.getAttribute('key') === 'extruder') {
            const val = parseInt(meta.getAttribute('value') ?? '1', 10);
            if (!isNaN(val)) return val;
          }
        }
      } catch {
        continue;
      }
    }
  }
  return 1;
}

/**
 * Parse filament colors and layer height from slicer config metadata.
 */
function parseSlicerMetadata(entries: Record<string, Uint8Array>): {
  filamentColors?: string[];
  layerHeight?: number;
  initialLayerHeight?: number;
} {
  const parser = new DOMParser();
  const result: { filamentColors?: string[]; layerHeight?: number; initialLayerHeight?: number } = {};

  for (const name of Object.keys(entries)) {
    const lower = name.toLowerCase();
    if (!lower.includes('slic3r_pe_model.config') && !lower.includes('model_settings.config')) {
      continue;
    }

    try {
      const configDoc = parser.parseFromString(decodeText(entries[name]), 'application/xml');

      // Parse filament colors
      const filamentEls = configDoc.getElementsByTagName('filament');
      if (filamentEls.length > 0) {
        const colors: string[] = [];
        for (let i = 0; i < filamentEls.length; i++) {
          const el = filamentEls[i];
          const id = parseInt(el.getAttribute('id') ?? '0', 10);
          const metaEls = el.getElementsByTagName('metadata');
          for (let j = 0; j < metaEls.length; j++) {
            if (metaEls[j].getAttribute('key') === 'display_color') {
              const color = metaEls[j].getAttribute('value');
              if (color && id > 0) {
                while (colors.length <= id) colors.push('');
                colors[id] = color;
              }
            }
          }
        }
        if (colors.length > 0) {
          result.filamentColors = colors;
        }
      }

      // Parse layer height from plate metadata
      const plateEls = configDoc.getElementsByTagName('plate');
      for (let i = 0; i < plateEls.length; i++) {
        const metaEls = plateEls[i].getElementsByTagName('metadata');
        for (let j = 0; j < metaEls.length; j++) {
          const key = metaEls[j].getAttribute('key');
          const val = metaEls[j].getAttribute('value');
          if (key === 'layer_height' && val) {
            const lh = parseFloat(val);
            if (!isNaN(lh)) result.layerHeight = lh;
          }
          if (key === 'initial_layer_height' && val) {
            const ilh = parseFloat(val);
            if (!isNaN(ilh)) result.initialLayerHeight = ilh;
          }
        }
      }
    } catch {
      continue;
    }
  }

  return result;
}

/**
 * Read a 3MF file and extract geometry + per-triangle filament assignments.
 *
 * @param data - Raw bytes of the .3mf ZIP file
 * @param flatten - If true, flatten sub-painted triangles to dominant filament.
 *                  If false, throw ThreeMFError on sub-painted triangles.
 */
export function read3mf(data: ArrayBuffer, flatten = false): ThreeMFData {
  // Unzip
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(data));
  } catch (e) {
    throw new ThreeMFError(`Cannot open 3MF file: ${e instanceof Error ? e.message : e}`);
  }

  // Find model file
  let modelPath: string | undefined;
  for (const name of Object.keys(entries)) {
    if (name.toLowerCase().endsWith('3dmodel.model')) {
      modelPath = name;
      break;
    }
  }
  if (!modelPath) {
    throw new ThreeMFError('No 3dmodel.model found in 3MF archive');
  }

  // Parse XML
  const parser = new DOMParser();
  const modelText = decodeText(entries[modelPath]);
  const doc = parser.parseFromString(modelText, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror');
  if (parserError.length > 0) {
    throw new ThreeMFError(`Invalid XML in ${modelPath}: ${parserError[0].textContent}`);
  }
  const root = doc.documentElement;

  // Find mesh element (resolving components if needed)
  const meshEl = findMeshElement(root, entries);

  // ── Parse vertices ──────────────────────────────────────────────────────

  const verticesEl = getElementByNS(meshEl, NS_CORE, 'vertices');
  if (!verticesEl) {
    throw new ThreeMFError('No <vertices> element found');
  }

  const vertexEls = getElementsByNS(verticesEl, NS_CORE, 'vertex');
  const vertexCount = vertexEls.length;
  const vertices = new Float64Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const v = vertexEls[i];
    const xAttr = v.getAttribute('x');
    const yAttr = v.getAttribute('y');
    const zAttr = v.getAttribute('z');
    if (xAttr === null || yAttr === null || zAttr === null) {
      throw new ThreeMFError(
        `Vertex ${i}: missing required attribute(s) ` +
        `(x=${xAttr !== null ? 'present' : 'MISSING'}, ` +
        `y=${yAttr !== null ? 'present' : 'MISSING'}, ` +
        `z=${zAttr !== null ? 'present' : 'MISSING'})`,
      );
    }
    vertices[i * 3] = parseFloat(xAttr);
    vertices[i * 3 + 1] = parseFloat(yAttr);
    vertices[i * 3 + 2] = parseFloat(zAttr);
  }

  // ── Parse triangles ─────────────────────────────────────────────────────

  const trianglesEl = getElementByNS(meshEl, NS_CORE, 'triangles');
  if (!trianglesEl) {
    throw new ThreeMFError('No <triangles> element found');
  }

  const triangleEls = getElementsByNS(trianglesEl, NS_CORE, 'triangle');
  const faceCount = triangleEls.length;
  const faces = new Uint32Array(faceCount * 3);
  const faceColors = new Map<number, number>();

  for (let i = 0; i < faceCount; i++) {
    const tri = triangleEls[i];
    const v1Attr = tri.getAttribute('v1');
    const v2Attr = tri.getAttribute('v2');
    const v3Attr = tri.getAttribute('v3');
    if (v1Attr === null || v2Attr === null || v3Attr === null) {
      throw new ThreeMFError(
        `Face ${i}: missing required attribute(s) ` +
        `(v1=${v1Attr !== null ? 'present' : 'MISSING'}, ` +
        `v2=${v2Attr !== null ? 'present' : 'MISSING'}, ` +
        `v3=${v3Attr !== null ? 'present' : 'MISSING'})`,
      );
    }
    const v1 = parseInt(v1Attr, 10);
    const v2 = parseInt(v2Attr, 10);
    const v3 = parseInt(v3Attr, 10);
    if (v1 < 0 || v1 >= vertexCount || v2 < 0 || v2 >= vertexCount || v3 < 0 || v3 >= vertexCount) {
      throw new ThreeMFError(
        `Face ${i}: vertex index out of bounds ` +
        `(v1=${v1}, v2=${v2}, v3=${v3}, max=${vertexCount - 1})`,
      );
    }
    faces[i * 3] = v1;
    faces[i * 3 + 1] = v2;
    faces[i * 3 + 2] = v3;

    // Check for color attributes
    let hexStr = tri.getAttributeNS(NS_SLIC3RPE, 'mmu_segmentation');
    if (!hexStr) {
      hexStr = tri.getAttribute('paint_color');
    }

    if (hexStr && hexStr.trim()) {
      hexStr = hexStr.trim();
      if (isSubPainted(hexStr)) {
        if (!flatten) {
          throw new ThreeMFError(
            `Sub-painted triangle detected at face ${i}: '${hexStr}'. ` +
            'Use flatten option to simplify to dominant filament.',
          );
        }
        // Flatten: decode tree and take dominant (most frequent) filament
        try {
          const tree = decodeBisectionTree(hexStr);
          const dominant = dominantFilament(tree);
          if (dominant > 0) {
            faceColors.set(i, dominant);
          }
        } catch (e) {
          throw new ThreeMFError(`Face ${i}: ${e instanceof Error ? e.message : e}`);
        }
      } else {
        try {
          faceColors.set(i, hexToFilament(hexStr));
        } catch (e) {
          throw new ThreeMFError(`Face ${i}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }

  // Parse default filament
  const defaultFilament = parseDefaultFilament(entries);

  // Parse additional metadata
  const slicerMeta = parseSlicerMetadata(entries);
  let dither3dConfig: Record<string, unknown> | undefined;

  // Check for dither3d config JSON
  for (const name of Object.keys(entries)) {
    if (name.toLowerCase() === 'metadata/dither3d.config.json') {
      try {
        dither3dConfig = JSON.parse(decodeText(entries[name])) as Record<string, unknown>;
      } catch {
        // Silently ignore malformed config
      }
      break;
    }
  }

  return {
    vertices,
    faces,
    vertexCount,
    faceCount,
    faceColors,
    defaultFilament,
    ...slicerMeta,
    dither3dConfig,
  };
}

// ── Write ───────────────────────────────────────────────────────────────────

/**
 * Write a 3MF file with per-triangle filament slot assignments.
 *
 * @param vertices - Flat Float64Array (V*3) of vertex coordinates
 * @param faces - Flat Uint32Array (F*3) of vertex indices per triangle
 * @param vertexCount - Number of vertices
 * @param faceCount - Number of triangles
 * @param faceColors - Hex string per face (empty string = default filament)
 * @param defaultFilament - Default filament for the object (1-based)
 * @param targetFormat - "prusaslicer", "bambu", or "both"
 * @returns Uint8Array of the ZIP bytes
 */
export interface Write3mfMetadata {
  config?: Record<string, unknown>;
  filamentColors?: string[];
  layerHeight?: number;
}

export function write3mf(
  vertices: Float64Array,
  faces: Uint32Array,
  vertexCount: number,
  faceCount: number,
  faceColors: string[],
  defaultFilament = 1,
  targetFormat = 'both',
  metadata?: Write3mfMetadata,
): Uint8Array {
  if (faceColors.length !== faceCount) {
    throw new ThreeMFError(
      `faceColors length (${faceColors.length}) != faceCount (${faceCount})`,
    );
  }
  // Validate vertices are finite
  for (let i = 0; i < vertices.length; i++) {
    if (!isFinite(vertices[i])) {
      throw new ThreeMFError('Vertices contain NaN or Inf values');
    }
  }

  const writeSlic3rpe = targetFormat === 'prusaslicer' || targetFormat === 'both';
  const writePaint = targetFormat === 'bambu' || targetFormat === 'both';

  // Build 3dmodel.model XML via DOM API
  const doc = document.implementation.createDocument(NS_CORE, 'model', null);
  const root = doc.documentElement;
  root.setAttribute('unit', 'millimeter');
  root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', NS_CORE);
  if (writeSlic3rpe) {
    root.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:slic3rpe', NS_SLIC3RPE);
  }
  root.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', 'en-US');

  const resources = doc.createElementNS(NS_CORE, 'resources');
  root.appendChild(resources);

  const obj = doc.createElementNS(NS_CORE, 'object');
  obj.setAttribute('id', '1');
  obj.setAttribute('type', 'model');
  resources.appendChild(obj);

  const meshEl = doc.createElementNS(NS_CORE, 'mesh');
  obj.appendChild(meshEl);

  // Vertices
  const vertsEl = doc.createElementNS(NS_CORE, 'vertices');
  meshEl.appendChild(vertsEl);
  for (let i = 0; i < vertexCount; i++) {
    const vertex = doc.createElementNS(NS_CORE, 'vertex');
    vertex.setAttribute('x', formatCoord(vertices[i * 3]));
    vertex.setAttribute('y', formatCoord(vertices[i * 3 + 1]));
    vertex.setAttribute('z', formatCoord(vertices[i * 3 + 2]));
    vertsEl.appendChild(vertex);
  }

  // Triangles
  const trisEl = doc.createElementNS(NS_CORE, 'triangles');
  meshEl.appendChild(trisEl);
  for (let i = 0; i < faceCount; i++) {
    const triangle = doc.createElementNS(NS_CORE, 'triangle');
    triangle.setAttribute('v1', String(faces[i * 3]));
    triangle.setAttribute('v2', String(faces[i * 3 + 1]));
    triangle.setAttribute('v3', String(faces[i * 3 + 2]));

    const hexCode = faceColors[i];
    if (hexCode) {
      if (writeSlic3rpe) {
        triangle.setAttributeNS(NS_SLIC3RPE, 'slic3rpe:mmu_segmentation', hexCode);
      }
      if (writePaint) {
        triangle.setAttribute('paint_color', hexCode);
      }
    }
    trisEl.appendChild(triangle);
  }

  // Build element
  const build = doc.createElementNS(NS_CORE, 'build');
  root.appendChild(build);
  const item = doc.createElementNS(NS_CORE, 'item');
  item.setAttribute('objectid', '1');
  item.setAttribute('transform', '1 0 0 0 1 0 0 0 1 0 0 0');
  item.setAttribute('printable', '1');
  build.appendChild(item);

  // Serialize XML
  const serializer = new XMLSerializer();
  const xmlString = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(doc);

  // Pack into ZIP
  const zipEntries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels': strToU8(RELS_XML),
    '3D/3dmodel.model': strToU8(xmlString),
    'Metadata/Slic3r_PE_model.config': strToU8(configXml({
      defaultFilament,
      filamentColors: metadata?.filamentColors,
      layerHeight: metadata?.layerHeight,
    })),
  };

  if (metadata?.config) {
    zipEntries['Metadata/dither3d.config.json'] = strToU8(
      JSON.stringify(metadata.config, null, 2),
    );
  }

  return zipSync(zipEntries);
}

/** Format a coordinate value similar to Python's `:.9g`. */
function formatCoord(value: number): string {
  // toPrecision(9) matches Python's :.9g formatting
  const s = value.toPrecision(9);
  // Remove trailing zeros after decimal point, and trailing decimal point
  if (s.includes('.')) {
    return s.replace(/\.?0+$/, '');
  }
  return s;
}
