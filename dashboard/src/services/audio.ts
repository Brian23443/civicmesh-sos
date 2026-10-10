let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  const AudioContextConstructor =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export async function primeAlertAudio(): Promise<void> {
  const current = context();
  if (current?.state === "suspended") {
    await current.resume();
  }
}

export async function playAlertChime(): Promise<void> {
  const current = context();
  if (!current) return;
  if (current.state === "suspended") await current.resume();

  const start = current.currentTime;
  const gain = current.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
  gain.connect(current.destination);

  const first = current.createOscillator();
  first.type = "sine";
  first.frequency.setValueAtTime(660, start);
  first.connect(gain);
  first.start(start);
  first.stop(start + 0.2);

  const second = current.createOscillator();
  second.type = "sine";
  second.frequency.setValueAtTime(880, start + 0.16);
  second.connect(gain);
  second.start(start + 0.16);
  second.stop(start + 0.42);
}
