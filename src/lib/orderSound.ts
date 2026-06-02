// Sound options for new-order notifications.
// Sounds are synthesized with the Web Audio API so we don't need any assets.

export type SoundId = "off" | "bell" | "beep" | "chime" | "alarm";

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "bell", label: "Sino" },
  { id: "beep", label: "Beep" },
  { id: "chime", label: "Campainha" },
  { id: "alarm", label: "Campainha alta (irritante)" },
  { id: "off", label: "Desativado" },
];

const LEGACY_KEY = "mesapro:order-sound";
const storageKey = (scope?: string | null) =>
  scope ? `mesapro:order-sound:${scope}` : LEGACY_KEY;

export function getSoundChoice(scope?: string | null): SoundId {
  try {
    const v = localStorage.getItem(storageKey(scope)) as SoundId | null;
    if (v && SOUND_OPTIONS.some((o) => o.id === v)) return v;
    if (scope) {
      const legacy = localStorage.getItem(LEGACY_KEY) as SoundId | null;
      if (legacy && SOUND_OPTIONS.some((o) => o.id === legacy)) return legacy;
    }
  } catch {}
  return "bell";
}

export function setSoundChoice(id: SoundId, scope?: string | null) {
  try {
    localStorage.setItem(storageKey(scope), id);
  } catch {}
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = "sine", peak = 0.35) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(peak, ac.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

// Returns approximate duration in ms of the played sound.
export function playSound(id: SoundId = getSoundChoice()): number {
  if (id === "off") return 0;
  const ac = getCtx();
  if (!ac) return 0;
  try {
    if (id === "bell") {
      tone(ac, 1760, 0, 0.9, "triangle", 0.35);
      tone(ac, 880, 0, 1.1, "sine", 0.25);
      return 1100;
    } else if (id === "beep") {
      tone(ac, 1200, 0, 0.18, "square", 0.3);
      tone(ac, 1200, 0.22, 0.18, "square", 0.3);
      return 400;
    } else if (id === "chime") {
      tone(ac, 880, 0, 0.5, "sine", 0.3);
      tone(ac, 659, 0.35, 0.7, "sine", 0.3);
      return 1050;
    } else if (id === "alarm") {
      // Loud, harsh school-bell style: alternating high square tones
      tone(ac, 1600, 0.00, 0.22, "square", 0.85);
      tone(ac, 2000, 0.00, 0.22, "square", 0.6);
      tone(ac, 1600, 0.28, 0.22, "square", 0.85);
      tone(ac, 2000, 0.28, 0.22, "square", 0.6);
      tone(ac, 1600, 0.56, 0.22, "square", 0.85);
      tone(ac, 2000, 0.56, 0.22, "square", 0.6);
      tone(ac, 1600, 0.84, 0.30, "square", 0.85);
      tone(ac, 2000, 0.84, 0.30, "square", 0.6);
      return 1200;
    }
  } catch {}
  return 0;
}
