import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

// speech, not music: 16 kHz mono AAC is what speech-to-text uses anyway, and uploads ~5x smaller than HIGH_QUALITY
const OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
};

/** a level above this counts as someone speaking */
const SPEECH_LEVEL = 0.35;
/** native calls that sometimes never return on Android (prepare / stop): give up after this */
const NATIVE_TIMEOUT_MS = 4000;

export class MicDeniedError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([p, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

/**
 * Thin wrapper over expo-audio: start(), stop() → uri, live level (0..1), elapsed time and silence tracking.
 * Elapsed time runs on our own clock: the recorder's status updates can stall on some Android phones, which made
 * the timer look frozen ("hanging"). Native prepare/stop calls are time-boxed so the screen never gets stuck.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(OPTIONS);
  const state = useAudioRecorderState(recorder, 120);
  // loudest moment of the current recording (null = this platform reports no metering, e.g. some web browsers)
  const peak = useRef<number | null>(null);
  const startedAt = useRef<number | null>(null);
  const lastSpeechAt = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState(false);

  // tick while recording so elapsed time / silence are fresh even when recorder status stalls
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [active]);

  const start = useCallback(async () => {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) throw new MicDeniedError('mic denied');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    // a previous recording left open (e.g. the app was backgrounded mid-recording): close it first
    if (recorder.isRecording) await withTimeout(recorder.stop(), NATIVE_TIMEOUT_MS).catch(() => {});
    const prepared = await withTimeout(recorder.prepareToRecordAsync().then(() => true), NATIVE_TIMEOUT_MS);
    if (!prepared) throw new Error('The microphone did not start. Try again.');
    peak.current = null;
    lastSpeechAt.current = null;
    startedAt.current = Date.now();
    setNow(Date.now());
    setActive(true);
    recorder.record();
  }, [recorder]);

  const stop = useCallback(async () => {
    setActive(false);
    startedAt.current = null;
    await withTimeout(recorder.stop(), NATIVE_TIMEOUT_MS).catch(() => {});
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    return recorder.uri;
  }, [recorder]);

  // metering is dBFS (about -60 silent … 0 loud) → 0..1
  const db = state.metering ?? -60;
  const level = active ? Math.min(Math.max((db + 60) / 60, 0), 1) : 0;
  if (active && state.metering != null) {
    peak.current = Math.max(peak.current ?? 0, level);
    if (level >= SPEECH_LEVEL) lastSpeechAt.current = Date.now();
  }

  const elapsedMs = active && startedAt.current ? Math.max(0, now - startedAt.current) : 0;

  /** true when metering showed nothing above room noise for the whole recording */
  const wasSilent = () => peak.current !== null && peak.current < 0.3;
  /** ms since the person last spoke (null until they have spoken, or when metering isn't available) */
  const silentForMs = active && lastSpeechAt.current ? now - lastSpeechAt.current : null;

  return { start, stop, wasSilent, isRecording: active, durationMillis: elapsedMs, level, silentForMs };
}
