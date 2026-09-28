import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export type Country = {
  id: string;
  slug: string;
  name: string;
  flag_emoji: string | null;
  region: string | null;
  currency_code: string | null;
  launch_phase: number;
  is_live: boolean;
  sort_order: number;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
};

export type Tool = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  country_id: string | null;
  category_id: string | null;
  language: string;
  description_md: string | null;
  how_it_works_md: string | null;
  faq: { question: string; answer: string }[];
  official_source_url: string | null;
  official_source_name: string | null;
  author_name: string | null;
  reviewer_name: string | null;
  status: 'draft' | 'published' | 'archived';
  last_reviewed_at: string | null;
  countries?: Country;
  categories?: Category;
};

export type Scholarship = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  country_id: string | null;
  level: 'undergraduate' | 'masters' | 'phd' | 'postdoc' | 'any' | null;
  funding_type: 'full' | 'partial' | 'tuition_only' | 'stipend_only' | null;
  field: string | null;
  benefits_md: string | null;
  eligibility_md: string | null;
  eligibility_source_url: string | null;
  required_documents_md: string | null;
  application_process_md: string | null;
  official_apply_url: string | null;
  deadline: string | null;
  is_closed: boolean;
  is_featured: boolean;
  board_priority: number | null;
  requirements_short: string | null;
  amount_short: string | null;
  status: 'draft' | 'published' | 'archived';
  countries?: Country;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string | null;
  country_id: string | null;
  language: string;
  author_name: string | null;
  reviewer_name: string | null;
  status: 'draft' | 'published' | 'archived';
  published_at: string | null;
  last_reviewed_at: string | null;
  countries?: Country;
};

export type QuizQuestion = {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
};

export type QuizCategory = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
};

export type Quiz = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  country_id: string | null;
  quiz_category_id: string | null;
  language: string;
  questions: QuizQuestion[];
  quiz_type: 'standard' | 'custom';
  custom_component_key: string | null;
  config: Record<string, unknown>;
  status: 'draft' | 'published' | 'archived';
  author_name: string | null;
  play_count: number;
  countries?: Country;
  quiz_categories?: QuizCategory;
};
