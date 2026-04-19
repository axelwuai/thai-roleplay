import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type {
  AuthSessionUser,
  AuthUser,
  ChatMessage,
  ScenarioSession,
  ScenarioSessionSummary,
} from "@/lib/types";

const dataDirectory = path.join(process.cwd(), "data");
const databasePath = path.join(dataDirectory, "practice.sqlite");
const AUTH_SESSION_TTL_DAYS = 30;

type PracticeOwner = {
  type: "client" | "user";
  id: string;
};

export type RenamePracticeSessionResult =
  | {
      status: "success";
      session: ScenarioSession;
    }
  | {
      status: "not_found" | "conflict";
    };

type PracticeSessionRow = {
  scenario: string;
  show_thai_script: number;
  messages_json: string;
  message_count: number;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
};

type AuthSessionRow = {
  user_id: string;
  email: string;
  created_at: string;
  expires_at: string;
};

let database: DatabaseSync | null = null;

export function getDatabase() {
  if (database) {
    return database;
  }

  fs.mkdirSync(dataDirectory, { recursive: true });

  database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT NOT NULL,
      scenario TEXT NOT NULL,
      show_thai_script INTEGER NOT NULL DEFAULT 1,
      messages_json TEXT NOT NULL DEFAULT '[]',
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(client_id, scenario)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS practice_session_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      scenario TEXT NOT NULL,
      show_thai_script INTEGER NOT NULL DEFAULT 1,
      messages_json TEXT NOT NULL DEFAULT '[]',
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(owner_type, owner_id, scenario)
    );

    CREATE INDEX IF NOT EXISTS idx_practice_session_records_owner_updated
      ON practice_session_records (owner_type, owner_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash
      ON auth_sessions (token_hash);
  `);

  migrateLegacyPracticeSessions(database);

  return database;
}

function migrateLegacyPracticeSessions(databaseConnection: DatabaseSync) {
  databaseConnection.exec(`
    INSERT OR IGNORE INTO practice_session_records (
      owner_type,
      owner_id,
      scenario,
      show_thai_script,
      messages_json,
      message_count,
      created_at,
      updated_at
    )
    SELECT
      'client',
      client_id,
      scenario,
      show_thai_script,
      messages_json,
      message_count,
      created_at,
      updated_at
    FROM practice_sessions;
  `);
}

function normalizeChatMessage(rawMessage: unknown): ChatMessage | null {
  if (!rawMessage || typeof rawMessage !== "object") {
    return null;
  }

  const candidate = rawMessage as Partial<ChatMessage>;

  if (
    typeof candidate.id !== "string" ||
    (candidate.role !== "user" && candidate.role !== "assistant") ||
    typeof candidate.content !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    role: candidate.role,
    content: candidate.content,
    createdAt: candidate.createdAt,
    structuredContent: candidate.structuredContent,
    learnerTranslation: candidate.learnerTranslation,
  };
}

function normalizeMessages(messagesJson: string) {
  try {
    const parsed = JSON.parse(messagesJson) as unknown[];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((message) => normalizeChatMessage(message))
      .filter((message): message is ChatMessage => Boolean(message));
  } catch {
    return [];
  }
}

function mapRowToScenarioSession(row: PracticeSessionRow): ScenarioSession {
  return {
    scenario: row.scenario,
    messages: normalizeMessages(row.messages_json),
    showThaiScript: Boolean(row.show_thai_script),
    updatedAt: row.updated_at,
  };
}

function normalizeUpdatedAt(updatedAt: string) {
  const timestamp = new Date(updatedAt).getTime();

  if (Number.isNaN(timestamp)) {
    return new Date().toISOString();
  }

  return new Date(timestamp).toISOString();
}

function createPasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");

  return `${salt}:${hash}`;
}

function verifyPasswordHash(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expectedHash, "hex");

  if (actualHash.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(actualHash, expectedBuffer);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createAuthSessionToken() {
  return randomBytes(32).toString("hex");
}

function cleanupExpiredAuthSessions(databaseConnection: DatabaseSync) {
  databaseConnection
    .prepare(`DELETE FROM auth_sessions WHERE expires_at <= ?`)
    .run(new Date().toISOString());
}

function findPracticeSessionRow(owner: PracticeOwner, scenario: string) {
  const databaseConnection = getDatabase();

  return databaseConnection
    .prepare(
      `
        SELECT scenario, show_thai_script, messages_json, message_count, updated_at
        FROM practice_session_records
        WHERE owner_type = ? AND owner_id = ? AND scenario = ?
      `,
    )
    .get(owner.type, owner.id, scenario) as PracticeSessionRow | undefined;
}

export function listPracticeSessionSummaries(owner: PracticeOwner): ScenarioSessionSummary[] {
  const databaseConnection = getDatabase();
  const rows = databaseConnection
    .prepare(
      `
        SELECT scenario, message_count, updated_at
        FROM practice_session_records
        WHERE owner_type = ? AND owner_id = ?
        ORDER BY updated_at DESC
      `,
    )
    .all(owner.type, owner.id) as Array<{
    scenario: string;
    message_count: number;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    scenario: row.scenario,
    messageCount: row.message_count,
    updatedAt: row.updated_at,
  }));
}

export function getPracticeSession(owner: PracticeOwner, scenario: string) {
  const row = findPracticeSessionRow(owner, scenario);

  if (!row) {
    return null;
  }

  return mapRowToScenarioSession(row);
}

export function upsertPracticeSession(owner: PracticeOwner, session: ScenarioSession) {
  const databaseConnection = getDatabase();
  const normalizedSession: ScenarioSession = {
    scenario: session.scenario.trim(),
    messages: session.messages,
    showThaiScript: session.showThaiScript,
    updatedAt: normalizeUpdatedAt(session.updatedAt),
  };
  const now = new Date().toISOString();

  databaseConnection
    .prepare(
      `
        INSERT INTO practice_session_records (
          owner_type,
          owner_id,
          scenario,
          show_thai_script,
          messages_json,
          message_count,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_type, owner_id, scenario) DO UPDATE SET
          show_thai_script = excluded.show_thai_script,
          messages_json = excluded.messages_json,
          message_count = excluded.message_count,
          updated_at = excluded.updated_at
      `,
    )
    .run(
      owner.type,
      owner.id,
      normalizedSession.scenario,
      normalizedSession.showThaiScript ? 1 : 0,
      JSON.stringify(normalizedSession.messages),
      normalizedSession.messages.length,
      now,
      normalizedSession.updatedAt,
    );

  return normalizedSession;
}

export function renamePracticeSession(
  owner: PracticeOwner,
  fromScenario: string,
  toScenario: string,
): RenamePracticeSessionResult {
  const databaseConnection = getDatabase();
  const normalizedFromScenario = fromScenario.trim();
  const normalizedToScenario = toScenario.trim();

  const sourceRow = findPracticeSessionRow(owner, normalizedFromScenario);

  if (!sourceRow) {
    return { status: "not_found" };
  }

  if (normalizedFromScenario === normalizedToScenario) {
    return {
      status: "success",
      session: mapRowToScenarioSession(sourceRow),
    };
  }

  if (findPracticeSessionRow(owner, normalizedToScenario)) {
    return { status: "conflict" };
  }

  const updatedAt = new Date().toISOString();

  databaseConnection
    .prepare(
      `
        UPDATE practice_session_records
        SET scenario = ?, updated_at = ?
        WHERE owner_type = ? AND owner_id = ? AND scenario = ?
      `,
    )
    .run(normalizedToScenario, updatedAt, owner.type, owner.id, normalizedFromScenario);

  return {
    status: "success",
    session: mapRowToScenarioSession({
      ...sourceRow,
      scenario: normalizedToScenario,
      updated_at: updatedAt,
    }),
  };
}

export function deletePracticeSession(owner: PracticeOwner, scenario: string) {
  const databaseConnection = getDatabase();
  const result = databaseConnection
    .prepare(
      `
        DELETE FROM practice_session_records
        WHERE owner_type = ? AND owner_id = ? AND scenario = ?
      `,
    )
    .run(owner.type, owner.id, scenario.trim()) as { changes?: number };

  return Number(result.changes ?? 0) > 0;
}

function mergePracticeSessions(targetOwner: PracticeOwner, sourceOwner: PracticeOwner) {
  const databaseConnection = getDatabase();
  const sourceRows = databaseConnection
    .prepare(
      `
        SELECT scenario, show_thai_script, messages_json, message_count, updated_at
        FROM practice_session_records
        WHERE owner_type = ? AND owner_id = ?
        ORDER BY updated_at DESC
      `,
    )
    .all(sourceOwner.type, sourceOwner.id) as PracticeSessionRow[];

  for (const row of sourceRows) {
    const sourceSession = mapRowToScenarioSession(row);
    const existingTarget = getPracticeSession(targetOwner, sourceSession.scenario);

    if (!existingTarget) {
      upsertPracticeSession(targetOwner, sourceSession);
      continue;
    }

    const sourceTime = new Date(sourceSession.updatedAt).getTime();
    const targetTime = new Date(existingTarget.updatedAt).getTime();

    if (sourceTime > targetTime) {
      upsertPracticeSession(targetOwner, sourceSession);
    }
  }
}

export function findUserByEmail(email: string): AuthUser | null {
  const databaseConnection = getDatabase();
  const row = databaseConnection
    .prepare(
      `
        SELECT id, email, password_hash, created_at
        FROM users
        WHERE email = ?
      `,
    )
    .get(email.trim().toLowerCase()) as UserRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
  };
}

export function registerUser(email: string, password: string): AuthUser {
  const databaseConnection = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const userId = randomBytes(16).toString("hex");
  const now = new Date().toISOString();

  databaseConnection
    .prepare(
      `
        INSERT INTO users (id, email, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(userId, normalizedEmail, createPasswordHash(password), now, now);

  return {
    id: userId,
    email: normalizedEmail,
    createdAt: now,
  };
}

export function authenticateUser(email: string, password: string): AuthUser | null {
  const databaseConnection = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const row = databaseConnection
    .prepare(
      `
        SELECT id, email, password_hash, created_at
        FROM users
        WHERE email = ?
      `,
    )
    .get(normalizedEmail) as UserRow | undefined;

  if (!row) {
    return null;
  }

  if (!verifyPasswordHash(password, row.password_hash)) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    createdAt: row.created_at,
  };
}

export function createAuthSession(userId: string) {
  const databaseConnection = getDatabase();
  const token = createAuthSessionToken();
  const sessionId = randomBytes(16).toString("hex");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  databaseConnection
    .prepare(
      `
        INSERT INTO auth_sessions (id, user_id, token_hash, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(sessionId, userId, hashSessionToken(token), createdAt, expiresAt);

  return {
    token,
    expiresAt,
  };
}

export function getUserFromSessionToken(token: string): AuthSessionUser | null {
  const databaseConnection = getDatabase();
  cleanupExpiredAuthSessions(databaseConnection);

  const row = databaseConnection
    .prepare(
      `
        SELECT users.id as user_id, users.email as email, users.created_at as created_at, auth_sessions.expires_at as expires_at
        FROM auth_sessions
        INNER JOIN users ON users.id = auth_sessions.user_id
        WHERE auth_sessions.token_hash = ?
      `,
    )
    .get(hashSessionToken(token)) as AuthSessionRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.user_id,
    email: row.email,
    createdAt: row.created_at,
    sessionExpiresAt: row.expires_at,
  };
}

export function revokeAuthSession(token: string) {
  const databaseConnection = getDatabase();

  databaseConnection
    .prepare(`DELETE FROM auth_sessions WHERE token_hash = ?`)
    .run(hashSessionToken(token));
}

export function attachClientSessionsToUser(clientId: string, userId: string) {
  if (!clientId.trim()) {
    return;
  }

  mergePracticeSessions(
    { type: "user", id: userId },
    { type: "client", id: clientId.trim() },
  );
}
