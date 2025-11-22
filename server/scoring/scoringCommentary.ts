import type { ContactScoreResult, CategoryScore } from './contactScoring';

/**
 * RULES-BASED SCORING COMMENTARY ENGINE
 * 
 * Generates punchy, A&R-style commentary for contact scoring without AI.
 * Designed to feel confident, opportunity-focused, and actionable.
 */

export interface ScoringCommentary {
  topLine: string;
  categoryComments: CategoryComment[];
  opportunityNote: string;
  priorityLevel: 'high' | 'medium' | 'low';
}

export interface CategoryComment {
  categoryName: string;
  comment: string;
  score: number;
  maxScore: number;
}

/**
 * Generate rules-based commentary for a contact's scoring profile
 */
export function generateRulesBasedCommentary(scoreResult: ContactScoreResult): ScoringCommentary {
  const categoryComments = scoreResult.categories.map(cat => ({
    categoryName: cat.category,
    comment: generateCategoryComment(cat),
    score: cat.score,
    maxScore: cat.maxScore
  }));

  const topLine = generateTopLineSummary(scoreResult);
  const opportunityNote = generateOpportunityNote(scoreResult);
  const priorityLevel = determinePriorityLevel(scoreResult.finalScore);

  return {
    topLine,
    categoryComments,
    opportunityNote,
    priorityLevel
  };
}

/**
 * Generate punchy commentary for each category
 */
function generateCategoryComment(category: CategoryScore): string {
  switch (category.category) {
    case 'Publishing Status':
      return generatePublishingStatusComment(category);
    case 'Release Pathway':
      return generateReleasePathwayComment(category);
    case 'Early Career Signals':
      return generateEarlyCareerComment(category);
    case 'Metadata Quality':
      return generateMetadataQualityComment(category);
    case 'Catalog Patterns':
      return generateCatalogPatternsComment(category);
    case 'Profile Verification':
      return generateProfileVerificationComment(category);
    default:
      return 'No data available.';
  }
}

/**
 * Publishing Status Commentary (4pts max)
 */
function generatePublishingStatusComment(category: CategoryScore): string {
  if (category.score === category.maxScore) {
    return "🎯 Wide-open publishing lane — no songs are currently represented. Maximum ownership opportunity.";
  }
  
  if (category.score > 0) {
    return "📋 Mixed representation — some songs are claimed, others remain open. Potential for targeted deals.";
  }
  
  return "🔒 All works are represented — limited publishing opportunity.";
}

/**
 * Release Pathway Commentary (3pts max)
 */
function generateReleasePathwayComment(category: CategoryScore): string {
  const signal = category.signals[0]?.signal;
  
  if (signal === 'DIY_DISTRIBUTION') {
    return "🚀 Fully independent release strategy — direct access and high creative ownership.";
  }
  
  if (signal === 'INDEPENDENT_DISTRIBUTOR') {
    return "🎸 Artist is backed by an indie or artist-forward label — reachable but competitive.";
  }
  
  if (signal === 'MAJOR_DISTRIBUTION') {
    return "🏢 Major distribution infrastructure detected — access potential is lower but career momentum may be stronger.";
  }
  
  if (signal === 'MAJOR_LABEL') {
    return "🏆 Major label backing confirmed — established infrastructure, limited unsigned opportunity.";
  }
  
  if (signal === 'UNKNOWN_LABEL') {
    return "❓ Label information unclear — likely independent or self-released based on patterns.";
  }
  
  return "📊 Release pathway shows mixed signals — requires deeper investigation.";
}

/**
 * Early Career Signals Commentary (2pts max)
 */
function generateEarlyCareerComment(category: CategoryScore): string {
  if (category.score === category.maxScore) {
    return "⚡ Early-stage momentum with editorial exposure — algorithmic traction confirmed.";
  }
  
  return "🌱 No early playlists yet, but room for organic discovery.";
}

/**
 * Metadata Quality Commentary (1pt max)
 */
function generateMetadataQualityComment(category: CategoryScore): string {
  const signal = category.signals[0]?.signal;
  
  if (signal === 'COMPLETENESS_UNDER_25') {
    return "✨ Clean and complete metadata — strong foundation for tracking and rights verification.";
  }
  
  if (signal === 'COMPLETENESS_25_50') {
    return "✅ Adequate metadata — enough detail to validate the profile.";
  }
  
  if (signal === 'COMPLETENESS_50_75') {
    return "📝 Moderate metadata coverage — some gaps but workable.";
  }
  
  return "⚠️ Sparse metadata — expect lighter data confidence.";
}

/**
 * Catalog Patterns Commentary (0.5pts max)
 */
function generateCatalogPatternsComment(category: CategoryScore): string {
  if (category.score === category.maxScore) {
    return "💿 Consistent independence across the catalog — clear unsigned behavior.";
  }
  
  if (category.score > 0) {
    return "🎵 Catalog shows a blend of indie and collaborative releases.";
  }
  
  return "📀 Catalog reflects major label involvement.";
}

/**
 * Profile Verification Commentary (0.5pts max)
 */
function generateProfileVerificationComment(category: CategoryScore): string {
  if (category.score === category.maxScore) {
    return "✓ External verification complete — profile validated via MusicBrainz.";
  }
  
  return "○ No external verification — signals rely on internal metadata only.";
}

/**
 * Generate top-line summary based on overall score
 */
function generateTopLineSummary(scoreResult: ContactScoreResult): string {
  const score = scoreResult.finalScore;
  const confidence = scoreResult.confidence;
  
  if (score >= 9) {
    return "🔥 High-upside unsigned candidate with clean rights and early traction.";
  }
  
  if (score >= 7) {
    return "⭐ Strong emerging profile with promising independent signals.";
  }
  
  if (score >= 5) {
    return "📈 Developing artist with potential — worth monitoring for growth.";
  }
  
  if (score >= 3) {
    return "🎯 Mid-stage prospect with some unsigned indicators.";
  }
  
  return "📊 Developing artist with fewer immediate indicators — long-term watch.";
}

/**
 * Generate opportunity note based on category combination
 */
function generateOpportunityNote(scoreResult: ContactScoreResult): string {
  const categories = scoreResult.categories;
  
  // Check for key signals
  const hasNoPublisher = categories.find(c => c.category === 'Publishing Status')?.score === 4;
  const releasePathwayScore = categories.find(c => c.category === 'Release Pathway')?.score || 0;
  const hasEarlyCareer = categories.find(c => c.category === 'Early Career Signals')?.score === 2;
  
  // Prime candidate: No publisher + DIY/Indie
  if (hasNoPublisher && releasePathwayScore >= 2) {
    return "🎯 Prime outreach candidate — rights are wide open and artist operates independently.";
  }
  
  // Strong prospect: Indie + early signals
  if (releasePathwayScore >= 2 && hasEarlyCareer) {
    return "🚀 Strong mid-stage prospect — reachable through indie channels with visible momentum.";
  }
  
  // Good monitoring candidate
  if (hasNoPublisher || releasePathwayScore >= 2) {
    return "📊 Good artist to monitor — indicators suggest independent operation with growth potential.";
  }
  
  // Developing artist
  if (scoreResult.finalScore >= 4) {
    return "🌱 Developing talent worth tracking — shows promise with room for movement.";
  }
  
  return "📈 Indicator-based monitoring recommended — gradual development track.";
}

/**
 * Determine priority level for outreach
 */
function determinePriorityLevel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 8) return 'high';
  if (score >= 5) return 'medium';
  return 'low';
}
