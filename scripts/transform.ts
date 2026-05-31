export const calMonth = (fm: number) => ((fm - 1) % 12) + 1;

export const fyOfFMonth = (fm: number): 2022 | 2023 => (fm <= 12 ? 2022 : 2023);

export const cleanStr = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

export const canonicalize = (name: string) =>
  cleanStr(name)
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\b(INC|LLC|CORP|CO|LTD|PLLC|PA)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-')
    .toLowerCase();
