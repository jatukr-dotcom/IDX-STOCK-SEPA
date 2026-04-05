#!/usr/bin/env python3
"""
Parse KSEI shareholder composition PDF → TSV.
Usage: python scripts/parse_ksei_shareholders.py <input.pdf> <output.tsv>
"""
import sys
import re
from pypdf import PdfReader
from datetime import datetime

TYPES = {'CP','ID','IB','IS','SC','MF','PF','IF'}  # investor type codes
LF = {'L','F'}

def parse_line(line):
    # Format: DD-MMM-YYYY CODE ISSUER_NAME ... INVESTOR_NAME [TYPE] [LF] [NAT] [DOMICILE] H_SCRIPLESS H_SCRIP TOTAL PCT
    # Strategy: split from RIGHT — last 4 tokens are fixed (scripless, scrip, total, pct)
    parts = line.split()
    if len(parts) < 8: return None
    if not re.match(r'\d{1,2}-[A-Z][a-z]{2}-\d{4}', parts[0]): return None

    # Parse from right: pct, total, scrip, scripless
    try:
        pct = float(parts[-1].replace('.','').replace(',','.'))
        total = int(parts[-2].replace('.',''))
        _scrip = int(parts[-3].replace('.',''))
        _scripless = int(parts[-4].replace('.',''))
    except (ValueError, IndexError):
        return None

    # Remaining tokens: date, code, ...issuer_name..., ...investor_name..., [type], [lf], [nat], [domicile]
    remainder = parts[1:-4]
    code = remainder[0]

    # Find type/lf/nat/domicile from the end of remainder
    # Walk backwards: consume domicile (may be multi-word like "VIRGIN ISLANDS, BRITISH")
    # Heuristic: type code (2 letters uppercase), then L/F
    # Easier: search for type+lf pattern
    inv_type = local_foreign = nationality = domicile = None
    tail_start = None
    for i in range(len(remainder) - 1, 0, -1):
        if remainder[i] in TYPES and i+1 < len(remainder) and remainder[i+1] in LF:
            inv_type = remainder[i]
            local_foreign = remainder[i+1]
            # nationality: next token (optional)
            # domicile: rest of line
            if i+2 < len(remainder):
                # nationality is INDONESIAN or blank, domicile is all upper
                # Pattern: INDONESIAN INDONESIA / blank INDONESIA / blank VIRGIN ISLANDS, BRITISH
                nat_dom = ' '.join(remainder[i+2:])
                if nat_dom.startswith('INDONESIAN'):
                    nationality = 'INDONESIAN'
                    domicile = nat_dom[len('INDONESIAN '):].strip() or None
                else:
                    domicile = nat_dom.strip()
            tail_start = i
            break

    if tail_start is None:
        # Some rows have no type/lf/nat/domicile (e.g. MEDIAHUIS IRELAND LIMITED)
        tail_start = len(remainder)

    # issuer_name + investor_name are in remainder[1:tail_start]
    # Heuristic: issuer_name ends with "Tbk" marker, then investor_name starts
    # Simpler: KSEI issuers end with "Tbk" as last word of issuer
    body = remainder[1:tail_start]
    # Find last "Tbk" token
    split_idx = None
    for j in range(len(body)-1, -1, -1):
        if body[j] == 'Tbk':
            split_idx = j + 1
            break
    if split_idx is None:
        # fallback: first 3 words = issuer, rest = investor
        split_idx = min(3, len(body))

    issuer_name = ' '.join(body[:split_idx])
    investor_name = ' '.join(body[split_idx:])

    # Normalize date
    date_obj = datetime.strptime(parts[0], '%d-%b-%Y')
    iso_date = date_obj.strftime('%Y-%m-%d')

    return {
        'date': iso_date, 'code': code, 'issuer': issuer_name,
        'investor': investor_name, 'type': inv_type, 'lf': local_foreign,
        'nationality': nationality, 'domicile': domicile,
        'total': total, 'pct': pct,
    }

def main():
    if len(sys.argv) != 3:
        print('Usage: parse_ksei_shareholders.py <input.pdf> <output.tsv>')
        sys.exit(1)
    reader = PdfReader(sys.argv[1])
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        f.write('date\tcode\tinvestor\ttype\tlocal_foreign\tnationality\tdomicile\ttotal\tpct\n')
        count = 0
        for page in reader.pages:
            for line in page.extract_text().split('\n'):
                row = parse_line(line)
                if row:
                    f.write(f"{row['date']}\t{row['code']}\t{row['investor']}\t{row['type'] or ''}\t{row['lf'] or ''}\t{row['nationality'] or ''}\t{row['domicile'] or ''}\t{row['total']}\t{row['pct']}\n")
                    count += 1
    print(f'Parsed {count} rows -> {sys.argv[2]}')

if __name__ == '__main__':
    main()
