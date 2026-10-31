/* B-3: offline CPU CLI comparison. See docs/evidence/ai-assistant for acquisition commands.
   node scripts/sensevoice-spike.cjs --assets-dir <cache> [--rounds 5] [--report <new-file.json>]
   Each observation starts a fresh process; hashes/downloads/log writes are outside the timer. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { parseArgs } = require('node:util');

const { values } = parseArgs({ options: {
  'assets-dir': { type: 'string' },
  rounds: { type: 'string', default: '5' },
  threads: { type: 'string', default: String(Math.max(4, Math.floor(os.cpus().length / 2))) },
  report: { type: 'string' }
} });
assert.ok(values['assets-dir'], '--assets-dir is required');
const assetsDir = path.resolve(values['assets-dir']);
const rounds = Number(values.rounds);
const threads = Number(values.threads);
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20, 'rounds must be 1..20');
assert.ok(Number.isInteger(threads) && threads >= 1 && threads <= os.cpus().length, 'invalid thread count');
assert.ok(fs.statSync(assetsDir).isDirectory(), 'assets directory must exist');
const desktop = path.resolve(__dirname, '..');
const whisperDir = path.join(desktop, 'resources', 'whisper');
const sherpaDir = path.join(assetsDir, 'sherpa-onnx-v2.0.1-win-x64-shared-MT-Release-no-tts', 'bin');
const revision = '2365baeacb507f821a0c8120fcee3d484dba7a07';
const modelRepo = 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17';
const hfUrl = (file) => `https://huggingface.co/${modelRepo}/resolve/${revision}/${file}`;

const pins = [
  { name: 'runtime-archive', file: path.join(assetsDir, 'hengsch-b3-sherpa-v2.0.1.tar.bz2'), size: 25567228,
    sha256: 'a644dfe2f7944afec9a356d2557c0452380f20ffcf2f8c704653cfce37558596',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v2.0.1/sherpa-onnx-v2.0.1-win-x64-shared-MT-Release-no-tts.tar.bz2' },
  { name: 'sensevoice-model', file: path.join(assetsDir, 'hengsch-b3-sensevoice-model.int8.onnx'), size: 239233841,
    sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51', url: hfUrl('model.int8.onnx') },
  { name: 'sensevoice-tokens', file: path.join(assetsDir, 'hengsch-b3-sensevoice-tokens.txt'), size: 315894,
    sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc', url: hfUrl('tokens.txt') },
  { name: 'zh', file: path.join(assetsDir, 'hengsch-b3-zh.wav'), size: 178988,
    sha256: 'b77f1794fe374a0ba1ee1dc458bfaf9349496cbbfc32780c50ba3c5a7ad8e373', url: hfUrl('test_wavs/zh.wav') },
  { name: 'en', file: path.join(assetsDir, 'hengsch-b3-en.wav'), size: 228908,
    sha256: 'eb1eb008904465b74c304aad8342e8c7d3c6e61ffe9f66adcaca9cf0f76a93f4', url: hfUrl('test_wavs/en.wav') },
  { name: 'whisper-model', file: path.join(whisperDir, 'ggml-small-q5_1.bin'), size: 190085487,
    sha256: 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb',
    url: 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin' }
];
const pinnedFile = (name) => pins.find((pin) => pin.name === name).file;
const roundNumber = (number) => Math.round(number * 1000) / 1000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fingerprint(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return { file, bytes: fs.statSync(file).size, sha256: hash.digest('hex') };
}

function wavInfo(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  let format;
  let bytes;
  for (let offset = 12; offset + 8 <= data.length;) {
    const kind = data.toString('ascii', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + size <= data.length, `truncated WAV: ${file}`);
    if (kind === 'fmt ') {
      format = { encoding: data.readUInt16LE(start), channels: data.readUInt16LE(start + 2),
        sampleRate: data.readUInt32LE(start + 4), byteRate: data.readUInt32LE(start + 8), bits: data.readUInt16LE(start + 14) };
    }
    if (kind === 'data') bytes = size;
    offset = start + size + (size % 2);
  }
  assert.ok(format && bytes, `missing WAV chunks: ${file}`);
  assert.equal(format.encoding, 1, 'PCM required');
  assert.equal(format.channels, 1, 'mono required');
  assert.equal(format.sampleRate, 16000, '16 kHz required');
  assert.equal(format.bits, 16, '16-bit required');
  return { ...format, audioBytes: bytes, seconds: bytes / format.byteRate };
}

function cpuCounters() {
  return os.cpus().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle,
    total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0) }), { idle: 0, total: 0 });
}

async function backgroundCpuPercent() {
  const before = cpuCounters();
  await wait(250);
  const after = cpuCounters();
  return roundNumber(100 * (1 - (after.idle - before.idle) / (after.total - before.total)));
}

function execute(exe, args) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn(exe, args, { cwd: path.dirname(exe), windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (value) => { stdout += value; });
    child.stderr.on('data', (value) => { stderr += value; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ wallMs: roundNumber(performance.now() - start), code, timedOut, stdout, stderr });
    });
  });
}

function sensevoiceResult(output) {
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    try {
      const result = JSON.parse(line);
      if (typeof result.text === 'string') return { text: result.text, language: result.lang };
    } catch { /* diagnostics are not recognition results */ }
  }
  throw new Error('SenseVoice result JSON missing; inspect raw output');
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function main() {
  assert.equal(process.platform, 'win32', 'this spike pins Windows x64 artifacts');
  assert.equal(process.arch, 'x64');
  const integrity = [];
  for (const pin of pins) {
    const actual = await fingerprint(pin.file);
    assert.equal(actual.bytes, pin.size, `${pin.name}: size mismatch`);
    assert.equal(actual.sha256, pin.sha256, `${pin.name}: SHA-256 mismatch`);
    integrity.push({ name: pin.name, url: pin.url, ...actual });
  }
  const samples = [];
  for (const [id, file] of [['jfk', path.join(__dirname, 'fixtures', 'jfk.wav')], ['zh', pinnedFile('zh')], ['en', pinnedFile('en')]]) {
    samples.push({ id, ...await fingerprint(file), ...wavInfo(file) });
  }
  const engines = [
    { id: 'whisper', exe: path.join(whisperDir, 'whisper-cli.exe'), args: (sample) => [
      '-m', pinnedFile('whisper-model'), '-f', sample.file, '-l', 'auto', '-np', '-nt', '-pp', '-t', String(threads)
    ] },
    { id: 'sensevoice', exe: path.join(sherpaDir, 'sherpa-onnx-offline.exe'), args: (sample) => [
      `--sense-voice-model=${pinnedFile('sensevoice-model')}`, `--tokens=${pinnedFile('sensevoice-tokens')}`,
      '--sense-voice-language=auto', '--sense-voice-use-itn=1', `--num-threads=${threads}`, '--provider=cpu', '--debug=0', sample.file
    ] }
  ];
  const payloads = {};
  for (const engine of engines) {
    const directory = path.dirname(engine.exe);
    const names = fs.readdirSync(directory).filter((name) => name.endsWith('.dll') || name === path.basename(engine.exe));
    const files = [];
    for (const name of names) files.push(await fingerprint(path.join(directory, name)));
    payloads[engine.id] = { bytes: files.reduce((total, file) => total + file.bytes, 0), files };
  }
  const version = spawnSync(path.join(sherpaDir, 'sherpa-onnx-version.exe'), { encoding: 'utf8', windowsHide: true });
  assert.equal(version.status, 0, version.stderr);
  const logDir = fs.mkdtempSync(path.join(assetsDir, 'hengsch-b3-bench-'));
  const reportPath = values.report ? path.resolve(values.report) : path.join(logDir, 'report.json');
  assert.equal(fs.existsSync(reportPath), false, 'choose a new report filename');
  assert.ok(fs.statSync(path.dirname(reportPath)).isDirectory(), 'report parent must exist');
  const report = {
    at: new Date().toISOString(), methodology: 'One discarded warmup then alternating engine order; fresh process per run. Wall clock includes model load, decode and exit. OS file cache is not flushed. Hashes and log I/O excluded.',
    rounds, threads, node: process.version, cpu: os.cpus()[0].model, logicalCores: os.cpus().length,
    memoryBytes: os.totalmem(), sherpaVersion: version.stdout.trim(), integrity, payloads, samples,
    commands: samples.flatMap((sample) => engines.map((engine) => ({ sample: sample.id, engine: engine.id, exe: engine.exe, args: engine.args(sample) }))),
    logDir, runs: [], summary: []
  };
  const save = () => fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  save();
  for (const sample of samples) {
    for (let round = 0; round <= rounds; round += 1) {
      const order = round % 2 ? engines.slice().reverse() : engines;
      for (const engine of order) {
        const phase = round === 0 ? 'warmup' : 'measured';
        const backgroundCpu = await backgroundCpuPercent();
        const result = await execute(engine.exe, engine.args(sample));
        const log = `${sample.id}-${engine.id}-${phase}-${round}`;
        fs.writeFileSync(path.join(logDir, `${log}.stdout.txt`), result.stdout);
        fs.writeFileSync(path.join(logDir, `${log}.stderr.txt`), result.stderr);
        const run = { sample: sample.id, engine: engine.id, phase, round, wallMs: result.wallMs, code: result.code, timedOut: result.timedOut, backgroundCpuPercent: backgroundCpu, log };
        report.runs.push(run);
        save();
        assert.equal(result.timedOut, false, `${log}: timed out`);
        assert.equal(result.code, 0, `${log}: ${result.stderr}`);
        const combined = `${result.stdout}\n${result.stderr}`;
        Object.assign(run, engine.id === 'sensevoice' ? sensevoiceResult(combined) : { text: result.stdout.trim() });
        assert.ok(run.text, `${log}: empty transcript`);
        if (engine.id === 'sensevoice') {
          const load = combined.match(/recognizer created in\s+([\d.]+)\s+s/i);
          const decode = combined.match(/Elapsed seconds:\s+([\d.]+)\s+s/i);
          if (load) run.recognizerLoadMs = Number(load[1]) * 1000;
          if (decode) run.decodeMs = Number(decode[1]) * 1000;
        }
        save();
        console.log(`${log}: ${result.wallMs} ms; background CPU ${backgroundCpu}%`);
      }
    }
  }
  for (const sample of samples) {
    const row = { sample: sample.id, seconds: sample.seconds };
    for (const engine of engines) {
      const runs = report.runs.filter((run) => run.sample === sample.id && run.engine === engine.id && run.phase === 'measured');
      const times = runs.map((run) => run.wallMs);
      row[engine.id] = { medianMs: roundNumber(median(times)), minMs: Math.min(...times), maxMs: Math.max(...times),
        wallRtf: roundNumber(median(times) / (sample.seconds * 1000)), texts: [...new Set(runs.map((run) => run.text))] };
    }
    row.speedup = roundNumber(row.whisper.medianMs / row.sensevoice.medianMs);
    report.summary.push(row);
  }
  report.finishedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`report: ${reportPath}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
