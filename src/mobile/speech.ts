/**
 * Listening for sail numbers. In the apps: the AlfieSpeech plugin (Apple / Google speech
 * recognition, given the race's sail numbers as hints). In phone browsers: the Web Speech API
 * where the browser has it. Each listening session reports the whole transcript so far.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from '../lib/native/platform';

interface AlfieSpeechPlugin {
  available(opts: { language: string }): Promise<{ available: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  start(opts: { language: string; hints: string[] }): Promise<void>;
  stop(): Promise<void>;
  addListener(event: 'partial' | 'final', fn: (d: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'end', fn: () => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', fn: (d: { message: string }) => void): Promise<PluginListenerHandle>;
}

const AlfieSpeech = registerPlugin<AlfieSpeechPlugin>('AlfieSpeech');
const LANG = 'en-AU';

export type SpeechKind = 'native' | 'web' | null;

const webRecognition = (): any => (typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null);

export async function speechKind(): Promise<SpeechKind> {
  if (isNative) {
    if (!Capacitor.isPluginAvailable('AlfieSpeech')) return webRecognition() ? 'web' : null;
    try { return (await AlfieSpeech.available({ language: LANG })).available ? 'native' : null; } catch { return null; }
  }
  return webRecognition() ? 'web' : null;
}

export interface SpeechHandlers {
  /** The whole transcript of this listening session so far; done when it won't change any more. */
  onText: (text: string, done: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface Listening { stop: () => void }

export async function listen(kind: SpeechKind, hints: string[], h: SpeechHandlers): Promise<Listening | null> {
  if (kind === 'native') {
    const perm = await AlfieSpeech.requestPermission().catch(() => ({ granted: false }));
    if (!perm.granted) { h.onError('Allow the microphone and speech recognition for AlfiePRO in Settings to call finishes.'); return null; }
    const subs = await Promise.all([
      AlfieSpeech.addListener('partial', d => h.onText(d.text || '', false)),
      AlfieSpeech.addListener('final', d => h.onText(d.text || '', true)),
      AlfieSpeech.addListener('error', d => h.onError(d.message || 'Couldn\'t hear that.')),
      AlfieSpeech.addListener('end', () => { subs.forEach(s => s.remove()); h.onEnd(); }),
    ]);
    try {
      await AlfieSpeech.start({ language: LANG, hints });
    } catch (e: any) {
      subs.forEach(s => s.remove());
      h.onError(e?.message === 'permission' ? 'Allow speech recognition for AlfiePRO in Settings.' : 'Voice isn\'t available right now.');
      return null;
    }
    return { stop: () => { void AlfieSpeech.stop().catch(() => {}); } };
  }
  if (kind === 'web') {
    const R = webRecognition();
    if (!R) return null;
    const rec = new R();
    rec.lang = LANG;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    let ended = false;
    rec.onresult = (ev: any) => {
      let text = '', done = true;
      for (let i = 0; i < ev.results.length; i++) {
        text += ` ${ev.results[i][0]?.transcript || ''}`;
        if (!ev.results[i].isFinal) done = false;
      }
      h.onText(text.trim(), done);
    };
    rec.onerror = (ev: any) => {
      if (ev?.error === 'no-speech' || ev?.error === 'aborted') return;
      h.onError(ev?.error === 'not-allowed' ? 'Allow the microphone for this site to call finishes.' : 'Couldn\'t hear that.');
    };
    rec.onend = () => { if (!ended) { ended = true; h.onEnd(); } };
    try { rec.start(); } catch { h.onError('Voice isn\'t available right now.'); return null; }
    return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
  }
  return null;
}
