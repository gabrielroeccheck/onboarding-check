import { Component } from '@theme/component';
import { fetchConfig } from '@theme/utilities';
import { CartAddEvent, CartErrorEvent } from '@theme/events';

/**
 * Adiciona o variant atual do formulário da PDP + o variant complementar em um único POST /cart/add.js.
 * Dispara os mesmos eventos de carrinho do tema para atualizar drawer e contador.
 */
class ProductBuyTogether extends Component {
  requiredRefs = ['submitButton', 'buttonLabel', 'errorMessage'];

  /** @type {boolean} */
  #busy = false;

  /**
   * @returns {HTMLFormElement | null}
   */
  #getProductForm() {
    const section = this.closest('.shopify-section');
    const sectionId = this.dataset.sectionId;
    /** @type {HTMLElement | null} */
    let root = section;
    if (!root && sectionId) {
      root = document.querySelector(`.shopify-section[id*="shopify-section-template"][id*="${sectionId}"]`);
    }
    return (
      root?.querySelector('product-form-component form[data-type="add-to-cart-form"]') ??
      document.querySelector(`product-form-component[data-section-id="${sectionId}"] form[data-type="add-to-cart-form"]`) ??
      document.querySelector('product-form-component form[data-type="add-to-cart-form"]')
    );
  }

  /**
   * Coleta IDs de secção do carrinho (drawer / página) como o product-form.js.
   * @returns {string}
   */
  #getCartSectionIds() {
    const components = document.querySelectorAll('cart-items-component[data-section-id]');
    const ids = new Set();
    components.forEach((el) => {
      if (el instanceof HTMLElement && el.dataset.sectionId) {
        ids.add(el.dataset.sectionId);
      }
    });
    return Array.from(ids).join(',');
  }

  /**
   * Lê plano de assinatura do formulário, se existir (apps / temas com selling plans).
   * @param {HTMLFormElement} form
   * @returns {number | undefined}
   */
  #getSellingPlanId(form) {
    const radio = form.querySelector('input[name="selling_plan"]:checked');
    if (radio?.value) {
      const n = Number.parseInt(String(radio.value), 10);
      return Number.isFinite(n) ? n : undefined;
    }
    const select = form.querySelector('select[name="selling_plan"]');
    if (select?.value) {
      const n = Number.parseInt(String(select.value), 10);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }

  handleAddBoth = async () => {
    if (this.#busy) return;

    const complementaryId = this.dataset.complementaryVariantId;
    if (!complementaryId) return;

    const form = this.#getProductForm();
    const variantInput = form?.querySelector('input[name="id"]');
    const mainVariantId = variantInput?.value;
    if (!mainVariantId) {
      this.#showError(Theme.translations.buy_together_select_variant);
      return;
    }

    const qtyInput = form?.querySelector('input[name="quantity"]');
    let mainQty = Number.parseInt(String(qtyInput?.value ?? '1'), 10);
    if (!Number.isFinite(mainQty) || mainQty < 1) mainQty = 1;

    this.#busy = true;
    const { submitButton, buttonLabel, errorMessage } = this.refs;
    submitButton.disabled = true;
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';

    const defaultLabel = submitButton.dataset.labelDefault || buttonLabel.textContent;
    const loadingLabel = submitButton.dataset.labelLoading || defaultLabel;
    buttonLabel.textContent = loadingLabel;

    const items = [{ id: Number(mainVariantId), quantity: mainQty }, { id: Number(complementaryId), quantity: 1 }];

    const sellingPlan = form ? this.#getSellingPlanId(form) : undefined;
    if (sellingPlan != null && !Number.isNaN(sellingPlan)) {
      items[0].selling_plan = sellingPlan;
    }

    const sections = this.#getCartSectionIds();
    /** @type {Record<string, unknown>} */
    const payload = { items };
    if (sections) {
      payload.sections = sections;
      payload.sections_url = window.location.pathname;
    }

    try {
      const cfg = fetchConfig('json', { body: JSON.stringify(payload) });
      const res = await fetch(Theme.routes.cart_add_url, {
        ...cfg,
        headers: { ...cfg.headers, Accept: 'application/json' },
      });

      const data = await res.json();

      if (data.status || data.errors) {
        const msg =
          typeof data.message === 'string'
            ? data.message
            : typeof data.description === 'string'
              ? data.description
              : Theme.translations.buy_together_error;
        document.dispatchEvent(
          new CartErrorEvent(this.id, msg, data.description ?? '', data.errors ?? data)
        );
        this.#showError(msg);
        return;
      }

      document.dispatchEvent(
        new CartAddEvent(data, this.id, {
          source: 'product-buy-together',
          itemCount: data.item_count ?? 0,
          sections: data.sections,
        })
      );
    } catch (e) {
      console.error(e);
      this.#showError(Theme.translations.buy_together_error);
    } finally {
      this.#busy = false;
      submitButton.disabled = false;
      buttonLabel.textContent = defaultLabel;
    }
  };

  /**
   * @param {string} text
   */
  #showError(text) {
    const { errorMessage } = this.refs;
    errorMessage.textContent = text;
    errorMessage.classList.remove('hidden');
  }

}

if (!customElements.get('product-buy-together')) {
  customElements.define('product-buy-together', ProductBuyTogether);
}
