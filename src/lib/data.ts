import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import type { ClassRoom, Student, Subject } from "../types";
import { DEFAULT_CLASSES } from "./school";

/**
 * Insert the standard class list (Reception 1 -> SS 3) into the database.
 * Classes that already exist are skipped. Returns an error message if it fails
 * (e.g. the classes table hasn't been created, or the user isn't an Admin).
 */
export async function seedDefaultClasses(): Promise<{ error?: string }> {
  const { error } = await supabase.from("classes").upsert(
    DEFAULT_CLASSES.map((c) => ({ name: c.name, level: c.level, sort_order: c.sort_order })),
    { onConflict: "name", ignoreDuplicates: true }
  );
  return { error: error?.message };
}

export function useClasses() {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("classes").select("*").order("sort_order", { ascending: true });
    setClasses((data ?? []) as ClassRoom[]);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  return { classes, loading, reload };
}

export function className(classes: ClassRoom[], id: string | null): string {
  if (!id) return "—";
  return classes.find((c) => c.id === id)?.name ?? "—";
}

export async function fetchStudents(classId?: string | null, parentId?: string): Promise<Student[]> {
  let q = supabase.from("students").select("*").order("last_name", { ascending: true });
  if (classId) q = q.eq("class_id", classId);
  if (parentId) q = q.eq("parent_id", parentId);
  const { data } = await q;
  return (data ?? []) as Student[];
}

export async function fetchSubjects(classId: string): Promise<Subject[]> {
  const { data } = await supabase
    .from("subjects")
    .select("*")
    .eq("class_id", classId)
    .order("name", { ascending: true });
  return (data ?? []) as Subject[];
}

export async function fetchMyChildren(parentProfileId: string): Promise<Student[]> {
  const { data } = await supabase
    .from("students")
    .select("*")
    .eq("parent_id", parentProfileId)
    .order("first_name", { ascending: true });
  return (data ?? []) as Student[];
}

export interface ResultSaveRow {
  student_id: string;
  subject_id: string;
  term: string;
  session: string;
  test_score: number;
  exam_score: number;
  score: number;
  entered_by: string;
}

/**
 * Save result rows. If the database doesn't have the test_score/exam_score
 * columns yet (latest setup script not run), it falls back to saving the
 * calculated total only and reports `degraded: true` so the UI can tell
 * the teacher — saving never fails just because of the missing columns.
 */
export async function saveResultRows(
  rows: ResultSaveRow[]
): Promise<{ error?: string; degraded?: boolean }> {
  if (rows.length === 0) return {};
  const { error } = await supabase
    .from("results")
    .upsert(rows, { onConflict: "student_id,subject_id,term,session" });
  if (!error) return {};
  const m = (error.message || "").toLowerCase();
  const columnMissing =
    error.code === "PGRST204" ||
    error.code === "42703" ||
    m.includes("test_score") ||
    m.includes("exam_score") ||
    (m.includes("column") && m.includes("does not exist"));
  if (!columnMissing) return { error: error.message };
  const lite = rows.map((r) => ({
    student_id: r.student_id,
    subject_id: r.subject_id,
    term: r.term,
    session: r.session,
    score: r.score,
    entered_by: r.entered_by,
  }));
  const retry = await supabase
    .from("results")
    .upsert(lite, { onConflict: "student_id,subject_id,term,session" });
  return retry.error ? { error: retry.error.message } : { degraded: true };
}

/** Overall average (mean of per-subject term averages) for one student in a session. */
export function overallAverage(rows: { subject_id: string; score: number }[]): number | null {
  if (rows.length === 0) return null;
  const bySubject = new Map<string, number[]>();
  rows.forEach((r) => {
    const arr = bySubject.get(r.subject_id) ?? [];
    arr.push(Number(r.score));
    bySubject.set(r.subject_id, arr);
  });
  const subjectAverages = [...bySubject.values()].map(
    (scores) => scores.reduce((a, b) => a + b, 0) / scores.length
  );
  return subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length;
}
