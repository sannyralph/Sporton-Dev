import { DialogComponent, DialogOpenEvent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';

/**
 * A custom element that manages a cart drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog - The dialog element.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  #FREE_SHIPPING_THRESHOLD = 80;
  /** @type {number} */
  #summaryThreshold = 0.5;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.addEventListener(DialogOpenEvent.eventName, this.#updateStickyState);

    // Inject styles once
    if (!document.getElementById('cart-drawer-progress-styles')) {
      const style = document.createElement('style');
      style.id = 'cart-drawer-progress-styles';
      style.textContent = `
        .cart-drawer__progress-bar-bg { width:100%; background:#eee; border-radius:8px; height:8px; overflow:hidden; }
        .cart-drawer__progress-bar-fill { height:8px; width:0%; border-radius:8px; transition:width 0.3s; }
        .cart-drawer__progress { margin-bottom:1.5em; }
      `;
      document.head.append(style);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.removeEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
  }

  #handleCartAdd = () => {
    this.#injectCartProgressBar();
    this.#updateCartProgress();
    if (this.hasAttribute('auto-open')) {
      this.showDialog();
    }
  };

  open() {
    this.showDialog();
    this.#injectCartProgressBar();
    this.#updateCartProgress();

    // Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }

 #injectCartProgressBar() {
  const content = this.refs?.dialog?.querySelector('.cart-drawer__content');
  if (!content) return;

  // Only inject once
  if (content.querySelector('.cart-drawer__progress')) return;

  const wrapper = document.createElement('div');
wrapper.className = 'cart-drawer__progress';
wrapper.innerHTML = `
  <div class="cart-drawer__progress-top-icon">
    <span class="cart-progress-icon-van">
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" id="Local-Shipping--Streamline-Outlined-Material" height="24" width="24">
      <desc>
        Local Shipping Streamline Icon: https://streamlinehq.com
      </desc>
      <path fill="#000000" d="M5.603 19.975c-0.818665 0 -1.5155 -0.28685 -2.0905 -0.8605 -0.575 -0.5735 -0.8625 -1.27 -0.8625 -2.0895H1V5.5c0 -0.4 0.15 -0.75 0.45 -1.05C1.75 4.15 2.1 4 2.5 4h14.475v4.175h2.625L23 12.7v4.325h-1.775c0 0.8195 -0.2865 1.516 -0.8595 2.0895 -0.573 0.57365 -1.26885 0.8605 -2.0875 0.8605 -0.81865 0 -1.5155 -0.28685 -2.0905 -0.8605 -0.575 -0.5735 -0.8625 -1.27 -0.8625 -2.0895H8.55c0 0.81665 -0.2865 1.5125 -0.8595 2.0875 -0.573 0.575 -1.26885 0.8625 -2.0875 0.8625Zm-0.003 -1.5c0.4 0 0.74165 -0.14165 1.025 -0.425 0.28335 -0.28335 0.425 -0.625 0.425 -1.025 0 -0.4 -0.14165 -0.74165 -0.425 -1.025 -0.28335 -0.28335 -0.625 -0.425 -1.025 -0.425 -0.4 0 -0.741665 0.14165 -1.025 0.425 -0.283335 0.28335 -0.425 0.625 -0.425 1.025 0 0.4 0.141665 0.74165 0.425 1.025 0.283335 0.28335 0.625 0.425 1.025 0.425ZM2.5 15.525h0.55c0.283335 -0.45 0.642 -0.80835 1.076 -1.075 0.434 -0.26665 0.91735 -0.4 1.45 -0.4s1.01985 0.1375 1.4615 0.4125c0.44165 0.275 0.80415 0.62915 1.0875 1.0625h7.35V5.5H2.5v10.025Zm15.775 2.95c0.4 0 0.74165 -0.14165 1.025 -0.425 0.28335 -0.28335 0.425 -0.625 0.425 -1.025 0 -0.4 -0.14165 -0.74165 -0.425 -1.025 -0.28335 -0.28335 -0.625 -0.425 -1.025 -0.425 -0.4 0 -0.74165 0.14165 -1.025 0.425 -0.28335 0.28335 -0.425 0.625 -0.425 1.025 0 0.4 0.14165 0.74165 0.425 1.025 0.28335 0.28335 0.625 0.425 1.025 0.425Zm-1.3 -5.1h4.65l-2.775 -3.7h-1.875v3.7Z" stroke-width="0.5"></path>
    </svg>
    </span>
  </div>
  <div class="cart-drawer__progress-bar-bg">
    <div class="cart-drawer__progress-bar-fill" id="cart-progress-bar"></div>
  </div>
  <div class="cart-drawer__progress-bottom-label">
    €${this.#FREE_SHIPPING_THRESHOLD}
  </div>
  <div id="cart-progress-message" class="cart-drawer__progress-message"></div>
  <div class="cart-drawer__progress-divider"></div>
`;
content.prepend(wrapper);

}


  #updateCartProgress = () => {
  fetch('/cart.js')
    .then(res => res.json())
    .then(cart => {
      const bar = this.refs?.dialog?.querySelector('#cart-progress-bar');
      const message = this.refs?.dialog?.querySelector('#cart-progress-message');
      const progressWrapper = this.refs?.dialog?.querySelector('.cart-drawer__progress');
      // If cart is empty, remove/hide the progress bar
      if (!cart.items || cart.items.length === 0) {
        if (progressWrapper) progressWrapper.style.display = 'none';
        return;
      } else {
        if (progressWrapper) progressWrapper.style.display = '';
      }
      if (!bar || !message) return;

      const subtotal = cart.total_price / 100; // convert cents to currency
      let progress, msg;
      if (subtotal < this.#FREE_SHIPPING_THRESHOLD) {
        progress = Math.min((subtotal / this.#FREE_SHIPPING_THRESHOLD) * 100, 100);
        msg = `Just €${(this.#FREE_SHIPPING_THRESHOLD - subtotal).toFixed(2)} more for free delivery + daily hydrating kit.`;
      } else {
        progress = 100;
        msg = "Congratulations! You've unlocked a daily hydrating kit, plus free delivery on this order.";
      }
      bar.style.width = `${progress}%`;
      message.textContent = msg;
    });
}


  #updateStickyState() {
    const { dialog } = /** @type {Refs} */ (this.refs);
    if (!dialog) return;

    const content = dialog.querySelector('.cart-drawer__content');
    const summary = dialog.querySelector('.cart-drawer__summary');

    if (!content || !summary) {
      dialog.setAttribute('cart-summary-sticky', 'false');
      return;
    }

    const drawerHeight = dialog.getBoundingClientRect().height;
    const summaryHeight = summary.getBoundingClientRect().height;
    const ratio = summaryHeight / drawerHeight;
    dialog.setAttribute('cart-summary-sticky', ratio > this.#summaryThreshold ? 'false' : 'true');
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}
