/**
 * Build Memory - Stores and retrieves build patterns using Mem0
 * Allows Albert to learn from past builds and make better recommendations.
 */

import { addMemory, searchMemories, addEchoMemory, searchEchoMemories } from './mem0';
import type { BuildProject, ProjectType } from '@/types/build';

// ============================================
// Types
// ============================================

export interface BuildPattern {
  projectType: ProjectType;
  stack: string[];
  description: string;
  success: boolean;
  buildDuration?: number;
  tips?: string[];
}

export interface UserBuildPreference {
  category: string;
  preference: string;
  frequency: number;
}

// ============================================
// Build Pattern Storage
// ============================================

/**
 * Save a build pattern after a build completes
 */
export async function saveBuildPattern(
  project: BuildProject,
  success: boolean,
  buildDuration?: number
): Promise<void> {
  try {
    const stack = project.preferredStack
      ? project.preferredStack.split(',').map(s => s.trim())
      : [];

    const content = success
      ? `Successfully built a ${project.projectType} project: "${project.description}". ` +
        `Used stack: ${stack.join(', ') || 'auto-selected'}. ` +
        (buildDuration ? `Build took ${Math.round(buildDuration / 1000)} seconds.` : '')
      : `Build failed for ${project.projectType} project: "${project.description}". ` +
        `Attempted stack: ${stack.join(', ') || 'auto-selected'}.`;

    // Store as Echo's memory (Albert's knowledge)
    await addEchoMemory(content, {
      type: 'build_pattern',
      projectType: project.projectType,
      stack: stack,
      success,
      projectId: project.id,
      buildDuration,
    });

    console.log(`[BuildMemory] Saved build pattern: ${success ? 'success' : 'failure'}`);
  } catch (error) {
    console.error('[BuildMemory] Failed to save build pattern:', error);
  }
}

/**
 * Find similar successful builds
 */
export async function findSimilarBuilds(
  description: string,
  projectType: ProjectType
): Promise<BuildPattern[]> {
  try {
    const query = `successful ${projectType} build similar to: ${description}`;
    const memories = await searchEchoMemories(query);

    // Filter and parse results
    const patterns: BuildPattern[] = [];
    for (const memory of memories) {
      const metadata = memory.metadata as Record<string, unknown> | undefined;
      if (metadata?.type === 'build_pattern' && metadata?.success === true) {
        patterns.push({
          projectType: (metadata.projectType as ProjectType) || projectType,
          stack: (metadata.stack as string[]) || [],
          description: memory.memory,
          success: true,
          buildDuration: metadata.buildDuration as number | undefined,
        });
      }
    }

    return patterns.slice(0, 5); // Return top 5 relevant patterns
  } catch (error) {
    console.error('[BuildMemory] Failed to find similar builds:', error);
    return [];
  }
}

/**
 * Find failed builds to learn from mistakes
 */
export async function findFailedBuilds(
  description: string,
  projectType: ProjectType
): Promise<BuildPattern[]> {
  try {
    const query = `failed ${projectType} build problems with: ${description}`;
    const memories = await searchEchoMemories(query);

    const patterns: BuildPattern[] = [];
    for (const memory of memories) {
      const metadata = memory.metadata as Record<string, unknown> | undefined;
      if (metadata?.type === 'build_pattern' && metadata?.success === false) {
        patterns.push({
          projectType: (metadata.projectType as ProjectType) || projectType,
          stack: (metadata.stack as string[]) || [],
          description: memory.memory,
          success: false,
        });
      }
    }

    return patterns.slice(0, 3); // Return top 3 failures to avoid
  } catch (error) {
    console.error('[BuildMemory] Failed to find failed builds:', error);
    return [];
  }
}

// ============================================
// User Preference Tracking
// ============================================

/**
 * Track user's technology preferences
 */
export async function trackBuildPreference(
  category: string,
  preference: string
): Promise<void> {
  try {
    const content = `User prefers ${preference} for ${category} in their builds.`;

    await addMemory(content, {
      type: 'build_preference',
      category,
      preference,
    });

    console.log(`[BuildMemory] Tracked preference: ${category} -> ${preference}`);
  } catch (error) {
    console.error('[BuildMemory] Failed to track preference:', error);
  }
}

/**
 * Get user's build preferences
 */
export async function getUserBuildPreferences(): Promise<UserBuildPreference[]> {
  try {
    const memories = await searchMemories('user prefers build technology');

    const preferences: UserBuildPreference[] = [];
    const seenCategories = new Set<string>();

    for (const memory of memories) {
      const metadata = memory.metadata as Record<string, unknown> | undefined;
      if (metadata?.type === 'build_preference') {
        const category = metadata.category as string;
        if (!seenCategories.has(category)) {
          seenCategories.add(category);
          preferences.push({
            category,
            preference: metadata.preference as string,
            frequency: 1, // Could track frequency if needed
          });
        }
      }
    }

    return preferences;
  } catch (error) {
    console.error('[BuildMemory] Failed to get preferences:', error);
    return [];
  }
}

// ============================================
// Context Building for Claude Code
// ============================================

/**
 * Get comprehensive build context for Albert/Claude Code
 */
export async function getBuildContext(
  description: string,
  projectType: ProjectType
): Promise<string> {
  try {
    const [successfulBuilds, failedBuilds, preferences] = await Promise.all([
      findSimilarBuilds(description, projectType),
      findFailedBuilds(description, projectType),
      getUserBuildPreferences(),
    ]);

    const contextParts: string[] = [];

    // Add successful patterns
    if (successfulBuilds.length > 0) {
      contextParts.push('## Past Successful Builds');
      for (const build of successfulBuilds) {
        contextParts.push(`- ${build.description}`);
        if (build.stack.length > 0) {
          contextParts.push(`  Stack: ${build.stack.join(', ')}`);
        }
      }
    }

    // Add warnings from failures
    if (failedBuilds.length > 0) {
      contextParts.push('\n## Past Issues to Avoid');
      for (const build of failedBuilds) {
        contextParts.push(`- ${build.description}`);
      }
    }

    // Add user preferences
    if (preferences.length > 0) {
      contextParts.push('\n## User Preferences');
      for (const pref of preferences) {
        contextParts.push(`- ${pref.category}: ${pref.preference}`);
      }
    }

    return contextParts.length > 0
      ? contextParts.join('\n')
      : 'No prior build context available.';
  } catch (error) {
    console.error('[BuildMemory] Failed to get build context:', error);
    return 'No prior build context available.';
  }
}

/**
 * Extract technology preferences from a project
 */
export function extractPreferencesFromProject(project: BuildProject): Array<{category: string; preference: string}> {
  const preferences: Array<{category: string; preference: string}> = [];

  if (!project.preferredStack) return preferences;

  const stack = project.preferredStack.toLowerCase();

  // Detect framework preferences
  if (stack.includes('react')) preferences.push({ category: 'framework', preference: 'React' });
  if (stack.includes('vue')) preferences.push({ category: 'framework', preference: 'Vue' });
  if (stack.includes('next')) preferences.push({ category: 'framework', preference: 'Next.js' });
  if (stack.includes('svelte')) preferences.push({ category: 'framework', preference: 'Svelte' });

  // Detect styling preferences
  if (stack.includes('tailwind')) preferences.push({ category: 'styling', preference: 'Tailwind CSS' });
  if (stack.includes('scss') || stack.includes('sass')) preferences.push({ category: 'styling', preference: 'SCSS' });
  if (stack.includes('styled')) preferences.push({ category: 'styling', preference: 'Styled Components' });

  // Detect language preferences
  if (stack.includes('typescript')) preferences.push({ category: 'language', preference: 'TypeScript' });
  if (stack.includes('python')) preferences.push({ category: 'language', preference: 'Python' });

  // Detect database preferences
  if (stack.includes('postgres')) preferences.push({ category: 'database', preference: 'PostgreSQL' });
  if (stack.includes('mongo')) preferences.push({ category: 'database', preference: 'MongoDB' });
  if (stack.includes('sqlite')) preferences.push({ category: 'database', preference: 'SQLite' });

  return preferences;
}

/**
 * Save all preferences from a successful build
 */
export async function savePreferencesFromBuild(project: BuildProject): Promise<void> {
  const preferences = extractPreferencesFromProject(project);

  for (const pref of preferences) {
    await trackBuildPreference(pref.category, pref.preference);
  }
}
