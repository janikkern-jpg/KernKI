"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";

/**
 * Sidebar mit Projekten + Chat-Verlauf + Verbrauchszähler.
 *
 * Layout (flex column, keine absoluten Positionen):
 *   1. Header: Logo + „Neuer Chat"
 *   2. Suchfeld
 *   3. Scrollbereich (flex-1 overflow-y-auto):
 *      - Projekte (aufklappbar, „+ Neues Projekt")
 *      - Chats ohne Projekt, gruppiert nach Datum
 *   4. Verbrauchs-Meter (immer unten)
 *   5. Nav-Links (Einstellungen / Abmelden)
 */

// ---------------------------------------------------------------- Types --

interface Project {
  id: string;
  name: string;
  color: string;
  instructions: string | null;
  conversationCount: number;
  updatedAt: string;
}
interface Conversation {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}
interface ProviderSplit {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
interface UsageResponse {
  month: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byProvider: { anthropic: ProviderSplit; openai: ProviderSplit };
}

const MONTHLY_BUDGET_USD = 20;

// ---------------------------------------------------------------- Fetch --

const jsonFetcher = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
};

// ---------------------------------------------------------------- Root --

export function Sidebar() {
  const router = useRouter();
  const search = useSearchParams();
  const activeConvId = search.get("c");

  const { data: projData, mutate: mutateProjects } = useSWR<{
    projects: Project[];
  }>("/api/projects", jsonFetcher, { revalidateOnFocus: true });
  const { data: convData, mutate: mutateConvs } = useSWR<{
    conversations: Conversation[];
  }>("/api/conversations", jsonFetcher, { revalidateOnFocus: true });
  const { data: usage, isLoading: usageLoading } = useSWR<UsageResponse>(
    "/api/usage/monthly",
    jsonFetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
  );

  const [query, setQuery] = useState("");
  const [projectsOpen, setProjectsOpen] = useState(true);

  const projects = projData?.projects ?? [];

  const filtered = useMemo(() => {
    const list = convData?.conversations ?? [];
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((c) => c.title.toLowerCase().includes(q));
  }, [convData, query]);

  const noProjectConvs = filtered.filter((c) => !c.projectId);
  const groupedByDate = groupByDate(noProjectConvs);

  const handleNewProject = async () => {
    const name = window.prompt("Name des Projekts?");
    if (!name?.trim()) return;
    const instructions = window.prompt(
      "Projekt-Instructions (optional, wird in jedem Chat als Kontext genutzt):",
    );
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        instructions: instructions?.trim() || undefined,
      }),
    });
    if (r.ok) void mutateProjects();
  };

  const handleAssignProject = async (
    convId: string,
    projectId: string | null,
  ) => {
    const r = await fetch(`/api/conversations/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (r.ok) {
      void mutateConvs();
      void mutateProjects();
    }
  };

  const handleDeleteConv = async (convId: string) => {
    if (!window.confirm("Chat wirklich löschen?")) return;
    const r = await fetch(`/api/conversations/${convId}`, { method: "DELETE" });
    if (r.ok) {
      void mutateConvs();
      if (activeConvId === convId) router.replace("/");
    }
  };

  const handleDeleteProject = async (projId: string) => {
    if (
      !window.confirm(
        "Projekt löschen? Die Chats bleiben erhalten und werden aus dem Projekt gelöst.",
      )
    )
      return;
    const r = await fetch(`/api/projects/${projId}`, { method: "DELETE" });
    if (r.ok) {
      void mutateProjects();
      void mutateConvs();
    }
  };

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-white/5 bg-neutral-950 text-neutral-100">
      {/* 1. Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-emerald-500" />
          <div>
            <div className="text-sm font-semibold leading-none">KernKI</div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">
              KERN CONTROL
            </div>
          </div>
        </div>
        <Link
          href="/"
          className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
          title="Neuen Chat starten"
        >
          + Neu
        </Link>
      </div>

      {/* 2. Suche */}
      <div className="px-3 py-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche…"
          className="w-full rounded border border-white/10 bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-white/20"
        />
      </div>

      {/* 3. Scrollbereich */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ProjectsSection
          open={projectsOpen}
          onToggle={() => setProjectsOpen((v) => !v)}
          projects={projects}
          conversations={filtered}
          activeConvId={activeConvId}
          onNewProject={handleNewProject}
          onAssignProject={handleAssignProject}
          onDeleteConv={handleDeleteConv}
          onDeleteProject={handleDeleteProject}
        />

        <div className="mt-3">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
            Chats
          </div>
          {groupedByDate.map((g) => (
            <div key={g.label} className="mb-2">
              <div className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-wider text-neutral-600">
                {g.label}
              </div>
              {g.items.map((c) => (
                <ConversationItem
                  key={c.id}
                  conv={c}
                  active={activeConvId === c.id}
                  projects={projects}
                  onAssignProject={handleAssignProject}
                  onDelete={handleDeleteConv}
                />
              ))}
            </div>
          ))}
          {noProjectConvs.length === 0 && (
            <div className="px-2 py-4 text-xs text-neutral-500">
              {query ? "Keine Treffer." : "Noch keine Chats."}
            </div>
          )}
        </div>
      </div>

      {/* 4. Verbrauchs-Meter (immer unten) */}
      <div className="border-t border-white/5 p-3">
        <BudgetBar
          anthropic={usage?.byProvider.anthropic.costUsd ?? 0}
          openai={usage?.byProvider.openai.costUsd ?? 0}
          budget={MONTHLY_BUDGET_USD}
          totalTokens={
            usage ? usage.totalInputTokens + usage.totalOutputTokens : 0
          }
          totalCost={usage?.totalCostUsd ?? 0}
          month={usage?.month ?? currentMonthLabel()}
          loading={usageLoading}
        />
      </div>

      {/* 5. Nav */}
      <div className="flex items-center justify-between gap-2 border-t border-white/5 px-3 py-2 text-xs">
        <Link
          href="/settings"
          className="rounded px-2 py-1 text-neutral-300 hover:bg-white/5"
        >
          Einstellungen
        </Link>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="rounded px-2 py-1 text-neutral-400 hover:bg-white/5"
        >
          Abmelden
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- Projects --

function ProjectsSection({
  open,
  onToggle,
  projects,
  conversations,
  activeConvId,
  onNewProject,
  onAssignProject,
  onDeleteConv,
  onDeleteProject,
}: {
  open: boolean;
  onToggle: () => void;
  projects: Project[];
  conversations: Conversation[];
  activeConvId: string | null;
  onNewProject: () => void;
  onAssignProject: (convId: string, projectId: string | null) => void;
  onDeleteConv: (convId: string) => void;
  onDeleteProject: (projId: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left hover:text-neutral-300"
        >
          Projekte {open ? "▾" : "▸"}
        </button>
        <button
          type="button"
          onClick={onNewProject}
          className="rounded px-1 text-neutral-400 hover:bg-white/5"
          title="Neues Projekt"
        >
          +
        </button>
      </div>
      {open && (
        <div>
          {projects.length === 0 && (
            <div className="px-2 py-2 text-xs text-neutral-500">
              Noch keine Projekte.
            </div>
          )}
          {projects.map((p) => (
            <ProjectItem
              key={p.id}
              project={p}
              conversations={conversations.filter((c) => c.projectId === p.id)}
              projects={projects}
              activeConvId={activeConvId}
              onAssignProject={onAssignProject}
              onDeleteConv={onDeleteConv}
              onDeleteProject={onDeleteProject}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectItem({
  project,
  conversations,
  projects,
  activeConvId,
  onAssignProject,
  onDeleteConv,
  onDeleteProject,
}: {
  project: Project;
  conversations: Conversation[];
  projects: Project[];
  activeConvId: string | null;
  onAssignProject: (convId: string, projectId: string | null) => void;
  onDeleteConv: (convId: string) => void;
  onDeleteProject: (projId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="mb-1">
      <div className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-white/5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left text-sm"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: project.color }}
          />
          <span className="flex-1 truncate">{project.name}</span>
          <span className="text-[10px] text-neutral-500">
            {conversations.length}
          </span>
          <span className="text-[10px] text-neutral-500">
            {open ? "▾" : "▸"}
          </span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded px-1 text-neutral-400 opacity-0 hover:bg-white/10 group-hover:opacity-100"
            aria-label="Projekt-Menü"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-6 z-10 w-40 rounded border border-white/10 bg-neutral-900 py-1 text-xs shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                type="button"
                className="block w-full px-3 py-1 text-left text-red-300 hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  onDeleteProject(project.id);
                }}
              >
                Projekt löschen
              </button>
            </div>
          )}
        </div>
      </div>
      {open && (
        <div className="ml-4 border-l border-white/5 pl-2">
          {conversations.length === 0 && (
            <div className="px-2 py-1 text-[11px] text-neutral-600">
              (keine Chats)
            </div>
          )}
          {conversations.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              active={activeConvId === c.id}
              projects={projects}
              onAssignProject={onAssignProject}
              onDelete={onDeleteConv}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Chat item --

function ConversationItem({
  conv,
  active,
  projects,
  onAssignProject,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  projects: Project[];
  onAssignProject: (convId: string, projectId: string | null) => void;
  onDelete: (convId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`group relative flex items-center rounded ${
        active ? "bg-white/10" : "hover:bg-white/5"
      }`}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
    >
      <Link
        href={`/?c=${conv.id}`}
        className="flex-1 truncate px-2 py-1 text-sm text-neutral-200"
      >
        {conv.title}
      </Link>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="mr-1 rounded px-1 text-neutral-400 opacity-0 hover:bg-white/10 group-hover:opacity-100"
        aria-label="Chat-Menü"
      >
        ⋯
      </button>
      {menuOpen && (
        <div
          className="absolute right-2 top-7 z-20 w-52 rounded border border-white/10 bg-neutral-900 py-1 text-xs shadow-lg"
          onMouseLeave={() => setMenuOpen(false)}
        >
          <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500">
            Projekt zuweisen
          </div>
          {projects.length === 0 && (
            <div className="px-3 py-1 text-neutral-600">Keine Projekte</div>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-white/5"
              onClick={() => {
                setMenuOpen(false);
                onAssignProject(conv.id, p.id);
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              {p.name}
              {conv.projectId === p.id && (
                <span className="ml-auto text-neutral-500">✓</span>
              )}
            </button>
          ))}
          {conv.projectId && (
            <button
              type="button"
              className="block w-full px-3 py-1 text-left hover:bg-white/5"
              onClick={() => {
                setMenuOpen(false);
                onAssignProject(conv.id, null);
              }}
            >
              Aus Projekt entfernen
            </button>
          )}
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            className="block w-full px-3 py-1 text-left text-red-300 hover:bg-white/5"
            onClick={() => {
              setMenuOpen(false);
              onDelete(conv.id);
            }}
          >
            Chat löschen
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Meter --

function BudgetBar({
  anthropic,
  openai,
  budget,
  totalTokens,
  totalCost,
  month,
  loading,
}: {
  anthropic: number;
  openai: number;
  budget: number;
  totalTokens: number;
  totalCost: number;
  month: string;
  loading: boolean;
}) {
  const total = anthropic + openai;
  const pct = Math.min(100, (total / budget) * 100);
  const antPct = total > 0 ? (anthropic / total) * pct : 0;
  const oaPct = total > 0 ? (openai / total) * pct : 0;
  return (
    <div className="rounded border border-white/5 bg-neutral-900 p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-500">
        <span>Verbrauch · {month}</span>
        <span>
          ${totalCost.toFixed(2)} / ${budget.toFixed(0)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="flex h-full">
          <div
            className="h-full bg-amber-500 transition-[width]"
            style={{ width: `${antPct}%` }}
            title={`Anthropic: $${anthropic.toFixed(4)}`}
          />
          <div
            className="h-full bg-emerald-500 transition-[width]"
            style={{ width: `${oaPct}%` }}
            title={`OpenAI: $${openai.toFixed(4)}`}
          />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>
          {loading
            ? "…"
            : `${new Intl.NumberFormat("de-DE").format(totalTokens)} Tokens`}
        </span>
        <span className="flex gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />A
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />O
          </span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Helpers --

function currentMonthLabel(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface DateGroup {
  label: string;
  items: Conversation[];
}

function groupByDate(convs: Conversation[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const weekStart = new Date(today.getTime() - 7 * 86_400_000);

  const groups: Record<string, Conversation[]> = {
    Heute: [],
    Gestern: [],
    "Diese Woche": [],
    Älter: [],
  };
  for (const c of convs) {
    const t = new Date(c.updatedAt).getTime();
    if (t >= today.getTime()) groups["Heute"].push(c);
    else if (t >= yesterday.getTime()) groups["Gestern"].push(c);
    else if (t >= weekStart.getTime()) groups["Diese Woche"].push(c);
    else groups["Älter"].push(c);
  }
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}
