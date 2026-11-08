/**
 * Ask Alfie on the phone: what shows while an answer streams, how the stream is read, what's
 * spoken, and what an answer carries (rig table, take-me-there links).
 */
import { describe, expect, it } from 'vitest';
import { blocks, navPath, plainText, rigRows, sseReader, takeSentences, visibleText } from '../../mobile/alfie';

describe('streaming an answer', () => {
  it('hides the control blocks, whole or still arriving', () => {
    const answer = 'Go with your **B rig**.\n\n```rig_settings\n{"rig_name":"B Rig","settings":{"ramPosition":1}}\n```\n```nav\n{"route":"/(tabs)/rigs","label":"Rig Settings"}\n```';
    // every prefix of the stream shows only the words, never a piece of a block
    for (let i = 1; i <= answer.length; i++) {
      const shown = visibleText(answer.slice(0, i));
      expect(shown).not.toMatch(/`|rig_settings|"route"/);
      expect('Go with your **B rig**.'.startsWith(shown)).toBe(true);
    }
    expect(visibleText(answer)).toBe('Go with your **B rig**.');
  });

  it('keeps an ordinary code block once it is closed', () => {
    expect(visibleText('Try this:\n```\nram +1\n```\nThen sail.')).toBe('Try this:\n```\nram +1\n```\nThen sail.');
  });

  it('reads server-sent events however the bytes are split', () => {
    const body = 'data: {"type":"token","content":"Hey "}\n\ndata: {"type":"token","content":"Stephen"}\n\ndata: {"type":"done","conversation_id":"c1","message":"Hey Stephen"}\n\n';
    for (const size of [1, 3, 7, 50, body.length]) {
      const got: any[] = [];
      const read = sseReader(e => got.push(e));
      for (let i = 0; i < body.length; i += size) read(body.slice(i, i + size));
      read('', true);
      expect(got.map(e => e.type)).toEqual(['token', 'token', 'done']);
      expect(got[2].conversation_id).toBe('c1');
    }
  });
});

describe('reading aloud', () => {
  it('speaks whole sentences as they arrive and waits on a number still arriving', () => {
    expect(takeSentences('Go with your B rig. You were quick')).toEqual({ ready: ['Go with your B rig.'], rest: 'You were quick' });
    expect(takeSentences('Set the ram to 3.')).toEqual({ ready: [], rest: 'Set the ram to 3.' });
    expect(takeSentences('Set the ram to 3.5 mm. Done')).toEqual({ ready: ['Set the ram to 3.5 mm.'], rest: 'Done' });
  });

  it('says the words, not the markdown', () => {
    expect(plainText('## Setup\n- **Ram** +1 mm\n- See [the guide](https://x.y)')).toBe('Setup\nRam +1 mm\nSee the guide');
  });
});

describe('what an answer carries', () => {
  it('formats paragraphs, lists and bold', () => {
    const b = blocks('Hey Stephen,\nhere goes.\n\n1. Start **early**\n2. Hold the lane\n\n- one\n- two');
    expect(b.map(x => x.t)).toEqual(['p', 'ol', 'ul']);
    expect((b[1] as any).items[0]).toEqual([{ t: 'text', s: 'Start ' }, { t: 'b', s: 'early' }]);
  });

  it('labels rig settings the way the boat shed does', () => {
    const rows = rigRows({ boat_type: 'Marblehead', rig_name: 'B Rig', settings: { ramPosition: 1, jibTwist: 16, customFields: { 'Jib Tension Min': 850 } } });
    expect(rows).toEqual([
      { label: 'Ram position', value: '1 mm' },
      { label: 'Jib twist', value: '16°' },
      { label: 'Jib Tension Min', value: '850' },
    ]);
  });

  it('takes "take me there" to the phone screen', () => {
    expect(navPath({ route: '/(tabs)/rigs', label: 'Rig Settings' })).toBe('/my-garage');
    expect(navPath({ route: '/(tabs)/my-stats', label: 'My Stats' })).toBe('/my-stats');
    expect(navPath({ route: '/(tabs)/results', label: 'Results' })).toBe('/results');
    expect(navPath({ route: '/(tabs)', label: 'Home' })).toBe('/');
    expect(navPath({ route: '/alfie-tv/home', label: 'AlfieTV' })).toBe('/alfie-tv');
    expect(navPath({ route: '/somewhere-new', label: 'X' })).toBeNull();
  });
});
