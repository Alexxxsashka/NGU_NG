export const MAX_TASK_EVIDENCE = 1000;
export const MAX_REPORT_BYTES = 2_500_000;

export function evidenceLines(value: string) {
 return [...new Set(value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean))];
}
