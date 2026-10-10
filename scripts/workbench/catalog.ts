import { ITEM_DEFINITIONS } from '@daoyou/game-content/items';
import { COMBAT_V6_SECT_DEFINITIONS } from '@daoyou/game-content/sects';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

export const registryFile = 'apps/web/src/components/ui/icons/registry.ts';
export const publicDirectory = 'apps/web/public';
export type Reference = { file: string; line: number };
export type Entry = {
  key: string;
  id: string;
  name: string;
  category: string;
  group: string;
  source: string;
  pointer: string[];
  icon?: string;
  image?: string;
  data: Record<string, unknown>;
  editable: boolean;
  revision: string;
};
export const digest = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');

export async function files(
  root: string,
  directory: string,
): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    if (
      entry.isSymbolicLink() ||
      ['dist', 'node_modules', '.git'].includes(entry.name)
    )
      continue;
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await files(root, file)));
    else result.push(file);
  }
  return result;
}

export function registryEntries(source: string) {
  const ast = ts.createSourceFile(
    registryFile,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const entries = new Map<
    string,
    { image: string; start: number; end: number }
  >();
  function visit(node: ts.Node) {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 2) {
      const [name, image] = node.elements;
      if (ts.isStringLiteral(name) && ts.isStringLiteral(image)) {
        entries.set(name.text, {
          image: image.text,
          start: image.getStart(ast),
          end: image.end,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return entries;
}

function category(file: string, pointer: string[]) {
  if (file.includes('/beasts/data/species.json')) return '灵兽';
  if (file.includes('/beasts/data/skills.json'))
    return pointer[0] === 'skills' ? '灵兽技能' : '技能家族';
  if (file.includes('/manuals/')) return '个人功法';
  if (file.includes('/world/')) return '地图节点';
  if (file.includes('/sects/')) {
    if (file.endsWith('/methods.json')) return '宗门心法';
    if (pointer.some((p) => /skills|passives|grantSkills/i.test(p)))
      return '宗门技能';
    return '宗门配置';
  }
  return '其他内容';
}

export async function buildCatalog(root: string) {
  const entries: Entry[] = [];
  const references = new Map<string, Reference[]>();
  const issues: { name: string; source: string; message: string }[] = [];
  const contentFiles = await files(root, 'packages/game-content/src');
  for (const file of contentFiles.filter(
    (f) => f.endsWith('.json') && !f.endsWith('.schema.json'),
  )) {
    const source = await readFile(path.join(root, file), 'utf8');
    try {
      const document: unknown = JSON.parse(source);
      function walk(value: unknown, pointer: string[]) {
        if (Array.isArray(value))
          return value.forEach((v, i) => walk(v, [...pointer, String(i)]));
        if (!value || typeof value !== 'object') return;
        const data = value as Record<string, unknown>;
        if (typeof data.id === 'string' && typeof data.name === 'string') {
          entries.push({
            key: `${file}#${pointer.join('/')}`,
            id: data.id,
            name: data.name,
            category: category(file, pointer),
            group: String(
              data.region ??
                data.realm ??
                (file.includes('/sects/')
                  ? pointer[0] === 'sects'
                    ? pointer[1]
                    : file.split('/').at(-1)?.split('-')[0]?.split('.')[0]
                  : file.split('/')[3]),
            ),
            source: file,
            pointer,
            data,
            revision: digest(source),
            icon: typeof data.icon === 'string' ? data.icon : undefined,
            editable: [
              '/beasts/data/species.json',
              '/beasts/data/skills.json',
              '/manuals/data/manual-pack.json',
            ].some((p) => file.endsWith(p)),
          });
        }
        Object.entries(data).forEach(([key, v]) => walk(v, [...pointer, key]));
      }
      walk(document, []);
      if (file.endsWith('/beasts/data/skills.json')) {
        const pack = document as {
          families: { normal: string; advanced: string }[];
          skills: { id: string; name: string }[];
        };
        pack.families.forEach((family, index) =>
          entries.push({
            key: `${file}#families/${index}`,
            id: `family:${family.normal}`,
            name: `${pack.skills.find((s) => s.id === family.normal)?.name ?? family.normal} / ${pack.skills.find((s) => s.id === family.advanced)?.name ?? family.advanced}`,
            category: '技能家族',
            group: '普通 / 高级',
            source: file,
            pointer: ['families', String(index)],
            data: family,
            editable: false,
            revision: digest(source),
          }),
        );
      }
    } catch (error) {
      issues.push({
        name: file,
        source: file,
        message: `无法解析：${String(error)}`,
      });
    }
  }
  const mapNodes = entries.filter((e) => e.category === '地图节点');
  for (const node of mapNodes) {
    if (typeof node.data.parent_id === 'string') {
      const parent = mapNodes.find((e) => e.id === node.data.parent_id);
      if (parent) node.group = parent.group;
    }
  }
  for (const item of ITEM_DEFINITIONS)
    entries.push({
      key: `item:${item.id}`,
      id: item.id,
      name: item.name,
      category: '物品定义',
      group: item.kind,
      source: 'packages/game-content/src/items/registry.ts',
      pointer: [],
      data: item as unknown as Record<string, unknown>,
      editable: false,
      revision: '',
    });
  for (const sect of Object.values(COMBAT_V6_SECT_DEFINITIONS))
    entries.push({
      key: `sect:${sect.id}`,
      id: sect.id,
      name: sect.name,
      category: '宗门',
      group: sect.id,
      source: `packages/game-content/src/sects/${sect.id}.ts`,
      pointer: [],
      data: sect as unknown as Record<string, unknown>,
      editable: false,
      revision: '',
    });
  const scanned = [
    ...contentFiles,
    ...(await files(root, 'packages/game-rules/src')),
    ...(await files(root, 'apps/web/src')),
    ...(await files(root, 'apps/api/src')),
  ].filter(
    (f) => /\.(ts|tsx|json)$/.test(f) && !/\.(test|spec|schema)\./.test(f),
  );
  for (const file of scanned) {
    const source = await readFile(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx')
        ? ts.ScriptKind.TSX
        : file.endsWith('.json')
          ? ts.ScriptKind.JSON
          : ts.ScriptKind.TS,
    );
    function visit(node: ts.Node) {
      if (ts.isStringLiteralLike(node)) {
        const list = references.get(node.text) ?? [];
        const line =
          ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
        if (!list.some((r) => r.file === file && r.line === line))
          list.push({ file, line });
        references.set(node.text, list);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  const registrySource = await readFile(path.join(root, registryFile), 'utf8');
  const icons = registryEntries(registrySource);
  const assets = await Promise.all(
    (await files(root, publicDirectory))
      .filter((f) =>
        /\.(webp|png|svg|jpe?g|gif|mp3|ogg|wav|m4a|woff2?|ttf)$/i.test(f),
      )
      .map(async (file) => {
        const url = `/${file.slice(publicDirectory.length + 1)}`;
        const names = [...icons]
          .filter(([, v]) => v.image === url)
          .map(([name]) => name);
        const refs = [
          ...(references.get(url) ?? []),
          ...names.flatMap((name) => references.get(`icon:${name}`) ?? []),
        ];
        return {
          path: file,
          url,
          names,
          bytes: (await stat(path.join(root, file))).size,
          references: refs,
        };
      }),
  );
  for (const [name, binding] of icons) {
    const asset = assets.find((a) => a.url === binding.image);
    if (!asset)
      issues.push({
        name: `icon:${name}`,
        source: registryFile,
        message: '注册素材文件不存在',
      });
    entries.push({
      key: `icon:${name}`,
      id: `icon:${name}`,
      name,
      category: '图标',
      group: name.split('-')[0],
      source: registryFile,
      pointer: [],
      icon: `icon:${name}`,
      image: binding.image,
      data: {
        name,
        path: binding.image,
        bytes: asset?.bytes,
        references: references.get(`icon:${name}`) ?? [],
      },
      editable: false,
      revision: digest(registrySource),
    });
  }
  for (const [value, refs] of references)
    if (
      value.startsWith('icon:') &&
      value.length > 5 &&
      !icons.has(value.slice(5))
    ) {
      issues.push({
        name: value,
        source: `${refs[0].file}:${refs[0].line}`,
        message: '未注册图标引用',
      });
    }
  const map = JSON.parse(
    await readFile(
      path.join(root, 'packages/game-content/src/world/data/map.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;
  return {
    entries,
    assets,
    issues,
    references: Object.fromEntries(references),
    registryRevision: digest(registrySource),
    world: map,
    generatedAt: new Date().toISOString(),
    scannedFiles: scanned.length,
  };
}
