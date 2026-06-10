// Parses the time conventions found in the existing SWI spreadsheets:
//   "13:20"                  -> mm:ss
//   "19"                     -> bare minutes
//   "11.66 minutes"          -> decimal minutes
//   "13 minutes 15 seconds"  -> words ("and" optional)
//   "3 min", "45 sec"        -> unit shorthand
// Anything with three colon-separated parts, multiple time tokens, or
// size-conditioned lists ("3.5: 8:10 4.5-6.5: 8:30") is flagged ambiguous
// rather than guessed.

export function parseTime(raw) {
  if (raw === null || raw === undefined) return { seconds: null, ambiguous: false, raw: null };
  const text = String(raw).trim();
  if (!text) return { seconds: null, ambiguous: false, raw: null };

  // h:mm:ss-looking or "/piece" qualifiers — don't guess
  if (/\d+:\d+:\d+/.test(text) || /\/\s*(piece|pc|unit)/i.test(text)) {
    return { seconds: null, ambiguous: true, raw: text };
  }

  const colonTimes = text.match(/\d+:\d{2}/g) || [];
  if (colonTimes.length > 1) return { seconds: null, ambiguous: true, raw: text };

  // single mm:ss, allowing surrounding junk like "13:04 "
  if (colonTimes.length === 1) {
    const stripped = text.replace(colonTimes[0], '').replace(/[\s.]/g, '');
    if (stripped) return { seconds: null, ambiguous: true, raw: text };
    const [m, s] = colonTimes[0].split(':').map(Number);
    return { seconds: m * 60 + s, ambiguous: false, raw: text };
  }

  // "13 minutes 15 seconds" / "3 minutes and 40 seconds"
  let m = text.match(/^(\d+(?:\.\d+)?)\s*min(?:ute)?s?\s*(?:and\s*)?(?:(\d+)\s*sec(?:ond)?s?)?\s*$/i);
  if (m) {
    return { seconds: Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0)), ambiguous: false, raw: text };
  }

  // "45 seconds"
  m = text.match(/^(\d+(?:\.\d+)?)\s*sec(?:ond)?s?\s*$/i);
  if (m) return { seconds: Math.round(parseFloat(m[1])), ambiguous: false, raw: text };

  // bare number = minutes (matches the "Time (minutes)" column convention)
  m = text.match(/^(\d+(?:\.\d+)?)\s*$/);
  if (m) return { seconds: Math.round(parseFloat(m[1]) * 60), ambiguous: false, raw: text };

  return { seconds: null, ambiguous: true, raw: text };
}

export function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
