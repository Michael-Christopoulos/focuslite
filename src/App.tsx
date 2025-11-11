import { useEffect, useRef, useState } from "react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { Project, Session } from "./types";
import { uid, dayKey, sumBy } from "./utils";

// Friendly pastel colors for projects
const COLORS = ["#93C5FD", "#FCA5A5", "#A7F3D0", "#FBCFE8", "#FDBA74"];

function formatSeconds(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function App() {
  // ------ Preferences ------
  const [workMin, setWorkMin] = useLocalStorage<number>("fl_workMin", 25);

  // ------ UI view (Today | History) ------
  const [view, setView] = useLocalStorage<"today" | "history">("fl_view", "today");

  // ------ Projects ------
  const [projects, setProjects] = useLocalStorage<Project[]>("fl_projects", [
    { id: "p_default", name: "General", color: COLORS[0] },
  ]);
  const [activeProjectId, setActiveProjectId] = useLocalStorage<string>(
    "fl_activeProject",
    projects[0]?.id ?? "p_default"
  );
  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0];

  const [newName, setNewName] = useState("");

  const addProject = () => {
    const name = newName.trim();
    if (!name) return;
    const color = COLORS[(projects.length - 0) % COLORS.length];
    const p: Project = { id: uid("p"), name, color };
    setProjects([...projects, p]);
    setActiveProjectId(p.id);
    setNewName("");
  };

  const deleteProject = (id: string) => {
    if (id === "p_default") return;
    const next = projects.filter((p) => p.id !== id);
    setProjects(next);
    if (activeProjectId === id) setActiveProjectId("p_default");
  };

  // ------ Sessions ------
  const [sessions, setSessions] = useLocalStorage<Session[]>("fl_sessions", []);
  const [currentStartISO, setCurrentStartISO] = useLocalStorage<string | null>(
    "fl_currentStartISO",
    null
  );

  // ------ Timer ------
  const [remaining, setRemaining] = useLocalStorage<number>(
    "fl_remaining",
    workMin * 60
  );
  const [running, setRunning] = useLocalStorage<boolean>("fl_running", false);
  const timerRef = useRef<number | null>(null);

  // Ask for notification permission once
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Reset length when pref changes (only if idle/paused)
  useEffect(() => {
    if (!running && Number.isFinite(workMin) && workMin > 0) {
      setRemaining(workMin * 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workMin]);

  // Ticking + complete handler
  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (!Number.isFinite(r)) return r;
        if (r <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          handleComplete();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  function startOrResume() {
    if (!activeProject) return;
    if (!Number.isFinite(workMin) || workMin <= 0) return; // ignore until valid
    if (!Number.isFinite(remaining) || remaining === 0) {
      setRemaining(workMin * 60);
      setCurrentStartISO(new Date().toISOString());
    }
    if (!currentStartISO) setCurrentStartISO(new Date().toISOString());
    setRunning(true);
  }

  function pause() {
    setRunning(false);
  }

  function reset() {
    setRunning(false);
    if (Number.isFinite(workMin) && workMin > 0) {
      setRemaining(workMin * 60);
    }
    setCurrentStartISO(null);
  }

  function notify() {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Focus session complete!", {
        body: activeProject ? `Project: ${activeProject.name}` : "Nice work!",
      });
    }
  }

  function handleComplete() {
    setRunning(false);

    if (currentStartISO && activeProject && Number.isFinite(workMin) && workMin > 0) {
      const ended = new Date();
      const sess: Session = {
        id: uid("s"),
        projectId: activeProject.id,
        startedAt: currentStartISO,
        endedAt: ended.toISOString(),
        durationSec: Math.round(workMin * 60),
        dayKey: dayKey(ended),
      };
      setSessions([sess, ...sessions]);
    }
    setCurrentStartISO(null);
    notify();
  }

  // ------- derived: today's total + per-project totals -------
  const today = dayKey();
  const todaysSessions = sessions.filter((s) => s.dayKey === today);
  const todayTotalMin = Math.floor(sumBy(todaysSessions, (s) => s.durationSec) / 60);

  const totalForProject = (pid: string) =>
    Math.floor(
      sumBy(sessions.filter((s) => s.projectId === pid), (s) => s.durationSec) / 60
    );

  // ------- history helpers -------
  const sessionsByDay: Record<string, Session[]> = sessions.reduce((acc, s) => {
    (acc[s.dayKey] ||= []).push(s);
    return acc;
  }, {} as Record<string, Session[]>);

  const orderedDays = Object.keys(sessionsByDay).sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0
  );

  const minutesForDay = (key: string) =>
    Math.floor(sumBy(sessionsByDay[key], (s) => s.durationSec) / 60);

  return (
    <div className="min-h-screen grid grid-cols-12 gap-6 p-6 bg-gradient-to-b from-blue-50 via-white to-pink-50 text-gray-800">
      {/* ------- Sidebar: Projects ------- */}
      <aside className="col-span-12 md:col-span-4 lg:col-span-3">
        <h1 className="text-3xl font-extrabold mb-4 tracking-tight">FocusLite</h1>

        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 border border-gray-300 bg-white rounded-xl px-3 py-2 shadow-sm"
            placeholder="New project…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addProject()}
          />
          <button
            className="px-3 py-2 rounded-xl bg-blue-500 text-white hover:bg-blue-600 transition shadow-sm"
            onClick={addProject}
          >
            Add
          </button>
        </div>

        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className={`rounded-xl p-3 flex items-center justify-between bg-white border border-gray-200 shadow-sm
                ${p.id === activeProjectId ? "ring-2 ring-pink-400" : ""}`}
            >
              <button
                className="flex items-center gap-3 text-left flex-1"
                onClick={() => setActiveProjectId(p.id)}
                title="Select project"
              >
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border border-black/10"
                  style={{ background: p.color || COLORS[0] }}
                />
                <span className="font-medium">{p.name}</span>
              </button>
              <span className="text-xs opacity-70 mr-2">{totalForProject(p.id)}m</span>
              {p.id !== "p_default" && (
                <button
                  className="text-sm opacity-70 hover:opacity-100"
                  onClick={() => deleteProject(p.id)}
                  title="Delete"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      </aside>

      {/* ------- Main: Timer + Tabs ------- */}
      <main className="col-span-12 md:col-span-8 lg:col-span-6">
        {/* Work length input */}
        <div className="mb-4 flex items-center gap-3 justify-center">
          <label className="font-medium" htmlFor="workMin">
            Work length (minutes):
          </label>
          <input
            id="workMin"
            type="number"
            className="border border-gray-300 bg-white rounded-xl px-3 py-2 w-24 text-center shadow-sm"
            value={isNaN(workMin) ? "" : workMin}
            min={1}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") {
                setWorkMin(NaN); // allow blank temporarily
              } else {
                const num = parseFloat(val);
                if (!isNaN(num) && num > 0) setWorkMin(num);
              }
            }}
          />
        </div>

        {/* Timer card */}
        <div className="rounded-2xl p-8 flex flex-col items-center gap-6 bg-white border border-gray-200 shadow-md">
          <div className="text-sm opacity-70">
            {activeProject ? `Project: ${activeProject.name}` : "No project selected"}
          </div>

          <div className="text-7xl font-extrabold tabular-nums">
            {formatSeconds(remaining)}
          </div>

          <div className="flex gap-3">
            {!running ? (
              <button
                className="px-6 py-3 rounded-2xl bg-green-500 text-white hover:bg-green-600 transition shadow"
                onClick={startOrResume}
                disabled={!activeProject || !Number.isFinite(workMin) || workMin <= 0}
              >
                {Number.isFinite(remaining) && remaining === 0 ? "Restart" : "Start"}
              </button>
            ) : (
              <button
                className="px-6 py-3 rounded-2xl bg-white border border-gray-300 hover:bg-gray-50 transition shadow-sm"
                onClick={pause}
              >
                Pause
              </button>
            )}
            <button
              className="px-6 py-3 rounded-2xl bg-white border border-gray-300 hover:bg-gray-50 transition shadow-sm"
              onClick={reset}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex gap-2">
          <button
            className={`px-4 py-2 rounded-xl border shadow-sm ${
              view === "today" ? "bg-blue-500 text-white border-blue-500" : "bg-white border-gray-200"
            }`}
            onClick={() => setView("today")}
          >
            Today
          </button>
          <button
            className={`px-4 py-2 rounded-xl border shadow-sm ${
              view === "history" ? "bg-blue-500 text-white border-blue-500" : "bg-white border-gray-200"
            }`}
            onClick={() => setView("history")}
          >
            View History
          </button>
        </div>

        {/* Today */}
        {view === "today" && (
          <section className="mt-3 rounded-2xl p-5 bg-white border border-gray-200 shadow">
            <h2 className="font-semibold mb-3">Today</h2>

            <div className="flex items-center">
              <div className="text-4xl font-bold tabular-nums">{todayTotalMin}</div>
              <div className="opacity-70">&nbsp;
                {todayTotalMin === 1 ? "minute focused" : "minutes focused"}
              </div>
            </div>

            <ul className="mt-3 space-y-1 text-sm">
              {todaysSessions.slice(0, 8).map((s) => {
                const when = new Date(s.endedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const proj = projects.find((p) => p.id === s.projectId)?.name ?? "Project";
                return (
                  <li key={s.id} className="flex justify-between">
                    <span>✅ {when}</span>
                    <span>{Math.round(s.durationSec / 60)}m • {proj}</span>
                  </li>
                );
              })}
              {todaysSessions.length === 0 && (
                <li className="opacity-60">No sessions yet.</li>
              )}
            </ul>
          </section>
        )}

        {/* History */}
        {view === "history" && (
          <section className="mt-3 rounded-2xl p-5 bg-white border border-gray-200 shadow">
            <h2 className="font-semibold mb-3">History</h2>
            {orderedDays.length === 0 ? (
              <div className="opacity-60">No past sessions yet.</div>
            ) : (
              <div className="flex justify-end mb-3">
                <button
                  className="px-3 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition shadow-sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to clear all session history?")) {
                      setSessions([]);
                    }
                  }}
                >
                  Reset History
                </button>
              </div>
            )}

            <div className="space-y-4">
              {orderedDays.map((key) => (
                <div key={key} className="border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">
                      {new Date(key).toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div className="text-sm opacity-70">
                      {minutesForDay(key)} {minutesForDay(key) === 1 ? "minute" : "minutes"}
                    </div>
                  </div>
                  <ul className="text-sm space-y-1">
                    {sessionsByDay[key].map((s) => {
                      const when = new Date(s.endedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const proj =
                        projects.find((p) => p.id === s.projectId)?.name ?? "Project";
                      return (
                        <li key={s.id} className="flex justify-between">
                          <span>✅ {when}</span>
                          <span>{Math.round(s.durationSec / 60)}m • {proj}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Spacer/right column for future features */}
      <aside className="col-span-12 lg:col-span-3" />
    </div>
  );
}
