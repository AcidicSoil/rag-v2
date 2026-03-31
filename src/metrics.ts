export interface EvalMetrics {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  accuracy: number;
}

export function buildEvalMetrics(totalCases: number, passedCases: number): EvalMetrics {
  const failedCases = totalCases - passedCases;
  return {
    totalCases,
    passedCases,
    failedCases,
    accuracy: totalCases === 0 ? 0 : passedCases / totalCases,
  };
}
