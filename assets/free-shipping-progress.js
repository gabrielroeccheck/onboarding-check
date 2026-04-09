import { ThemeEvents } from '@theme/events';
import { formatMoney } from '@theme/money-formatting';

/**
 * Sincroniza todas as barras com um objeto carrinho (ex.: resposta de `cart.js` ou evento do tema).
 * Use quando um fluxo Ajax customizado não disparar `cart:update` / `discount:update`.
 *
 * @param {{ items_subtotal_price?: number; items?: unknown[] }} cart
 */
export function syncFreeShippingProgressFromCart(cart) {
  if (typeof cart?.items_subtotal_price !== 'number') return;
  for (const el of document.querySelectorAll('free-shipping-progress')) {
    if (el instanceof FreeShippingProgress) {
      el.updateFromCartPayload(cart);
    }
  }
}

/**
 * Barra de frete grátis: escuta eventos globais do Horizon e atualiza texto, % e ARIA.
 * Idempotente — `connectedCallback` / `disconnectedCallback` com AbortController.
 */
class FreeShippingProgress extends HTMLElement {
  /** @type {AbortController | undefined} */
  #abort;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    document.addEventListener(ThemeEvents.cartUpdate, this.#onCartEvent, { signal });
    document.addEventListener(ThemeEvents.discountUpdate, this.#onCartEvent, { signal });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#abort = undefined;
  }

  /**
   * @param {{ items_subtotal_price?: number; items?: unknown[] }} cart
   */
  updateFromCartPayload(cart) {
    if (typeof cart?.items_subtotal_price !== 'number') return;
    const threshold = Number(this.dataset.thresholdCents);
    if (!Number.isFinite(threshold) || threshold <= 0) return;

    if (!cart.items?.length) {
      this.hidden = true;
      return;
    }
    this.hidden = false;

    this.#paint(cart.items_subtotal_price, threshold);
  }

  /**
   * @param {Event} event
   */
  #onCartEvent = (event) => {
    const e = /** @type {CustomEvent<{ resource?: { items_subtotal_price?: number; items?: unknown[] } }>} */ (
      event
    );
    const cart = e.detail?.resource;
    if (!cart) return;
    this.updateFromCartPayload(cart);
  };

  /**
   * @param {number} subtotalCents
   * @param {number} threshold
   */
  #paint(subtotalCents, threshold) {
    const qualified = subtotalCents >= threshold;
    let pct = Math.round((subtotalCents / threshold) * 10000) / 100;
    if (pct > 100) pct = 100;
    if (pct < 0) pct = 0;

    const format = this.dataset.moneyFormat ?? '{{amount}}';
    const currency = this.dataset.currency ?? 'USD';
    const remaining = Math.max(0, threshold - subtotalCents);

    const templateRemaining = this.dataset.templateRemaining ?? '';
    const templateQualified = this.dataset.templateQualified ?? '';

    const messageEl = this.querySelector('.free-shipping-progress__message');
    const track = this.querySelector('.free-shipping-progress__track');
    const fill = this.querySelector('.free-shipping-progress__fill');

    if (messageEl instanceof HTMLElement) {
      if (qualified) {
        messageEl.textContent = templateQualified;
      } else {
        const formatted = formatMoney(remaining, format, currency);
        messageEl.textContent = templateRemaining.replace('__REPLACE__', formatted);
      }
    }

    if (track instanceof HTMLElement) {
      track.setAttribute('aria-valuenow', String(Math.round(pct)));
      track.setAttribute('aria-valuetext', `${Math.round(pct)}%`);
    }

    if (fill instanceof HTMLElement) {
      fill.style.setProperty('--free-shipping-pct', `${pct}%`);
    }
  }
}

if (!customElements.get('free-shipping-progress')) {
  customElements.define('free-shipping-progress', FreeShippingProgress);
}
