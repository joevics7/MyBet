export interface ToolEntry {
  title: string;
  tagline: string;
  href: string;
  countrySlug: string;
  categorySlug: string;
}

// Manually curated for now. Once more tools are live, this list is
// replaced with a query against the `tools` table in Supabase.
export const TOOLS_CATALOG: ToolEntry[] = [
  {
    title: 'University GPA Calculator (5.0 Scale)',
    tagline: 'Calculate your semester GPA and projected class of degree.',
    href: '/tools/country/nigeria/university-gpa-calculator',
    countrySlug: 'nigeria',
    categorySlug: 'gpa-calculator',
  },
];
