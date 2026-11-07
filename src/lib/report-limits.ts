export const MAX_TASK_EVIDENCE = 100;
export const MAX_REPORT_BYTES = 1_000_000;

export function evidenceLines(value: string) {
 return [...new Set(value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
}
