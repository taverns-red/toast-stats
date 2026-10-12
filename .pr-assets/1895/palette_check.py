#!/usr/bin/env python3
"""Map pin palette validator for #1785 (docs/design/map-pin-colour-modes.md).

Pure Python, no dependencies. Method:
  * CVD simulation: Machado, Oliveira & Fernandes (2009) matrices at severity
    1.0 (protanopia, deuteranopia, tritanopia), applied in linear sRGB.
  * Distinctness: CIEDE2000 colour difference between every pair of fills
    (categorical palettes) or every adjacent pair (ordinal palettes), under
    normal vision and each simulation.
  * Contrast: WCAG 2.x relative-luminance contrast ratio.
      - pin outline vs basemap land and water, light and dark (1.4.11, >= 3:1)
      - best label colour (white or ink) on each fill (1.4.3, >= 4.5:1),
        for cluster counts and on-pin codes.
  * Ordinal palettes additionally must have monotone CIE L* under every
    simulation (order survives any CVD).

Run: python3 palette_check.py [--json out.json]
Exit 1 if any palette fails its thresholds.
"""
import json
import math
import sys

# ── Basemap + chrome colours (proposed for #1786; brand tokens where they exist)
BASEMAP = {
    'light': {'land': '#F4F1EB', 'water': '#C9D7E0', 'outline': '#3D3B38'},
    'dark': {'land': '#1A1816', 'water': '#1E2A33', 'outline': '#F4F1EB'},
}
INK = '#0F0E0D'
WHITE = '#FFFFFF'

# ── Palettes. kind: 'categorical' (all pairs) | 'ordinal' (adjacent pairs,
# monotone L*) | 'status' (all pairs; shapes carry meaning too)
PALETTES = {
    'health': {
        'kind': 'status',
        'colors': {
            'Thriving': '#2A8F6E',
            'Vulnerable': '#E0A030',
            'Intervention required': '#C93D3D',
        },
    },
    'tier': {
        'kind': 'ordinal',
        'colors': {
            'Not yet Distinguished': '#D6D3CC',
            'Distinguished': '#7FB8D9',
            'Select': '#2C6E90',
            "President's": '#004165',
            'Smedley': '#7B1828',
        },
        # Smedley is a distinct award, not the next lightness step — exempt
        # the last step from the monotone check.
        'monotone_upto': 4,
    },
    'categorical8': {
        'kind': 'categorical',
        'colors': {
            'c1 indigo': '#332288',
            'c2 teal': '#44AA99',
            'c3 sand': '#DDCC77',
            'c4 rose': '#CC6677',
            'c5 sky': '#88CCEE',
            'c6 green': '#117733',
            'c7 wine': '#882255',
            'c8 olive': '#999933',
        },
    },
    'sequential5': {
        'kind': 'ordinal',
        'colors': {
            's1': '#DCE9F5',
            's2': '#9ECAE1',
            's3': '#5A9FCF',
            's4': '#2B6FB0',
            's5': '#0B3F7A',
        },
    },
    'diverging5': {
        'kind': 'diverging',
        'colors': {
            'strong decline': '#B2182B',
            'decline': '#EF8A62',
            'no change': '#D9D6D0',
            'growth': '#67A9CF',
            'strong growth': '#2166AC',
        },
    },
    # Compliance modes (renewals, CSP, officer list): exception-first. "Not
    # available" is NOT a fill — it is the shared hollow-ring glyph — so it is
    # deliberately absent here (it is distinguished by shape, not colour).
    'compliance': {
        'kind': 'status',
        'colors': {
            'Done': '#2A8F6E',
            'Partly / pending': '#E0A030',
            'Needs action': '#C93D3D',
        },
    },
    # Attendance (online/hybrid): three categories from categorical8.
    'attendance': {
        'kind': 'categorical',
        'colors': {
            'In person only': '#332288',
            'Online attendance possible': '#44AA99',
            'Online only': '#DDCC77',
        },
    },
    # Coach: exception-first (an active coach is the signal).
    'coach': {
        'kind': 'status',
        'colors': {
            'Coach active': '#882255',
            'Coaching complete': '#88CCEE',
            'No coach': '#D6D3CC',
        },
    },
    # Operational status (Active / Low / Ineligible / Suspended).
    'status': {
        'kind': 'status',
        'colors': {
            'Active': '#2B6FB0',
            'Low': '#E0A030',
            'Ineligible': '#C93D3D',
            'Suspended': '#8C8A82',
        },
    },
}

THRESH = {
    'outline_vs_land': 3.0,
    'label_on_fill': 4.5,
    'de_normal': 15.0,
    'de_cvd': 8.0,
    'de_adjacent_ordinal': 8.0,
}

MACHADO = {
    'protan': [[0.152286, 1.052583, -0.204868],
               [0.114503, 0.786281, 0.099216],
               [-0.003882, -0.048116, 1.051998]],
    'deutan': [[0.367322, 0.860646, -0.227968],
               [0.280085, 0.672501, 0.047413],
               [-0.011820, 0.042940, 0.968881]],
    'tritan': [[1.255528, -0.076749, -0.178779],
               [-0.078411, 0.930809, 0.147602],
               [0.004733, 0.691367, 0.303900]],
}


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def rgb2hex(c):
    return '#' + ''.join('%02X' % round(max(0, min(1, v)) * 255) for v in c)


def to_lin(v):
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def to_srgb(v):
    v = max(0.0, min(1.0, v))
    return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055


def simulate(hexc, kind):
    if kind == 'normal':
        return hexc
    lin = [to_lin(v) for v in hex2rgb(hexc)]
    m = MACHADO[kind]
    out = [sum(m[r][k] * lin[k] for k in range(3)) for r in range(3)]
    return rgb2hex([to_srgb(v) for v in out])


def luminance(hexc):
    r, g, b = (to_lin(v) for v in hex2rgb(hexc))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def lab(hexc):
    r, g, b = (to_lin(v) for v in hex2rgb(hexc))
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b)
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116
    fx, fy, fz = f(x), f(y), f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def ciede2000(c1, c2):
    L1, a1, b1 = lab(c1)
    L2, a2, b2 = lab(c2)
    C1 = math.hypot(a1, b1)
    C2 = math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360
    h2p = math.degrees(math.atan2(b2, a2p)) % 360
    dLp = L2 - L1
    dCp = C2p - C1p
    if C1p * C2p == 0:
        dhp = 0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp / 2))
    Lbp = (L1 + L2) / 2
    Cbp = (C1p + C2p) / 2
    if C1p * C2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbp = (h1p + h2p + 360) / 2
    else:
        hbp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30))
         + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6))
         - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    dth = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + (0.015 * (Lbp - 50) ** 2) / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dth)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
                     + Rt * (dCp / Sc) * (dHp / Sh))


VISIONS = ['normal', 'protan', 'deutan', 'tritan']


def check_palette(name, p):
    cols = list(p['colors'].items())
    res = {'name': name, 'kind': p['kind'], 'fills': [], 'pairs': [], 'fail': []}
    for label, c in cols:
        lw, li = contrast(c, WHITE), contrast(c, INK)
        best = ('white', lw) if lw >= li else ('ink', li)
        res['fills'].append({
            'label': label, 'hex': c, 'L': round(lab(c)[0], 1),
            'text': best[0], 'text_contrast': round(best[1], 2),
            'sim': {v: simulate(c, v) for v in VISIONS},
            'vs_land': {t: round(contrast(c, BASEMAP[t]['land']), 2) for t in BASEMAP},
        })
        if best[1] < THRESH['label_on_fill']:
            res['fail'].append(f'{label}: best label contrast {best[1]:.2f} < 4.5')
    if p['kind'] in ('categorical', 'status'):
        pairs = [(i, j) for i in range(len(cols)) for j in range(i + 1, len(cols))]
    else:
        pairs = [(i, i + 1) for i in range(len(cols) - 1)]
    for i, j in pairs:
        row = {'a': cols[i][0], 'b': cols[j][0]}
        for v in VISIONS:
            de = ciede2000(simulate(cols[i][1], v), simulate(cols[j][1], v))
            row[v] = round(de, 1)
            limit = (THRESH['de_normal'] if v == 'normal' else THRESH['de_cvd'])
            if p['kind'] in ('ordinal', 'diverging'):
                limit = THRESH['de_adjacent_ordinal']
            if de < limit:
                res['fail'].append(f'{cols[i][0]} vs {cols[j][0]} ({v}) dE {de:.1f} < {limit}')
        res['pairs'].append(row)
    if p['kind'] == 'ordinal':
        upto = p.get('monotone_upto', len(cols))
        for v in VISIONS:
            ls = [lab(simulate(c, v))[0] for _, c in cols[:upto]]
            mono = all(a > b for a, b in zip(ls, ls[1:])) or all(a < b for a, b in zip(ls, ls[1:]))
            if not mono:
                res['fail'].append(f'L* not monotone under {v}: {[round(x) for x in ls]}')
    if p['kind'] == 'diverging':
        for v in VISIONS:
            ls = [lab(simulate(c, v))[0] for _, c in cols]
            mid = len(ls) // 2
            ok = ls[0] < ls[1] < ls[mid] and ls[-1] < ls[-2] < ls[mid]
            if not ok:
                res['fail'].append(f'diverging L* not peaked at centre under {v}: {[round(x) for x in ls]}')
    return res


def main():
    out = {'basemap': {}, 'palettes': []}
    failed = False
    for t, b in BASEMAP.items():
        cl = contrast(b['outline'], b['land'])
        cw = contrast(b['outline'], b['water'])
        out['basemap'][t] = {'outline_vs_land': round(cl, 2), 'outline_vs_water': round(cw, 2)}
        print(f'[{t}] outline {b["outline"]} vs land {cl:.2f}:1, vs water {cw:.2f}:1')
        if min(cl, cw) < THRESH['outline_vs_land']:
            failed = True
            print('  FAIL outline contrast')
    for name, p in PALETTES.items():
        r = check_palette(name, p)
        out['palettes'].append(r)
        status = 'PASS' if not r['fail'] else 'FAIL'
        print(f'\n== {name} ({r["kind"]}) {status}')
        for f in r['fills']:
            print(f'  {f["hex"]} L*={f["L"]:5} label={f["text"]:5} {f["text_contrast"]:5}:1 '
                  f'sim p/d/t={f["sim"]["protan"]} {f["sim"]["deutan"]} {f["sim"]["tritan"]}  {f["label"]}')
        worst = {v: min((row[v] for row in r['pairs']), default=0) for v in VISIONS}
        print('  min dE2000 ' + ' '.join(f'{v}={worst[v]}' for v in VISIONS))
        for m in r['fail']:
            print('  FAIL ' + m)
        failed = failed or bool(r['fail'])
    if len(sys.argv) > 2 and sys.argv[1] == '--json':
        json.dump(out, open(sys.argv[2], 'w'), indent=1)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
