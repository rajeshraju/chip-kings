export type Person = {
  name: string;
  earnings: number;
  expenses: number;
  chipsTaken?: number;
};

export type Transaction = {
  from: string;
  to: string;
  amount: number;
};

export type CalculationResult = {
  totalNet: number;
  transactions: Transaction[];
  potBalance: number;
  potExpenses: number;
  potEarnings: number;
  hasPot: boolean;
  playerCount: number;
  people: Person[];
};

export type Report = {
  id: string;
  title: string;
  createdAt: string;
  createdBy: string;
  snapshot: CalculationResult;
  // Set when the report has been folded into a reconciliation. Archived
  // reports are hidden from the active games list but remain in storage so
  // undo can restore them and YTD/history views can still see them.
  archived?: boolean;
  archivedAt?: string;
};

export type Player = {
  id: string;
  name: string;
  createdAt: string;
};

// Pot ledger: per-player running balance with the POT.
//   amount > 0  → POT owes the player (player gets this from the pot)
//   amount < 0  → player owes the POT
export type PotLedgerEntry = {
  name: string;
  amount: number;
  updatedAt: string;
};

export type Reconciliation = {
  id: string;
  title: string;
  createdAt: string;
  createdBy: string;
  reportIds: string[];
  reportTitles: string[];
  sourceReports?: Report[];
  snapshot: CalculationResult;
  // Payment status indexed by transaction position in snapshot.transactions.
  // true = paid/settled. Missing or false = outstanding.
  payments?: boolean[];
  // Once marked complete, the reconciliation is view-only: no settlement
  // edits, no undo, no payment-status toggles.
  completed?: boolean;
  completedAt?: string;
  completedBy?: string;
  // True once every settlement has been marked paid AND each player's
  // snapshot W/L has been applied to the pot ledger. Cleared if any
  // settlement is later unchecked, so the W/L deltas are reversed.
  potApplied?: boolean;
};

// --- Auth / users ---

export type Role = "admin" | "editor" | "viewer";

export const ROLES: Role[] = ["admin", "editor", "viewer"];

export type User = {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  createdAt: string;
};

export type PublicUser = Omit<User, "passwordHash">;

export type SessionUser = {
  userId: string;
  username: string;
  role: Role;
};

export const ROLE_PERMISSIONS: Record<Role, { canRead: boolean; canWrite: boolean; canAdmin: boolean }> = {
  admin: { canRead: true, canWrite: true, canAdmin: true },
  editor: { canRead: true, canWrite: true, canAdmin: false },
  viewer: { canRead: true, canWrite: false, canAdmin: false },
};
