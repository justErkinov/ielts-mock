"""
Plain-text format that teachers paste straight from a Cambridge book / PDF.

QUESTIONS (one box per Listening part or Reading passage):

    Questions 1-10
    Complete the notes below.
    Write ONE WORD AND/OR A NUMBER for each answer.
    The Food Studio                      <- heading line inside notes (optional)
    1 shows you how to ........ and cook  <- "1 ...", "1. ...", "1) ..."
    • clients who return get a 3 ........ percent discount   <- number inside line

    Questions 11-13
    Choose the correct letter, A, B or C.
    11 Why are changes needed?
    A The number of accidents has risen.
    B The amount of traffic has increased.
    C The types of vehicles have changed.

    Questions 14-19
    Choose the correct heading for each paragraph from the list below.
    List of Headings                      <- optional box title
    i  The productive outcomes of boredom
    ii What teachers can do
    14 Paragraph A

    Questions 8-13
    Do the following statements agree with the information in the passage?
    Write TRUE, FALSE or NOT GIVEN.
    8 The website aimed to ...

ANSWERS (separate box, from the answer key):

    1 choose
    3 20 / twenty           alternatives with "/" or "OR"; "(the) river" = optional word
    11 B                     a letter is turned into that option's text
    14 iv
    8 F                      T/F/NG and Y/N/NG work too
    21-22 B, D               "choose TWO" pairs (either order)

parse() returns questions in the shape the models use, plus errors/warnings.
to_text() turns saved questions back into the same text, for editing.
"""
import re

LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
ROMANS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
          'xi', 'xii', 'xiii', 'xiv', 'xv']
TFNG = ['TRUE', 'FALSE', 'NOT GIVEN']
YNNG = ['YES', 'NO', 'NOT GIVEN']

BLANK = r'(?:\.{3,}|…+|_{2,}|‥+)'
GROUP_RE = re.compile(
    r'^\s*questions?\s+(\d{1,2})(?:\s*(?:[-–—]|to|and|&)\s*(\d{1,2}))?\s*[:.]?\s*$', re.I)
Q_RE = re.compile(r'^\s*[•●▪·◦○■\-]?\s*\(?(\d{1,2})\s*[.):]?\s+(.*)$')
Q_ONLY_RE = re.compile(r'^\s*\(?(\d{1,2})\s*[.):]?\s*$')
LETTER_OPT_RE = re.compile(r'^\s*\(?([A-Z])\s*[.)]?\s+(.+)$')
ROMAN_OPT_RE = re.compile(r'^\s*\(?(xiii|xiv|xii|xv|xi|x|viii|vii|vi|v|iv|ix|iii|ii|i)\s*[.)]?\s+(.+)$', re.I)
EMBEDDED_RE = re.compile(r'(?<![\d£$€.,])\(?\b(\d{1,2})\)?\s*' + BLANK)
IMG_RE = re.compile(r'^\s*\[img:[^\]]+\]\s*$')
BOX_TOKEN_RE = re.compile(r'\[box:([^\]]*)\]')
BULLET_RE = re.compile(r'^\s*[•●▪·◦○■\-–]\s*')


def _clean_line(s):
    s = s.replace(' ', ' ').replace('\t', ' ')
    return re.sub(r'[ ]{2,}', ' ', s).rstrip()


def _blanks(text):
    """Any dots / underscores / ellipsis run becomes the ___ the exam screens use."""
    text = re.sub(r'\s*' + BLANK + r'\s*', ' ___ ', text)
    return re.sub(r'\s{2,}', ' ', text).strip()


# ---------------------------------------------------------------- questions

def _new_group(title=None, start=None, end=None):
    return {'title': title, 'start': start, 'end': end, 'instr': [], 'box': None,
            'shared': [], 'shared_kind': None, 'questions': [], 'pending': []}


def _expected(group, used):
    """Question numbers this group may still contain."""
    if group['start'] is None:
        return None
    return [n for n in range(group['start'], group['end'] + 1) if n not in used]


def _option_run(lines, i):
    """Read a run of lettered (A, B, C...) or roman (i, ii...) options starting at lines[i]."""
    m = LETTER_OPT_RE.match(lines[i])
    if m and m.group(1) == 'A':
        out, k = [], i
        while k < len(lines):
            mm = LETTER_OPT_RE.match(lines[k])
            if not mm or mm.group(1) != LETTERS[len(out)]:
                break
            out.append(mm.group(2).strip())
            k += 1
        if len(out) >= 2:
            return 'letter', out, k
    m = ROMAN_OPT_RE.match(lines[i])
    if m and m.group(1).lower() == 'i':
        out, k = [], i
        while k < len(lines) and len(out) < len(ROMANS):
            mm = ROMAN_OPT_RE.match(lines[k])
            if not mm or mm.group(1).lower() != ROMANS[len(out)]:
                break
            out.append(mm.group(2).strip())
            k += 1
        if len(out) >= 2:
            return 'roman', out, k
    return None, None, i


def _embedded(line, expected):
    """'shows you how to 1 ........ and 2 ........ fish' -> [(1, text), (2, text)]"""
    hits = [m for m in EMBEDDED_RE.finditer(line)
            if expected is None or int(m.group(1)) in expected]
    out = []
    for idx, m in enumerate(hits):
        seg_start = 0 if idx == 0 else hits[idx - 1].end()
        after = line[m.end():] if idx + 1 == len(hits) else ''
        t = line[seg_start:m.start()] + ' ___ ' + after
        out.append((int(m.group(1)), _blanks(BULLET_RE.sub('', t))))
    return out


BLANK_START_RE = re.compile(r'^\s*' + BLANK)
ENDS_WITH_NUM_RE = re.compile(r'(?:^|\s)\(?\d{1,2}\)?\s*$')


def _join_broken(lines):
    """PDF copies often split '1 ……… and cook' over two lines:
    a line that starts with a gap is glued to the line before it when that line
    ends with the question number (or is only the number)."""
    out = []
    for l in lines:
        if out and BLANK_START_RE.match(l) and ENDS_WITH_NUM_RE.search(out[-1]):
            out[-1] = out[-1].rstrip() + ' ' + l.strip()
        else:
            out.append(l)
    # '• also offers' + '2 …… classes' -> one line, when the first is an unfinished bullet
    joined = []
    for l in out:
        if joined and BULLET_RE.match(joined[-1]) and not re.search(BLANK, joined[-1]) \
                and re.match(r'^\s*\(?\d{1,2}\)?\s*' + BLANK, l) and not joined[-1].rstrip().endswith(('.', ':', '?')):
            joined[-1] = joined[-1].rstrip() + ' ' + l.strip()
        else:
            joined.append(l)
    return joined


NOISE_RE = re.compile(r'^(part|section|listening|reading|reading passage|passage)\s*\d*\s*$', re.I)


def parse_questions(text):
    lines = [_clean_line(l) for l in (text or '').splitlines()]
    lines = _join_broken([l for l in lines if l.strip() and not NOISE_RE.match(l.strip())])
    groups, errors, used = [], [], set()
    g = None
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        gm = GROUP_RE.match(line)
        if gm:
            a = int(gm.group(1))
            b = int(gm.group(2) or a)
            title = re.sub(r'\s*[–—]\s*', '-', stripped).rstrip(':.')
            g = _new_group(title, min(a, b), max(a, b))
            groups.append(g)
            i += 1
            continue
        if g is None:
            g = _new_group()
            groups.append(g)

        expected = _expected(g, used)
        qs = g['questions']
        q = qs[-1] if qs else None

        # option lists (A, B, C... or i, ii, iii...)
        kind, opts, nxt = _option_run(lines, i)
        if kind:
            own = q is not None and q['options'] is None and not q['gap'] \
                and not g['pending'] and (len(qs) == 1 or any(x['options'] for x in qs))
            if own:
                q['options'] = opts
            else:
                g['shared'], g['shared_kind'] = opts, kind
                # a short line right before the box is its title ("List of Headings")
                src = g['pending'] if g['pending'] else (g['instr'] if not qs else [])
                if src and len(src[-1]) <= 40 and not src[-1].endswith(('.', '?')) \
                        and not IMG_RE.match(src[-1]):
                    g['box'] = src.pop()
            i = nxt
            continue

        # "1 text" / "1. text" / "1"
        qm = Q_RE.match(line) or Q_ONLY_RE.match(line)
        n = int(qm.group(1)) if qm else None
        multi = _embedded(line, expected) if qm else []
        if qm and len([x for x in multi if x[0] not in used]) >= 2 and multi[0][0] == n:
            qm = None   # several numbered gaps on one line: handled below
        if qm and ((expected is None and n not in used) or (expected is not None and n in expected)):
            rest = ((qm.group(2) if qm.re is Q_RE else '') or '').strip()
            gap = bool(re.search(BLANK + '|___', rest))
            heading = '\n'.join(g['pending'])
            g['pending'] = []
            body = _blanks(rest) if gap else rest
            qs.append({'number': n, 'text': (heading + '\n' + body) if heading else body,
                       'options': None, 'gap': gap})
            used.add(n)
            i += 1
            continue

        # number inside a notes line: "• costs £ 3 ........ per hour"
        emb = [(num, t) for num, t in _embedded(line, expected) if num not in used]
        if emb:
            heading = '\n'.join(g['pending'])
            g['pending'] = []
            for k, (num, t) in enumerate(emb):
                qs.append({'number': num, 'text': (heading + '\n' + t) if (heading and k == 0) else t,
                           'options': None, 'gap': True})
                used.add(num)
            i += 1
            continue

        # plain line
        if IMG_RE.match(stripped):
            g['instr'].append(stripped)
        elif BOX_TOKEN_RE.fullmatch(stripped):
            g['box'] = BOX_TOKEN_RE.fullmatch(stripped).group(1).strip()
        elif not qs:
            g['instr'].append(stripped)
        elif q and not q['gap'] and q['options'] is None and not g['shared'] and not g['pending'] \
                and not (i + 1 < len(lines) and _option_run(lines, i + 1)[0]):
            if re.search(BLANK, stripped):
                q['text'], q['gap'] = _blanks(q['text'] + ' ' + stripped), True
            else:
                q['text'] = (q['text'] + ' ' + stripped).strip()      # stem wrapped onto the next line
        elif q and q['gap'] and not g['pending'] and stripped[:1].islower():
            q['text'] = (q['text'] + ' ' + _blanks(stripped)).strip()  # notes line wrapped
        else:
            g['pending'].append(BULLET_RE.sub('', stripped))
        i += 1

    warnings = []
    for g in groups:
        # "Questions 21 and 22 / Choose TWO letters / Which TWO ...? / A ... E" — no numbered lines
        if not g['questions'] and g['shared'] and g['start'] is not None:
            stem = g['instr'].pop() if g['instr'] and not IMG_RE.match(g['instr'][-1]) else ''
            for n in range(g['start'], g['end'] + 1):
                if n not in used:
                    g['questions'].append({'number': n, 'text': stem, 'options': None, 'gap': False})
                    used.add(n)
        if g['pending'] and g['questions']:
            warnings.append(f"{g['title'] or 'Group'}: this text after the last question was not used: "
                            f"\"{g['pending'][0][:60]}\"")
        _split_instruction(g)
    for g in groups:
        if g['title'] and not g['questions']:
            errors.append(f"{g['title']}: no questions were found under this title. Put the number before each "
                          f"question (\"1 …\") or before each gap (\"1 ……\").")
    return [g for g in groups if g['questions']], errors, warnings


INSTR_RE = re.compile(r'\b(complete|write|choose|label|answer|match|classify|look at|do the following|'
                      r'reading passage|which|NB|you may use|list of|in boxes|on your answer sheet)\b', re.I)


def _split_instruction(g):
    """Lines after the last instruction-like sentence (e.g. the notes title, 'The Food Studio')
    are headings inside the notes, so they move onto the first question."""
    if not g['questions'] or not g['instr'] or g['questions'][0]['options'] is not None or not g['questions'][0]['gap']:
        return
    last = max((k for k, l in enumerate(g['instr']) if INSTR_RE.search(l) or IMG_RE.match(l)), default=-1)
    tail = [l for l in g['instr'][last + 1:] if l.lower() not in ('example', 'examples', 'answer')]
    if tail:
        g['instr'] = g['instr'][:last + 1]
        q0 = g['questions'][0]
        q0['text'] = '\n'.join(tail + [q0['text']])


def _group_style(g):
    instr = ' '.join(g['instr']).upper()
    if 'TRUE' in instr and 'FALSE' in instr and 'NOT GIVEN' in instr:
        return 'tfng'
    if re.search(r'\bYES\b', instr) and re.search(r'\bNO\b', instr) and 'NOT GIVEN' in instr:
        return 'ynng'
    if g['shared']:
        return 'list'
    if any(q['options'] for q in g['questions']):
        return 'choice'
    return 'gap'


def _letters_from_instr(instr):
    m = re.search(r'letters?,?\s*([A-Z])\s*[-–]\s*([A-Z])', instr, re.I)
    return bool(m)


# ---------------------------------------------------------------- answers

HEAD_RE = re.compile(r'^\s*(?:Q(?:uestion)?\s*)?(\d{1,2})(?:\s*(?:[-–&,]|and)\s*(\d{1,2}))?\s*[.):]?\s+', re.I)


def parse_answers(text):
    """
    One answer per line ("1 choose"), or several on one line ("1 choose 2 private 3 20 / twenty").
    A line is only split where the NEXT question number appears, so "3 20 / twenty" stays intact.
    """
    out = {}
    for line in (text or '').replace(' ', ' ').splitlines():
        line = line.strip()
        if not line or re.match(r'^(answers?|answer key|listening|reading|part|section|passage)\b', line, re.I):
            continue
        while line:
            m = HEAD_RE.match(line)
            if not m:
                break
            a = int(m.group(1))
            b = int(m.group(2) or a)
            rest = line[m.end():]
            nxt = re.search(r'\s(' + str(max(a, b) + 1) + r')\s*[.):]?\s+\S', ' ' + rest)
            if nxt:
                ans, line = rest[:nxt.start(1) - 1].strip(), rest[nxt.start(1) - 1:].strip()
            else:
                ans, line = rest.strip(), ''
            ans = re.sub(r'\(?\s*in (either|any) order\s*\)?', '', ans, flags=re.I).strip()
            for n in range(min(a, b), max(a, b) + 1):
                out[n] = {'raw': ans, 'pair': b != a}
    return out


def _gap_answer(ans):
    alts = []
    for part in re.split(r'\s*(?:/|\|| OR |;)\s*', ans):
        part = part.strip().strip('.').strip()
        if not part:
            continue
        m = re.search(r'\(([^)]+)\)', part)
        if m:
            without = re.sub(r'\s*\([^)]+\)\s*', ' ', part).strip()
            with_ = re.sub(r'[()]', '', part).strip()
            for v in (without, with_):
                if v and v not in alts:
                    alts.append(re.sub(r'\s{2,}', ' ', v))
        elif part not in alts:
            alts.append(part)
    return '|'.join(alts)


def _choice_answer(ans, options, kind):
    tokens = [t for t in re.split(r'[\s,/&]+|\band\b|\bor\b', ans, flags=re.I) if t]
    picked = []
    for t in tokens:
        t0 = t.strip('().').strip()
        if kind == 'roman' and t0.lower() in ROMANS[:len(options)]:
            picked.append(options[ROMANS.index(t0.lower())])
        elif len(t0) == 1 and t0.upper() in LETTERS[:len(options)]:
            picked.append(options[LETTERS.index(t0.upper())])
    if not picked:  # the answer was written as the option text itself
        for o in options:
            if o.lower().strip('. ') == ans.lower().strip('. '):
                picked.append(o)
    return picked


def _fixed_answer(ans, vocab):
    a = ans.upper().strip('. ')
    short = {'T': 'TRUE', 'F': 'FALSE', 'Y': 'YES', 'N': 'NO', 'NG': 'NOT GIVEN', 'NOTGIVEN': 'NOT GIVEN'}
    a = short.get(a.replace(' ', ''), a)
    return a if a in vocab else None


# ---------------------------------------------------------------- public

def parse(kind, questions_text, answers_text, first=None, last=None):
    """
    kind: 'listening' | 'reading'
    Returns {'questions': [...model-ready dicts...], 'errors': [...], 'warnings': [...]}
    """
    groups, errors, warnings = parse_questions(questions_text)
    answers = parse_answers(answers_text)
    out = []

    for g in groups:
        style = _group_style(g)
        instr_lines = list(g['instr'])
        if g['box']:
            instr_lines.append(f"[box:{g['box']}]")
        instruction = '\n'.join(instr_lines)
        nums = [q['number'] for q in g['questions']]
        title = g['title'] or (f"Questions {min(nums)}-{max(nums)}" if nums else '')
        letters = _letters_from_instr(' '.join(g['instr']))
        if g['start'] is not None:
            missing = [n for n in range(g['start'], g['end'] + 1) if n not in nums]
            if missing:
                errors.append(f"{title}: question{'s' if len(missing) > 1 else ''} "
                              f"{', '.join(map(str, missing))} not found in the text.")

        for q in g['questions']:
            n = q['number']
            item = {'question_number': n, 'group_title': title, 'group_instruction': instruction,
                    'question_text': q['text'], 'options': None, 'correct_answer': '', 'style': style}
            a = answers.get(n)
            if not a:
                errors.append(f"Question {n}: no answer in the answer key.")
            raw = a['raw'] if a else ''

            if style == 'tfng':
                item['question_type'] = 'tfng' if kind == 'reading' else 'mcq'
                item['options'] = None if kind == 'reading' else TFNG
                v = _fixed_answer(raw, TFNG) if raw else None
                if raw and not v:
                    errors.append(f"Question {n}: answer must be TRUE, FALSE or NOT GIVEN (got \"{raw}\").")
                item['correct_answer'] = v or ''
            elif style == 'ynng':
                item['question_type'] = 'mcq'
                item['options'] = YNNG
                v = _fixed_answer(raw, YNNG) if raw else None
                if raw and not v:
                    errors.append(f"Question {n}: answer must be YES, NO or NOT GIVEN (got \"{raw}\").")
                item['correct_answer'] = v or ''
            elif style in ('list', 'choice'):
                if style == 'list':
                    base = g['shared']
                    opts = [f"{ROMANS[i]}. {o}" for i, o in enumerate(base)] \
                        if (g['shared_kind'] == 'roman' and kind == 'reading') else list(base)
                    okind = g['shared_kind']
                else:
                    base = q['options'] or []
                    opts, okind = list(base), 'letter'
                    if not base:
                        errors.append(f"Question {n}: no options A, B, C... found under it.")
                item['question_type'] = 'mcq'
                item['options'] = opts
                if raw:
                    picked = _choice_answer(raw, base, okind)
                    if not picked:
                        errors.append(f"Question {n}: answer \"{raw}\" does not match any option letter.")
                    else:
                        idx = [base.index(p) for p in picked]
                        item['correct_answer'] = '|'.join(opts[i] for i in idx)
            else:  # gap
                item['question_type'] = 'gap_fill'
                if '___' not in q['text']:
                    item['question_text'] = (q['text'] + ' ___').strip() if not letters else \
                        (q['text'].rstrip(' :') + ': ___')
                if letters:
                    item['correct_answer'] = raw.strip('. ').lower()
                else:
                    item['correct_answer'] = _gap_answer(raw) if raw else ''
            out.append(item)

    nums = [q['question_number'] for q in out]
    dupes = sorted({n for n in nums if nums.count(n) > 1})
    if dupes:
        errors.append(f"Question number used twice: {', '.join(map(str, dupes))}.")
    if first is not None and last is not None:
        missing = [n for n in range(first, last + 1) if n not in nums]
        if missing and len(missing) < (last - first + 1):
            warnings.append(f"Expected questions {first}-{last}; missing: {', '.join(map(str, missing))}.")
        if not nums:
            errors.append(f"No questions found. Start each block with a line like \"Questions {first}-{last}\".")
    extra = sorted(set(answers) - set(nums))
    if extra and nums:
        warnings.append(f"The answer key has answers for questions that are not in the text: "
                        f"{', '.join(map(str, extra))}.")
    out.sort(key=lambda q: q['question_number'])
    return {'questions': out, 'errors': errors, 'warnings': warnings}


# ---------------------------------------------------------------- back to text

def _strip_prefixes(t):
    t = re.sub(r'^(YES / NO / NOT GIVEN|TRUE / FALSE / NOT GIVEN):\s*', '', t or '', flags=re.I)
    return t


def to_text(kind, questions):
    """questions: model objects or dicts with question_number, question_type, question_text,
    options, correct_answer, group_title, group_instruction (may be empty for old data)."""
    get = (lambda q, k: q.get(k)) if questions and isinstance(questions[0], dict) else getattr
    qs = sorted(questions, key=lambda q: get(q, 'question_number'))

    # group: saved group fields, or (old Reading data) consecutive questions of the same kind
    groups = []
    for q in qs:
        opts = get(q, 'options') or []
        gkey = (get(q, 'group_title') or '', get(q, 'group_instruction') or '')
        if not gkey[0]:
            if get(q, 'question_type') == 'tfng':
                gkey = ('', 'tfng')
            elif opts == YNNG:
                gkey = ('', 'ynng')
            elif get(q, 'question_type') == 'mcq':
                gkey = ('', 'mcq:' + '|'.join(opts))
            else:
                gkey = ('', 'gap')
        if groups and groups[-1]['key'] == gkey:
            groups[-1]['items'].append(q)
        else:
            groups.append({'key': gkey, 'items': [q]})

    q_lines, a_lines = [], []
    for grp in groups:
        items = grp['items']
        title, instr = grp['key']
        first, last = get(items[0], 'question_number'), get(items[-1], 'question_number')
        q_lines.append(title or (f"Questions {first}-{last}" if first != last else f"Question {first}"))
        box = None
        if title:
            for l in (instr or '').split('\n'):
                bm = BOX_TOKEN_RE.fullmatch(l.strip())
                if bm:
                    box = bm.group(1)
                elif l.strip():
                    q_lines.append(l.strip())
        else:
            default = {
                'tfng': ['Do the following statements agree with the information given in the passage?',
                         'Write TRUE, FALSE or NOT GIVEN.'],
                'ynng': ['Do the following statements agree with the claims of the writer?',
                         'Write YES, NO or NOT GIVEN.'],
                'gap': ['Complete the sentences below.'],
            }
            roman0 = all(re.match(r'^[ivx]+\.\s', o, re.I) for o in (get(items[0], 'options') or ['x']))
            q_lines.extend(default.get(instr, ['Choose the correct heading for each paragraph from the list of headings below.']
                                       if roman0 else ['Choose the correct answer.']))

        opts0 = get(items[0], 'options') or []
        shared = get(items[0], 'question_type') == 'mcq' and len(items) > 1 and opts0 not in (YNNG, TFNG) \
            and all((get(q, 'options') or []) == opts0 for q in items)
        roman = shared and all(re.match(r'^[ivx]+\.\s', o, re.I) for o in opts0)
        base = [re.sub(r'^[ivx]+\.\s*', '', o, flags=re.I) for o in opts0] if roman else opts0
        if shared:
            if box or roman:
                q_lines.append(box or 'List of Headings')
            for i, o in enumerate(base):
                q_lines.append(f"{ROMANS[i] if roman else LETTERS[i]} {o}")

        for q in items:
            n = get(q, 'question_number')
            text = _strip_prefixes(get(q, 'question_text') or '')
            if roman:
                text = re.sub(r'^Choose the correct heading for\s*', '', text, flags=re.I)
            *heads, body = text.split('\n')
            q_lines.extend(heads)
            q_lines.append(f"{n} {body}")
            opts = get(q, 'options') or []
            ans = get(q, 'correct_answer') or ''
            if get(q, 'question_type') == 'mcq' and opts not in (YNNG, TFNG):
                if not shared:
                    for i, o in enumerate(opts):
                        q_lines.append(f"{LETTERS[i]} {o}")
                codes = []
                for a in ans.split('|'):
                    if a in opts:
                        i = opts.index(a)
                        codes.append(ROMANS[i] if roman else LETTERS[i])
                ans = ', '.join(codes) if codes else ans.replace('|', ' / ')
            else:
                ans = ans.replace('|', ' / ')
            a_lines.append(f"{n} {ans}")
        q_lines.append('')
    return '\n'.join(q_lines).strip() + '\n', '\n'.join(a_lines) + '\n'
