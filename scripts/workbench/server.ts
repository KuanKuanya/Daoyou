import { loadBeastPacks } from '@daoyou/game-domain/beasts/authoring';
import { loadManualPack } from '@daoyou/game-domain/manuals/authoring';
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import {
  atlasFile,
  atlasImageFile,
  readAtlas,
  replaceAtlasImage,
  replaceAtlasPoints,
} from './atlas.ts';
import { audioFile, parseAudioManifest, readAudio } from './audio.ts';
import {
  buildCatalog,
  digest,
  publicDirectory,
  registryEntries,
  registryFile,
} from './catalog.ts';

export function workbenchMiddleware(root: string) {
  let busy = false;
  const history: { file: string; before: string; after: string }[] = [];
  async function atomicWrite(file: string, value: string) {
    const destination = path.join(root, file);
    const temporary = `${destination}.workbench.tmp`;
    await writeFile(temporary, value);
    await rename(temporary, destination);
  }
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    if (!req.url?.startsWith('/__workbench/')) return next();
    const host = req.headers.host;
    if (
      host !== '127.0.0.1:5180' ||
      (req.headers.origin && req.headers.origin !== `http://${host}`) ||
      (req.method !== 'GET' && req.headers.origin !== `http://${host}`)
    ) {
      res.writeHead(403).end('Local same-origin requests only');
      return;
    }
    const send = (status: number, value: unknown) =>
      res
        .writeHead(status, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        })
        .end(JSON.stringify(value));
    const mutation = req.method === 'POST';
    if (mutation && busy) {
      send(409, { error: '另一项修改正在保存，请稍后重试' });
      return;
    }
    if (mutation) busy = true;
    try {
      if (req.method === 'GET' && req.url === '/__workbench/catalog') {
        const catalog = await buildCatalog(root);
        const atlas = await readAtlas(root);
        for (const entry of catalog.entries) {
          if (entry.category === '地图节点') {
            const region = atlas.nodes.find(
              (n) => n.id === entry.id,
            )?.atlasRegion;
            entry.group =
              atlas.regions.find((r) => r.id === region)?.name ?? entry.group;
          }
        }
        send(200, {
          ...catalog,
          atlas,
          audio: await readAudio(root),
          undoAvailable: history.length > 0,
        });
        return;
      }
      if (!mutation) {
        send(404, { error: 'Unknown operation' });
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) throw new Error('请求超过 8 MiB');
        chunks.push(Buffer.from(chunk));
      }
      const input = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      ) as Record<string, unknown>;
      if (req.url === '/__workbench/undo') {
        const last = history.at(-1);
        if (!last) throw new Error('没有可撤销的工作台修改');
        if (
          digest(await readFile(path.join(root, last.file))) !==
          digest(last.after)
        )
          throw new Error('文件已被外部修改，不能覆盖撤销');
        await atomicWrite(last.file, last.before);
        history.pop();
        send(200, { saved: last.file });
        return;
      }
      const catalog = await buildCatalog(root);
      if (req.url === '/__workbench/audio') {
        const before = await readFile(path.join(root, audioFile), 'utf8');
        if (input.revision !== digest(before))
          throw new Error('音乐配置已变化，请刷新后重新编辑');
        const manifest = parseAudioManifest(input.manifest);
        for (const track of manifest.tracks) {
          if (!catalog.assets.some((asset) => asset.url === track.src))
            throw new Error(`音频素材不存在：${track.name}`);
        }
        const after = `${JSON.stringify(manifest, null, 2)}\n`;
        if (
          digest(await readFile(path.join(root, audioFile))) !== digest(before)
        )
          throw new Error('音乐配置已被外部修改，请刷新');
        await atomicWrite(audioFile, after);
        history.push({ file: audioFile, before, after });
        send(200, { saved: audioFile });
        return;
      }
      if (
        req.url === '/__workbench/atlas' ||
        req.url === '/__workbench/atlas-image'
      ) {
        const atlas = await readAtlas(root);
        const region = String(input.region);
        if (!atlas.points[region] || !atlas.images[region])
          throw new Error('地图区域未开放');
        if (input.contentRevision !== atlas.contentRevision)
          throw new Error('地点设定已变化，请刷新后重新编辑');
        const imageOperation = req.url.endsWith('atlas-image');
        if (
          !atlas.imageRevisions[region] ||
          input.imageContentRevision !== atlas.imageRevisions[region]
        )
          throw new Error('底图素材内容已变化，请刷新后重新校准');
        if (imageOperation && input.atlasRevision !== atlas.revision)
          throw new Error('锚点配置已变化，请刷新后重新核对底图');
        const file = imageOperation ? atlasImageFile : atlasFile;
        const before = await readFile(path.join(root, file), 'utf8');
        if (input.revision !== digest(before))
          throw new Error('地图配置已变化，请刷新后重新编辑');
        let after: string;
        if (imageOperation) {
          const image = String(input.image);
          if (
            !catalog.assets.some(
              (a) =>
                a.url === image &&
                image.startsWith('/assets/maps/') &&
                /\.(png|webp)$/i.test(image),
            )
          )
            throw new Error('请选择现有 PNG / WebP 地图素材');
          after = replaceAtlasImage(before, region, image);
        } else {
          if (input.imageRevision !== atlas.imageRevision)
            throw new Error('底图绑定已变化，请刷新后重新校准');
          const points = input.points as Record<string, [number, number]>;
          const expected =
            region === 'world'
              ? atlas.regions.map((r) => r.id)
              : atlas.nodes
                  .filter((n) => n.atlasRegion === region)
                  .map((n) => n.id);
          if (
            !points ||
            typeof points !== 'object' ||
            Array.isArray(points) ||
            Object.keys(points).length !== expected.length ||
            expected.some((id) => !Object.hasOwn(points, id))
          )
            throw new Error('地点锚点必须完整且与当前区域一致');
          for (const point of Object.values(points)) {
            if (
              !Array.isArray(point) ||
              point.length !== 2 ||
              !point.every(
                (v) =>
                  typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1,
              )
            )
              throw new Error('坐标必须为 0 与 1 之间的有限数值');
          }
          after = replaceAtlasPoints(before, region, points);
        }
        const current = await readAtlas(root);
        if (
          current.revision !== atlas.revision ||
          current.imageRevision !== atlas.imageRevision ||
          current.imageRevisions[region] !== atlas.imageRevisions[region] ||
          current.contentRevision !== atlas.contentRevision
        )
          throw new Error('地图源文件已被外部修改，请刷新');
        await atomicWrite(file, after);
        history.push({ file, before, after });
        send(200, { saved: file });
        return;
      }
      if (req.url === '/__workbench/icon') {
        const before = await readFile(path.join(root, registryFile), 'utf8');
        if (input.revision !== digest(before))
          throw new Error('图标注册表已变化，请刷新后重新编辑');
        const entry = registryEntries(before).get(String(input.name));
        if (!entry) throw new Error('图标不存在');
        let image = String(input.image ?? '');
        if (typeof input.upload === 'string') {
          const buffer = Buffer.from(input.upload, 'base64');
          const png = buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          const webp =
            buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP';
          if ((!png && !webp) || buffer.length > 5 * 1024 * 1024)
            throw new Error('仅支持不超过 5 MiB 的 PNG / WebP 图片');
          image = `/assets/icons/workbench-${digest(buffer).slice(0, 16)}.${png ? 'png' : 'webp'}`;
          await writeFile(
            path.join(root, publicDirectory, image.slice(1)),
            buffer,
            { flag: 'wx' },
          ).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'EEXIST') throw error;
          });
        } else if (
          !catalog.assets.some(
            (a) =>
              a.url === image &&
              image.startsWith('/assets/icons/') &&
              /\.(png|webp|svg)$/i.test(image),
          )
        )
          throw new Error('请选择已存在的图标素材');
        const after =
          before.slice(0, entry.start) +
          JSON.stringify(image) +
          before.slice(entry.end);
        await atomicWrite(registryFile, after);
        history.push({ file: registryFile, before, after });
        send(200, { saved: registryFile });
        return;
      }
      if (req.url === '/__workbench/content') {
        const entry = catalog.entries.find(
          (e) => e.key === input.key && e.editable,
        );
        if (!entry) throw new Error('此内容暂不支持写入');
        const before = await readFile(path.join(root, entry.source), 'utf8');
        if (input.revision !== digest(before))
          throw new Error('源文件已变化，请刷新后重新编辑');
        const document = JSON.parse(before);
        let target = document;
        for (const key of entry.pointer) target = target[key];
        const patch = input.patch as Record<string, unknown>;
        if (!patch || typeof patch !== 'object')
          throw new Error('缺少修改字段');
        for (const [field, value] of Object.entries(patch)) {
          if (
            !['name', 'description', 'flavorText', 'icon'].includes(field) ||
            !(field in target) ||
            typeof value !== 'string' ||
            value.length > 2000 ||
            !value.trim()
          )
            throw new Error('不支持的字段或字段内容无效');
          if (
            field === 'icon' &&
            !catalog.entries.some(
              (e) => e.category === '图标' && e.id === value,
            )
          )
            throw new Error('图标未注册');
          target[field] = value;
        }
        const read = async (name: string) =>
          JSON.parse(
            await readFile(
              path.join(
                root,
                `packages/game-content/src/beasts/data/${name}.json`,
              ),
              'utf8',
            ),
          );
        if (entry.category === '个人功法') loadManualPack(document);
        else
          loadBeastPacks(
            entry.category === '灵兽' ? document : await read('species'),
            entry.category === '灵兽技能' ? document : await read('skills'),
            await read('progression'),
          );
        if (typeof document.contentRevision === 'number')
          document.contentRevision += 1;
        const after = `${JSON.stringify(document, null, 2)}\n`;
        await atomicWrite(entry.source, after);
        history.push({ file: entry.source, before, after });
        send(200, { saved: entry.source });
        return;
      }
      send(404, { error: 'Unknown operation' });
    } catch (error) {
      send(409, {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (mutation) busy = false;
    }
  };
}
