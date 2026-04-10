/**
 * =============================================================================
 * CUPOM NO CARRINHO — cart-discount.js (Horizon)
 * =============================================================================
 * Para que serve: quando o cliente aplica ou remove um código de desconto no
 * carrinho (drawer ou página), este script fala com a Shopify e atualiza a tela.
 *
 * Ideia geral (sem jargão):
 * - A loja “entende” cupons; o tema só coleta o texto e manda para a Shopify.
 * - A resposta diz se o cupom vale ou não. Não confiamos só no “deu 200 OK”:
 *   olhamos os dados (ex.: applicable) para não mentir para o cliente.
 * - Para não dar F5 na página, pedimos HTML atualizado de uma “section” e o tema
 *   troca só aquele pedaço (morphSection). Por isso o Liquid passa data-section-id.
 *
 * Por que Shopify.routes.root: em lojas com idioma/país no URL (/pt-br/…), o
 * endereço da API muda; root garante o caminho certo.
 *
 * AbortController: se o cliente clicar duas vezes rápido, cancelamos o pedido
 * antigo para não bagunçar estado e economizar rede.
 * =============================================================================
 */

import { Component } from '@theme/component';
import { morphSection } from '@theme/section-renderer';
import { DiscountUpdateEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';
import { cartPerformance } from '@theme/performance';

/**
 * Monta a URL da Ajax Cart API (cart/update.js).
 * Prioriza window.Shopify.routes.root (Markets / prefixo de idioma na URL).
 * @returns {string}
 */
function getCartUpdateJsUrl() {
  if (typeof window.Shopify !== 'undefined' && window.Shopify.routes?.root) {
    const root = window.Shopify.routes.root;
    const path = 'cart/update.js';
    return root.endsWith('/') ? `${root}${path}` : `${root}/${path}`;
  }
  const base = window.Theme?.routes?.cart_update_url ?? '/cart/update';
  return base.includes('.js') ? base : `${base}.js`;
}

/**
 * Mostra a mensagem de sucesso DEPOIS que o HTML da section foi trocado.
 * Motivo: após morphSection o componente antigo pode sumir; achamos o novo pelo ID da section.
 * @param {string} sectionId
 * @param {string} code
 * @param {string} template Texto vindo do Liquid com placeholder [code]
 */
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

/**
 * @typedef {Object} CartDiscountComponentRefs
 * @property {HTMLElement} cartDiscountError
 * @property {HTMLElement} cartDiscountErrorDiscountCode
 * @property {HTMLElement} cartDiscountErrorShipping
 * @property {HTMLElement} cartDiscountSuccess
 */

/**
 * Web component <cart-discount-component>: une o markup do snippet cart-discount-form.liquid
 * às ações apply / remove / removeAll.
 * @extends {Component<CartDiscountComponentRefs>}
 */
class CartDiscount extends Component {
  requiredRefs = [
    'cartDiscountError',
    'cartDiscountErrorDiscountCode',
    'cartDiscountErrorShipping',
    'cartDiscountSuccess',
  ];

  /** @type {AbortController | null} */
  #activeFetch = null;

  #createAbortController() {
    if (this.#activeFetch) {
      this.#activeFetch.abort();
    }
    const abortController = new AbortController();
    this.#activeFetch = abortController;
    return abortController;
  }

  /** Desabilita controles e sinaliza busy para leitores de tela. */
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

  /** Limpa feedback visual antes de nova tentativa. */
  #clearFeedback() {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping, cartDiscountSuccess } =
      this.refs;
    cartDiscountError.classList.add('hidden');
    cartDiscountErrorDiscountCode.classList.add('hidden');
    cartDiscountErrorShipping.classList.add('hidden');
    cartDiscountSuccess.classList.add('hidden');
    cartDiscountSuccess.textContent = '';
  }

  /**
   * @param {SubmitEvent} event
   */
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

      // Shopify pode responder “ok” mesmo quando o cupom não entrou no carrinho.
      // applicable === false = cupom inválido/expirado/regra não bate com o carrinho.
      if (
        data.discount_codes?.find((/** @type {{ code: string; applicable: boolean; }} */ discount) => {
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
        // Caso especial: cupom existe mas o desconto é só de frete no checkout —
        // a lista de códigos na UI não muda; avisamos com a mensagem de “shipping”.
        if (
          codesFromDom.length === existingDiscounts.length &&
          codesFromDom.every((/** @type {string} */ code) => existingDiscounts.includes(code)) &&
          data.discount_codes?.find((/** @type {{ code: string; applicable: boolean; }} */ discount) => {
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

  /**
   * Remove um código (pílula). Mantém o contrato do tema: apenas clique de mouse.
   * @param {MouseEvent | KeyboardEvent} event
   */
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

  /**
   * Remove todos os códigos de uma vez (`discount: ''`).
   * @param {MouseEvent} event
   */
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

  /**
   * @param {'discount_code' | 'shipping'} type
   */
  #handleDiscountError(type) {
    const { cartDiscountError, cartDiscountErrorDiscountCode, cartDiscountErrorShipping } = this.refs;
    const target = type === 'discount_code' ? cartDiscountErrorDiscountCode : cartDiscountErrorShipping;
    cartDiscountError.classList.remove('hidden');
    target.classList.remove('hidden');
  }

  /**
   * @returns {string[]}
   */
  #existingDiscounts() {
    /** @type {string[]} */
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
