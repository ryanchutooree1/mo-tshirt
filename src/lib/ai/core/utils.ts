const WORD_RE = /[a-z0-9+]+/gi;

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeText(value: string) {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s/+.-]/g, " ")
  );
}

export function titleCase(value: string) {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/\b([a-z])/g, (_, letter: string) => letter.toUpperCase())
  );
}

export function tokenize(value: string) {
  return Array.from(normalizeText(value).matchAll(WORD_RE)).map((match) => match[0]);
}

export function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function incrementCounter(counter: Record<string, number>, key: string, amount = 1) {
  counter[key] = (counter[key] || 0) + amount;
}

export function toProbabilityMap(values: Record<string, number>) {
  const total = Object.values(values).reduce((sumValue, value) => sumValue + value, 0);
  if (!total) return values;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total]));
}

export function cosineSimilarity(left: Record<string, number>, right: Record<string, number>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (!leftKeys.length || !rightKeys.length) return 0;

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  leftKeys.forEach((key) => {
    const value = left[key] || 0;
    leftMagnitude += value * value;
    dot += value * (right[key] || 0);
  });

  rightKeys.forEach((key) => {
    const value = right[key] || 0;
    rightMagnitude += value * value;
  });

  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () => Array<number>(right.length + 1).fill(0));
  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let col = 0; col <= right.length; col += 1) matrix[0][col] = col;

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

export function fuzzySimilarity(left: string, right: string) {
  const cleanLeft = normalizeText(left);
  const cleanRight = normalizeText(right);
  if (!cleanLeft || !cleanRight) return 0;
  if (cleanLeft === cleanRight) return 1;
  const distance = levenshteinDistance(cleanLeft, cleanRight);
  return clamp(1 - distance / Math.max(cleanLeft.length, cleanRight.length, 1));
}

export function termFrequency(tokens: string[]) {
  const counts: Record<string, number> = {};
  tokens.forEach((token) => incrementCounter(counts, token));
  return counts;
}

export function tfidfVector(tokens: string[], idf: Record<string, number>) {
  const tf = termFrequency(tokens);
  const maxTf = Math.max(...Object.values(tf), 1);
  return Object.fromEntries(
    Object.entries(tf).map(([token, count]) => [token, (0.5 + 0.5 * (count / maxTf)) * (idf[token] || 0)])
  );
}

export function softmax(logits: Record<string, number>) {
  const values = Object.values(logits);
  const maxValue = Math.max(...values, 0);
  const exps = Object.fromEntries(
    Object.entries(logits).map(([key, value]) => [key, Math.exp(value - maxValue)])
  );
  const total = Object.values(exps).reduce((sumValue, value) => sumValue + value, 0);
  return Object.fromEntries(Object.entries(exps).map(([key, value]) => [key, value / (total || 1)]));
}

export function stableSort<T>(values: T[], compare: (left: T, right: T) => number) {
  return values
    .map((value, index) => ({ value, index }))
    .sort((left, right) => compare(left.value, right.value) || left.index - right.index)
    .map((item) => item.value);
}

export function charNgrams(value: string, size = 3) {
  const source = ` ${normalizeText(value)} `.replace(/\s+/g, " ");
  const grams: string[] = [];
  for (let index = 0; index <= source.length - size; index += 1) {
    grams.push(source.slice(index, index + size));
  }
  return grams;
}

export function hybridTokens(value: string) {
  return [...tokenize(value), ...charNgrams(value)];
}
