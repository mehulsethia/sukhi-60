"use client";
// Live speech-to-text with ElevenLabs realtime Scribe over a WebSocket.
// The mic is streamed as 16 kHz 16-bit PCM while the person speaks; partial text arrives as they
// talk, and ElevenLabs' voice activity detection decides when the sentence is finished, which is
// far more reliable than guessing from loudness (older voices pause mid-sentence).

const WS = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";

export interface LiveOptions {
  token: string;
  model: string;
  onPartial: (text: string) => void;
  onLevel: (level: number) => void;
  /** Gets a function that ends listening early (tap on the orb). */
  onStopper: (stop: () => void) => void;
  /** Seconds of silence that end a sentence. Generous: people pause while they think. */
  silenceSecs?: number;
}

/** Resolves with the full sentence, "" for silence, or null if live transcription can't run. */
export async function liveTranscribe(o: LiveOptions): Promise<string | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch {
    return null;
  }
  const ctx = new AudioContext();
  const rate = ctx.sampleRate;
  const source = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but works everywhere (incl. iOS Safari) without a worklet file.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const params = new URLSearchParams({
    model_id: o.model,
    token: o.token,
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_silence_threshold_secs: String(o.silenceSecs ?? 1.4),
    min_speech_duration_ms: "120",
  });
  const ws = new WebSocket(`${WS}?${params}`);
  const queue: string[] = []; // audio captured before the socket opened: the first words are kept
  let open = false;
  let done = false;
  let finalText = "";
  let heardSpeech = false;

  const send = (b64: string, commit = false) => {
    const msg = JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: b64, commit, sample_rate: 16000 });
    if (open && ws.readyState === WebSocket.OPEN) ws.send(msg);
    else queue.push(msg);
  };

  proc.onaudioprocess = (e) => {
    if (done) return;
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    o.onLevel(Math.min(1, Math.sqrt(sum / input.length) * 6));
    send(toBase64(downsampleTo16k(input, rate)));
  };
  source.connect(proc);
  proc.connect(ctx.destination); // required for onaudioprocess to fire; outputs silence

  return new Promise((resolve) => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const finish = (value: string | null) => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      try { proc.disconnect(); source.disconnect(); } catch { /* already gone */ }
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => undefined);
      try { ws.close(); } catch { /* ignore */ }
      o.onLevel(0);
      resolve(value);
    };
    // Ask ElevenLabs to wrap up now (tap to finish, or the time limit), then give it a moment.
    const wrapUp = () => {
      if (done) return;
      send(toBase64(new Int16Array(1600)), true); // 0.1 s of silence with commit
      timers.push(setTimeout(() => finish(finalText.trim()), 1500));
    };
    o.onStopper(wrapUp);
    timers.push(setTimeout(() => { if (!heardSpeech) finish(""); }, 8000)); // nobody spoke
    timers.push(setTimeout(wrapUp, 25_000)); // hard limit for one turn

    ws.onopen = () => {
      open = true;
      while (queue.length) ws.send(queue.shift()!);
    };
    ws.onmessage = (ev) => {
      let m: { message_type?: string; text?: string; error?: string };
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.message_type === "partial_transcript" && m.text) {
        heardSpeech = true;
        o.onPartial(`${finalText} ${m.text}`.trim());
      } else if (m.message_type === "committed_transcript" || m.message_type === "committed_transcript_with_timestamps") {
        const t = (m.text ?? "").trim();
        if (t) {
          heardSpeech = true;
          finalText = `${finalText} ${t}`.trim();
          o.onPartial(finalText);
          finish(finalText);
        }
      } else if (m.error || /error|exceeded|throttled|limited|overflow|exhausted|unaccepted/.test(m.message_type ?? "")) {
        finish(finalText.trim() || null);
      }
    };
    ws.onerror = () => finish(finalText.trim() || null);
    ws.onclose = () => finish(finalText.trim() || (heardSpeech ? "" : null));
  });
}

/** Average-based downsampling to 16 kHz, as 16-bit little-endian PCM. */
function downsampleTo16k(input: Float32Array, rate: number): Int16Array {
  const ratio = rate / 16000;
  const out = new Int16Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio), end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
