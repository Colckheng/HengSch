import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface VoiceModelStatus {
  state: 'ready' | 'missing' | 'downloading' | 'error';
  /** 0..1，downloading 时有效 */
  progress: number;
  /** whisper-cli.exe 是否随包/随仓库就位 */
  exeReady: boolean;
  error?: string;
}

export interface VoiceServiceDeps {
  /** 打包：process.resourcesPath/whisper；dev：仓库 resources/whisper */
  bundledDir: string;
  /** %APPDATA%/hengsch/whisper（模型下载目标） */
  userDataDir: string;
  push: (channel: string, payload: unknown) => void;
}

/** small 只有 q5_1/q8_0/fp16，设计的 q5_0 不存在（§12 开放项实测后固化） */
const MODEL_FILE = 'ggml-small-q5_1.bin';
const MODEL_URL = 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin';
const MODEL_SHA256 = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb';
const MODEL_SIZE = 190085487;
const EXE_FILE = 'whisper-cli.exe';
const MAX_VOICE_BYTES = 10 * 1024 * 1024;
/** 设计「音频×3 封顶 30s」漏算 190MB 模型加载，补 10s 下限 */
const MIN_TIMEOUT_S = 10;
const MAX_TIMEOUT_S = 30;
const PROGRESS_CHANNEL = 'ai:voice-model:progress';
const TRANSCRIBE_CHANNEL = 'ai:voice-transcribe-progress';
/** whisper 默认仅 4 线程；逻辑核一半（本机 8）实测 11s 夹具 8s→5s */
const WHISPER_THREADS = Math.max(4, Math.floor(os.cpus().length / 2));

let deps: VoiceServiceDeps | null = null;
let downloadActive = false;
let downloadProgress = 0;
let downloadError: string | null = null;
const verified = new Map<string, boolean>();

export function initVoiceService(next: VoiceServiceDeps): void {
  deps = next;
  downloadActive = false;
  downloadProgress = 0;
  downloadError = null;
  verified.clear();
}

function requireDeps(): VoiceServiceDeps {
  if (!deps) throw new Error('语音服务未初始化');
  return deps;
}

function exePath(d: VoiceServiceDeps): string {
  return path.join(d.bundledDir, EXE_FILE);
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** 全量 sha 校验，按 路径+mtime+size 记忆，一会话只算一次 */
async function verifyModel(file: string): Promise<boolean> {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return false;
  }
  if (stat.size !== MODEL_SIZE) return false;
  const key = `${file}|${stat.size}|${stat.mtimeMs}`;
  const cached = verified.get(key);
  if (cached !== undefined) return cached;
  const ok = (await sha256File(file)) === MODEL_SHA256;
  verified.set(key, ok);
  return ok;
}

async function resolveModel(d: VoiceServiceDeps): Promise<{ file: string; valid: boolean } | null> {
  const candidates = [path.join(d.bundledDir, MODEL_FILE), path.join(d.userDataDir, MODEL_FILE)];
  let corrupt = false;
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    if (await verifyModel(file)) return { file, valid: true };
    corrupt = true;
  }
  return corrupt ? { file: candidates[0], valid: false } : null;
}

export async function getVoiceModelStatus(): Promise<VoiceModelStatus> {
  const d = requireDeps();
  const exeReady = fs.existsSync(exePath(d));
  if (downloadActive) return { state: 'downloading', progress: downloadProgress, exeReady };
  const model = await resolveModel(d);
  if (model?.valid) return { state: 'ready', progress: 1, exeReady };
  if (model && !model.valid) return { state: 'error', progress: 0, exeReady, error: '模型校验失败' };
  if (downloadError) return { state: 'error', progress: 0, exeReady, error: downloadError };
  return { state: 'missing', progress: 0, exeReady };
}

function emitStatus(): void {
  if (!deps) return;
  void getVoiceModelStatus().then((status) => deps?.push(PROGRESS_CHANNEL, status));
}

export async function startVoiceModelDownload(): Promise<VoiceModelStatus> {
  const d = requireDeps();
  if (downloadActive) return getVoiceModelStatus();
  downloadActive = true;
  downloadProgress = 0;
  downloadError = null;
  emitStatus();
  const tmp = path.join(d.userDataDir, `${MODEL_FILE}.download`);
  try {
    fs.mkdirSync(d.userDataDir, { recursive: true });
    const response = await fetch(MODEL_URL, { redirect: 'follow' });
    if (!response.ok || !response.body) throw new Error(`下载失败 HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length')) > 0 ? Number(response.headers.get('content-length')) : MODEL_SIZE;
    let received = 0;
    let lastEmit = 0;
    const progress = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        downloadProgress = Math.min(received / total, 1);
        const now = Date.now();
        if (now - lastEmit > 200) {
          lastEmit = now;
          emitStatus();
        }
        callback(null, chunk);
      }
    });
    await pipeline(
      Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>),
      progress,
      fs.createWriteStream(tmp)
    );
    downloadProgress = received / total;
    emitStatus();
    const digest = await sha256File(tmp);
    if (digest !== MODEL_SHA256) throw new Error('模型校验失败');
    fs.renameSync(tmp, path.join(d.userDataDir, MODEL_FILE));
    verified.clear();
  } catch (error) {
    downloadError = error instanceof Error ? error.message : '下载失败';
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* 清理失败不阻断 */
    }
  } finally {
    downloadActive = false;
    emitStatus();
  }
  return getVoiceModelStatus();
}

function wavSeconds(data: Buffer): number {
  if (data.length < 44 || data.toString('ascii', 0, 4) !== 'RIFF') return 0;
  const byteRate = data.readUInt32LE(28);
  const dataSize = data.readUInt32LE(40);
  if (byteRate > 0 && dataSize > 0) return dataSize / byteRate;
  if (byteRate > 0) return (data.length - 44) / byteRate;
  return 0;
}

function runWhisper(exe: string, model: string, wav: string, timeoutMs: number): Promise<{ text: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-m', model, '-f', wav, '-l', 'auto', '-np', '-nt', '-pp', '-t', String(WHISPER_THREADS)], {
      cwd: path.dirname(exe),
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    let parseBuf = '';
    let settled = false;
    let lastPhase = '';
    let lastPercent = -1;
    let lastEmitAt = 0;
    // -pp 的 progress 有 >100 的已知 bug（实测 272%），钳到 99；阶段按出现顺序取最高
    const emitProgress = () => {
      const re = /progress\s*=\s*(\d+)%/g;
      let match: RegExpExecArray | null;
      let raw: number | null = null;
      while ((match = re.exec(parseBuf)) !== null) raw = Number(match[1]);
      const percent = raw === null ? null : Math.min(99, Math.max(0, raw));
      const phase = percent !== null ? 'progress' : parseBuf.includes('read_audio_data') ? 'decode' : parseBuf.includes('load_backend') ? 'load' : '';
      if (!phase || (phase === lastPhase && percent === lastPercent)) return;
      const now = Date.now();
      if (phase === 'progress' && now - lastEmitAt < 150) return;
      lastPhase = phase;
      lastPercent = percent ?? -1;
      lastEmitAt = now;
      deps?.push(TRANSCRIBE_CHANNEL, percent !== null ? { phase, percent } : { phase });
    };
    const settle = (error?: Error, text?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      deps?.push(TRANSCRIBE_CHANNEL, { phase: 'done' });
      if (error) reject(error);
      else resolve({ text: text ?? '' });
    };
    const timer = setTimeout(() => {
      child.kill();
      settle(new Error('识别超时'));
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 1_000_000) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (stderr.length < 8192) stderr += text;
      if (parseBuf.length < 65536) parseBuf += text;
      emitProgress();
    });
    child.on('error', (error) => settle(error));
    child.on('close', (code) => {
      if (code === 0) {
        settle(undefined, stdout.trim());
        return;
      }
      const tail = stderr.split(/\r?\n/).filter((line) => line.trim()).slice(-3).join(' | ');
      settle(new Error(tail || `whisper 退出码 ${code}`));
    });
  });
}

export async function transcribe(data: Buffer): Promise<{ text: string }> {
  const d = requireDeps();
  if (!fs.existsSync(exePath(d))) throw new Error('语音组件未安装');
  const model = await resolveModel(d);
  if (!model?.valid) throw new Error('语音模型未下载');
  if (data.length < 44 || data.length > MAX_VOICE_BYTES) throw new Error('录音数据无效');
  const wav = path.join(os.tmpdir(), `hengsch-voice-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.wav`);
  fs.writeFileSync(wav, data);
  try {
    const seconds = wavSeconds(data);
    const timeoutMs = Math.min(Math.max(seconds * 3, MIN_TIMEOUT_S), MAX_TIMEOUT_S) * 1000;
    return await runWhisper(exePath(d), model.file, wav, timeoutMs);
  } finally {
    fs.rmSync(wav, { force: true });
  }
}
