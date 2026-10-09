import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { digest } from './catalog.ts';

export const atlasFile = 'packages/game-rules/src/world/mapAtlas.ts';
export const atlasImageFile =
  'apps/web/src/routes/game/map-v2/AtlasPhaserRuntime.ts';
const mapFile = 'packages/game-content/src/world/data/map.json';
type Point = [number, number];
type Region = { id: string; name: string; x: number; y: number };
type Location = {
  id: string;
  name: string;
  region?: string;
  parent_id?: string;
  sect_id?: string;
};
export type AtlasIndex = {
  revision: string;
  imageRevision: string;
  contentRevision: string;
  regions: Region[];
  images: Record<string, string>;
  imageRevisions: Record<string, string>;
  points: Record<string, Record<string, Point>>;
  nodes: (Location & { atlasRegion?: string })[];
  issues: string[];
};

function parse(source: string) {
  const ast = ts.createSourceFile(
    'atlas.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const values = new Map<string, ts.Expression>();
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      values.set(node.name.text, node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  function unwrap(node: ts.Expression): ts.Expression {
    return ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isParenthesizedExpression(node)
      ? unwrap(node.expression)
      : node;
  }
  function literal(node: ts.Expression): unknown {
    node = unwrap(node);
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (
      ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.MinusToken
    )
      return -Number(literal(node.operand));
    if (ts.isIdentifier(node) && values.has(node.text))
      return literal(values.get(node.text)!);
    if (ts.isArrayLiteralExpression(node))
      return node.elements.map((e) => literal(e));
    if (ts.isObjectLiteralExpression(node))
      return Object.fromEntries(
        node.properties.map((p) => {
          if (!ts.isPropertyAssignment(p))
            throw new Error('地图配置包含不支持的表达式');
          return [
            p.name.getText(ast).replace(/^['"]|['"]$/g, ''),
            literal(p.initializer),
          ];
        }),
      );
    throw new Error('地图配置必须使用静态字面量');
  }
  const value = <T>(name: string) => {
    const node = values.get(name);
    if (!node) throw new Error(`地图配置缺少 ${name}`);
    return literal(node) as T;
  };
  return { ast, values, unwrap, value };
}

export async function readAtlas(root: string): Promise<AtlasIndex> {
  const source = await readFile(path.join(root, atlasFile), 'utf8');
  const imageSource = await readFile(path.join(root, atlasImageFile), 'utf8');
  const content = await readFile(path.join(root, mapFile), 'utf8');
  const config = parse(source);
  const map = JSON.parse(content);
  const regions = config.value<Region[]>('ATLAS_REGIONS');
  const points = config.value<AtlasIndex['points']>('ATLAS_ANCHORS');
  points.world = Object.fromEntries(regions.map((r) => [r.id, [r.x, r.y]]));
  const byName = config.value<Record<string, string>>(
    'REGION_BY_BUSINESS_NAME',
  );
  const byNode = config.value<Record<string, string>>('REGION_BY_MAIN_NODE');
  const locations: Location[] = [
    ...map.map_nodes,
    ...map.satellite_nodes,
    ...map.sect_landmarks,
  ];
  const nodes = locations.map((n) => {
    const parent = n.region ? n : locations.find((p) => p.id === n.parent_id);
    return {
      ...n,
      atlasRegion: parent?.region
        ? (byNode[parent.id] ?? byName[parent.region])
        : undefined,
    };
  });
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) issues.push(`重复地点 ID：${n.id}`);
    ids.add(n.id);
    if (!n.atlasRegion) issues.push(`地点归属无法解析：${n.id}`);
    else if (!points[n.atlasRegion]?.[n.id]) issues.push(`缺少锚点：${n.id}`);
  }
  for (const [region, anchors] of Object.entries(points)) {
    for (const [id, point] of Object.entries(anchors)) {
      if (!point.every((v) => Number.isFinite(v) && v > 0 && v < 1))
        issues.push(`锚点越界：${id}`);
      if (
        region !== 'world' &&
        !nodes.some((n) => n.id === id && n.atlasRegion === region)
      )
        issues.push(`锚点归属错误或地点不存在：${region}/${id}`);
    }
    const entries = Object.entries(anchors);
    for (let i = 0; i < entries.length; i++)
      for (let j = i + 1; j < entries.length; j++) {
        const [a, p] = entries[i];
        const [b, q] = entries[j];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.025)
          issues.push(`锚点过近（需人工核对）：${a} / ${b}`);
      }
  }
  const images = parse(imageSource).value<Record<string, string>>('TEXTURES');
  const imageRevisions: Record<string, string> = {};
  for (const [region, image] of Object.entries(images)) {
    if (!image.startsWith('/assets/maps/') || image.includes('..')) {
      issues.push(`底图路径无效：${region}`);
      continue;
    }
    try {
      imageRevisions[region] = digest(
        await readFile(path.join(root, 'apps/web/public', image.slice(1))),
      );
    } catch {
      issues.push(`底图文件缺失：${region} / ${image}`);
    }
  }
  return {
    revision: digest(source),
    imageRevision: digest(imageSource),
    contentRevision: digest(content),
    regions,
    points,
    nodes,
    images,
    imageRevisions,
    issues,
  };
}

export function replaceAtlasPoints(
  source: string,
  region: string,
  points: Record<string, Point>,
) {
  const config = parse(source);
  const edits: { start: number; end: number; value: string }[] = [];
  if (region === 'world') {
    const array = config.unwrap(config.values.get('ATLAS_REGIONS')!);
    if (!ts.isArrayLiteralExpression(array))
      throw new Error('无法解析区域入口');
    for (const e of array.elements) {
      if (!ts.isObjectLiteralExpression(e)) throw new Error('无法解析区域入口');
      const props = e.properties.filter(ts.isPropertyAssignment);
      const id = props.find(
        (p) => p.name.getText(config.ast) === 'id',
      )?.initializer;
      if (!id || !ts.isStringLiteral(id) || !points[id.text])
        throw new Error('区域入口不完整');
      for (const [i, key] of ['x', 'y'].entries()) {
        const prop = props.find((p) => p.name.getText(config.ast) === key)!;
        edits.push({
          start: prop.initializer.getStart(config.ast),
          end: prop.initializer.end,
          value: String(points[id.text][i]),
        });
      }
    }
  } else {
    const object = config.unwrap(config.values.get('ATLAS_ANCHORS')!);
    if (!ts.isObjectLiteralExpression(object))
      throw new Error('无法解析锚点配置');
    const binding = object.properties
      .filter(ts.isPropertyAssignment)
      .find((p) => p.name.getText(config.ast) === region)?.initializer;
    if (!binding || !ts.isIdentifier(binding))
      throw new Error('地图区域未开放');
    const anchors = config.unwrap(config.values.get(binding.text)!);
    if (!ts.isObjectLiteralExpression(anchors))
      throw new Error('无法解析锚点配置');
    const members = anchors.properties.filter(ts.isPropertyAssignment);
    for (const p of members) {
      const id = p.name.getText(config.ast).replace(/^['"]|['"]$/g, '');
      const point = points[id];
      if (!point) throw new Error(`缺少锚点 ${id}`);
      edits.push({
        start: p.initializer.getStart(config.ast),
        end: p.initializer.end,
        value: `[${point.join(', ')}]`,
      });
    }
    const additions = Object.keys(points).filter(
      (id) =>
        !members.some(
          (p) => p.name.getText(config.ast).replace(/^['"]|['"]$/g, '') === id,
        ),
    );
    if (additions.length) {
      const last = members.at(-1);
      const prefix =
        last && !source.slice(last.end, anchors.end - 1).includes(',')
          ? ','
          : '';
      edits.push({
        start: anchors.end - 1,
        end: anchors.end - 1,
        value: `${prefix}\n${additions.map((id) => `  ${JSON.stringify(id)}: [${points[id].join(', ')}],`).join('\n')}\n`,
      });
    }
  }
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce((s, e) => s.slice(0, e.start) + e.value + s.slice(e.end), source);
}

export function replaceAtlasImage(
  source: string,
  region: string,
  image: string,
) {
  const config = parse(source);
  const textures = config.unwrap(config.values.get('TEXTURES')!);
  if (!ts.isObjectLiteralExpression(textures))
    throw new Error('无法解析底图配置');
  const target = textures.properties
    .filter(ts.isPropertyAssignment)
    .find((p) => p.name.getText(config.ast) === region)?.initializer;
  if (!target || !ts.isStringLiteral(target)) throw new Error('地图区域未开放');
  return (
    source.slice(0, target.getStart(config.ast)) +
    JSON.stringify(image) +
    source.slice(target.end)
  );
}
