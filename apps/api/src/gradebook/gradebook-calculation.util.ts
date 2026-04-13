import { GradebookWeightingMode, ResultCalculationBehavior } from '@prisma/client';

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export type CalculationResultEntry = {
  score: number | null;
  statusBehavior: ResultCalculationBehavior | null;
};

export type AssessmentForCalculation = {
  maxScore: number;
  weight: number;
  categoryId: string | null;
  categoryWeight: number | null;
  result: CalculationResultEntry | null;
};

export function resolveAssessmentForCalculation(
  assessment: AssessmentForCalculation,
): { included: boolean; score: number; maxScore: number; weight: number; categoryId: string | null; categoryWeight: number | null } | null {
  const maxScore = assessment.maxScore;
  const rawScore = assessment.result?.score ?? null;
  const behavior = assessment.result?.statusBehavior ?? null;

  if (!assessment.result) {
    return null;
  }

  if (behavior === ResultCalculationBehavior.EXCLUDE_FROM_CALCULATION) {
    return null;
  }

  if (behavior === ResultCalculationBehavior.COUNT_AS_ZERO) {
    return {
      included: true,
      score: 0,
      maxScore,
      weight: assessment.weight,
      categoryId: assessment.categoryId,
      categoryWeight: assessment.categoryWeight,
    };
  }

  if (behavior === ResultCalculationBehavior.INFORMATION_ONLY) {
    if (rawScore === null || rawScore === undefined) {
      return null;
    }
  }

  if (rawScore === null || rawScore === undefined) {
    return null;
  }

  return {
    included: true,
    score: rawScore,
    maxScore,
    weight: assessment.weight,
    categoryId: assessment.categoryId,
    categoryWeight: assessment.categoryWeight,
  };
}

export function computeGradebookAveragePercent(
  mode: GradebookWeightingMode,
  assessments: AssessmentForCalculation[],
) {
  const resolved = assessments
    .map((assessment) => resolveAssessmentForCalculation(assessment))
    .filter(Boolean) as Array<NonNullable<ReturnType<typeof resolveAssessmentForCalculation>>>;

  if (resolved.length === 0) {
    return { averagePercent: null as number | null, usesWeights: false, includedCount: 0 };
  }

  if (mode === GradebookWeightingMode.UNWEIGHTED) {
    const percents = resolved.map((entry) => (entry.score / entry.maxScore) * 100);
    const average = percents.reduce((sum, value) => sum + value, 0) / percents.length;
    return { averagePercent: round1(average), usesWeights: false, includedCount: resolved.length };
  }

  if (mode === GradebookWeightingMode.ASSESSMENT_WEIGHTED) {
    const weights = resolved.map((entry) => entry.weight ?? 1);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const usesWeights = weights.some((value) => value !== 1);

    if (totalWeight <= 0) {
      const percents = resolved.map((entry) => (entry.score / entry.maxScore) * 100);
      const average = percents.reduce((sum, value) => sum + value, 0) / percents.length;
      return { averagePercent: round1(average), usesWeights, includedCount: resolved.length };
    }

    const weighted =
      resolved.reduce((sum, entry) => {
        const percent = (entry.score / entry.maxScore) * 100;
        return sum + percent * (entry.weight ?? 1);
      }, 0) / totalWeight;

    return { averagePercent: round1(weighted), usesWeights, includedCount: resolved.length };
  }

  // CATEGORY_WEIGHTED
  const byCategory = new Map<
    string,
    {
      categoryWeight: number;
      percents: number[];
    }
  >();

  for (const entry of resolved) {
    const categoryKey = entry.categoryId ?? 'uncategorized';
    const categoryWeight = entry.categoryWeight ?? 1;
    const bucket =
      byCategory.get(categoryKey) ?? { categoryWeight, percents: [] };
    bucket.percents.push((entry.score / entry.maxScore) * 100);
    byCategory.set(categoryKey, bucket);
  }

  const categoryAverages = Array.from(byCategory.values())
    .map((bucket) => {
      if (bucket.percents.length === 0) {
        return null;
      }
      const average =
        bucket.percents.reduce((sum, value) => sum + value, 0) / bucket.percents.length;
      return { weight: bucket.categoryWeight, averagePercent: average };
    })
    .filter(Boolean) as Array<{ weight: number; averagePercent: number }>;

  if (categoryAverages.length === 0) {
    return { averagePercent: null as number | null, usesWeights: false, includedCount: 0 };
  }

  const weights = categoryAverages.map((entry) => entry.weight ?? 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const usesWeights = weights.some((value) => value !== 1);

  if (totalWeight <= 0) {
    const average =
      categoryAverages.reduce((sum, entry) => sum + entry.averagePercent, 0) /
      categoryAverages.length;
    return { averagePercent: round1(average), usesWeights, includedCount: resolved.length };
  }

  const weighted =
    categoryAverages.reduce((sum, entry) => sum + entry.averagePercent * (entry.weight ?? 1), 0) /
    totalWeight;

  return { averagePercent: round1(weighted), usesWeights, includedCount: resolved.length };
}

