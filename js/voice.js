/* Hold-to-talk card/dice entry using the Web Speech API.
 * Final recognition segments are collected while Space is held and delivered
 * together after release. parseSpeech remains available for legacy callers;
 * the app uses strict parseEntry so unknown words cannot silently alter a hand.
 */
(function (root) {
  const WORD_RANKS = {
    ace: 'A', aces: 'A', a: 'A',
    king: 'K', kings: 'K', k: 'K',
    queen: 'Q', queens: 'Q', q: 'Q',
    jack: 'J', jacks: 'J', j: 'J',
    ten: '10', tens: '10', '10': '10',
    nine: '9', nines: '9', '9': '9',
    eight: '8', eights: '8', ate: '8', '8': '8',
    seven: '7', sevens: '7', '7': '7',
    six: '6', sixes: '6', '6': '6',
    five: '5', fives: '5', '5': '5',
    four: '4', fours: '4', '4': '4',
    three: '3', threes: '3', trey: '3', '3': '3',
    two: '2', twos: '2', deuce: '2', '2': '2'
  };

  const WORD_SUITS = {
    heart: 'h', hearts: 'h', '1': 'h', one: 'h',
    spade: 's', spades: 's', '2': 's', two: 's',
    club: 'c', clubs: 'c', '3': 'c', three: 'c',
    diamond: 'd', diamonds: 'd', '4': 'd', four: 'd'
  };

  const DICE_WORDS = {
    one: 1, '1': 1, two: 2, '2': 2, three: 3, '3': 3,
    four: 4, '4': 4, five: 5, '5': 5, six: 6, '6': 6
  };

  function parseSpeech(text, activeGame = 'teenpatti') {
    if (!text || typeof text !== 'string') return { cards: [], dice: [], commands: [] };
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    const tokens = clean.split(/\s+/).filter(Boolean);
    const cards = [];
    const dice = [];
    const commands = [];
    let i = 0;

    while (i < tokens.length) {
      const t = tokens[i];

      // Voice commands
      if (t === 'undo' || (t === 'go' && tokens[i + 1] === 'back')) {
        commands.push('undo');
        i += (t === 'undo' ? 1 : 2);
        continue;
      }
      if (t === 'clear' || t === 'cancel') {
        commands.push('clear');
        i++;
        continue;
      }
      if (t === 'new' && tokens[i + 1] === 'session') {
        commands.push('newSession');
        i += 2;
        continue;
      }
      if ((t === 'p1' || (t === 'player' && (tokens[i + 1] === '1' || tokens[i + 1] === 'one'))) && tokens[i + (t === 'p1' ? 1 : 2)] === 'won') {
        commands.push('wa');
        i += (t === 'p1' ? 2 : 3);
        continue;
      }
      if ((t === 'p2' || (t === 'player' && (tokens[i + 1] === '2' || tokens[i + 1] === 'two'))) && tokens[i + (t === 'p2' ? 1 : 2)] === 'won') {
        commands.push('wb');
        i += (t === 'p2' ? 2 : 3);
        continue;
      }
      if (t === 'tie' || t === 'push') {
        commands.push('wt');
        i++;
        continue;
      }

      // Teen Patti: Cards parser
      if (activeGame === 'teenpatti') {
        if (WORD_RANKS[t]) {
          const rank = WORD_RANKS[t];
          let j = i + 1;
          if (tokens[j] === 'of') j++;
          if (j < tokens.length && WORD_SUITS[tokens[j]]) {
            cards.push(rank + WORD_SUITS[tokens[j]]);
            i = j + 1;
            continue;
          }
        }
      }

      // Sic Bo / Kickoff: Dice parser
      if (activeGame === 'sicbo' || activeGame === 'kickoff') {
        if (t === 'triple' && DICE_WORDS[tokens[i + 1]]) {
          const val = DICE_WORDS[tokens[i + 1]];
          dice.push(val, val, val);
          i += 2;
          continue;
        }
        if (DICE_WORDS[t]) {
          dice.push(DICE_WORDS[t]);
          i++;
          continue;
        }
      }

      i++;
    }

    return { cards, dice, commands };
  }

  // Strict entry parser: never silently drop an unrecognized value from a hand.
  function parseEntry(text, game) {
    const tokens = String(text || '').toLowerCase()
      .replace(/\bplayer\s+[ab12]\b|\bbanker\b|\bplayer\b|\bred\b|\bblue\b/g, ' ')
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const keys = [];
    for (let i = 0; i < tokens.length;) {
      if (game === 'sicbo' || game === 'kickoff') {
        const n = DICE_WORDS[tokens[i++]];
        if (!n) return { error: 'Say each die as a number from one to six.' };
        keys.push(n);
      } else {
        const rank = WORD_RANKS[tokens[i]];
        i++;
        if (tokens[i] === 'of') i++;
        const suit = WORD_SUITS[tokens[i++]];
        if (!rank || !suit) return { error: 'Say each card rank followed by its suit.' };
        keys.push(rank + suit);
      }
    }
    return keys.length ? { keys } : { error: 'No cards or dice heard. Hold Space and try again.' };
  }

  class VoiceController {
    constructor() { this.recognition = null; this.isListening = false; this.shouldBeListening = false; this.busy = false; this.generation = 0; }
    isSupported() { return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
    init(callbacks = {}) { this.callbacks = callbacks; return this.isSupported(); }
    start() {
      if (!this.isSupported() || this.busy) return false;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = this.recognition = new SR(), generation = ++this.generation;
      const current = () => generation === this.generation;
      let results = new Map(), completed = [];
      this.busy = true; this.shouldBeListening = true;
      recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US';
      recognition.onstart = () => { if (current()) { this.isListening = true; this.callbacks?.onStateChange?.({ listening: true }); } };
      recognition.onresult = event => {
        if (!current()) return;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          results.set(i, { text: result[0]?.transcript.trim() || '', final: result.isFinal });
        }
        this.callbacks?.onInterim?.({ transcript: [...completed, ...[...results.values()].map(r => r.text)].join(' ') });
      };
      recognition.onerror = event => {
        if (!current() || event.error === 'no-speech') return;
        this.cancel();
        this.callbacks?.onError?.(event.error === 'not-allowed' ? 'Microphone access not permitted.' : 'Voice error: ' + event.error);
      };
      recognition.onend = () => {
        if (!current()) return;
        completed.push(...[...results.values()].filter(r => r.final).map(r => r.text)); results.clear();
        this.isListening = false;
        if (this.shouldBeListening) {
          try { recognition.start(); } catch (error) { this.cancel(); this.callbacks?.onError?.(error.message); }
          return;
        }
        this.busy = false;
        clearTimeout(this.stopTimer);
        ++this.generation;
        this.callbacks?.onStateChange?.({ listening: false });
        if (completed.length) this.callbacks?.onResult?.({ transcript: completed.join(' ') });
        else this.callbacks?.onError?.('No speech recognized. Hold Space and try again.');
      };
      try { recognition.start(); return true; }
      catch (error) { this.cancel(); this.callbacks?.onError?.(error.message); return false; }
    }
    stop() {
      this.shouldBeListening = false;
      if (this.busy) {
        this.stopTimer = setTimeout(() => {
          this.cancel();
          this.callbacks?.onError?.('Speech recognition did not finish. Nothing recorded; please try again.');
        }, 5000);
        try { this.recognition.stop(); } catch (error) { this.cancel(); this.callbacks?.onError?.(error.message); }
      }
    }
    cancel() {
      clearTimeout(this.stopTimer);
      ++this.generation; this.shouldBeListening = false; this.isListening = false; this.busy = false;
      try { this.recognition?.abort(); } catch {}
      this.callbacks?.onStateChange?.({ listening: false });
    }
    toggle() { if (this.shouldBeListening) { this.stop(); return false; } return this.start(); }
  }

  const voice = new VoiceController();
  const VoiceModule = {
    controller: voice,
    parseSpeech,
    parseEntry,
    VoiceController,
    cancel: () => voice.cancel(),
    toggle: () => voice.toggle(),
    start: () => voice.start(),
    stop: () => voice.stop(),
    isListening: () => voice.isListening,
    isSupported: () => voice.isSupported(),
    init: (opts) => voice.init(opts)
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = VoiceModule;
  else root.Voice = VoiceModule;
})(this);
