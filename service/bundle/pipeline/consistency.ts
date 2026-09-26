/**
 * Cross-document consistency check for one bundle. Pure function: compares the
 * identity fields returned by classification across the bundle's documents and
 * reports conflicts for human review. It never decides an outcome.
 */
import {
  normaliseNameTokens,
  datesMatch,
  normaliseDate,
  normalisePAN,
} from '../engine/normalisers';

export interface ConsistencyInput {
  documentId: string;
  typeKey: string | null;
  keyFields: Record<string, string>;
}

export interface ConsistencyConflict {
  field: string;
  message: string;
  severity: 'review';
  values: Array<{ documentId: string; typeKey: string | null; value: string }>;
}

type Comparator = (a: string, b: string) => boolean;

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return inter / (setA.size + setB.size - inter);
}

function namesAgree(a: string, b: string): boolean {
  const ta = normaliseNameTokens(a);
  const tb = normaliseNameTokens(b);
  if (jaccard(ta, tb) >= 0.8) return true;
  // Allow initials ("R Kumar" vs "Ravi Kumar") when every token lines up.
  if (ta.length !== tb.length || ta.length === 0) return false;
  const sa = [...ta];
  const sb = [...tb];
  return sa.every((tok) => {
    const idx = sb.findIndex(
      (other) =>
        other === tok ||
        (tok.length === 1 && other.startsWith(tok)) ||
        (other.length === 1 && tok.startsWith(other))
    );
    if (idx === -1) return false;
    sb.splice(idx, 1);
    return true;
  });
}

function gendersAgree(a: string, b: string): boolean {
  const g = (v: string) => {
    const s = v.trim().toLowerCase();
    if (['m', 'male', 'man', 'purush'].includes(s)) return 'm';
    if (['f', 'female', 'woman', 'mahila'].includes(s)) return 'f';
    return s;
  };
  return g(a) === g(b);
}

function digitsTail(v: string, n: number): string {
  const d = v.replace(/\D/g, '');
  return d.length >= n ? d.slice(-n) : d;
}

const FIELDS: Array<{ field: string; label: string; aliases: string[]; agree: Comparator; mask?: (v: string) => string }> = [
  { field: 'full_name', label: 'Name', aliases: ['full_name', 'name', 'patient_name', 'applicant_name'], agree: namesAgree },
  {
    field: 'date_of_birth',
    label: 'Date of birth',
    aliases: ['date_of_birth', 'dob'],
    agree: (a, b) => (normaliseDate(a) === null || normaliseDate(b) === null ? true : datesMatch(a, b)),
  },
  { field: 'gender', label: 'Gender', aliases: ['gender', 'sex'], agree: gendersAgree },
  {
    field: 'pan',
    label: 'PAN',
    aliases: ['pan', 'pan_number'],
    agree: (a, b) => normalisePAN(a) === normalisePAN(b),
  },
  {
    field: 'aadhaar_last4',
    label: 'Aadhaar (last 4)',
    aliases: ['aadhaar_last4', 'aadhaar'],
    agree: (a, b) => digitsTail(a, 4) === digitsTail(b, 4),
    mask: (v) => digitsTail(v, 4),
  },
];

function pick(keyFields: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = keyFields[alias];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function checkConsistency(documents: ConsistencyInput[]): ConsistencyConflict[] {
  const conflicts: ConsistencyConflict[] = [];

  for (const spec of FIELDS) {
    const present = documents
      .map((doc) => ({ doc, value: pick(doc.keyFields || {}, spec.aliases) }))
      .filter((entry): entry is { doc: ConsistencyInput; value: string } => entry.value !== null);

    if (present.length < 2) continue;

    let mismatch = false;
    for (let i = 0; i < present.length && !mismatch; i++) {
      for (let j = i + 1; j < present.length; j++) {
        if (!spec.agree(present[i].value, present[j].value)) {
          mismatch = true;
          break;
        }
      }
    }

    if (mismatch) {
      conflicts.push({
        field: spec.field,
        message: `${spec.label} differs between documents in this bundle`,
        severity: 'review',
        values: present.map(({ doc, value }) => ({
          documentId: doc.documentId,
          typeKey: doc.typeKey,
          value: spec.mask ? spec.mask(value) : value,
        })),
      });
    }
  }

  return conflicts;
}
