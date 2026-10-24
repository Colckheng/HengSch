export interface VoiceRecording {
  /** 停止采集并返回 16-bit PCM WAV */
  stop: () => Promise<{ wav: Uint8Array; seconds: number }>;
  /** 停止并丢弃已采数据（关抽屉等取消场景） */
  discard: () => void;
}

function encodeWav(pcm: Int16Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + pcm.length * 2);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) view.setInt16(44 + i * 2, pcm[i], true);
  return bytes;
}

/** 16kHz 单声道采集（AudioContext 不支持指定采样率时用设备原生率，WAV 头如实回写） */
export async function startVoiceRecording(): Promise<VoiceRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  });
  const context = new AudioContext({ sampleRate: 16000 });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const sink = context.createGain();
  sink.gain.value = 0;
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(sink);
  sink.connect(context.destination);

  let finished = false;
  const cleanup = () => {
    processor.onaudioprocess = null;
    try {
      source.disconnect();
      processor.disconnect();
      sink.disconnect();
    } catch {
      /* 已断开 */
    }
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };

  const finish = async (discard: boolean) => {
    if (finished) return null;
    finished = true;
    const rate = context.sampleRate;
    const collected = chunks.splice(0, chunks.length);
    cleanup();
    if (discard) return null;
    const length = collected.reduce((total, part) => total + part.length, 0);
    const pcm = new Int16Array(length);
    let offset = 0;
    for (const part of collected) {
      for (let i = 0; i < part.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, part[i]));
        pcm[offset] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        offset += 1;
      }
    }
    return { wav: encodeWav(pcm, rate), seconds: length / rate };
  };

  return {
    stop: async () => {
      const result = await finish(false);
      if (!result) throw new Error('录音已结束');
      return result;
    },
    discard: () => {
      void finish(true);
    }
  };
}
