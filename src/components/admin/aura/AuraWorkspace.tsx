"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Archive,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Fingerprint,
  Heart,
  HeartPulse,
  Layers3,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  AURA_AREAS,
  EMPTY_AURA_WORKSPACE,
  localDateKey,
  getAuraPracticeOccurrenceKey,
  mergeAuraDraft,
  type AuraAction,
  type AuraArea,
  type AuraGoal,
  type AuraReview,
  type AuraLesson,
  type AuraWorkspace as Workspace,
} from "@/lib/aura";
import styles from "./aura.module.css";

const AREA_ICONS = {
  life: Sunrise,
  business: BriefcaseBusiness,
  family: Heart,
  career: TrendingUp,
  health: HeartPulse,
  moments: Sparkles,
  presence: Fingerprint,
};
const AREA_NAMES: Record<AuraArea, string> = {
  life: "Life",
  business: "Business",
  family: "Family",
  career: "Career",
  health: "Health",
  moments: "Magic moments",
  presence: "Presence",
};
const TEMPLATES: Record<
  AuraArea,
  { title: string; success: string; actions: string[] }
> = {
  life: {
    title: "Make space for what matters",
    success:
      "Describe the routine and the change you want to notice in your life.",
    actions: [
      "Choose one part of my day to simplify",
      "Try the simpler routine once",
      "Review what worked and choose my next step",
    ],
  },
  business: {
    title: "Turn an opportunity into a result",
    success:
      "Define the customer result or business measure that would make this worthwhile.",
    actions: [
      "Identify one real customer need",
      "Prepare a clear offer that answers it",
      "Have a conversation and record the response",
    ],
  },
  family: {
    title: "Be more present with my people",
    success: "Describe the connection or shared experience you want to create.",
    actions: [
      "Ask what would feel meaningful to us",
      "Choose a time together and protect it",
      "Spend that time fully present",
    ],
  },
  career: {
    title: "Build a skill I can demonstrate",
    success:
      "Name the work you will be able to produce and how you will assess it.",
    actions: [
      "Choose one skill and a useful practice project",
      "Complete one focused practice session",
      "Ask for feedback on a concrete piece of work",
    ],
  },
  health: {
    title: "Build a sustainable wellbeing routine",
    success:
      "Choose a realistic measure of wellbeing and a review date that suits you.",
    actions: [
      "Decide what wellbeing means to me right now",
      "Choose one manageable activity that fits my needs",
      "Review how I feel and adjust the next step",
    ],
  },
  moments: {
    title: "Make a memory worth keeping",
    success:
      "Describe the experience, who it is with, and what would make it meaningful.",
    actions: [
      "Choose the experience I actually want",
      "Check the time, budget, and practical details",
      "Make a simple plan with the people involved",
    ],
  },
  presence: {
    title: "Let my work speak clearly",
    success:
      "Define what you want people to understand from an honest example of your work.",
    actions: [
      "Choose one real piece of work I am proud of",
      "Explain the problem, my contribution, and the result",
      "Share it thoughtfully with a relevant audience",
    ],
  },
};
function id() {
  return crypto.randomUUID();
}
function progress(goal: AuraGoal) {
  return goal.actions.length
    ? Math.round(
        (goal.actions.filter((a) => a.completedAt).length /
          goal.actions.length) *
          100,
      )
    : 0;
}
function formatDate(value: string) {
  return value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No target date";
}
function blankAction(): AuraAction {
  return {
    id: id(),
    title: "",
    minutes: 15,
    dueDate: "",
    completedAt: null,
    evidence: "",
  };
}
function blankGoal(area: AuraArea = "life"): AuraGoal {
  return {
    id: id(),
    title: "",
    area,
    why: "",
    success: "",
    targetDate: "",
    priority: 2,
    status: "active",
    actions: [blankAction()],
    outcomeEvidence: "",
    achievedAt: null,
    createdAt: new Date().toISOString(),
  };
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response
    .json()
    .catch(() => ({
      error: "The server returned an unreadable response. Please retry.",
    }));
  if (!response.ok)
    throw Object.assign(
      new Error(body.error || "Could not save. Please retry."),
      { status: response.status, code: body.code },
    );
  return body;
}

const RecoveryContext = createContext<null | (() => void)>(null);
function ConflictNotice() {
  const recover = useContext(RecoveryContext);
  return recover ? (
    <div className={styles.errorPanel} role="alert">
      <p>
        A newer version is saved. Reload it while keeping this draft, then
        review your changes before saving again.
      </p>
      <button type="button" className={styles.secondary} onClick={recover}>
        Reload saved data; keep my draft
      </button>
    </div>
  ) : null;
}

let modalHistoryToken: string | null = null;
let activeModals = 0;

function Modal({
  title,
  kicker,
  children,
  onClose,
  dirty = false,
  busy = false,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const dirtyRef = useRef(dirty);
  const busyRef = useRef(busy);
  useEffect(() => {
    closeRef.current = onClose;
    dirtyRef.current = dirty;
    busyRef.current = busy;
  }, [onClose, dirty, busy]);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    activeModals += 1;
    if (!modalHistoryToken) {
      modalHistoryToken = id();
      window.history.pushState(
        { ...window.history.state, auraDialog: modalHistoryToken },
        "",
        window.location.href,
      );
    }
    const token = modalHistoryToken;
    const mayClose = () =>
      !busyRef.current &&
      (!dirtyRef.current || window.confirm("Discard your unsaved changes?"));
    const onBack = () => {
      if (mayClose()) {
        modalHistoryToken = null;
        closeRef.current();
      } else
        window.history.pushState(
          { ...window.history.state, auraDialog: token },
          "",
          window.location.href,
        );
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || busyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("popstate", onBack);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("popstate", onBack);
      window.removeEventListener("beforeunload", beforeUnload);
      document.body.style.overflow = previousOverflow;
      dialog?.close();
      activeModals -= 1;
      queueMicrotask(() => {
        if (activeModals === 0 && modalHistoryToken === token) {
          modalHistoryToken = null;
          if (window.history.state?.auraDialog === token) window.history.back();
        }
      });
      previous?.focus();
    };
  }, []);
  const close = () => {
    if (!busy && (!dirty || window.confirm("Discard your unsaved changes?")))
      onClose();
  };
  return (
    <dialog
      ref={ref}
      className={styles.modal}
      aria-labelledby="aura-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className={styles.modalHead}>
        <div>
          <span className={styles.eyebrow}>
            {kicker || "YOUR NEXT CHAPTER"}
          </span>
          <h2 id="aura-dialog-title">{title}</h2>
        </div>
        <button
          className={styles.iconButton}
          onClick={close}
          disabled={busy}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      <ConflictNotice />
      <fieldset className={styles.modalFields} disabled={busy}>
        {children}
      </fieldset>
    </dialog>
  );
}

function GoalEditor({
  initial,
  isNew,
  onSave,
  onClose,
  busy,
  error,
}: {
  initial: AuraGoal;
  isNew: boolean;
  onSave: (goal: AuraGoal) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [removed, setRemoved] = useState<AuraAction | null>(null);
  const [localError, setLocalError] = useState("");
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  const patch = (change: Partial<AuraGoal>) =>
    setDraft((current) => ({ ...current, ...change }));
  const patchAction = (actionId: string, change: Partial<AuraAction>) =>
    patch({
      actions: draft.actions.map((action) =>
        action.id === actionId ? { ...action, ...change } : action,
      ),
    });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.actions.length || draft.actions.some((a) => !a.title.trim())) {
      setLocalError("Give each action a clear name. Add at least one action.");
      return;
    }
    setLocalError("");
    onSave({
      ...draft,
      title: draft.title.trim(),
      success: draft.success.trim(),
      actions: draft.actions.map((a) => ({ ...a, title: a.title.trim() })),
    });
  };
  return (
    <Modal
      title={isNew ? "Give your vision a path." : "Refine your path."}
      kicker={isNew ? "DEFINE → ACT → VERIFY" : "ADJUST THE PLAN"}
      onClose={onClose}
      dirty={dirty}
      busy={busy}
    >
      <form onSubmit={submit} className={styles.form}>
        <p className={styles.formIntro}>
          One meaningful outcome. Small actions you can control. A clear way to
          know what changed.
        </p>
        <label>
          Outcome name
          <input
            required
            maxLength={120}
            value={draft.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="What do you want to make real?"
            autoFocus
          />
        </label>
        <div className={styles.formGrid}>
          <label>
            Life area
            <select
              value={draft.area}
              onChange={(e) => patch({ area: e.target.value as AuraArea })}
            >
              {AURA_AREAS.map((area) => (
                <option key={area.id} value={area.id}>
                  {AREA_NAMES[area.id]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={draft.priority}
              onChange={(e) => patch({ priority: Number(e.target.value) })}
            >
              <option value={1}>High · move this first</option>
              <option value={2}>Medium · steady progress</option>
              <option value={3}>Low · when there is room</option>
            </select>
          </label>
        </div>
        <label>
          Why this matters <span className={styles.optional}>optional</span>
          <textarea
            maxLength={1000}
            rows={2}
            value={draft.why}
            onChange={(e) => patch({ why: e.target.value })}
            placeholder="The life this helps you build"
          />
        </label>
        <label>
          I will know it worked when…
          <textarea
            required
            maxLength={2000}
            rows={2}
            value={draft.success}
            onChange={(e) => patch({ success: e.target.value })}
            placeholder="Describe an observable result, not only a completed checklist"
          />
        </label>
        <label>
          Target / review date{" "}
          <span className={styles.optional}>optional, adjustable</span>
          <input
            type="date"
            value={draft.targetDate}
            onChange={(e) => patch({ targetDate: e.target.value })}
          />
        </label>
        <div className={styles.formSection}>
          <div>
            <span className={styles.eyebrow}>THE PATH</span>
            <h3>Make the next move obvious.</h3>
          </div>
          <p>
            In order, one real action per step. Today surfaces your next
            available action from each goal, prioritizing overdue work, then
            your priorities.
          </p>
        </div>
        <div className={styles.editActions}>
          {draft.actions.map((action, index) => (
            <div className={styles.editAction} key={action.id}>
              <div className={styles.actionNumber}>
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className={styles.actionFields}>
                <label>
                  <span className={styles.srOnly}>Action {index + 1}</span>
                  <input
                    required
                    maxLength={180}
                    value={action.title}
                    placeholder="A specific action I can finish"
                    onChange={(e) =>
                      patchAction(action.id, { title: e.target.value })
                    }
                  />
                </label>
                <div className={styles.formGrid}>
                  <label>
                    Minutes
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      required
                      value={action.minutes}
                      onChange={(e) =>
                        patchAction(action.id, {
                          minutes: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Do on / after
                    <input
                      type="date"
                      value={action.dueDate}
                      onChange={(e) =>
                        patchAction(action.id, { dueDate: e.target.value })
                      }
                    />
                  </label>
                </div>
                {action.completedAt ? (
                  <span className={styles.completedNote}>
                    <Check size={12} /> Completed · evidence kept
                  </span>
                ) : null}
              </div>
              <div className={styles.actionTools}>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Move action ${index + 1} up`}
                  disabled={index === 0}
                  onClick={() => {
                    const actions = [...draft.actions];
                    [actions[index - 1], actions[index]] = [
                      actions[index],
                      actions[index - 1],
                    ];
                    patch({ actions });
                  }}
                >
                  <ArrowDown
                    size={15}
                    style={{ transform: "rotate(180deg)" }}
                  />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() => {
                    setRemoved(action);
                    patch({
                      actions: draft.actions.filter((a) => a.id !== action.id),
                    });
                  }}
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {removed ? (
          <div className={styles.inlineNotice}>
            Action removed from this draft{" "}
            <button
              type="button"
              onClick={() => {
                patch({ actions: [...draft.actions, removed] });
                setRemoved(null);
              }}
            >
              Undo
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={styles.textButton}
          disabled={draft.actions.length >= 30}
          onClick={() => patch({ actions: [...draft.actions, blankAction()] })}
        >
          <Plus size={16} /> Add an action
        </button>
        {localError || error ? (
          <p role="alert" className={styles.formError}>
            {localError || error}
          </p>
        ) : null}
        <div className={styles.modalFoot}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm("Discard your unsaved changes?"))
                onClose();
            }}
          >
            Cancel
          </button>
          <button className={styles.primary} disabled={busy}>
            <Save size={16} />
            {busy ? "Saving…" : isNew ? "Create my path" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TextEditor({
  kind,
  initial,
  onClose,
  onSave,
  busy,
  error,
}: {
  kind: "vision" | "review";
  initial: string;
  onClose: () => void;
  onSave: (value: string | AuraReview, baseVision?: string) => void;
  busy: boolean;
  error: string;
}) {
  const [vision, setVision] = useState(initial);
  const [originalVision] = useState(initial);
  const [review, setReview] = useState<AuraReview>(() => ({
    id: id(),
    createdAt: new Date().toISOString(),
    win: "",
    lesson: "",
    adjustment: "",
  }));
  return (
    <Modal
      title={
        kind === "vision"
          ? "What are you building toward?"
          : "Keep what works. Adjust the rest."
      }
      kicker={kind === "vision" ? "YOUR NORTH STAR" : "THE WEEKLY REVIEW"}
      onClose={onClose}
      dirty={
        vision !== initial ||
        [review.win, review.lesson, review.adjustment].some(Boolean)
      }
      busy={busy}
    >
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(kind === "vision" ? vision.trim() : review, originalVision);
        }}
      >
        {kind === "vision" ? (
          <>
            <p className={styles.formIntro}>
              Describe a life you genuinely want: how you spend your time, who
              is beside you, the work you do, and how you feel. Make it yours.
            </p>
            <label>
              My vision
              <textarea
                rows={7}
                required
                maxLength={3000}
                value={vision}
                onChange={(e) => setVision(e.target.value)}
                autoFocus
                placeholder="I want a life where…"
              />
            </label>
          </>
        ) : (
          <>
            <p className={styles.formIntro}>
              A review is information, not a judgment. Use it to make your next
              week more realistic.
            </p>
            <label>
              What moved forward?
              <textarea
                rows={2}
                required
                maxLength={1000}
                value={review.win}
                onChange={(e) => setReview({ ...review, win: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              What did I learn?
              <textarea
                rows={2}
                required
                maxLength={1000}
                value={review.lesson}
                onChange={(e) =>
                  setReview({ ...review, lesson: e.target.value })
                }
              />
            </label>
            <label>
              What will I change next?
              <textarea
                rows={2}
                required
                maxLength={1000}
                value={review.adjustment}
                onChange={(e) =>
                  setReview({ ...review, adjustment: e.target.value })
                }
              />
            </label>
            <p className={styles.muted}>
              Saved as a reflection. Edit your goal afterward to apply the
              change to its actions.
            </p>
          </>
        )}
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.modalFoot}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => {
              if (
                !(
                  vision !== initial ||
                  [review.win, review.lesson, review.adjustment].some(Boolean)
                ) ||
                window.confirm("Discard your unsaved changes?")
              )
                onClose();
            }}
          >
            Cancel
          </button>
          <button className={styles.primary} disabled={busy}>
            <Save size={16} />
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GoalDetail({
  goal,
  onClose,
  onEdit,
  onChange,
  busy,
  error,
}: {
  goal: AuraGoal;
  onClose: () => void;
  onEdit: () => void;
  onChange: (goal: AuraGoal, message: string) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  const [evidenceDraft, setEvidence] = useState<string | null>(null);
  const evidence = evidenceDraft ?? goal.outcomeEvidence;
  const baseGoal = useRef(goal);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const dirty =
    evidence !== goal.outcomeEvidence ||
    Object.keys(actionNotes).some(
      (key) =>
        actionNotes[key] !== goal.actions.find((a) => a.id === key)?.evidence,
    );
  const saveEvidence = async (achieve = false) => {
    const candidate = {
      ...baseGoal.current,
      outcomeEvidence: evidence,
      actions: baseGoal.current.actions.map((a) => ({
        ...a,
        evidence: actionNotes[a.id] ?? a.evidence,
      })),
      ...(achieve
        ? { status: "achieved" as const, achievedAt: new Date().toISOString() }
        : {}),
    };
    const merged = mergeAuraDraft(baseGoal.current, candidate, goal);
    if (
      merged.conflicts.length &&
      !window.confirm(
        `Newer evidence overlaps your draft in: ${merged.conflicts.join(", ")}. Replace those fields with your draft?`,
      )
    )
      return;
    if (
      await onChange(
        merged.value,
        achieve ? "Outcome achieved. Evidence recorded." : "Evidence saved",
      )
    ) {
      baseGoal.current = merged.value;
      setEvidence(null);
      setActionNotes({});
    }
  };
  const status =
    goal.status === "achieved"
      ? "Outcome verified"
      : goal.status === "archived"
        ? "Archived"
        : progress(goal) === 100
          ? "Actions complete · verify the outcome"
          : "In progress";
  return (
    <Modal
      title={goal.title}
      kicker={AREA_NAMES[goal.area]}
      onClose={onClose}
      dirty={dirty}
      busy={busy}
    >
      <div className={styles.detailBody}>
        <div className={styles.detailMeta}>
          <span className={styles.status}>{status}</span>
          <span>
            <Clock3 size={13} />
            {formatDate(goal.targetDate)}
          </span>
        </div>
        {goal.why ? <p className={styles.detailWhy}>{goal.why}</p> : null}
        <div className={styles.successBox}>
          <span className={styles.eyebrow}>THE RESULT I AM LOOKING FOR</span>
          <p>{goal.success}</p>
        </div>
        <div className={styles.sectionHeading}>
          <h3>The action path</h3>
          <span>
            {goal.actions.filter((a) => a.completedAt).length} /{" "}
            {goal.actions.length}
          </span>
        </div>
        <div className={styles.progressTrack}>
          <span style={{ width: `${progress(goal)}%` }} />
        </div>
        <div className={styles.detailActions}>
          {goal.actions.map((action, index) => (
            <div key={action.id} className={styles.detailAction}>
              <button
                className={`${styles.checkbox} ${action.completedAt ? styles.checked : ""}`}
                aria-label={`${action.completedAt ? "Reopen" : "Complete"} ${action.title}`}
                aria-pressed={!!action.completedAt}
                disabled={busy || dirty || goal.status !== "active"}
                onClick={() =>
                  void onChange(
                    {
                      ...goal,
                      actions: goal.actions.map((a) =>
                        a.id === action.id
                          ? {
                              ...a,
                              completedAt: a.completedAt
                                ? null
                                : new Date().toISOString(),
                            }
                          : a,
                      ),
                    },
                    action.completedAt ? "Action reopened" : "Action completed",
                  )
                }
              >
                {action.completedAt ? (
                  <Check size={15} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </button>
              <div>
                <strong className={action.completedAt ? styles.strike : ""}>
                  {action.title}
                </strong>
                <p>
                  {action.minutes} min
                  {action.dueDate ? ` · ${formatDate(action.dueDate)}` : ""}
                </p>
                <label className={styles.evidenceLabel}>
                  Action evidence / note{" "}
                  <span className={styles.optional}>optional</span>
                  <input
                    maxLength={1000}
                    value={actionNotes[action.id] ?? action.evidence}
                    onChange={(e) =>
                      setActionNotes({
                        ...actionNotes,
                        [action.id]: e.target.value,
                      })
                    }
                    placeholder="What did you do or notice?"
                    disabled={goal.status === "archived"}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.successBox}>
          <span className={styles.eyebrow}>VERIFY THE OUTCOME</span>
          <h3>What actually changed?</h3>
          <p>
            Finishing actions creates progress. Mark the outcome achieved only
            when you can point to the result.
          </p>
          <label>
            Outcome evidence
            <textarea
              rows={3}
              maxLength={2000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Record an observable change, measure, or result"
              disabled={goal.status === "archived"}
            />
          </label>
          {goal.status === "active" ? (
            <button
              className={styles.primary}
              disabled={busy || !evidence.trim()}
              onClick={() => void saveEvidence(true)}
            >
              <ShieldCheck size={16} /> Verify as achieved
            </button>
          ) : (
            <button
              className={styles.secondary}
              disabled={busy || dirty}
              onClick={() =>
                void onChange(
                  { ...goal, status: "active", achievedAt: null },
                  "Goal reopened",
                )
              }
            >
              <RotateCcw size={16} />
              {goal.status === "archived"
                ? "Restore this goal"
                : "Reopen this goal"}
            </button>
          )}
        </div>
        {dirty ? (
          <div className={styles.inlineNotice}>
            You have unsaved evidence{" "}
            <button onClick={() => void saveEvidence()} disabled={busy}>
              Save evidence
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className={styles.formError}>
            {error}
          </p>
        ) : null}
        <div className={styles.detailFooter}>
          <button
            className={styles.secondary}
            onClick={() => {
              if (!dirty || window.confirm("Discard your unsaved evidence?"))
                onEdit();
            }}
            disabled={busy}
          >
            <Compass size={16} /> Edit path
          </button>
          <div>
            {goal.status === "active" &&
            goal.actions.some((a) => a.completedAt) ? (
              <button
                className={styles.textButton}
                disabled={busy || dirty}
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset action checkmarks for this goal? Your notes stay. You can undo this change.",
                    )
                  )
                    void onChange(
                      {
                        ...goal,
                        actions: goal.actions.map((a) => ({
                          ...a,
                          completedAt: null,
                        })),
                      },
                      "Action checkmarks reset",
                    );
                }}
              >
                <RotateCcw size={14} /> Reset actions
              </button>
            ) : null}
            {goal.status !== "archived" ? (
              <button
                className={styles.textButton}
                disabled={busy || dirty}
                onClick={() => {
                  if (
                    window.confirm(
                      "Archive this goal? You can restore it from Archived.",
                    )
                  )
                    void onChange(
                      { ...goal, status: "archived" },
                      "Goal archived. Restore it anytime.",
                    );
                }}
              >
                <Archive size={14} /> Archive
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

const LESSON_EXAMPLES = [
  {
    name: "Before a business meeting",
    area: "business" as AuraArea,
    situation:
      "Example: a business partner needed a cash payment, and I was not prepared.",
    lesson:
      "Check the payment method before a meeting and prepare an appropriate cash amount when needed.",
    nextAction:
      "Confirm the next meeting’s payment needs. Consider Rs 5,000 as an editable preparation amount for this situation.",
    title: "Arrive prepared",
    trigger: "Before a meeting where a cash payment may be needed",
    steps: [
      "Confirm whether payment is expected and how much",
      "If appropriate, prepare the agreed cash amount (example: Rs 5,000)",
      "Keep a record of any payment",
    ],
  },
  {
    name: "Make someone feel heard",
    area: "presence" as AuraArea,
    situation:
      "Example: I spoke mainly about myself and left little space for the other person.",
    lesson:
      "Show genuine interest, listen carefully, and help the other person feel understood.",
    nextAction:
      "In my next conversation, start with an open question and reflect back what I hear.",
    title: "Create space for the other person",
    trigger: "Before an important conversation",
    steps: [
      "Ask an open question about their experience",
      "Listen and reflect back the key point",
      "Keep my own story brief and relevant",
    ],
  },
  {
    name: "Remember the important details",
    area: "career" as AuraArea,
    situation:
      "Example: I forgot a detail or commitment shared by a colleague or client.",
    lesson:
      "Capture important details and confirm commitments instead of relying on memory.",
    nextAction:
      "Bring a hardcopy notebook to the next meeting and confirm the actions before leaving.",
    title: "Capture and confirm",
    trigger: "At each client or team meeting",
    steps: [
      "Bring a notebook and pen",
      "Write key details, names, and agreed actions",
      "Confirm owners and dates before the meeting ends",
    ],
  },
];
function blankLesson(): AuraLesson {
  return {
    id: id(),
    createdAt: new Date().toISOString(),
    situation: "",
    lesson: "",
    nextAction: "",
    area: "life",
    practice: null,
  };
}
function occurrenceKey(lesson: AuraLesson, today: string) {
  return lesson.practice
    ? getAuraPracticeOccurrenceKey(lesson.practice, today)
    : today;
}
function LessonEditor({
  initial,
  onClose,
  onSave,
  busy,
  error,
}: {
  initial: AuraLesson;
  onClose: () => void;
  onSave: (lesson: AuraLesson) => void;
  busy: boolean;
  error: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [example, setExample] = useState(false);
  const patch = (change: Partial<AuraLesson>) =>
    setDraft((current) => ({ ...current, ...change }));
  const patchPractice = (
    change: Partial<NonNullable<AuraLesson["practice"]>>,
  ) => {
    if (draft.practice) patch({ practice: { ...draft.practice, ...change } });
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const applyExample = (index: number) => {
    const t = LESSON_EXAMPLES[index];
    if (
      dirty &&
      !window.confirm("Replace this unsaved draft with an editable example?")
    )
      return;
    setDraft({
      ...initial,
      area: t.area,
      situation: t.situation,
      lesson: t.lesson,
      nextAction: t.nextAction,
      practice: {
        title: t.title,
        trigger: t.trigger,
        cadence: "when-needed",
        steps: t.steps.map((title) => ({ id: id(), title })),
        adopted: false,
        checks: {},
      },
    });
    setExample(true);
  };
  return (
    <Modal
      title="Turn a moment into a better next move."
      kicker="WHAT HAPPENED?"
      onClose={onClose}
      busy={busy}
      dirty={dirty}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          const practice = draft.practice
            ? {
                ...draft.practice,
                checks: Object.fromEntries(
                  Object.entries(draft.practice.checks).map(([key, checks]) => [
                    key,
                    checks.filter((stepId) =>
                      draft.practice!.steps.some((s) => s.id === stepId),
                    ),
                  ]),
                ),
              }
            : null;
          onSave({ ...draft, practice });
        }}
      >
        <p className={styles.formIntro}>
          Write it in your own words. You or Bosco can add the lesson and next
          step. Nothing is inferred or adopted automatically.
        </p>
        {!initial.situation ? (
          <div className={styles.lessonExamples}>
            <span>Optional examples</span>
            {LESSON_EXAMPLES.map((item, index) => (
              <button
                type="button"
                key={item.name}
                onClick={() => applyExample(index)}
              >
                {item.name}
                <ArrowUpRight size={12} />
              </button>
            ))}
          </div>
        ) : null}
        {example ? (
          <p className={styles.inlineNotice}>
            Editable example. Replace the situation with what actually happened
            before saving.
          </p>
        ) : null}
        <label>
          What happened?
          <textarea
            rows={4}
            maxLength={2000}
            required
            value={draft.situation}
            onChange={(e) => patch({ situation: e.target.value })}
            placeholder="Tell the story, just as you would tell Bosco"
            autoFocus
          />
        </label>
        <label>
          Life area
          <select
            value={draft.area}
            onChange={(e) => patch({ area: e.target.value as AuraArea })}
          >
            {AURA_AREAS.map((item) => (
              <option key={item.id} value={item.id}>
                {AREA_NAMES[item.id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          What can I learn?{" "}
          <span className={styles.optional}>can be added later</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={draft.lesson}
            onChange={(e) => patch({ lesson: e.target.value })}
            placeholder="A useful insight, without judging myself"
          />
        </label>
        <label>
          My next practical action{" "}
          <span className={styles.optional}>can be added later</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={draft.nextAction}
            onChange={(e) => patch({ nextAction: e.target.value })}
            placeholder="What could I do differently next time?"
          />
        </label>
        <label className={styles.checkLabel}>
          <input
            type="checkbox"
            checked={!!draft.practice}
            onChange={(e) =>
              patch({
                practice: e.target.checked
                  ? {
                      title: "",
                      trigger: "",
                      cadence: "when-needed",
                      steps: [{ id: id(), title: "" }],
                      adopted: false,
                      checks: {},
                    }
                  : null,
              })
            }
          />
          <span>Create a reusable checklist from this lesson</span>
        </label>
        {draft.practice ? (
          <div className={styles.practiceForm}>
            <span className={styles.eyebrow}>REVIEW BEFORE ADOPTING</span>
            <label>
              Checklist name
              <input
                required
                maxLength={180}
                value={draft.practice.title}
                onChange={(e) => patchPractice({ title: e.target.value })}
              />
            </label>
            <label>
              When should I use it?
              <input
                required
                maxLength={2000}
                value={draft.practice.trigger}
                onChange={(e) => patchPractice({ trigger: e.target.value })}
                placeholder="For example: before a client meeting"
              />
            </label>
            <label>
              Repeat
              <select
                value={draft.practice.cadence}
                onChange={(e) =>
                  patchPractice({
                    cadence: e.target.value as NonNullable<
                      AuraLesson["practice"]
                    >["cadence"],
                  })
                }
              >
                <option value="when-needed">
                  When needed · start each use myself
                </option>
                <option value="daily">Daily · fresh checks each day</option>
                <option value="weekly">
                  Weekly · fresh checks each Monday
                </option>
              </select>
            </label>
            <p className={styles.muted}>
              Uses your device’s local date. No notifications or automatic
              actions.
            </p>
            <div className={styles.practiceSteps}>
              {draft.practice.steps.map((step, index) => (
                <div key={step.id}>
                  <label>
                    <span className={styles.srOnly}>
                      Checklist step {index + 1}
                    </span>
                    <input
                      required
                      maxLength={180}
                      value={step.title}
                      placeholder={`Step ${index + 1}`}
                      onChange={(e) =>
                        patchPractice({
                          steps: draft.practice!.steps.map((s) =>
                            s.id === step.id
                              ? { ...s, title: e.target.value }
                              : s,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.iconButton}
                    disabled={draft.practice!.steps.length <= 1}
                    aria-label={`Remove checklist step ${index + 1}`}
                    onClick={() =>
                      patchPractice({
                        steps: draft.practice!.steps.filter(
                          (s) => s.id !== step.id,
                        ),
                      })
                    }
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className={styles.textButton}
              disabled={draft.practice.steps.length >= 20}
              onClick={() =>
                patchPractice({
                  steps: [...draft.practice!.steps, { id: id(), title: "" }],
                })
              }
            >
              <Plus size={15} />
              Add checklist step
            </button>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={draft.practice.adopted}
                onChange={(e) => patchPractice({ adopted: e.target.checked })}
              />
              <span>I’ve reviewed this checklist and want to use it</span>
            </label>
            <p className={styles.muted}>
              Leave unchecked to save it as a draft. You can edit or pause it
              later.
            </p>
          </div>
        ) : null}
        {error ? (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.modalFoot}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm("Discard your unsaved changes?"))
                onClose();
            }}
          >
            Cancel
          </button>
          <button className={styles.primary} disabled={busy}>
            <Save size={15} />
            {busy ? "Saving…" : "Save this lesson"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function PracticeCards({
  lessons,
  today,
  busy,
  onChange,
  onEdit,
}: {
  lessons: AuraLesson[];
  today: string;
  busy: boolean;
  onChange: (lesson: AuraLesson, message: string) => void;
  onEdit: (lesson: AuraLesson) => void;
}) {
  return (
    <div className={styles.practiceGrid}>
      {lessons
        .filter((lesson) => lesson.practice?.adopted)
        .map((lesson) => {
          const practice = lesson.practice!;
          const key = occurrenceKey(lesson, today);
          const checks = practice.checks[key] || [];
          return (
            <article className={styles.practiceCard} key={lesson.id}>
              <div className={styles.goalCardTop}>
                <span>
                  <RotateCcw size={14} />
                  {practice.cadence === "daily"
                    ? "Daily"
                    : practice.cadence === "weekly"
                      ? "This week"
                      : "Use when needed"}
                </span>
                <span>
                  {checks.length}/{practice.steps.length}
                </span>
              </div>
              <h3>{practice.title}</h3>
              <p>{practice.trigger}</p>
              <div>
                {practice.steps.map((step) => (
                  <label className={styles.practiceCheck} key={step.id}>
                    <input
                      type="checkbox"
                      checked={checks.includes(step.id)}
                      disabled={busy}
                      onChange={() => {
                        const next = checks.includes(step.id)
                          ? checks.filter((value) => value !== step.id)
                          : [...checks, step.id];
                        const history = Object.fromEntries(
                          Object.entries({ ...practice.checks, [key]: next })
                            .sort(([a], [b]) => b.localeCompare(a))
                            .slice(0, 400),
                        );
                        onChange(
                          {
                            ...lesson,
                            practice: { ...practice, checks: history },
                          },
                          checks.includes(step.id)
                            ? "Checklist step reopened"
                            : "Checklist step completed",
                        );
                      }}
                    />
                    <span>{step.title}</span>
                  </label>
                ))}
              </div>
              <div className={styles.practiceFooter}>
                <button
                  className={styles.textButton}
                  disabled={busy}
                  onClick={() => onEdit(lesson)}
                >
                  Review / edit
                  <ArrowUpRight size={13} />
                </button>
                <button
                  className={styles.textButton}
                  disabled={busy || !checks.length}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Start this checklist again? This run’s checkmarks will reset. You can undo this.",
                      )
                    )
                      onChange(
                        {
                          ...lesson,
                          practice: {
                            ...practice,
                            checks: Object.fromEntries(
                              Object.entries({
                                ...practice.checks,
                                [practice.cadence === "when-needed"
                                  ? today
                                  : key]: [],
                              })
                                .sort(([a], [b]) => b.localeCompare(a))
                                .slice(0, 400),
                            ),
                          },
                        },
                        "Checklist ready for another use",
                      );
                  }}
                >
                  <RotateCcw size={12} />
                  Start again
                </button>
              </div>
            </article>
          );
        })}
    </div>
  );
}

export default function AuraWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_AURA_WORKSPACE);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [view, setView] = useState<"today" | "vision" | "review" | "lessons">(
    "today",
  );
  const [area, setArea] = useState<AuraArea | "all">("all");
  const [filter, setFilter] = useState<"active" | "achieved" | "archived">(
    "active",
  );
  const [editor, setEditor] = useState<{
    goal: AuraGoal;
    isNew: boolean;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textEditor, setTextEditor] = useState<"vision" | "review" | null>(
    null,
  );
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [lessonEditor, setLessonEditor] = useState<AuraLesson | null>(null);
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState<Workspace | null>(null);
  const [today, setToday] = useState("");
  const last = useRef({
    workspace: EMPTY_AURA_WORKSPACE,
    revision: 0,
    accountScope: "",
  });
  const requestGeneration = useRef(0);
  const forgetWorkspace = useCallback(() => {
    requestGeneration.current += 1;
    last.current = {
      workspace: EMPTY_AURA_WORKSPACE,
      revision: 0,
      accountScope: "",
    };
    setWorkspace(EMPTY_AURA_WORKSPACE);
    setRevision(0);
    setEditor(null);
    setSelectedId(null);
    setTextEditor(null);
    setLessonEditor(null);
    setTemplatesOpen(false);
    setUndo(null);
    setToast("");
    setConflict(false);
    setError("");
    setLoadError(
      "Your signed-in account changed or the session expired. Reload to open the current account’s workspace. No draft was saved to another account.",
    );
  }, []);
  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const scope = last.current.accountScope;
    setLoading(true);
    setLoadError("");
    try {
      const body = await request("/api/admin/aura");
      if (generation !== requestGeneration.current) return false;
      if (scope && scope !== body.accountScope) {
        forgetWorkspace();
        return false;
      }
      setWorkspace(body.workspace);
      setRevision(body.revision);
      last.current = body;
      setUndo(null);
      setConflict(false);
      setError("");
      return true;
    } catch (e) {
      if (generation === requestGeneration.current)
        setLoadError(
          e instanceof Error ? e.message : "Could not load your workspace.",
        );
      return false;
    } finally {
      setLoading(false);
    }
  }, [forgetWorkspace]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const checkIdentity = async () => {
      const scope = last.current.accountScope;
      if (!scope) return;
      try {
        const response = await fetch("/api/admin/session", {
          cache: "no-store",
        });
        if (response.status === 401) {
          forgetWorkspace();
          return;
        }
        if (response.ok) {
          const body = await response.json();
          if (
            last.current.accountScope === scope &&
            body.session?.userId !== scope
          )
            forgetWorkspace();
        }
      } catch {
        /* A temporary network failure does not discard a draft. */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkIdentity();
    };
    window.addEventListener("focus", checkIdentity);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", checkIdentity);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [forgetWorkspace]);
  useEffect(() => {
    const update = () => setToday(localDateKey());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (inFlight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  async function persist(next: Workspace, message: string, allowUndo = true) {
    if (inFlight.current || conflict) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const previous = last.current.workspace;
    const generation = requestGeneration.current;
    try {
      const body = await request("/api/admin/aura", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: next,
          revision: last.current.revision,
          accountScope: last.current.accountScope,
        }),
      });
      if (generation !== requestGeneration.current) return false;
      if (body.accountScope !== last.current.accountScope) {
        forgetWorkspace();
        return false;
      }
      last.current = body;
      setWorkspace(body.workspace);
      setRevision(body.revision);
      setUndo(allowUndo ? previous : null);
      setToast(message);
      return true;
    } catch (e) {
      if (
        (e as { code?: string }).code === "ACCOUNT_CHANGED" ||
        (e as { status?: number }).status === 401
      ) {
        forgetWorkspace();
        return false;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Your change was not saved. Please retry.",
      );
      if ((e as { status?: number }).status === 409) setConflict(true);
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const changeGoal = (goal: AuraGoal, message: string) =>
    persist(
      {
        ...last.current.workspace,
        goals: last.current.workspace.goals.map((g) =>
          g.id === goal.id ? goal : g,
        ),
      },
      message,
    );
  const changeLesson = (lesson: AuraLesson, message: string) =>
    persist(
      {
        ...last.current.workspace,
        lessons: last.current.workspace.lessons.map((item) =>
          item.id === lesson.id ? lesson : item,
        ),
      },
      message,
    );
  const openLesson = (lesson?: AuraLesson) => {
    setError("");
    setLessonEditor(lesson || blankLesson());
  };
  const selected = workspace.goals.find((g) => g.id === selectedId);
  const visibleGoals = workspace.goals.filter(
    (g) => g.status === filter && (area === "all" || g.area === area),
  );
  const nonArchived = workspace.goals.filter((g) => g.status !== "archived");
  const active = nonArchived.filter((g) => g.status === "active");
  const achieved = nonArchived.filter((g) => g.status === "achieved");
  const actions = nonArchived.flatMap((g) => g.actions);
  const completed = actions.filter((a) => a.completedAt);
  const percent = actions.length
    ? Math.round((completed.length / actions.length) * 100)
    : 0;
  const focus = active
    .flatMap((goal) => {
      const action = goal.actions.find((a) => !a.completedAt);
      return action && (!action.dueDate || action.dueDate <= today)
        ? [{ goal, action }]
        : [];
    })
    .sort((a, b) => {
      const overdueA = !!a.action.dueDate && a.action.dueDate < today;
      const overdueB = !!b.action.dueDate && b.action.dueDate < today;
      return (
        Number(overdueB) - Number(overdueA) ||
        a.goal.priority - b.goal.priority ||
        a.action.minutes - b.action.minutes ||
        a.goal.createdAt.localeCompare(b.goal.createdAt)
      );
    })
    .slice(0, 3);
  const ready = active.filter((g) => g.actions.length && progress(g) === 100);
  const completeAction = (goal: AuraGoal, action: AuraAction) =>
    changeGoal(
      {
        ...goal,
        actions: goal.actions.map((a) =>
          a.id === action.id
            ? { ...a, completedAt: new Date().toISOString() }
            : a,
        ),
      },
      "One meaningful move, made.",
    );
  const openNew = (selectedArea: AuraArea = "life", template = false) => {
    setError("");
    let goal = blankGoal(selectedArea);
    if (template) {
      const t = TEMPLATES[selectedArea];
      goal = {
        ...goal,
        title: t.title,
        success: t.success,
        actions: t.actions.map((title) => ({ ...blankAction(), title })),
      };
    }
    setEditor({ goal, isNew: true });
    setTemplatesOpen(false);
  };
  const chooseGoal = (goal: AuraGoal) => {
    setError("");
    setSelectedId(goal.id);
  };
  const addReview = async (value: string | AuraReview, baseVision?: string) => {
    if (typeof value === "string") {
      if (
        last.current.workspace.vision !== baseVision &&
        last.current.workspace.vision !== value &&
        !window.confirm(
          `Your saved vision changed in another tab. Current version: “${last.current.workspace.vision}”. Replace it with this draft?`,
        )
      )
        return;
      if (
        await persist(
          { ...last.current.workspace, vision: value },
          "Vision saved",
        )
      )
        setTextEditor(null);
    } else {
      const reviews = last.current.workspace.reviews.some(
        (review) => review.id === value.id,
      )
        ? last.current.workspace.reviews.map((review) =>
            review.id === value.id ? value : review,
          )
        : [value, ...last.current.workspace.reviews];
      if (
        await persist(
          { ...last.current.workspace, reviews },
          "Review saved. Your next move can be clearer.",
        )
      )
        setTextEditor(null);
    }
  };

  return (
    <RecoveryContext.Provider
      value={
        conflict
          ? () => {
              void load().then((loaded) => {
                if (loaded)
                  setToast(
                    "Latest saved data loaded. Review your preserved draft before saving.",
                  );
              });
            }
          : null
      }
    >
      <div
        className={`${styles.workspace} ${workspace.goals.length || workspace.lessons.length ? styles.hasData : ""}`}
      >
        <header className={styles.topbar}>
          <div className={styles.wordmark}>
            <span className={styles.monogram}>A</span>
            <div>
              <span>X5 AURA FARMING</span>
              <small>THE QUIET POWER SYSTEM</small>
            </div>
          </div>
          <div className={styles.privateBadge}>
            <LockKeyhole size={12} />
            <span>Your personal workspace</span>
          </div>
        </header>
        <div className={styles.content}>
          <section className={styles.hero} aria-label="Aura Farming overview">
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>
                <span className={styles.lightDot} /> INTENTION INTO EVIDENCE
              </span>
              <h1>
                One system.
                <br />A greater <em>you.</em>
              </h1>
              <p>
                A clear vision. A deliberate next move.
                <br />A life built by what you actually do.
              </p>
              <div className={styles.heroActions}>
                <button
                  className={styles.primary}
                  disabled={loading || !!loadError || busy || conflict}
                  onClick={() => openNew()}
                >
                  <Plus size={16} /> Define an outcome
                </button>
                <button
                  className={styles.heroLink}
                  onClick={() => {
                    setView("vision");
                    document
                      .getElementById("aura-main")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  See the whole picture <ArrowUpRight size={16} />
                </button>
              </div>
              <span className={styles.signature}>
                PLAN. LEAD. EXECUTE. DELIVER.
              </span>
            </div>
            <div
              className={styles.constellation}
              aria-label={`${percent}% of planned actions complete. ${achieved.length} outcomes verified.`}
            >
              <div className={styles.orbitOuter} />
              <div className={styles.orbitInner} />
              <div className={styles.orbitAxis} />
              <div className={styles.core}>
                <span className={styles.coreMark}>A</span>
                <span className={styles.coreLabel}>YOUR LIFE, IN SYNC</span>
                <div className={styles.coreLine} />
                <strong>
                  {loading ? "—" : percent}
                  <small>%</small>
                </strong>
                <span className={styles.coreSub}>ACTIONS COMPLETE</span>
              </div>
              {AURA_AREAS.map((item, index) => {
                const Icon = AREA_ICONS[item.id];
                return (
                  <button
                    key={item.id}
                    className={`${styles.orbitNode} ${styles[`node${index}`]}`}
                    onClick={() => {
                      setArea(item.id);
                      setView("vision");
                      document
                        .getElementById("aura-main")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    }}
                  >
                    <Icon size={16} />
                    <span>{AREA_NAMES[item.id]}</span>
                    <i
                      className={
                        active.some((g) => g.area === item.id)
                          ? styles.nodeLit
                          : ""
                      }
                    />
                  </button>
                );
              })}
              <span className={styles.orbitCaption}>
                POWER DOESN’T NEED AN AUDIENCE.
              </span>
            </div>
          </section>
          <div className={styles.metricStrip}>
            <div>
              <span>01 / DIRECTION</span>
              <strong>
                {loading ? "—" : active.length}
                <small>active outcomes</small>
              </strong>
            </div>
            <div>
              <span>02 / DISCIPLINE</span>
              <strong>
                {loading ? "—" : completed.length}
                <small>of {actions.length} actions complete</small>
              </strong>
            </div>
            <div>
              <span>03 / EVIDENCE</span>
              <strong>
                {loading ? "—" : achieved.length}
                <small>outcomes verified</small>
              </strong>
            </div>
            <p>
              <ShieldCheck size={18} />
              Actions build momentum.
              <br />
              Evidence confirms the result.
            </p>
          </div>
          <nav className={styles.tabs} aria-label="Aura Farming views">
            <div>
              {(
                [
                  ["today", "Today", Sunrise],
                  ["vision", "My vision", Compass],
                  ["lessons", "Life lessons", BookOpen],
                  ["review", "Evidence & review", Layers3],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={view === key ? styles.activeTab : ""}
                  aria-current={view === key ? "page" : undefined}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
            <Link className={styles.earningsLink} href="/admin/x5-execution/ai-earnings" aria-label="AI Earnings">
              <BriefcaseBusiness size={14} />
              <span>AI Earnings</span>
              <ArrowUpRight size={13} />
            </Link>
            <Link href="/admin/x5-execution/saved-work">
              <Archive size={14} />
              <span>Earlier saved work</span>
              <ArrowUpRight size={13} />
            </Link>
          </nav>
          <main id="aura-main" className={styles.main}>
            {loading ? (
              <div className={styles.loading} role="status">
                <span className={styles.lightDot} /> Opening your personal
                system…
              </div>
            ) : loadError ? (
              <div className={styles.errorPanel} role="alert">
                <h2>Your workspace couldn’t be opened.</h2>
                <p>{loadError}</p>
                <p>No saved data has been changed.</p>
                <button className={styles.primary} onClick={() => void load()}>
                  <RotateCcw size={15} /> Retry connection
                </button>
              </div>
            ) : (
              <>
                {conflict ? <ConflictNotice /> : null}
                {error &&
                !conflict &&
                !editor &&
                !selected &&
                !textEditor &&
                !lessonEditor ? (
                  <div className={styles.errorPanel} role="alert">
                    <p>{error}</p>
                    {conflict ? (
                      <button
                        className={styles.secondary}
                        onClick={() => {
                          setUndo(null);
                          void load();
                        }}
                      >
                        Load latest saved version
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {toast ? (
                  <div className={styles.toast} role="status">
                    <CheckCheck size={16} />
                    <span>{toast}</span>
                    {undo ? (
                      <button
                        disabled={busy || conflict}
                        onClick={() =>
                          void persist(undo, "Change undone", false)
                        }
                      >
                        Undo
                      </button>
                    ) : null}
                    <button
                      className={styles.iconButton}
                      aria-label="Dismiss notification"
                      onClick={() => setToast("")}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                {view === "today" ? (
                  <>
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          LESS NOISE. MORE INTENT.
                        </span>
                        <h2>Your next meaningful moves.</h2>
                        <p>
                          Up to three actions, chosen from your priorities. One
                          at a time is enough.
                        </p>
                      </div>
                      <button
                        className={styles.secondary}
                        disabled={busy || conflict}
                        onClick={() => openLesson()}
                      >
                        <Plus size={15} />
                        What happened?
                      </button>
                      <span className={styles.dateLabel}>
                        {today
                          ? new Date(`${today}T12:00:00`).toLocaleDateString(
                              undefined,
                              {
                                weekday: "short",
                                day: "numeric",
                                month: "long",
                              },
                            )
                          : "Today"}
                      </span>
                    </div>
                    <div className={styles.todayGrid}>
                      <section
                        className={styles.focusPanel}
                        aria-label="Today's priority actions"
                      >
                        <div className={styles.panelHeading}>
                          <span>
                            <span className={styles.lightDot} /> TODAY’S FOCUS
                          </span>
                          <small>
                            {focus.reduce(
                              (sum, item) => sum + item.action.minutes,
                              0,
                            )}{" "}
                            MIN PLANNED
                          </small>
                        </div>
                        {focus.length ? (
                          <div className={styles.focusList}>
                            {focus.map(({ goal, action }, index) => {
                              const Icon = AREA_ICONS[goal.area];
                              return (
                                <div
                                  key={action.id}
                                  className={styles.focusItem}
                                >
                                  <button
                                    className={styles.checkbox}
                                    disabled={busy || conflict}
                                    aria-label={`Complete ${action.title}`}
                                    onClick={() =>
                                      void completeAction(goal, action)
                                    }
                                  >
                                    <span>
                                      {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <Check size={17} />
                                  </button>
                                  <div>
                                    <span className={styles.actionArea}>
                                      <Icon size={12} />
                                      {AREA_NAMES[goal.area]}
                                      {action.dueDate &&
                                      action.dueDate < today ? (
                                        <b>Overdue</b>
                                      ) : null}
                                    </span>
                                    <h3>{action.title}</h3>
                                    <button
                                      className={styles.goalLink}
                                      onClick={() => chooseGoal(goal)}
                                    >
                                      {goal.title}
                                      <ChevronRight size={12} />
                                    </button>
                                  </div>
                                  <span className={styles.duration}>
                                    <Clock3 size={13} />
                                    {action.minutes} min
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className={styles.focusEmpty}>
                            <Compass size={28} />
                            <h3>
                              {active.length
                                ? ready.length
                                  ? "Your actions are complete."
                                  : "Room to breathe."
                                : "Start with something that matters."}
                            </h3>
                            <p>
                              {active.length
                                ? ready.length
                                  ? "Now look at the result. Add evidence, then verify the outcome or adjust the plan."
                                  : "Your next actions are scheduled for later. You can review your paths or choose a smaller next step."
                                : "Choose one outcome. Define what success looks like. Break it into a few actions you can actually finish."}
                            </p>
                            <button
                              className={styles.secondary}
                              onClick={() =>
                                active.length ? setView("vision") : openNew()
                              }
                            >
                              {active.length
                                ? "Review my paths"
                                : "Create my first path"}
                              <ArrowRight size={15} />
                            </button>
                          </div>
                        )}
                        <div className={styles.panelFoot}>
                          <CircleHelp size={13} />
                          <span>
                            Overdue actions first, then priority and effort.
                            Your dates remain adjustable.
                          </span>
                        </div>
                      </section>
                      <aside className={styles.northStar}>
                        <div className={styles.northStarTop}>
                          <Compass size={21} />
                          <span className={styles.eyebrow}>
                            YOUR NORTH STAR
                          </span>
                        </div>
                        <h3>
                          {workspace.vision
                            ? "Remember the reason."
                            : "Make the destination personal."}
                        </h3>
                        <p>
                          {workspace.vision ||
                            "Not a longer to-do list. A clearer picture of the life you want to live."}
                        </p>
                        <button
                          className={styles.textButton}
                          disabled={busy || conflict}
                          onClick={() => {
                            setError("");
                            setTextEditor("vision");
                          }}
                        >
                          {workspace.vision
                            ? "Refine my vision"
                            : "Write my vision"}
                          <ArrowUpRight size={15} />
                        </button>
                        <div
                          className={styles.starDecoration}
                          aria-hidden="true"
                        >
                          ✦
                        </div>
                      </aside>
                    </div>
                    {workspace.lessons.some(
                      (item) => item.practice?.adopted,
                    ) ? (
                      <>
                        <div className={styles.sectionHeading}>
                          <div>
                            <span className={styles.eyebrow}>
                              LESSONS INTO PRACTICE
                            </span>
                            <h2>What works, on repeat.</h2>
                          </div>
                          <button
                            className={styles.textButton}
                            onClick={() => setView("lessons")}
                          >
                            All lessons
                            <ArrowRight size={15} />
                          </button>
                        </div>
                        <PracticeCards
                          lessons={workspace.lessons}
                          today={today}
                          busy={busy || conflict}
                          onEdit={openLesson}
                          onChange={(lesson, message) =>
                            void changeLesson(lesson, message)
                          }
                        />
                      </>
                    ) : null}
                    {ready.length ? (
                      <div className={styles.readyBanner}>
                        <ShieldCheck size={20} />
                        <div>
                          <strong>
                            {ready.length}{" "}
                            {ready.length === 1 ? "outcome is" : "outcomes are"}{" "}
                            ready to review
                          </strong>
                          <p>
                            A complete checklist is a good moment to ask: did
                            the result happen?
                          </p>
                        </div>
                        <button
                          className={styles.secondary}
                          onClick={() => chooseGoal(ready[0])}
                        >
                          Review evidence
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    ) : null}
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          THE WHOLE PICTURE
                        </span>
                        <h2>Build across your life.</h2>
                      </div>
                      <button
                        className={styles.textButton}
                        onClick={() => setView("vision")}
                      >
                        All outcomes <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className={styles.areaGrid}>
                      {AURA_AREAS.map((item, index) => {
                        const Icon = AREA_ICONS[item.id];
                        const goals = nonArchived.filter(
                          (g) => g.area === item.id,
                        );
                        return (
                          <button
                            key={item.id}
                            className={styles.areaCard}
                            onClick={() => {
                              setArea(item.id);
                              setView("vision");
                            }}
                          >
                            <span className={styles.areaIndex}>
                              0{index + 1}
                            </span>
                            <Icon size={23} />
                            <h3>{AREA_NAMES[item.id]}</h3>
                            <p>{item.description}</p>
                            <span className={styles.areaCount}>
                              {goals.length
                                ? `${goals.length} ${goals.length === 1 ? "outcome" : "outcomes"}`
                                : "Shape this area"}
                              <ArrowUpRight size={13} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
                {view === "vision" ? (
                  <>
                    <div className={styles.visionBand}>
                      <div>
                        <span className={styles.eyebrow}>
                          THE LIFE I AM BUILDING
                        </span>
                        <h2>
                          {workspace.vision ||
                            "Your direction starts with you."}
                        </h2>
                      </div>
                      <button
                        className={styles.secondary}
                        disabled={busy || conflict}
                        onClick={() => {
                          setError("");
                          setTextEditor("vision");
                        }}
                      >
                        {workspace.vision ? "Edit vision" : "Set my vision"}
                        <Compass size={15} />
                      </button>
                    </div>
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          VISION → OUTCOME → ACTION → EVIDENCE
                        </span>
                        <h2>Give each ambition a path.</h2>
                      </div>
                      <button
                        className={styles.primary}
                        disabled={busy || conflict}
                        onClick={() => openNew(area === "all" ? "life" : area)}
                      >
                        <Plus size={16} />
                        New outcome
                      </button>
                    </div>
                    <div className={styles.filters}>
                      <div className={styles.areaFilters}>
                        <button
                          aria-pressed={area === "all"}
                          className={
                            area === "all" ? styles.selectedFilter : ""
                          }
                          onClick={() => setArea("all")}
                        >
                          All areas
                        </button>
                        {AURA_AREAS.map((item) => (
                          <button
                            key={item.id}
                            aria-pressed={area === item.id}
                            className={
                              area === item.id ? styles.selectedFilter : ""
                            }
                            onClick={() => setArea(item.id)}
                          >
                            {AREA_NAMES[item.id]}
                          </button>
                        ))}
                      </div>
                      <div className={styles.statusFilters}>
                        {(
                          [
                            ["active", "In progress"],
                            ["achieved", "Achieved"],
                            ["archived", "Archived"],
                          ] as const
                        ).map(([key, label]) => (
                          <button
                            key={key}
                            aria-pressed={filter === key}
                            className={
                              filter === key ? styles.activeStatus : ""
                            }
                            onClick={() => setFilter(key)}
                          >
                            {label}
                            <span>
                              {
                                workspace.goals.filter(
                                  (g) =>
                                    g.status === key &&
                                    (area === "all" || g.area === area),
                                ).length
                              }
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {visibleGoals.length ? (
                      <div className={styles.goalGrid}>
                        {visibleGoals
                          .sort((a, b) => a.priority - b.priority)
                          .map((goal) => {
                            const Icon = AREA_ICONS[goal.area];
                            return (
                              <button
                                className={styles.goalCard}
                                key={goal.id}
                                onClick={() => chooseGoal(goal)}
                              >
                                <div className={styles.goalCardTop}>
                                  <span>
                                    <Icon size={15} />
                                    {AREA_NAMES[goal.area]}
                                  </span>
                                  <span className={styles.priority}>
                                    {goal.status === "achieved" ? (
                                      <ShieldCheck size={15} />
                                    ) : goal.priority === 1 ? (
                                      "HIGH PRIORITY"
                                    ) : (
                                      ""
                                    )}
                                  </span>
                                </div>
                                <h3>{goal.title}</h3>
                                <p>{goal.success}</p>
                                <div className={styles.goalProgress}>
                                  <span>
                                    {
                                      goal.actions.filter((a) => a.completedAt)
                                        .length
                                    }{" "}
                                    / {goal.actions.length} actions
                                  </span>
                                  <strong>{progress(goal)}%</strong>
                                </div>
                                <div className={styles.progressTrack}>
                                  <span
                                    style={{ width: `${progress(goal)}%` }}
                                  />
                                </div>
                                <div className={styles.goalCardFoot}>
                                  <span>
                                    {goal.status === "achieved"
                                      ? "Outcome verified"
                                      : progress(goal) === 100
                                        ? "Ready to verify"
                                        : formatDate(goal.targetDate)}
                                  </span>
                                  <ArrowUpRight size={17} />
                                </div>
                              </button>
                            );
                          })}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <Target size={30} />
                        <h3>
                          {filter === "active"
                            ? "A clear path starts here."
                            : filter === "achieved"
                              ? "Let the evidence tell the story."
                              : "Nothing archived here."}
                        </h3>
                        <p>
                          {filter === "active"
                            ? "Define a meaningful result, choose your next actions, and make room for it in real life."
                            : filter === "achieved"
                              ? "Achieved outcomes appear here after you record the result and verify it."
                              : "Archived goals stay recoverable. Restore one whenever it matters again."}
                        </p>
                        {filter === "active" ? (
                          <button
                            className={styles.primary}
                            onClick={() =>
                              openNew(area === "all" ? "life" : area)
                            }
                            disabled={busy || conflict}
                          >
                            <Plus size={15} />
                            Create a path
                          </button>
                        ) : null}
                      </div>
                    )}
                    <div className={styles.templateBanner}>
                      <div>
                        <span className={styles.eyebrow}>
                          A LITTLE DIRECTION
                        </span>
                        <h3>Need a starting point?</h3>
                        <p>
                          Choose an editable example. Nothing is added until you
                          make it yours and save.
                        </p>
                      </div>
                      <button
                        className={styles.secondary}
                        disabled={busy || conflict}
                        onClick={() => setTemplatesOpen(true)}
                      >
                        Explore starting points
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </>
                ) : null}
                {view === "lessons" ? (
                  <>
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          EXPERIENCE → INSIGHT → A BETTER NEXT MOVE
                        </span>
                        <h2>Let real life teach the system.</h2>
                        <p>
                          Capture what happened. Work through it with Bosco.
                          Keep the practices that help.
                        </p>
                      </div>
                      <button
                        className={styles.primary}
                        disabled={busy || conflict}
                        onClick={() => openLesson()}
                      >
                        <Plus size={15} />
                        What happened?
                      </button>
                    </div>
                    {workspace.lessons.some(
                      (item) => item.practice?.adopted,
                    ) ? (
                      <PracticeCards
                        lessons={workspace.lessons}
                        today={today}
                        busy={busy || conflict}
                        onEdit={openLesson}
                        onChange={(lesson, message) =>
                          void changeLesson(lesson, message)
                        }
                      />
                    ) : null}
                    {workspace.lessons.length ? (
                      <div className={styles.lessonList}>
                        {[...workspace.lessons].reverse().map((lesson) => (
                          <article
                            className={styles.lessonCard}
                            key={lesson.id}
                          >
                            <div className={styles.goalCardTop}>
                              <span>{AREA_NAMES[lesson.area]}</span>
                              <time>
                                {new Date(lesson.createdAt).toLocaleDateString(
                                  undefined,
                                  { dateStyle: "medium" },
                                )}
                              </time>
                            </div>
                            <span className={styles.eyebrow}>
                              WHAT HAPPENED
                            </span>
                            <h3>{lesson.situation}</h3>
                            <div className={styles.lessonColumns}>
                              <div>
                                <h4>The lesson</h4>
                                <p>
                                  {lesson.lesson ||
                                    "Still making sense of it. Add the insight when you are ready."}
                                </p>
                              </div>
                              <div>
                                <h4>My next action</h4>
                                <p>
                                  {lesson.nextAction ||
                                    "Choose a useful next step, alone or with Bosco."}
                                </p>
                              </div>
                            </div>
                            <div className={styles.practiceFooter}>
                              <span>
                                {lesson.practice
                                  ? lesson.practice.adopted
                                    ? "Checklist in use"
                                    : "Checklist saved as draft"
                                  : "Captured for reflection"}
                              </span>
                              <button
                                className={styles.textButton}
                                disabled={busy || conflict}
                                onClick={() => openLesson(lesson)}
                              >
                                Edit lesson / checklist
                                <ArrowUpRight size={14} />
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <BookOpen size={30} />
                        <h3>Start with “here’s what happened.”</h3>
                        <p>
                          A conversation, a missed detail, a win, a difficult
                          moment. Capture it in plain language, then decide what
                          to carry forward.
                        </p>
                        <button
                          className={styles.primary}
                          disabled={busy || conflict}
                          onClick={() => openLesson()}
                        >
                          Capture my first lesson
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
                {view === "review" ? (
                  <>
                    <div className={styles.sectionHeading}>
                      <div>
                        <span className={styles.eyebrow}>
                          TRACK → LEARN → ADJUST
                        </span>
                        <h2>Progress you can point to.</h2>
                        <p>
                          Actions tell you what you did. Evidence tells you what
                          changed.
                        </p>
                      </div>
                      <button
                        className={styles.primary}
                        disabled={busy || conflict}
                        onClick={() => {
                          setError("");
                          setTextEditor("review");
                        }}
                      >
                        <BookOpen size={16} />
                        Reflect on my week
                      </button>
                    </div>
                    <div className={styles.reviewGrid}>
                      <section className={styles.reviewPanel}>
                        <div className={styles.panelHeading}>
                          <span>
                            <ShieldCheck size={15} /> VERIFIED OUTCOMES
                          </span>
                          <small>{achieved.length} RECORDED</small>
                        </div>
                        {achieved.length ? (
                          achieved.map((goal) => (
                            <button
                              key={goal.id}
                              className={styles.evidenceCard}
                              onClick={() => chooseGoal(goal)}
                            >
                              <span className={styles.eyebrow}>
                                {AREA_NAMES[goal.area]}
                              </span>
                              <h3>
                                {goal.title}
                                <ArrowUpRight size={16} />
                              </h3>
                              <p>{goal.outcomeEvidence}</p>
                              <small>
                                {goal.achievedAt
                                  ? new Date(
                                      goal.achievedAt,
                                    ).toLocaleDateString(undefined, {
                                      dateStyle: "medium",
                                    })
                                  : "Recorded"}
                              </small>
                            </button>
                          ))
                        ) : (
                          <div className={styles.focusEmpty}>
                            <ShieldCheck size={26} />
                            <h3>Real results belong here.</h3>
                            <p>
                              When an outcome happens, open its path, record
                              evidence, and verify it. No automatic achievement
                              claims.
                            </p>
                          </div>
                        )}
                      </section>
                      <section className={styles.reviewPanel}>
                        <div className={styles.panelHeading}>
                          <span>
                            <BookOpen size={15} /> REFLECTIONS
                          </span>
                          <small>{workspace.reviews.length} SAVED</small>
                        </div>
                        {workspace.reviews.length ? (
                          workspace.reviews.map((review) => (
                            <article
                              key={review.id}
                              className={styles.reviewCard}
                            >
                              <time>
                                {new Date(review.createdAt).toLocaleDateString(
                                  undefined,
                                  { dateStyle: "medium" },
                                )}
                              </time>
                              <h4>What moved forward</h4>
                              <p>{review.win}</p>
                              <h4>What I learned</h4>
                              <p>{review.lesson}</p>
                              <h4>My next adjustment</h4>
                              <p>{review.adjustment}</p>
                            </article>
                          ))
                        ) : (
                          <div className={styles.focusEmpty}>
                            <BookOpen size={26} />
                            <h3>A little reflection. A better next move.</h3>
                            <p>
                              Keep what works, notice what gets in the way, and
                              adjust the plan without judging yourself.
                            </p>
                            <button
                              className={styles.secondary}
                              disabled={busy || conflict}
                              onClick={() => setTextEditor("review")}
                            >
                              Write my first review
                              <ArrowRight size={14} />
                            </button>
                          </div>
                        )}
                      </section>
                    </div>
                    <div className={styles.boscoNote}>
                      <span className={styles.monogram}>B</span>
                      <div>
                        <span className={styles.eyebrow}>
                          BOSCO, THEN THE SYSTEM
                        </span>
                        <h3>Your judgment stays at the center.</h3>
                        <p>
                          Use what you learn with Bosco to refine your vision
                          and actions here. This workspace organizes your
                          decisions and evidence; it does not run an autonomous
                          coach or train an AI.
                        </p>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </main>
          <footer className={styles.footer}>
            <div className={styles.loop}>
              {["Plan", "Execute", "Track", "Improve", "Repeat"].map(
                (step, index) => (
                  <span key={step}>
                    <small>0{index + 1}</small>
                    {step}
                    {index < 4 ? <ArrowRight size={12} /> : null}
                  </span>
                ),
              )}
            </div>
            <div className={styles.footerBottom}>
              <span>QUIET POWER. DELIBERATE PROGRESS.</span>
              <span>
                {busy
                  ? "Saving…"
                  : loading
                    ? "Connecting…"
                    : loadError
                      ? "Connection unavailable"
                      : conflict
                        ? "Newer version available"
                        : `Saved workspace · v${revision}`}
                <i className={styles.lightDot} />
              </span>
            </div>
            <p className={styles.disclaimer}>
              Your worth is not a checklist. Outcomes depend on more than
              effort. Use the system to take action, learn, and adjust.
            </p>
          </footer>
        </div>
        {editor ? (
          <GoalEditor
            key={editor.goal.id}
            initial={editor.goal}
            isNew={editor.isNew}
            busy={busy}
            error={error}
            onClose={() => {
              setEditor(null);
              setError("");
            }}
            onSave={async (goal) => {
              const latest = last.current.workspace.goals.find(
                (item) => item.id === goal.id,
              );
              const merged = latest
                ? mergeAuraDraft(editor.goal, goal, latest)
                : { value: goal, conflicts: [] };
              if (
                merged.conflicts.length &&
                !window.confirm(
                  `Newer changes overlap this draft in: ${merged.conflicts.join(", ")}. Replace those fields with your draft? Other newer changes will be kept.`,
                )
              )
                return;
              const savedGoal = merged.value;
              const goals = latest
                ? last.current.workspace.goals.map((g) =>
                    g.id === goal.id ? savedGoal : g,
                  )
                : [...last.current.workspace.goals, savedGoal];
              if (
                await persist(
                  { ...last.current.workspace, goals },
                  editor.isNew
                    ? "Your path is ready. Take the first small step."
                    : "Path updated",
                )
              ) {
                setEditor(null);
                setView("vision");
                setFilter(goal.status);
                setArea("all");
              }
            }}
          />
        ) : null}
        {selected && !editor ? (
          <GoalDetail
            key={selected.id}
            goal={selected}
            onClose={() => {
              setSelectedId(null);
              setError("");
            }}
            onEdit={() => {
              setEditor({ goal: selected, isNew: false });
              setSelectedId(null);
            }}
            onChange={changeGoal}
            busy={busy}
            error={error}
          />
        ) : null}
        {textEditor ? (
          <TextEditor
            kind={textEditor}
            initial={textEditor === "vision" ? workspace.vision : ""}
            onClose={() => {
              setTextEditor(null);
              setError("");
            }}
            onSave={addReview}
            busy={busy}
            error={error}
          />
        ) : null}
        {lessonEditor ? (
          <LessonEditor
            initial={lessonEditor}
            onClose={() => {
              setLessonEditor(null);
              setError("");
            }}
            busy={busy}
            error={error}
            onSave={async (lesson) => {
              const latest = last.current.workspace.lessons.find(
                (item) => item.id === lesson.id,
              );
              const merged = latest
                ? mergeAuraDraft(lessonEditor, lesson, latest)
                : { value: lesson, conflicts: [] };
              if (
                merged.conflicts.length &&
                !window.confirm(
                  `Newer changes overlap this draft in: ${merged.conflicts.join(", ")}. Replace those fields with your draft? Other newer changes will be kept.`,
                )
              )
                return;
              const lessons = latest
                ? last.current.workspace.lessons.map((item) =>
                    item.id === lesson.id ? merged.value : item,
                  )
                : [...last.current.workspace.lessons, merged.value];
              if (
                await persist(
                  { ...last.current.workspace, lessons },
                  "Lesson saved. Your next move is clearer.",
                )
              ) {
                setLessonEditor(null);
                setView("lessons");
              }
            }}
          />
        ) : null}
        {templatesOpen ? (
          <Modal
            title="A starting point. Make it yours."
            kicker="EDITABLE EXAMPLES"
            onClose={() => setTemplatesOpen(false)}
          >
            <div className={styles.templateList}>
              {AURA_AREAS.map((item) => {
                const Icon = AREA_ICONS[item.id];
                return (
                  <button key={item.id} onClick={() => openNew(item.id, true)}>
                    <Icon size={22} />
                    <div>
                      <span>{AREA_NAMES[item.id]}</span>
                      <strong>{TEMPLATES[item.id].title}</strong>
                    </div>
                    <ArrowRight size={17} />
                  </button>
                );
              })}
              <p>
                These examples are prompts to edit, not personal targets or
                promised results.
              </p>
            </div>
          </Modal>
        ) : null}
      </div>
    </RecoveryContext.Provider>
  );
}
