-- Seed data for testing the Scholarship Tracker + individual scholarship
-- pages. Deliberately varied: different countries, funding types, urgency
-- levels, and one closed scholarship to test that state.
--
-- Note: a 4th scholarship (Mastercard Foundation Scholars 2026, Nigeria,
-- featured, board_priority null) was seeded directly in an earlier session
-- and isn't repeated here. `on conflict do nothing` makes this file safe
-- to re-run without duplicating rows.

insert into scholarships (
  slug, title, summary, country_id, level, funding_type,
  requirements_short, amount_short,
  eligibility_md, benefits_md, required_documents_md, application_process_md,
  eligibility_source_url, official_apply_url,
  deadline, is_closed, is_featured, board_priority, status, last_reviewed_at
) values
(
  'daad-kenya-in-country-masters-2026',
  'DAAD Kenya In-Country Masters Scholarship 2026',
  'Partial funding for Kenyan graduates pursuing a masters degree at a participating university in Kenya.',
  'b3166a14-c03c-465d-866d-2d8ce68a815b',
  'masters',
  'partial',
  'Bachelor''s, 2 yrs work exp',
  'Tuition + monthly stipend',
  'You are eligible if you:

- Hold a Kenyan Bachelor''s degree with at least Second Class Upper
- Have a minimum of 2 years of relevant work experience
- Have been admitted to a participating masters programme in Kenya
- Are not currently receiving another scholarship for the same programme',
  'The scholarship covers:

- Partial tuition contribution
- Monthly stipend for the duration of the programme
- Study and research materials allowance',
  '- Completed DAAD application form
- Certified copies of degree certificates and transcripts
- Admission letter from the host university
- Curriculum vitae
- Motivation letter (max 2 pages)',
  '1. Confirm admission to a participating masters programme
2. Complete the DAAD online application form
3. Upload certified academic documents
4. Submit before the deadline
5. Selection results are released within 10 weeks',
  'https://www.daad.de/en',
  'https://www.daad.de/en',
  (current_date + interval '45 days')::date,
  false,
  false,
  null,
  'published',
  now()
),
(
  'mtn-ghana-foundation-undergraduate-2026',
  'MTN Ghana Foundation Undergraduate Scholarship 2026',
  'Full tuition scholarship for Ghanaian undergraduates with strong WASSCE results and demonstrated financial need.',
  '230443d6-363f-484b-9c3b-a1f0205b198c',
  'undergraduate',
  'tuition_only',
  'WASSCE, Ghanaian citizen',
  'Full tuition',
  'You are eligible if you:

- Are a Ghanaian citizen
- Have obtained at least 6 credits in WASSCE, including English and Mathematics
- Have gained admission to a recognized Ghanaian tertiary institution
- Can demonstrate financial need',
  'The scholarship covers:

- Full tuition fees for the duration of the degree
- Academic materials allowance for the first year',
  '- Completed MTN Foundation application form
- WASSCE results slip
- Admission letter
- Proof of financial need (guardian income statement)',
  '1. Download and complete the application form from the MTN Foundation website
2. Attach all required documents
3. Submit to the address listed on the form before the deadline
4. Shortlisted applicants are contacted for a follow-up interview',
  'https://www.mtn.com.gh/mtn-foundation/',
  'https://www.mtn.com.gh/mtn-foundation/',
  (current_date + interval '4 days')::date,
  false,
  true,
  null, -- left to natural deadline order; don't override urgency with priority unless truly needed
  'published',
  now()
),
(
  'ched-merit-scholarship-2025',
  'CHED Merit Scholarship 2025',
  'Merit-based undergraduate scholarship for top-performing Filipino high school graduates. This round has closed.',
  '7e076bc9-f925-4f59-accb-8c9d53ced718',
  'undergraduate',
  'partial',
  'Top 5% graduating class',
  '₱60,000/year',
  'Open to Filipino students who ranked in the top 5% of their graduating high school class and were admitted to a CHED-recognized institution.',
  null,
  null,
  null,
  'https://ched.gov.ph',
  'https://ched.gov.ph',
  (current_date - interval '30 days')::date,
  true,
  false,
  null,
  'published',
  now() - interval '30 days'
)
on conflict (slug) do nothing;
