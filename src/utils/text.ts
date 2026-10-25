export function foldText(input: string): string {
  return input.normalize('NFKC').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '');
}

export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

export function previewText(input: string, limit = 280): string {
  const collapsed = collapseWhitespace(input);
  if (collapsed.length <= limit) {
    return collapsed;
  }
  return `${collapsed.slice(0, limit - 1)}…`;
}

export function matchesKeyword(text: string, keyword: string): boolean {
  const foldedText = foldText(text);
  const foldedKeyword = foldText(keyword).trim();
  if (!foldedKeyword) {
    return false;
  }
  if (/\s/u.test(foldedKeyword)) {
    return foldedText.includes(foldedKeyword);
  }
  const escaped = foldedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u');
  return expression.test(foldedText);
}

export function namesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  return foldText(left) === foldText(right);
}

export function nameContains(haystack: string | null | undefined, needle: string): boolean {
  if (!haystack) {
    return false;
  }
  return matchesKeyword(haystack, needle);
}
