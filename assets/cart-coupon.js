document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('cart-coupon-input');
    const applyButton = document.getElementById('cart-coupon-apply');
    const message = document.getElementById('cart-coupon-message');
    const appliedCouponsList = document.getElementById('applied-coupons-list');

    let appliedCoupons = JSON.parse(localStorage.getItem('appliedCoupons') || '[]');

    renderAppliedCoupons();
    applyCouponsToCheckout();

    applyButton.addEventListener('click', async function () {
        const code = input.value.trim().toUpperCase();
        if (!code) {
            message.textContent = "{{ 'cart.coupon_enter_code' | t }}";
            return;
        }
        if (appliedCoupons.includes(code)) {
            const alreadyText = message.dataset.alreadyText.replace('{{ code }}', code);
            message.textContent = alreadyText;
            message.style.display = 'block';
            return;
        }

        const isValid = await validateCoupon(code);
        if (!isValid) {
            const invalidText = message.dataset.invalidText.replace('{{ code }}', code);
            message.textContent = invalidText;
            message.style.display = 'block';
            return;
        }

        appliedCoupons.push(code);
        localStorage.setItem('appliedCoupons', JSON.stringify(appliedCoupons));
        renderAppliedCoupons();
        applyCouponsToCheckout();

        input.value = '';
        const appliedText = message.dataset.appliedText.replace('{{ code }}', code);
        message.textContent = appliedText;
        message.style.display = 'block';

        setTimeout(() => {
            refreshCartElements(['#main-cart-items', '#cart-total']);
        }, 500);
    });

    async function validateCoupon(code) {
        try {
            const response = await fetch('/cart/update.js', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ discount: code }),
            });

            if (!response.ok) return false;

            const data = await response.json();

            const isApplicable = data?.discount_codes?.some(
                (dc) => dc.code.toUpperCase() === code.toUpperCase() && dc.applicable
            );

            return !!isApplicable;
        } catch (err) {
            console.error('Erro ao validar cupom:', err);
            return false;
        }
    }

    function removeCoupon(code) {
        appliedCoupons = appliedCoupons.filter((c) => c !== code);
        localStorage.setItem('appliedCoupons', JSON.stringify(appliedCoupons));
        renderAppliedCoupons();
        applyCouponsToCheckout();
        const removedText = message.dataset.removedText.replace('{{ code }}', code);
        message.textContent = removedText;
        message.style.display = 'block';

        setTimeout(() => {
            refreshCartElements(['#main-cart-items', '#cart-total']);
        }, 400);
    }

    function renderAppliedCoupons() {
        const container = document.getElementById('applied-coupons-container');
        const appliedCouponsList = document.getElementById('applied-coupons-list');

        appliedCouponsList.innerHTML = '';

        if (appliedCoupons.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        appliedCoupons.forEach((c) => {
            const li = document.createElement('li');

            const span = document.createElement('span');
            span.textContent = c;

            const removeBtn = document.createElement('button');
            removeBtn.textContent = "X";
            removeBtn.addEventListener('click', () => removeCoupon(c));

            li.appendChild(span);
            li.appendChild(removeBtn);
            appliedCouponsList.appendChild(li);
        });
    }

    function applyCouponsToCheckout() {
        if (appliedCoupons.length === 0) {
            fetch('/checkout?discount=', { method: 'GET', credentials: 'same-origin' }).catch(() => {
                message.textContent = "{{ 'cart.coupon_clear_error' | t }}";
            });
            return;
        }

        const discountQuery = `discount=${encodeURIComponent(appliedCoupons.join(','))}`;
        const checkoutUrl = `/checkout?${discountQuery}`;

        fetch(checkoutUrl, { method: 'GET', credentials: 'same-origin' }).catch(() => {
            message.textContent = "{{ 'cart.coupon_update_error' | t }}";
        });
    }

    function refreshCartElements(selectors = []) {
        fetch('/cart?view=cart-items')
            .then((response) => response.text())
            .then((html) => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                selectors.forEach((sel) => {
                    const newEl = doc.querySelector(sel);
                    const currentEl = document.querySelector(sel);
                    if (newEl && currentEl) {
                        currentEl.innerHTML = newEl.innerHTML;
                    }
                });
            })
            .catch((err) => console.error('Erro ao atualizar elementos:', err));
    }
});