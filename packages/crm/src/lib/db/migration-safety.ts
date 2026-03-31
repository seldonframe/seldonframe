const allowedStatementPatterns = [/^create\s+table\b/i, /^alter\s+table\b[\s\S]*\badd\s+column\b/i, /^create\s+index\b/i, /^create\s+type\b/i];

const blockedStatementPatterns = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+column\b/i,
  /\balter\s+column\b/i,
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\bdrop\s+index\b/i,
  /\bupdate\s+\w+\b/i,
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

export function validateMigrationSQL(sql: string): boolean {
  const sanitized = removeSqlComments(sql).trim();

  if (!sanitized) {
    return true;
  }

  const statements = normalizeStatements(sanitized);

  return statements.every((statement) => {
    if (blockedStatementPatterns.some((pattern) => pattern.test(statement))) {
      return false;
    }

    return allowedStatementPatterns.some((pattern) => pattern.test(statement));
  });
}
