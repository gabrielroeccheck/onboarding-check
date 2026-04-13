/**
 * Atualiza o texto "% OFF" nos cards quando o swatch troca a variante.
 * Mantém a estrutura visual (número / % / OFF) alinhada ao Liquid.
 */
const VARIANT_UPDATE = 'variant:update';

/**
 * @param {number | string | null | undefined} compareAt
 * @param {number | string | null | undefined} price
 * @returns {number | null}
 */
function percentOff(compareAt, price) {
  const cap = Number(compareAt);
  const pr = Number(price);
  if (!Number.isFinite(cap) || !Number.isFinite(pr) || cap <= 0 || cap <= pr) return null;
  const pct = Math.round(((cap - pr) * 100) / cap);
  return pct > 0 ? pct : null;
}

class ProductDiscountBadge extends HTMLElement {
  /** @type {AbortController | undefined} */
  #abort;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const card = this.closest('product-card');
    if (card) {
      card.addEventListener(VARIANT_UPDATE, this.#onVariantUpdate, { capture: true, signal });
    }
  }

  disconnectedCallback() {
    this.#abort?.abort();
  }

  /**
   * @param {number} pct
   * @param {string} srTemplate
   */
  #showPercentMode(pct, srTemplate) {
    const sr = this.querySelector('[data-product-discount-sr]');
    const valueEl = this.querySelector('[data-product-discount-value]');
    const visual = this.querySelector('.product-discount-badge__visual');
    const fallback = this.querySelector('[data-product-discount-fallback]');

    const s = String(pct);
    if (valueEl) valueEl.textContent = s;
    if (sr) sr.textContent = srTemplate.replace('__NUM__', s);
    visual?.removeAttribute('hidden');
    fallback?.setAttribute('hidden', '');
    if (fallback) fallback.textContent = '';
  }

  /**
   * @param {string} label
   */
  #showSaleFallbackMode(label) {
    const sr = this.querySelector('[data-product-discount-sr]');
    const visual = this.querySelector('.product-discount-badge__visual');
    const fallback = this.querySelector('[data-product-discount-fallback]');

    if (sr) sr.textContent = label;
    visual?.setAttribute('hidden', '');
    if (fallback) {
      fallback.textContent = label;
      fallback.removeAttribute('hidden');
    }
  }

  #clearModes() {
    const visual = this.querySelector('.product-discount-badge__visual');
    const fallback = this.querySelector('[data-product-discount-fallback]');
    const sr = this.querySelector('[data-product-discount-sr]');
    visual?.setAttribute('hidden', '');
    fallback?.setAttribute('hidden', '');
    if (fallback) fallback.textContent = '';
    if (sr) sr.textContent = '';
  }

  /** @param {Event} event */
  #onVariantUpdate = (event) => {
    const detail = /** @type {CustomEvent} */ (event).detail;
    const resource = detail?.resource;
    if (!resource) return;

    const pct = percentOff(resource.compare_at_price, resource.price);
    const tpl = window.Theme?.translations?.product_badge_percent_off_js;
    const saleFallback = window.Theme?.translations?.product_badge_sale_fallback;
    const productLevelSale = this.dataset.productLevelSale === 'true';

    if (pct != null && typeof tpl === 'string' && tpl.length) {
      this.#showPercentMode(pct, tpl);
      return;
    }

    if (productLevelSale && typeof saleFallback === 'string') {
      this.#showSaleFallbackMode(saleFallback);
      return;
    }

    this.#clearModes();
  };
}

if (!customElements.get('product-discount-badge')) {
  customElements.define('product-discount-badge', ProductDiscountBadge);
}
