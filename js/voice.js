/* Voice Input & Natural Language Card Parser for Bet-R Play-R
 * Allows hands-free card/dice entry via microphone using the Web Speech API.
 * Supports spoken cards ("ace of spades", "king hearts", "5 diamonds", "01"),
 * multi-card runs, quick outcomes ("player 1 won", "tie"), and voice commands ("undo", "clear").
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

  class VoiceController {
    constructor() {
      this.recognition = null;
      this.shouldBeListening = false;
      this.isListening = false;
      this.onResultCb = null;
      this.onInterimCb = null;
      this.onStateChangeCb = null;
      this.onErrorCb = null;
    }

    isSupported() {
      return typeof window !== 'undefined' &&
        !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    init({ onResult, onInterim, onStateChange, onError } = {}) {
      if (!this.isSupported()) return false;
      this.onResultCb = onResult;
      this.onInterimCb = onInterim;
      this.onStateChangeCb = onStateChange;
      this.onErrorCb = onError;

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SR();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        if (this.onStateChangeCb) this.onStateChangeCb({ listening: true });
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.shouldBeListening) {
          // Continuous restart on silence/pause
          try {
            this.recognition.start();
          } catch (e) {
            setTimeout(() => {
              if (this.shouldBeListening) {
                try { this.recognition.start(); } catch (err) {}
              }
            }, 250);
          }
        } else {
          if (this.onStateChangeCb) this.onStateChangeCb({ listening: false });
        }
      };

      this.recognition.onerror = (e) => {
        if (e.error === 'no-speech') return; // Expected during pauses, ignore
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.shouldBeListening = false;
          this.isListening = false;
          if (this.onErrorCb) this.onErrorCb('Microphone access not permitted.');
          if (this.onStateChangeCb) this.onStateChangeCb({ listening: false });
          return;
        }
        if (this.onErrorCb) this.onErrorCb('Voice error: ' + e.error);
      };

      this.recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const transcript = res[0] ? res[0].transcript.trim() : '';
          if (!transcript) continue;
          if (res.isFinal) {
            if (this.onResultCb) this.onResultCb({ transcript });
          } else {
            if (this.onInterimCb) this.onInterimCb({ transcript });
          }
        }
      };

      return true;
    }

    start() {
      if (!this.recognition && !this.init()) return false;
      this.shouldBeListening = true;
      try {
        this.recognition.start();
        return true;
      } catch (err) {
        if (err.name !== 'InvalidStateError') {
          if (this.onErrorCb) this.onErrorCb(err.message);
        }
        return true;
      }
    }

    stop() {
      this.shouldBeListening = false;
      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) {}
      }
      this.isListening = false;
      if (this.onStateChangeCb) this.onStateChangeCb({ listening: false });
    }

    toggle() {
      if (this.isListening || this.shouldBeListening) {
        this.stop();
        return false;
      }
      return this.start();
    }
  }

  const voice = new VoiceController();
  const VoiceModule = {
    controller: voice,
    parseSpeech,
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
