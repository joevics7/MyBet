'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { ResultSlip } from '@/components/ResultSlip';
import type { QuizQuestion } from '@/lib/supabase';

export function QuizPlayer({ questions }: { questions: QuizQuestion[] }) {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);

  const question = questions[step];
  const score = answers.filter((a, i) => a === questions[i].correct_index).length;

  const checkAnswer = () => {
    if (selected === null) return;
    setRevealed(true);
  };

  const nextQuestion = () => {
    const next = [...answers, selected as number];
    setAnswers(next);
    if (step + 1 >= questions.length) {
      setFinished(true);
    } else {
      setStep(step + 1);
      setSelected(null);
      setRevealed(false);
    }
  };

  const restart = () => {
    setStep(0);
    setSelected(null);
    setRevealed(false);
    setAnswers([]);
    setFinished(false);
  };

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <div>
        <ResultSlip
          heading="Quiz Result Slip"
          stampLabel="Complete"
          rows={[
            { label: 'Questions answered', value: `${questions.length}` },
            { label: 'Correct answers', value: `${score}` },
            { label: 'Score', value: `${pct}%`, emphasis: true },
          ]}
        />
        <button
          onClick={restart}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--verified))]"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Retake quiz
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-[0.14em] font-mono text-muted-foreground mb-1">
        Question {step + 1} of {questions.length}
      </p>
      <div className="h-1 rounded-full bg-muted overflow-hidden mb-4">
        <div
          className="h-full bg-[hsl(var(--verified))] transition-all"
          style={{ width: `${(step / questions.length) * 100}%` }}
        />
      </div>

      <p className="font-serif text-lg font-semibold leading-snug">{question.question}</p>

      <div className="mt-4 space-y-2">
        {question.options.map((opt, i) => {
          const isCorrect = i === question.correct_index;
          const isSelected = i === selected;
          let style = 'border-border hover:border-[hsl(var(--verified))]';
          if (revealed) {
            if (isCorrect) style = 'border-[hsl(var(--verified))] bg-[hsl(var(--verified))]/10';
            else if (isSelected) style = 'border-[hsl(var(--rust))] bg-[hsl(var(--rust))]/10';
          } else if (isSelected) {
            style = 'border-[hsl(var(--verified))] bg-[hsl(var(--verified))]/5';
          }
          return (
            <button
              key={opt}
              onClick={() => !revealed && setSelected(i)}
              disabled={revealed}
              className={`w-full text-left rounded-sm border px-4 py-2.5 text-sm flex items-center justify-between gap-2 transition-colors ${style}`}
            >
              {opt}
              {revealed && isCorrect && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--verified))] shrink-0" />}
              {revealed && isSelected && !isCorrect && <XCircle className="h-4 w-4 text-[hsl(var(--rust))] shrink-0" />}
            </button>
          );
        })}
      </div>

      {revealed && question.explanation && (
        <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">
          {question.explanation}
        </p>
      )}

      <button
        onClick={revealed ? nextQuestion : checkAnswer}
        disabled={selected === null}
        className="mt-5 w-full rounded-sm bg-[hsl(var(--ink))] text-[hsl(var(--paper))] py-2.5 text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {revealed
          ? step + 1 >= questions.length
            ? 'See results'
            : 'Next question'
          : selected === null
          ? 'Select an answer'
          : 'Check answer'}
      </button>
    </div>
  );
}
