// src/features/space-studio/engine/promptDeduplication.ts
// MANWAH Space Studio｜提示词安全去重引擎 (Prompt Deduplication Engine) V1.0
// 职责：
// 1. 负向提示词精确 Set 去重：按逗号切分各负向词组，消除字面级重复（如重复的 text, watermark, people 等），
//    保留首次出现的排位与高优先级顺序，大幅精简无谓 Token 消耗；
// 2. 正向提示词数组级短语去重：针对数组级语义短语，仅剔除 100% 相同字面的重复片段，绝不破坏长文句意、标点与头部强令。

/**
 * 负向提示词词组去重器 (Comma-Delimited Negative Token Deduplicator)
 * 接收多个输入字符串（可以是逗号拼接的整段，也可以是短语片段），
 * 按逗号安全切分、去除空白、对大小写不敏感去重，并保持首次出现的相对顺序。
 */
export function deduplicateNegativeConstraints(...clauses: Array<string | undefined | null | false>): string {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const clause of clauses) {
    if (!clause || typeof clause !== 'string') continue;
    const parts = clause.split(',');
    for (const raw of parts) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const normalized = trimmed.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        tokens.push(trimmed);
      }
    }
  }

  return tokens.join(', ');
}

/**
 * 正向提示词数组级短语去重器 (Positive Clause Array Deduplicator)
 * 仅用于组合多个独立片段时，剔除首尾去空白后完全一致的重复语义块。
 */
export function deduplicatePositiveClauses(...clauses: Array<string | undefined | null | false>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const clause of clauses) {
    if (!clause || typeof clause !== 'string') continue;
    const trimmed = clause.trim();
    if (!trimmed) continue;
    const normalized = trimmed.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(trimmed);
    }
  }

  return result;
}
