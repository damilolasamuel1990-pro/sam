import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Users, GraduationCap, BookOpen, Wallet, Megaphone, UserPlus, ClipboardList,
  FileText, CalendarCheck, Baby, ArrowRight, ReceiptText,
} from "lucide-react";
import { supabase } from "../supabase";
import type { Profile, Student } from "../types";
import { CURRENT_SESSION, formatMoney } from "../lib/school";
import { useClasses, fetchMyChildren, className } from "../lib/data";
import { StatCard, Card, Avatar, RoleBadge, Spinner, PageHeader } from "../components/ui";
import type { PageKey } from "../layout/DashboardLayout";

export default function DashboardHome({
  me, profile, go,
}: {
  me: User;
  profile: Profile;
  go: (p: PageKey) => void;
}) {
  const isAdmin = profile.role === "super_admin" || profile.role === "admin";
  const isTeacher = profile.role === "teacher";
  const isParent = profile.role === "parent";
  const isPartTime = profile.role === "part_time";
  const isBursary = profile.role === "bursary";
  const [ptStats, setPtStats] = useState({ subjects: 0, students: 0 });

  useEffect(() => {
    if (!isPartTime) return;
    (async () => {
      const { data: links } = await supabase.from("staff_subjects").select("subject_id").eq("profile_id", profile.id);
      const subjectIds = ((links ?? []) as { subject_id: string }[]).map((l) => l.subject_id);
      if (subjectIds.length === 0) { setPtStats({ subjects: 0, students: 0 }); return; }
      const { data: subs } = await supabase.from("subjects").select("class_id").in("id", subjectIds);
      const classIds = [...new Set(((subs ?? []) as { class_id: string }[]).map((s) => s.class_id))];
      let studentCount = 0;
      if (classIds.length) {
        const { data: studs } = await supabase.from("students").select("id").in("class_id", classIds).eq("status", "active");
        studentCount = (studs ?? []).length;
      }
      setPtStats({ subjects: subjectIds.length, students: studentCount });
    })();
  }, [isPartTime, profile.id]);
  const { classes } = useClasses();

  const [counts, setCounts] = useState({ students: 0, teachers: 0, parents: 0, notices: 0, fees: 0, subjects: 0, pendingPayments: 0 });
  const [notices, setNotices] = useState<{ id: string; title: string; body: string; created_at: string }[]>([]);
  const [children, setChildren] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [studentsRes, profilesRes, noticesRes, paymentsRes, subjectsRes] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id, role"),
        supabase.from("notices").select("*").order("created_at", { ascending: false }).limit(3),
        supabase.from("payments").select("amount, status"),
        supabase.from("subjects").select("id", { count: "exact", head: true }),
      ]);
      const profs = (profilesRes.data ?? []) as { role: string }[];
      const allPayments = (paymentsRes.data ?? []) as { amount: number; status: string }[];
      setCounts({
        students: studentsRes.count ?? 0,
        teachers: profs.filter((p) => p.role === "teacher").length,
        parents: profs.filter((p) => p.role === "parent").length,
        notices: (noticesRes.data ?? []).length,
        fees: allPayments
          .filter((p) => p.status === "Paid" || p.status === "Verified")
          .reduce((a, p) => a + Number(p.amount), 0),
        subjects: subjectsRes.count ?? 0,
        pendingPayments: allPayments.filter((p) => p.status === "Pending Verification").length,
      });
      setNotices((noticesRes.data ?? []) as typeof notices);
      if (isParent) setChildren(await fetchMyChildren(profile.id));
      setLoading(false);
    })();
  }, [isParent, profile.id]);

  const firstName = (profile.full_name || "").split(" ")[0];

  const quickActions: { label: string; desc: string; icon: React.ElementType; page: PageKey; show: boolean }[] = [
    { label: "Admit Student", desc: "Register a new student", icon: UserPlus, page: "admit", show: !isParent },
    { label: "Input Results", desc: "Enter term scores", icon: ClipboardList, page: "results", show: !isParent },
    { label: "Report Cards", desc: "View & print report cards", icon: FileText, page: "reportcards", show: true },
    { label: "Attendance", desc: isParent ? "Children's attendance" : "Mark class attendance", icon: CalendarCheck, page: "attendance", show: true },
    { label: "School Fees", desc: isParent ? "View fees & pay online" : "Fees and payments", icon: Wallet, page: "fees", show: profile.role !== "teacher" },
    { label: "Notice Board", desc: "School announcements", icon: Megaphone, page: "notices", show: true },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome${firstName ? `, ${firstName}` : ""}`}
        subtitle={`${CURRENT_SESSION} Session · Edana Schools — Raising to Greatness`}
      />

      {loading ? (
        <div className="py-16 flex justify-center text-[#0a4da8]"><Spinner className="w-7 h-7" /></div>
      ) : (
        <>
          {isPartTime && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="My Subjects" value={ptStats.subjects} icon={BookOpen} tint="bg-teal-50 text-teal-700" />
              <StatCard label="Students in My Classes" value={ptStats.students} icon={Users} tint="bg-blue-50 text-[#0a4da8]" />
              <StatCard label="Latest Notices" value={counts.notices} icon={Megaphone} tint="bg-amber-50 text-amber-700" />
            </div>
          )}

          {isBursary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Fees Collected (Verified)" value={formatMoney(counts.fees)} icon={Wallet} tint="bg-cyan-50 text-cyan-700" />
              <StatCard label="Awaiting Verification" value={counts.pendingPayments} icon={ReceiptText} tint="bg-amber-50 text-amber-700" />
              <StatCard label="Students" value={counts.students} icon={Users} tint="bg-blue-50 text-[#0a4da8]" />
              <StatCard label="Parents" value={counts.parents} icon={Baby} tint="bg-pink-50 text-pink-700" />
            </div>
          )}

          {(isAdmin || isTeacher) && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Students" value={counts.students} icon={Users} tint="bg-blue-50 text-[#0a4da8]" />
              <StatCard label="Teachers" value={counts.teachers} icon={GraduationCap} tint="bg-emerald-50 text-emerald-700" />
              <StatCard label="Subjects" value={counts.subjects} icon={BookOpen} tint="bg-amber-50 text-amber-700" />
              {isAdmin ? (
                <StatCard label={`Fees Collected`} value={formatMoney(counts.fees)} icon={Wallet} tint="bg-purple-50 text-purple-700" />
              ) : (
                <StatCard label="Parents" value={counts.parents} icon={Baby} tint="bg-pink-50 text-pink-700" />
              )}
            </div>
          )}

          {isParent && (
            <div>
              <h2 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Baby className="w-5 h-5 text-[#0a4da8]" /> My Children
              </h2>
              {children.length === 0 ? (
                <Card className="p-6 text-sm text-slate-500">
                  No children are linked to your account yet. Please contact the school office so the
                  Super Admin can link your children to your account.
                </Card>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {children.map((child) => (
                    <Card key={child.id} className="p-5">
                      <div className="flex items-center gap-3">
                        <Avatar name={`${child.first_name} ${child.last_name}`} className="h-12 w-12 text-sm" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{child.first_name} {child.last_name}</p>
                          <p className="text-xs text-slate-500">{className(classes, child.class_id)} · {child.admission_no}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        <button onClick={() => go("reportcards")} className="rounded-lg bg-blue-50 hover:bg-blue-100 text-[#0a4da8] text-xs font-medium py-2 transition">Report Card</button>
                        <button onClick={() => go("attendance")} className="rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium py-2 transition">Attendance</button>
                        <button onClick={() => go("fees")} className="rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-medium py-2 transition">Fees</button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          <h2 className="font-bold text-slate-900 mt-7 mb-3">Quick Actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(isPartTime
              ? [
                  { label: "My Subjects & Results", desc: "Students offering your subjects — enter Test & Exam scores", icon: ClipboardList, page: "mysubjects" as PageKey },
                  { label: "Notice Board", desc: "School announcements", icon: Megaphone, page: "notices" as PageKey },
                ]
              : isBursary
                ? [
                    { label: "School Fees", desc: "Fee bills, payments and verification", icon: Wallet, page: "fees" as PageKey },
                    { label: "Student Information", desc: "View student details", icon: Users, page: "students" as PageKey },
                    { label: "Parents", desc: "View parent information", icon: Baby, page: "parents" as PageKey },
                    { label: "Notice Board", desc: "Announcements (send fee bills from School Fees)", icon: Megaphone, page: "notices" as PageKey },
                  ]
                : quickActions.filter((a) => a.show)
            ).map((a) => (
              <button
                key={a.label}
                onClick={() => go(a.page)}
                className="text-left bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-[#0a4da8]/40 hover:shadow transition group"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0a4da8]/10 text-[#0a4da8]">
                  <a.icon className="w-5 h-5" />
                </span>
                <p className="font-semibold text-slate-900 mt-3 flex items-center gap-1.5">
                  {a.label}
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-[#0a4da8] group-hover:translate-x-0.5 transition" />
                </p>
                <p className="text-sm text-slate-500 mt-0.5">{a.desc}</p>
              </button>
            ))}
          </div>

          <h2 className="font-bold text-slate-900 mt-7 mb-3 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#0a4da8]" /> Latest Notices
          </h2>
          {notices.length === 0 ? (
            <Card className="p-6 text-sm text-slate-500">No notices yet.</Card>
          ) : (
            <div className="space-y-3">
              {notices.map((n) => (
                <Card key={n.id} className="p-5">
                  <p className="font-semibold text-slate-900">{n.title}</p>
                  <p className="text-sm text-slate-600 mt-1 whitespace-pre-line">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-2">{new Date(n.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-6 flex items-center gap-2 text-xs text-slate-400">
            <span>Signed in as</span>
            <RoleBadge role={profile.role} />
            <span>{me.email}</span>
          </div>
        </>
      )}
    </div>
  );
}
