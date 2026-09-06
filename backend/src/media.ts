import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Store } from './store.js';
import { ApiError } from './errors.js';
import type { Media } from '../../shared/types.js';

function detect(buffer: Buffer, originalName: string): { mime: string; extension: string } | null {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', extension: 'png' };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { mime: 'image/jpeg', extension: 'jpg' };
  if (/^GIF8[79]a/.test(buffer.subarray(0, 6).toString('ascii'))) return { mime: 'image/gif', extension: 'gif' };
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { mime: 'image/webp', extension: 'webp' };
  if (buffer.subarray(0, 5).toString() === '%PDF-') return { mime: 'application/pdf', extension: 'pdf' };
  if (originalName.toLowerCase().endsWith('.txt') && !buffer.includes(0)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); return { mime: 'text/plain', extension: 'txt' }; } catch { return null; }
  }
  return null;
}
export function uploadMedia(store: Store, files: Express.Multer.File[], actor: string): Media[] {
  const validated = files.map(file => {
    const format = detect(file.buffer, file.originalname);
    if (!format || !file.size) throw new ApiError(400, 'UNSUPPORTED_MEDIA', `${file.originalname}：只支持 PNG、JPEG、GIF、WebP、PDF 和 UTF-8 TXT；文件内容需与格式一致`);
    return { file, format, hash: createHash('sha256').update(file.buffer).digest('hex') };
  });
  const createdPaths: string[] = [];
  try {
    return store.transaction(() => validated.map(({ file, format, hash }) => {
      const existing = store.db.prepare('SELECT * FROM media WHERE sha256=?').get(hash);
      if (existing) return store.media(existing as Record<string, string | number | null>);
      const id = randomUUID();
      const filename = `${id}.${format.extension}`;
      const originalName = basename(file.originalname.replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || filename;
      const path = join(store.config.uploadDir, filename);
      writeFileSync(path, file.buffer, { flag: 'wx', mode: 0o600 });
      createdPaths.push(path);
      store.db.prepare('INSERT INTO media VALUES(?,?,?,?,?,?,?)').run(id, originalName, filename, format.mime, file.size, hash, new Date().toISOString());
      store.audit(actor, 'upload-media', id, format.mime);
      return store.media(store.mediaRow(id)!);
    }));
  } catch (error) {
    for (const path of createdPaths) { try { unlinkSync(path); } catch { /* Retain the original error. */ } }
    throw error;
  }
}
