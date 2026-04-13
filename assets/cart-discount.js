import { Component } from '@theme/component';
import { morphSection } from '@theme/section-renderer';
import { DiscountUpdateEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';
import { cartPerformance } from '@theme/performance';

function getCartUpdateJsUrl() {
  if (typeof window.Shopify !== 'undefined' && window.Shopify.routes?.root) {
    const root = window.Shopify.routes.root;
    const path = 'cart/update.js';
    return root.endsWith('/') ? `${root}${path}` : `${root}/${path}`;
  }
  const base = window.Theme?.routes?.cart_update_url ?? '/cart/update';
  return base.includes('.js') ? base : `${base}.js`;
}

function flashDiscountSuccess(sectionId, code, template) {
  if (!sectionId || !code) return;
  const sectionEl = document.getElementById(`shopify-section-${sectionId}`);
  const host = sectionEl?.querySelector('cart-discount-component');
  const successEl = host?.querySelector('[ref="cartDiscountSuccess"]');
  if (!(successEl instanceof HTMLElement)) return;
  const text = (template || '').replace('[code]', code);
  successEl.textContent = text;
  successEl.classList.remove('hidden');
}

class CartDiscount extends Component {
  requiredRefs = [
    'cartDiscountError',
    'cartDiscountErrorDiscountCode',
    'cartDiscountErrorShipping',
    'cartDiscountSuccess',
  ];

  #activeFetch = null;

  #createAbortController() {
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }
    const abortController = new AbortController();
    this.#activeFetch = abortController;
    return abortController;
  }

  #setLoading(on) {
    this.classList.toggle('cart-discount--loading', on);
    this.setAttribute('aria-busy', on ? 'true' : 'false');
    const form = this.querySelector('.cart-discount__form');
    if (form instanceof HTMLFormElement) {
      for (const el of form.querySelectorAll('button, input')) {
        if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
          el.toggleAttribute('disabled', on);
        }
      }
    }
    for (const btn of this.querySelectorAll('.cart-discount__pill-remove, .cart-discount__remove-all')) {
      if (btn instanceof HTMLButtonElement) btn.toggleAttribute('disabled', on);
    }
  }

  #clearFeedback() {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping, cartDiscountSuccess } =
      this.refs;
    cartDiscountError.classList.add('hidden');
    cartDiscountErrorDiscountCode.classList.add('hidden');
    cartDiscountErrorShipping.classList.add('hidden');
    cartDiscountSuccess.classList.add('hidden');
    cartDiscountSuccess.textContent = '';
  }

  applyDiscount = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    const discountInput = form.querySelector('input[name="discount"]');
    if (!(discountInput instanceof HTMLInputElement) || typeof this.dataset.sectionId !== 'string') return;

    const discountCodeValue = discountInput.value.trim();
    if (!discountCodeValue) return;

    const abortController = this.#createAbortController();
    const successTemplate = this.dataset.successTemplate ?? '';

    const existingDiscounts = this.#existingDiscounts();
    if (existingDiscounts.includes(discountCodeValue)) return;

    this.#clearFeedback();

    this.#setLoading(true);

    try {
      const config = fetchConfig('json', {
        body: JSON.stringify({
          discount: [...existingDiscounts, discountCodeValue].join(','),
          sections: [this.dataset.sectionId],
        }),
      });

      const response = await fetch(getCartUpdateJsUrl(), {
        ...config,
        signal: abortController.signal,
      });

      const data = await response.json();

      if (
        data.discount_codes?.find((discount) => {
          return discount.code === discountCodeValue && discount.applicable === false;
        })
      ) {
        discountInput.value = '';
        this.#handleDiscountError('discount_code');
        return;
      }

      const newHtml = data.sections[this.dataset.sectionId];
      const parsedHtml = new DOMParser().parseFromString(newHtml, 'text/html');
      const section = parsedHtml.getElementById(`shopify-section-${this.dataset.sectionId}`);
      const discountPills = section?.querySelectorAll('.cart-discount__pill') || [];
      if (section) {
        const codesFromDom = Array.from(discountPills)
          .map((element) => (element instanceof HTMLLIElement ? element.dataset.discountCode : null))
          .filter(Boolean);
        if (
          codesFromDom.length === existingDiscounts.length &&
          codesFromDom.every((code) => existingDiscounts.includes(code)) &&
          data.discount_codes?.find((discount) => {
            return discount.code === discountCodeValue && discount.applicable === true;
          })
        ) {
          this.#handleDiscountError('shipping');
          discountInput.value = '';
          return;
        }
      }

      document.dispatchEvent(new DiscountUpdateEvent(data, this.id));
      morphSection(this.dataset.sectionId, newHtml);
      queueMicrotask(() => flashDiscountSuccess(this.dataset.sectionId, discountCodeValue, successTemplate));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    } finally {
      this.#activeFetch = null;
      this.#setLoading(false);
      cartPerformance.measureFromEvent('discount-update:user-action', event);
    }
  };

  removeDiscount = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (
      (event instanceof KeyboardEvent && event.key !== 'Enter') ||
      !(event instanceof MouseEvent) ||
      !(event.target instanceof HTMLElement) ||
      typeof this.dataset.sectionId !== 'string'
    ) {
      return;
    }

    const pill = event.target.closest('.cart-discount__pill');
    if (!(pill instanceof HTMLLIElement)) return;

    const discountCode = pill.dataset.discountCode;
    if (!discountCode) return;

    const existingDiscounts = this.#existingDiscounts();
    const index = existingDiscounts.indexOf(discountCode);
    if (index === -1) return;

    existingDiscounts.splice(index, 1);

    const abortController = this.#createAbortController();
    this.#clearFeedback();
    this.#setLoading(true);

    try {
      const config = fetchConfig('json', {
        body: JSON.stringify({
          discount: existingDiscounts.join(','),
          sections: [this.dataset.sectionId],
        }),
      });

      const response = await fetch(getCartUpdateJsUrl(), {
        ...config,
        signal: abortController.signal,
      });

      const responseData = await response.json();

      document.dispatchEvent(new DiscountUpdateEvent(responseData, this.id));
      morphSection(this.dataset.sectionId, responseData.sections[this.dataset.sectionId]);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    } finally {
      this.#activeFetch = null;
      this.#setLoading(false);
    }
  };

  removeAllDiscounts = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!(event.target instanceof HTMLElement) || typeof this.dataset.sectionId !== 'string') return;

    const abortController = this.#createAbortController();
    this.#clearFeedback();
    this.#setLoading(true);

    try {
      const config = fetchConfig('json', {
        body: JSON.stringify({
          discount: '',
          sections: [this.dataset.sectionId],
        }),
      });

      const response = await fetch(getCartUpdateJsUrl(), {
        ...config,
        signal: abortController.signal,
      });

      const data = await response.json();

      document.dispatchEvent(new DiscountUpdateEvent(data, this.id));
      morphSection(this.dataset.sectionId, data.sections[this.dataset.sectionId]);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    } finally {
      this.#activeFetch = null;
      this.#setLoading(false);
    }
  };

  #handleDiscountError(type) {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;
    const target = type === 'discount_code' ? cartDiscountErrorDiscountCode : cartDiscountErrorShipping;
    cartDiscountError.classList.remove('hidden');
    target.classList.remove('hidden');
  }

  #existingDiscounts() {
    const discountCodes = [];
    const discountPills = this.querySelectorAll('.cart-discount__pill');
    for (const pill of discountPills) {
      if (pill instanceof HTMLLIElement && typeof pill.dataset.discountCode === 'string') {
        discountCodes.push(pill.dataset.discountCode);
      }
    }
    return discountCodes;
  }
}

if (!customElements.get('cart-discount-component')) {
  customElements.define('cart-discount-component', CartDiscount);
}
