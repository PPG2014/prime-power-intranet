export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
export const isRequired = (v) => String(v ?? '').trim().length > 0;
export const maxLength = (v, n) => String(v ?? '').length <= n;
