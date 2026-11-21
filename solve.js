// A faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader): run(input) returns exactly
// csv-reader's {columns, rows, errors} for every {text, header}, but reads the text with
// indexOf/slice/split instead of one character at a time.
//
// Semantics (mirroring csv-reader 1.0.0 exactly):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it one
//     quote, each CRLF or lone CR inside it read as LF; what follows its closing quote, up to the
//     next comma or line break, is appended as it stands (quote_junk, when the field ends); a quote
//     that never closes is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote); a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the records after it,
//     each padded with "" (short_row, with fields: its count) or cut (long_row, with extra: the cut
//     fields) to the first record's width;
//   - each error is {code, line, row}, in the order met: line the 1-based line its record starts on
//     (every LF, CRLF and lone CR inside a quoted field counted), row its record's index in rows,
//     null for the header.
//
// Speed: most records hold no quote and no stray CR, so a whole physical line is taken at once
// (slice + split(','), both C++). Records that do hold a quote or a CR take the slow path below,
// which still scans with indexOf and a delimiter regex instead of stepping character by character.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// The next of ',', CR, LF at or after the regex's lastIndex.
const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // How the field being read ended, and how many characters the last unquoted read kept.
  let ended = END;
  let added = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by
  // LF is dropped (stray_cr). Returns the field; `ended` and `added` (characters kept) are set.
  function readUnquoted(value) {
    added = 0;
    while (true) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        if (pos < n) {
          value += text.slice(pos);
          added += n - pos;
          pos = n;
        }
        ended = END;
        return value;
      }
      const i = m.index;
      const c = m[0];
      if (c === ',') {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 1;
        ended = COMMA;
        return value;
      }
      if (c === '\n') {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 1;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      // A CR: a line break when followed by LF, else a stray CR, dropped.
      if (i + 1 < n && text.charCodeAt(i + 1) === 10) {
        if (i > pos) {
          value += text.slice(pos, i);
          added += i - pos;
        }
        pos = i + 2;
        line += 1;
        ended = LINE_BREAK;
        return value;
      }
      error('stray_cr');
      if (i > pos) {
        value += text.slice(pos, i);
        added += i - pos;
      }
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns the field; `ended` is set.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      const q = text.indexOf('"', pos);
      if (q === -1) break; // no closing quote anywhere: unterminated
      if (q > pos) {
        const seg = text.slice(pos, q);
        if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
          value += seg;
        } else {
          // CRLF and a lone CR inside quotes are each one LF.
          for (let i = 0; i < seg.length; i++) {
            const c = seg.charCodeAt(i);
            if (c === 13) {
              value += '\n';
              line += 1;
              if (i + 1 < seg.length && seg.charCodeAt(i + 1) === 10) i += 1;
            } else {
              if (c === 10) line += 1;
              value += seg[i];
            }
          }
        }
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === 34) {
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again
      // as an unquoted field.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= n) {
      ended = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    let quoted = false;
    // Fast path: a whole physical line with no quote and no CR is one record; split it at once.
    // A trailing CR before the line's LF is the CRLF terminator, not part of the record.
    let eol = text.indexOf('\n', pos);
    const hasEol = eol !== -1;
    if (!hasEol) eol = n;
    let chunkEnd = eol;
    if (hasEol && eol > pos && text.charCodeAt(eol - 1) === 13) chunkEnd = eol - 1;
    const chunk = text.slice(pos, chunkEnd);
    if (chunk.indexOf('"') === -1 && chunk.indexOf('\r') === -1) {
      fields = chunk.split(',');
      pos = hasEol ? eol + 1 : n;
      line += 1;
    } else {
      // Slow path: the record holds a quote or a CR; read it field by field.
      fields = [];
      do {
        quoted = text.charCodeAt(pos) === 34;
        fields.push(quoted ? readQuoted() : readUnquoted(''));
      } while (ended === COMMA);
    }

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
