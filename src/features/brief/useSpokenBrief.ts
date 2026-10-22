// The 1-minute audio brief, spoken for real: the first tap asks the `speak` Edge Function to read the brief aloud
// (Saudi Arabic or English), saves the mp3 in the app's cache and plays it; later taps pause / resume. A new brief
// text (new numbers) means a new recording.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

export function useSpokenBrief(text: string, lang: string) {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const madeFor = useRef('');
  const playWhenReady = useRef(false);
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  // the numbers changed: the old recording is stale
  useEffect(() => {
    if (uri && madeFor.current !== `${lang}|${text}`) setUri(null);
  }, [text, lang, uri]);

  // first play starts as soon as the new file is loaded
  useEffect(() => {
    if (playWhenReady.current && status.isLoaded) {
      playWhenReady.current = false;
      player.play();
    }
  }, [status.isLoaded, player]);

  // finished: back to the start, ready to play again
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0).catch(() => {});
    }
  }, [status.didJustFinish, player]);

  const fetchAudio = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not signed in');
    const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/speak`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) throw new Error(`speak ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (Platform.OS === 'web') return URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    const file = new File(Paths.cache, `brief-${Date.now()}.mp3`);
    file.create();
    file.write(bytes);
    return file.uri;
  };

  const toggle = async () => {
    if (loading) return;
    setFailed(false);
    // play through the speaker even in silent mode (and not the earpiece after a voice recording)
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    if (uri) return status.playing ? player.pause() : player.play();
    setLoading(true);
    try {
      const made = await fetchAudio();
      madeFor.current = `${lang}|${text}`;
      playWhenReady.current = true;
      setUri(made);
    } catch (e) {
      console.warn('[brief audio]', String(e));
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const duration = status.duration || 0;
  return {
    toggle,
    loading,
    failed,
    playing: status.playing,
    pos: status.currentTime || 0,
    duration,
    progress: duration ? (status.currentTime || 0) / duration : 0,
  };
}
