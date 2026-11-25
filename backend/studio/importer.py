"""
Import a whole Listening test from the teacher's PDF or Word file.

A typical file holds Part 1-4 questions, the answer key and often the transcripts,
with pictures (maps, diagrams). This module:
  * reads the text in reading order, with each picture at its place (PDF: by its
    height on the page; Word: where it sits in the document),
  * finds the answer key (a run of lines "1 club / 2 male / 3 drive ..."),
  * ignores everything after it and any transcripts (a second "PART 1"),
  * splits the questions into Part 1-4 by "PART n" / "Questions x-y" headers,
    question numbers and page breaks,
  * when questions are only inside a picture (e.g. "21 ....." labels on a diagram),
    adds them under the picture so the teacher only has to check them.
The result is plain text in the studio format (see textformat.py), shown in the
editor for the teacher to review before saving.
"""
import io
import re

from .textformat import parse_questions, IMG_RE, _option_run, LETTERS

PART_HDR = re.compile(r'^\s*(?:PART|SECTION)\s*(\d)\b\s*:?\s*$', re.I)
QHDR = re.compile(r'^\s*questions?\s+(\d{1,2})(?:\s*(?:[-–—]|to|and|&)\s*(\d{1,2}))?', re.I)
NUM_LINE = re.compile(r'^\s*[•\-]?\s*\(?(\d{1,2})\b')
EMB = re.compile(r'(?<![\d£$€.,])\b(\d{1,2})\s*(?:\.{3,}|…+|_{2,})')
KEY_LINE = re.compile(r'^\s*(\d{1,2})\s*[.):]?\s+(\S.*)$')
KEY_HDR = re.compile(r'^\s*(question\s*(number|no\.?)?\s*)?answers?(\s*key)?\s*$|^\s*answer\s*key\b', re.I)
PAGE = '\f'   # page-break marker inside the line list


def part_of(n):
    return (n - 1) // 10 + 1 if 1 <= n <= 40 else None


# ------------------------------------------------------------------ reading files

def _pdf_lines(data, save_image):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    lines = []
    for pno, page in enumerate(reader.pages):
        if pno:
            lines.append(PAGE)
        frags, imgs = [], []

        def on_text(text, cm, tm, font, size):
            y = tm[5] * cm[3] + cm[5] if cm else tm[5]
            if text:
                frags.append((text, y))

        def on_op(op, args, cm, tm):
            if op == b'Do' and cm:
                imgs.append(cm[5] + cm[3])     # top edge of the image

        try:
            page.extract_text(visitor_text=on_text, visitor_operand_before=on_op)
        except Exception:
            frags = [(page.extract_text() or '', 0)]
        # rebuild lines with the y of the fragment where each line starts
        text_lines, cur, cur_y = [], '', None
        for text, y in frags:
            parts = text.split('\n')
            for k, piece in enumerate(parts):
                if cur_y is None:
                    cur_y = y
                cur += piece
                if k < len(parts) - 1:
                    text_lines.append((cur, cur_y))
                    cur, cur_y = '', None
        if cur.strip():
            text_lines.append((cur, cur_y or 0))

        pics = []
        try:
            for im in page.images:
                if len(im.data) < 4000:      # tiny logos / lines
                    continue
                url = save_image(im.name or 'picture.jpg', im.data)
                if url:
                    pics.append(url)
        except Exception:
            pass
        # put each picture before the first line that is lower on the page than its top
        tops = sorted(imgs, reverse=True)[:len(pics)] + [None] * max(0, len(pics) - len(imgs))
        placed = list(zip(tops, pics))
        out = []
        for text, y in text_lines:
            while placed and (placed[0][0] is None or (y is not None and y < placed[0][0] - 2)):
                out.append(f'[img:{placed.pop(0)[1]}]')
            out.append(text)
        out += [f'[img:{u}]' for _, u in placed]
        lines += out
    return lines


def _docx_lines(data, save_image):
    from docx import Document
    from docx.oxml.ns import qn
    doc = Document(io.BytesIO(data))
    rels = doc.part.related_parts
    lines = []

    def para(p_el):
        text, pics = [], []
        for node in p_el.iter():
            if node.tag == qn('w:t'):
                text.append(node.text or '')
            elif node.tag == qn('w:tab'):
                text.append(' ')
            elif node.tag == qn('w:br') and node.get(qn('w:type')) == 'page':
                lines.append(''.join(text)); text = []
                lines.append(PAGE)
            elif node.tag.endswith('}blip'):
                rid = node.get(qn('r:embed'))
                part = rels.get(rid)
                if part is not None:
                    url = save_image(getattr(part, 'partname', 'picture.png').split('/')[-1], part.blob)
                    if url:
                        pics.append(url)
        for u in pics:
            lines.append(f'[img:{u}]')
        lines.append(''.join(text))

    for el in doc.element.body.iterchildren():
        if el.tag == qn('w:p'):
            para(el)
        elif el.tag == qn('w:tbl'):
            for row in el.iter(qn('w:tr')):
                cells = []
                for cell in row.iter(qn('w:tc')):
                    before = len(lines)
                    for p in cell.iter(qn('w:p')):
                        para(p)
                    cell_lines = [l for l in lines[before:] if l.strip() and l != PAGE]
                    del lines[before:]
                    imgs = [l for l in cell_lines if IMG_RE.match(l)]
                    lines.extend(imgs)
                    # a cell with several paragraphs (e.g. a box of options) stays multi-line
                    txt = [l for l in cell_lines if not IMG_RE.match(l)]
                    cells.append(txt)
                if all(len(c) <= 1 for c in cells):
                    lines.append(' '.join(c[0] for c in cells if c))
                else:
                    for c in cells:
                        lines.extend(c)
    return lines


# ------------------------------------------------------------------ splitting

def _find_answer_key(lines):
    """Where the answer key is: after an "Answers" / "Answer key" heading, or else the
    longest run of lines '1 club', '2 male', ... (numbers going up by 1)."""
    for h, l in enumerate(lines):
        if l != PAGE and KEY_HDR.match(l):
            j, last, got = h + 1, 0, 0
            while j < len(lines):
                if lines[j] == PAGE or not lines[j].strip() or KEY_HDR.match(lines[j]) or PART_HDR.match(lines[j]):
                    j += 1
                    continue
                mm = KEY_LINE.match(lines[j])
                if not mm or int(mm.group(1)) <= last:
                    break
                last, got = int(mm.group(1)), got + 1
                j += 1
            if got >= 3:
                return h, j
    best = (None, None, 0)
    i = 0
    while i < len(lines):
        m = KEY_LINE.match(lines[i]) if lines[i] != PAGE else None
        if m:
            j, expect, run = i, int(m.group(1)), 0
            while j < len(lines):
                if lines[j] == PAGE or not lines[j].strip() or KEY_HDR.match(lines[j]) or PART_HDR.match(lines[j]):
                    j += 1
                    continue
                mm = KEY_LINE.match(lines[j])
                if not mm or int(mm.group(1)) != expect:
                    break
                expect += 1
                run += 1
                j += 1
            if run > best[2]:
                best = (i, j, run)
            i = max(j, i + 1)
        else:
            i += 1
    if best[2] >= 8:
        start = best[0]
        while start > 0 and (KEY_HDR.match(lines[start - 1]) or not lines[start - 1].strip()):
            start -= 1
        return start, best[1]
    return None, None


def split_listening(lines):
    warnings = []
    k0, k1 = _find_answer_key(lines)
    answers = {1: [], 2: [], 3: [], 4: []}
    if k0 is not None:
        for l in lines[k0:k1]:
            m = KEY_LINE.match(l) if l != PAGE else None
            if m and part_of(int(m.group(1))):
                answers[part_of(int(m.group(1)))].append(f'{int(m.group(1))} {m.group(2).strip()}')
    else:
        warnings.append('No answer key was found in the file. Paste the answers into each part.')

    # questions: before the answer key, and before transcripts (a second "PART 1")
    end = k0 if k0 is not None else len(lines)
    seen_part1 = 0
    for idx, l in enumerate(lines[:end]):
        m = PART_HDR.match(l) if l != PAGE else None
        if m and m.group(1) == '1':
            seen_part1 += 1
            if seen_part1 == 2:
                end = idx
                break
    q_lines = lines[:end]

    parts = {1: [], 2: [], 3: [], 4: []}
    cur, seen = 1, set()
    for l in q_lines:
        if l == PAGE:
            # the part on screen is finished -> the next page starts the next part
            if 10 * cur in seen and cur < 4:
                cur += 1
            continue
        m = PART_HDR.match(l)
        if m:
            cur = min(4, max(1, int(m.group(1))))
            continue
        h = QHDR.match(l)
        if h and part_of(int(h.group(1))):
            cur = part_of(int(h.group(1)))           # "Questions 27-30" -> Part 3
        nums = [int(x) for x in EMB.findall(l)]
        nm = NUM_LINE.match(l)
        if nm and not h:
            nums.append(int(nm.group(1)))
        for n in nums:
            p = part_of(n)
            if p and p == cur + 1 and n not in seen:
                cur = p                               # first question of the next part
            if p == cur:
                seen.add(n)
        parts[cur].append(l.rstrip())

    result = []
    for p in range(1, 5):
        text = '\n'.join(parts[p]).strip()
        text = re.sub(r'\n{3,}', '\n\n', text)
        text, note = _label_picture_questions(text, p, answers[p])
        if note:
            warnings.append(note)
        result.append({'questions': text + ('\n' if text else ''),
                       'answers': '\n'.join(answers[p]) + ('\n' if answers[p] else '')})
        if not text:
            warnings.append(f'Part {p}: no questions were found in the file.')
    return result, warnings


NUM_WORDS = {2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE', 6: 'SIX', 7: 'SEVEN', 8: 'EIGHT', 9: 'NINE', 10: 'TEN'}
WORD_LIMIT = {1: 'ONE WORD ONLY', 2: 'NO MORE THAN TWO WORDS', 3: 'NO MORE THAN THREE WORDS'}


def _picture_kind(text):
    low = text.lower()
    for word in ('map', 'plan', 'diagram'):
        if re.search(rf'\b{word}\b', low):
            return word
    return 'diagram'


def _picture_instruction(kind, a, b, box, answer_lines):
    """The same wording as the official IELTS papers, built from what is known:
    how many questions, the letters of the box, and the answers themselves."""
    rng = f'{a}–{b}'
    first = f'Label the {kind} below.'
    if box:
        last = LETTERS[box - 1]
        count = NUM_WORDS.get(b - a + 1)
        choose = f'Choose {count} answers from the box and write' if count and box > b - a + 1 else 'Write'
        return [first, f'{choose} the correct letter, A–{last}, next to Questions {rng}.']
    vals = {}
    for l in answer_lines:
        m = re.match(r'^(\d{1,2})\s+(.*)$', l)
        if m and a <= int(m.group(1)) <= b:
            vals[int(m.group(1))] = m.group(2).strip()
    if vals and all(re.fullmatch(r'[A-Za-z]', v) for v in vals.values()):
        last = max(v.upper() for v in vals.values())
        return [first, f'Write the correct letter, A–{last}, next to Questions {rng}.']
    if vals:
        words = max(len(re.split(r'\s*(?:/|\bOR\b)\s*', v)[0].split()) for v in vals.values())
        has_num = any(re.search(r'\d', v) for v in vals.values())
        limit = WORD_LIMIT.get(words, f'NO MORE THAN {NUM_WORDS.get(words, words)} WORDS')
        return [first, f'Write {limit}{" AND/OR A NUMBER" if has_num else ""} for each answer.']
    return [first]


def _label_picture_questions(text, part, answer_lines=()):
    """Questions that exist only as labels inside a picture ('21 ......' on a diagram):
    add 'Questions 21-26', an official-style instruction and the numbers after the picture."""
    if not text:
        return text, None
    groups, _, _ = parse_questions(text)
    found = {q['number'] for g in groups for q in g['questions']}
    missing = [n for n in range((part - 1) * 10 + 1, part * 10 + 1) if n not in found]
    lines = text.split('\n')
    img_idx = [i for i, l in enumerate(lines) if IMG_RE.match(l.strip())]
    if not missing or not img_idx:
        return text, None
    # contiguous block of missing numbers
    a = b = missing[0]
    while b + 1 in missing:
        b += 1
    i = img_idx[0]
    # only when the picture sits where those questions belong: the next question
    # written as text after the picture must come after the missing ones
    after = parse_questions('\n'.join(lines[i + 1:]))[0]
    nxt = min((q['number'] for g in after for q in g['questions']), default=None)
    if nxt is not None and nxt < a:
        return text, None

    # a box of lettered options right after the picture (e.g. "Functions  A ... I")
    box = 0
    for j in range(i + 1, min(len(lines), i + 4)):
        if QHDR.match(lines[j]):
            break
        kind, opts, _ = _option_run(lines, j)
        if kind == 'letter':
            box = len(opts)
            break
    # instruction lines already written above the picture (under a "Questions a-b" header)
    hdr = next((k for k in range(i - 1, max(-1, i - 6), -1)
                if QHDR.match(lines[k]) and int(QHDR.match(lines[k]).group(1)) == a), None)
    instr = _picture_instruction(_picture_kind('\n'.join(lines[max(0, i - 6):i + 12])), a, b, box, answer_lines)
    if hdr is not None:
        existing = [l for l in lines[hdr + 1:i] if l.strip()]
        block = ([] if existing else instr) + [lines[i]] + [str(n) for n in range(a, b + 1)]
        lines[i:i + 1] = block
    else:
        lines[i:i + 1] = [f'Questions {a}–{b}'] + instr + [lines[i]] + [str(n) for n in range(a, b + 1)]
    return '\n'.join(lines), (f'Part {part}: questions {a}–{b} are labels inside the picture. They were added '
                              f'under it with the standard instructions — check them in the preview.')


def import_listening(name, data, save_image):
    low = (name or '').lower()
    if low.endswith('.pdf') or data[:4] == b'%PDF':
        lines = _pdf_lines(data, save_image)
    elif low.endswith('.docx') or data[:2] == b'PK':
        lines = _docx_lines(data, save_image)
    else:
        lines = data.decode('utf-8', 'replace').splitlines()
    lines = [l.replace(' ', ' ') if l != PAGE else l for l in lines]
    return split_listening(lines)
