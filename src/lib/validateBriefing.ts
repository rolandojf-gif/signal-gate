import type { BriefingRun, ChangeType } from '../types/briefing';
import { computeSignalScore } from './score';

export type ValidationIssue = {
  briefingId: string;
  severity: 'error' | 'warn';
  rule: string;
  message: string;
};

// A change can legitimately reference a signal that is no longer in the active
// set — that is exactly what "it left the nervous system" means.
function signalMayBeAbsent(type: ChangeType): boolean {
  return type === 'degraded' || type === 'discarded' || type === 'weakened';
}

/**
 * Encodes the product's coherence contract. The dashboard lives or dies on the
 * verdict, the matrix, the signals and the radar telling the same story — so we
 * fail loudly (in dev) when an id dangles or a score drifts from its formula.
 */
export function validateBriefings(briefings: BriefingRun[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (briefingId: string, severity: ValidationIssue['severity'], rule: string, message: string) =>
    issues.push({ briefingId, severity, rule, message });

  for (const b of briefings) {
    const signalIds = new Set(b.signals.map((s) => s.id));
    const variableIds = new Set(b.variableRadar.map((v) => v.id));

    for (const s of b.signals) {
      const expected = computeSignalScore(s);
      if (Math.abs(s.signalScore - expected) > 1) {
        add(b.id, 'error', 'score-coherence', `Signal "${s.id}" stores signalScore=${s.signalScore} but the formula yields ${expected}.`);
      }
      if (!variableIds.has(s.variableId)) {
        add(b.id, 'error', 'signal-variable-ref', `Signal "${s.id}" references unknown variableId "${s.variableId}".`);
      }
      if (s.signalScore >= 80 && s.level === 'low') {
        add(b.id, 'warn', 'level-vs-score', `Signal "${s.id}" scores ${s.signalScore} but is tagged level "low".`);
      }
      if (s.signalScore < 60 && s.level === 'critical') {
        add(b.id, 'warn', 'level-vs-score', `Signal "${s.id}" scores ${s.signalScore} but is tagged level "critical".`);
      }
    }

    for (const c of b.changesSinceLastRun) {
      if (c.relatedSignalId && !signalIds.has(c.relatedSignalId) && !signalMayBeAbsent(c.type)) {
        add(b.id, 'error', 'change-signal-ref', `Change "${c.id}" (${c.type}) references unknown signal "${c.relatedSignalId}".`);
      }
      if (c.relatedVariableId && !variableIds.has(c.relatedVariableId)) {
        add(b.id, 'error', 'change-variable-ref', `Change "${c.id}" references unknown variable "${c.relatedVariableId}".`);
      }
    }

    for (const v of b.variableRadar) {
      for (const sid of v.relatedSignalIds ?? []) {
        if (!signalIds.has(sid)) {
          add(b.id, 'error', 'radar-signal-ref', `Radar variable "${v.id}" references unknown signal "${sid}".`);
        }
      }
    }

    for (const t of b.thresholds) {
      if (t.relatedSignalId && !signalIds.has(t.relatedSignalId)) {
        add(b.id, 'error', 'threshold-signal-ref', `Threshold "${t.id}" references unknown signal "${t.relatedSignalId}".`);
      }
      if (t.relatedVariableId && !variableIds.has(t.relatedVariableId)) {
        add(b.id, 'error', 'threshold-variable-ref', `Threshold "${t.id}" references unknown variable "${t.relatedVariableId}".`);
      }
    }

    const nervousCount = b.signals.filter((s) => s.signalScore >= 80).length;
    if (b.actionMatrix.nervousSystem.length !== nervousCount) {
      add(b.id, 'warn', 'matrix-nervous-count', `actionMatrix.nervousSystem has ${b.actionMatrix.nervousSystem.length} items but ${nervousCount} signal(s) score >=80.`);
    }
  }

  return issues;
}
