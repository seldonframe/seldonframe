const allowedStatementPatterns = [/^create\s+table\b/i, /^alter\s+table\b[\s\S]*\badd\s+column\b/i, /^create\s+index\b/i, /^create\s+type\b/i];

const blockedStatementPatterns = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+column\b/i,
  /\balter\s+column\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\bdrop\s+index\b/i,
];

function normalizeStatements(sql: string) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function removeSqlComments(sql: string) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/g, ""))
    .join("\n");
}

function normalizeIdentifier(identifier: string) {
  return identifier
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/"\."/g, ".")
    .toLowerCase();
}

function collectCreatedTables(statements: string[]) {
  const created = new Set<string>();

  for (const statement of statements) {
    const match = statement.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?(["a-zA-Z0-9_.]+)/i);
    if (!match?.[1]) {
      continue;
    }

    const normalized = normalizeIdentifier(match[1]);
    created.add(normalized);

    const parts = normalized.split(".");
    const bare = parts[parts.length - 1];
    if (bare) {
      created.add(bare);
    }
  }

  return created;
}

function isSafeUpdateStatement(statement: string, createdTables: Set<string>) {
  const match = statement.match(/^update\s+(["a-zA-Z0-9_.]+)/i);
  if (!match?.[1]) {
    return false;
  }

  const normalized = normalizeIdentifier(match[1]);
  if (createdTables.has(normalized)) {
    return true;
  }

  const parts = normalized.split(".");
  const bare = parts[parts.length - 1];
  return Boolean(bare && createdTables.has(bare));
}

export function validateMigrationSQL(sql: string): boolean {
  const sanitized = removeSqlComments(sql).trim();

  if (!sanitized) {
    return true;
  }

  const statements = normalizeStatements(sanitized);
  const createdTables = collectCreatedTables(statements);

  return statements.every((statement) => {
    if (blockedStatementPatterns.some((pattern) => pattern.test(statement))) {
      return false;
    }

    if (/^update\s+/i.test(statement)) {
      return isSafeUpdateStatement(statement, createdTables);
    }

    return allowedStatementPatterns.some((pattern) => pattern.test(statement));
  });
}
