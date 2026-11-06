"use client";

import { useEffect, useState } from "react";

type Share = {
  id: string;
  email: string;
  role: "viewer" | "commenter" | "editor";
  status: "pending" | "active";
  userName: string | null;
};

const ROLES = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
] as const;

export function ShareDialog({
  open,
  onClose,
  docId,
  docTitle,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  docTitle: string;
}) {
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "commenter" | "editor">("editor");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    (async () => {
      const res = await fetch(`/api/docs/${docId}/shares`);
      if (!res.ok) {
        setError("Could not load people with access.");
        return;
      }
      const body = await res.json();
      setShares(body.shares);
    })();
  }, [open, docId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/docs/${docId}/shares`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: trimmed, role }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Could not share.");
      return;
    }
    const body = await res.json();
    setEmail("");
    setShares((prev) => {
      const without = prev.filter((p) => p.id !== body.share.id);
      return [...without, { ...body.share, userName: body.userName }];
    });
  }

  async function changeRole(id: string, next: "viewer" | "commenter" | "editor") {
    setShares((prev) => prev.map((s) => (s.id === id ? { ...s, role: next } : s)));
    const res = await fetch(`/api/docs/${docId}/shares/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    if (!res.ok) {
      setError("Could not change role.");
    }
  }

  async function revoke(id: string) {
    const prev = shares;
    setShares((rows) => rows.filter((r) => r.id !== id));
    const res = await fetch(`/api/docs/${docId}/shares/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Could not remove that person.");
      setShares(prev);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Share"
      className="fixed inset-0 z-50 flex items-start justify-center p-6"
      style={{ background: "rgba(15, 23, 42, 0.35)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md border p-6 shadow-lg"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Share this document</h2>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              {docTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost rounded-md px-2 py-1 text-sm"
            aria-label="Close share dialog"
          >
            ×
          </button>
        </header>

        <form onSubmit={invite} className="mt-4 flex items-stretch gap-2">
          <input
            type="email"
            required
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input flex-1 rounded-md px-3 py-2 text-sm"
            aria-label="Email to invite"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="input rounded-md px-2 py-2 text-sm"
            aria-label="Role"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {loading ? "Inviting..." : "Invite"}
          </button>
        </form>

        {error && (
          <p
            className="mt-3 rounded-md border px-3 py-2 text-xs"
            style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#b91c1c" }}
          >
            {error}
          </p>
        )}

        <section className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            People with access
          </p>
          {shares.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              No one else has access yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
              {shares.map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.userName ?? s.email}</p>
                    {s.userName && (
                      <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
                        {s.email}
                      </p>
                    )}
                  </div>
                  {s.status === "pending" && (
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide"
                      style={{ borderColor: "#fcd34d", background: "#fef3c7", color: "#92400e" }}
                    >
                      Pending
                    </span>
                  )}
                  <select
                    value={s.role}
                    onChange={(e) => changeRole(s.id, e.target.value as typeof s.role)}
                    className="input rounded-md px-2 py-1 text-xs"
                    aria-label={`Change role for ${s.email}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => revoke(s.id)}
                    className="btn-ghost rounded-md px-2 py-1 text-xs"
                    aria-label={`Remove ${s.email}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
