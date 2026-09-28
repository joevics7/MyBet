import Link from 'next/link';

const columns = [
  {
    heading: 'Quizzes',
    links: [
      { label: 'All quizzes', href: '/quizzes' },
      { label: 'Exam prep quizzes', href: '/quizzes?category=exam-prep' },
    ],
  },
  {
    heading: 'Scholarships',
    links: [
      { label: 'Browse scholarships', href: '/scholarships' },
      { label: 'Fully funded', href: '/scholarships/browse?funding=full' },
      { label: 'Masters', href: '/scholarships/browse?level=masters' },
    ],
  },
  {
    heading: 'Guides',
    links: [{ label: 'All guides', href: '/blog' }],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Editorial policy', href: '/about#editorial-policy' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Disclaimer', href: '/about#disclaimer' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-[hsl(var(--ink))] text-[hsl(var(--paper))]/90 mt-20">
      <div className="max-w-6xl mx-auto px-4 py-14 grid grid-cols-2 md:grid-cols-6 gap-8">
        <div className="col-span-2">
          <p className="font-serif text-xl font-semibold text-[hsl(var(--paper))]">Edubase</p>
          <p className="mt-3 text-sm text-[hsl(var(--paper))]/60 max-w-xs">
            A verified scholarship tracker and education resource guide.
            Every figure sourced, every scholarship linked to its official page.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.heading}>
            <p className="text-xs uppercase tracking-[0.14em] text-[hsl(var(--seal))] font-mono mb-3">
              {col.heading}
            </p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-[hsl(var(--paper))]/70 hover:text-[hsl(var(--paper))] transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="max-w-6xl mx-auto px-4 py-5 text-xs text-[hsl(var(--paper))]/50">
          © {new Date().getFullYear()} Edubase. Educational information only — always confirm figures with the official source linked on each page.
        </p>
      </div>
    </footer>
  );
}
