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
};

export type Player = {
  id: string;
  name: string;
  createdAt: string;
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
