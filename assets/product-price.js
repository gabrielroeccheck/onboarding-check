import { ThemeEvents, VariantUpdateEvent } from '@theme/events';
import { Component } from '@theme/component';

class ProductPrice extends Component {
  connectedCallback() {
    super.connectedCallback();
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.addEventListener(ThemeEvents.variantUpdate, this.updatePrice);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    const closestSection = this.closest('.shopify-section, dialog');
    if (!closestSection) return;
    closestSection.removeEventListener(ThemeEvents.variantUpdate, this.updatePrice);
  }

  updatePrice = (event) => {
    if (event.detail.data.newProduct) {
      this.dataset.productId = event.detail.data.newProduct.id;
    } else if (event.target instanceof HTMLElement && event.target.dataset.productId !== this.dataset.productId) {
      return;
    }

    const { priceContainer, volumePricingNote, installmentsDisplay, pixPriceDisplay } = this.refs;
    const newProductPrice = event.detail.data.html.querySelector(
      `product-price[data-block-id="${this.dataset.blockId}"]`
    );
    if (!newProductPrice) return;

    const newPrice = newProductPrice.querySelector('[ref="priceContainer"]');
    if (newPrice && priceContainer) {
      priceContainer.replaceWith(newPrice);
    }

    const newNote = newProductPrice.querySelector('[ref="volumePricingNote"]');

    if (!newNote) {
      volumePricingNote?.remove();
    } else if (!volumePricingNote) {
      newPrice?.insertAdjacentElement('afterend', newNote.cloneNode(true));
    } else {
      volumePricingNote.replaceWith(newNote);
    }

    const newInstallments = newProductPrice.querySelector('[ref="installmentsDisplay"]');
    if (newInstallments && installmentsDisplay) {
      installmentsDisplay.replaceWith(newInstallments);
    } else if (installmentsDisplay && !newInstallments) {
      installmentsDisplay.remove();
    } else if (newInstallments && !installmentsDisplay) {
      const anchor =
        this.querySelector('[ref="volumePricingNote"]') ?? this.querySelector('[ref="priceContainer"]');
      anchor?.insertAdjacentElement('afterend', newInstallments.cloneNode(true));
    }

    const newPix = newProductPrice.querySelector('[ref="pixPriceDisplay"]');
    if (newPix && pixPriceDisplay) {
      pixPriceDisplay.replaceWith(newPix);
    } else if (pixPriceDisplay && !newPix) {
      pixPriceDisplay.remove();
    } else if (newPix && !pixPriceDisplay) {
      const anchor =
        this.querySelector('[ref="installmentsDisplay"]') ??
        this.querySelector('[ref="volumePricingNote"]') ??
        this.querySelector('[ref="priceContainer"]');
      anchor?.insertAdjacentElement('afterend', newPix.cloneNode(true));
    }
  };
}

if (!customElements.get('product-price')) {
  customElements.define('product-price', ProductPrice);
}
