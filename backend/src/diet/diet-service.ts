const recommendations = new Map<string, Record<string, unknown>>();

export function createDietRecommendation(patientId: string, availableInformation: Record<string, string>) {
  const unavailable = ["HbA1c", "bloodPressure", "fastingGlucose"].filter((key) => !availableInformation[key]);
  const recommendation = {
    id: crypto.randomUUID(),
    patientId,
    status: "AI_ASSISTED_DRAFT_REQUIRES_DOCTOR_REVIEW",
    informationConsidered: availableInformation,
    informationUnavailable: unavailable,
    draft: "General diabetes-friendly nutrition guidance only; doctor review is required before patient delivery.",
    createdAt: new Date().toISOString()
  };
  recommendations.set(recommendation.id, recommendation);
  return recommendation;
}

export function approveDietPlan(input: { recommendationId: string; doctorId: string; finalPlan: string }) {
  const original = recommendations.get(input.recommendationId);
  if (!original) return { approved: false, reason: "RECOMMENDATION_NOT_FOUND" };
  return {
    approved: true,
    originalRecommendation: original,
    doctorId: input.doctorId,
    finalPlan: input.finalPlan,
    approvedAt: new Date().toISOString(),
    feedbackUse: "Stored as expert feedback for future validated model improvement; no automatic online learning."
  };
}
