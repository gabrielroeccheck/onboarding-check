/**
 * Atualiza o texto "% OFF" nos cards quando o swatch troca a variante.
 * Na PDP a galeria é substituída por HTML novo (variant-picker + Section Rendering), logo não depende disto.
 * Escuta em fase de captura no product-card porque variantUpdate é stopPropagation.
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
      this.textContent = tpl.replace('__NUM__', String(pct));
      return;
    }

    if (productLevelSale && typeof saleFallback === 'string') {
      this.textContent = saleFallback;
      return;
    }

    this.textContent = '';
  };
}

if (!customElements.get('product-discount-badge')) {
  customElements.define('product-discount-badge', ProductDiscountBadge);
}
