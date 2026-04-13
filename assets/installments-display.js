import { ThemeEvents } from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

export function computeInstallments(priceCents, maxInstallments, minCentsPerPayment) {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  if (!Number.isFinite(maxInstallments) || maxInstallments < 2) return null;
  if (!Number.isFinite(minCentsPerPayment) || minCentsPerPayment <= 0) return null;

  let nByMin = Math.floor(priceCents / minCentsPerPayment);
  if (nByMin < 1) nByMin = 1;
  let n = Math.min(maxInstallments, nByMin);
  if (n < 2) return null;

  const perCents = Math.ceil(priceCents / n);
  return { n, perCents };
}

class InstallmentsDisplayDynamic extends HTMLElement {
  #abort;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    document.addEventListener(ThemeEvents.cartUpdate, this.#sync, { signal });
    document.addEventListener(ThemeEvents.discountUpdate, this.#sync, { signal });
    this.#paint();
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#abort = undefined;
  }

  #sync = (event) => {
    const cart = event.detail?.resource;
    if (!cart || typeof cart.total_price !== 'number') return;
    this.dataset.priceCents = String(cart.total_price);
    this.#paint();
  };

  #paint() {
    const priceCents = Number(this.dataset.priceCents);
    const maxP = Number(this.dataset.maxInstallments);
    const minCents = Number(this.dataset.minCentsPerPayment);
    const result = computeInstallments(priceCents, maxP, minCents);
    const p = this.querySelector('.installments-display__text');

    if (!p) return;

    if (!result) {
      this.hidden = true;
      p.textContent = '';
      return;
    }

    this.hidden = false;
    const format = this.dataset.moneyFormat ?? '{{amount}}';
    const currency = this.dataset.currency ?? 'USD';
    const formatted = formatMoney(result.perCents, format, currency);
    const tpl = this.dataset.templateJs ?? '';
    p.textContent = tpl.replace('[count]', String(result.n)).replace('[amount]', formatted);
  }
}

if (!customElements.get('installments-display-dynamic')) {
  customElements.define('installments-display-dynamic', InstallmentsDisplayDynamic);
}
