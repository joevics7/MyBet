'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ResultSlip } from '@/components/ResultSlip';

interface Course {
  id: string;
  unit: string;
  grade: string;
}

const GRADE_POINTS: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

function classOfDegree(gpa: number): string {
  if (gpa >= 4.5) return 'First Class';
  if (gpa >= 3.5) return 'Second Class Upper';
  if (gpa >= 2.4) return 'Second Class Lower';
  if (gpa >= 1.5) return 'Third Class';
  return 'Pass';
}

export function GpaCalculatorNg() {
  const [courses, setCourses] = useState<Course[]>([
    { id: '1', unit: '3', grade: 'A' },
    { id: '2', unit: '2', grade: 'B' },
  ]);

  const addCourse = () =>
    setCourses((c) => [...c, { id: crypto.randomUUID(), unit: '3', grade: 'A' }]);

  const removeCourse = (id: string) => setCourses((c) => c.filter((x) => x.id !== id));

  const updateCourse = (id: string, field: 'unit' | 'grade', value: string) =>
    setCourses((c) => c.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  const totalUnits = courses.reduce((sum, c) => sum + (parseFloat(c.unit) || 0), 0);
  const totalPoints = courses.reduce(
    (sum, c) => sum + (parseFloat(c.unit) || 0) * (GRADE_POINTS[c.grade] ?? 0),
    0
  );
  const gpa = totalUnits > 0 ? totalPoints / totalUnits : 0;

  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-[0.14em] font-mono text-muted-foreground mb-4">
        Enter this semester&rsquo;s courses
      </p>

      <div className="space-y-2">
        {courses.map((course) => (
          <div key={course.id} className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={6}
              value={course.unit}
              onChange={(e) => updateCourse(course.id, 'unit', e.target.value)}
              aria-label="Course units"
              className="w-16 rounded-sm border border-border px-2 py-1.5 text-sm font-mono"
            />
            <select
              value={course.grade}
              onChange={(e) => updateCourse(course.id, 'grade', e.target.value)}
              aria-label="Grade"
              className="flex-1 rounded-sm border border-border px-2 py-1.5 text-sm font-mono"
            >
              {Object.keys(GRADE_POINTS).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeCourse(course.id)}
              aria-label="Remove course"
              className="text-muted-foreground hover:text-[hsl(var(--rust))] p-1.5"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addCourse}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--verified))]"
      >
        <Plus className="h-4 w-4" /> Add course
      </button>

      <div className="mt-6">
        <ResultSlip
          heading="Your GPA — Result Slip"
          stampLabel="Calculated"
          rows={[
            { label: 'Total units', value: totalUnits.toFixed(0) },
            { label: 'Total grade points', value: totalPoints.toFixed(1) },
            { label: 'GPA (5.0 scale)', value: gpa.toFixed(2), emphasis: true },
            { label: 'Projected class of degree', value: classOfDegree(gpa) },
          ]}
        />
      </div>
    </div>
  );
}
