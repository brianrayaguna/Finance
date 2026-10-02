/* Navigasi fokus antar-field dengan tombol Enter. Elemen field ditandai dengan atribut data-field. */

function fields(scope: ParentNode): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-field]')).filter((el) => {
    if ((el as HTMLInputElement).disabled) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function focusNext(from: HTMLElement, dir: 1 | -1 = 1): boolean {
  const scope = from.closest('[data-form]') ?? from.closest('form') ?? document;
  const list = fields(scope);
  const idx = list.findIndex((el) => el === from || el.contains(from));
  const next = list[idx + dir];
  if (next) {
    next.focus();
    if (next instanceof HTMLInputElement && next.type !== 'checkbox') {
      requestAnimationFrame(() => next.select?.());
    }
    return true;
  }
  return false;
}

export function focusFirst(scope: ParentNode | null | undefined) {
  if (!scope) return;
  const list = fields(scope);
  list[0]?.focus();
}
