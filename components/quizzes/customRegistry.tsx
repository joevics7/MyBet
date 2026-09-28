import type { ComponentType } from 'react';
import type { Quiz } from '@/lib/supabase';

export interface CustomQuizProps {
  quiz: Quiz;
}

/**
 * Most quizzes use the generic QuizPlayer (quiz_type = 'standard') driven by
 * the questions[] column. Some formats won't fit that shape — a personality
 * quiz with weighted results instead of right/wrong answers, an image-match
 * quiz, a timed speed round with different pacing, etc.
 *
 * For those, set quiz_type = 'custom' and custom_component_key on the quiz
 * row, put whatever structured data the component needs in the config jsonb
 * column, and register the component here. The dynamic quiz page looks it
 * up by key at render time — no new route or migration needed per quiz.
 *
 * Example registration once a custom component exists:
 *   import { PersonalityQuiz } from './custom/PersonalityQuiz';
 *   export const CUSTOM_QUIZ_COMPONENTS: Record<string, ComponentType<CustomQuizProps>> = {
 *     'personality-quiz': PersonalityQuiz,
 *   };
 */
export const CUSTOM_QUIZ_COMPONENTS: Record<string, ComponentType<CustomQuizProps>> = {};
