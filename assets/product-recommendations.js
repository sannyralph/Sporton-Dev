class ProductRecommendations extends HTMLElement {
  /**
   * The observer for the product recommendations
   * @type {IntersectionObserver}
   */
  #intersectionObserver = new IntersectionObserver(
    (entries, observer) => {
      if (!entries[0]?.isIntersecting) return;

      observer.disconnect();
      this.#loadRecommendations();
    },
    { rootMargin: '0px 0px 400px 0px' }
  );

  /**
   * Observing changes to the elements attributes
   * @type {MutationObserver}
   */
  #mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only attribute changes are interesting
      if (mutation.target !== this || mutation.type !== 'attributes') continue;

      // Ignore error attribute changes
      if (mutation.attributeName === 'data-error') continue;

      // Ignore addition of hidden class because it means there's an error with the display
      if (mutation.attributeName === 'class' && this.classList.contains('hidden')) continue;

      // Ignore when the data-recommendations-performed attribute has been set to 'true'
      if (
        mutation.attributeName === 'data-recommendations-performed' &&
        this.dataset.recommendationsPerformed === 'true'
      )
        continue;

      // All other attribute changes trigger a reload
      this.#loadRecommendations();
      break;
    }
  });

  /**
   * The cached recommendations
   * @type {Record<string, string>}
   */
  #cachedRecommendations = {};

  /**
   * An abort controller for the active fetch (if there is one)
   * @type {AbortController | null}
   */
  #activeFetch = null;

  connectedCallback() {
    this.#intersectionObserver.observe(this);
    this.#mutationObserver.observe(this, { attributes: true });
  }

  disconnectedCallback() {
    this.#intersectionObserver.disconnect();
    this.#mutationObserver.disconnect();
  }

  /**
   * Load the product recommendations
   */
  #loadRecommendations() {
    const { productId, recommendationsPerformed, sectionId, intent } = this.dataset;
    const id = this.id;

    if (!productId || !id) {
      throw new Error('Product ID and an ID attribute are required');
    }

    // If the recommendations have already been loaded, accounts for the case where the Theme Editor
    // is loaded the section from the editor's visual preview context.
    if (recommendationsPerformed === 'true') {
      return;
    }

    this.#fetchCachedRecommendations(productId, sectionId, intent)
      .then((result) => {
        if (!result.success) {
          // The Theme Editor will place a section element element in the DOM whose section_id is not available
          // to the Section Renderer API. In this case, we can safely ignore the error.
          if (!Shopify.designMode) {
            this.#handleError(new Error(`Server returned ${result.status}`));
          }
          return;
        }

        const html = document.createElement('div');
        html.innerHTML = result.data || '';
        const recommendations = html.querySelector(`product-recommendations[id="${id}"]`);

        if (recommendations?.innerHTML && recommendations.innerHTML.trim().length) {
          this.dataset.recommendationsPerformed = 'true';
          this.innerHTML = recommendations.innerHTML;
        } else {
          this.#handleError(new Error('No recommendations available'));
        }
      })
      .catch((e) => {
        this.#handleError(e);
      });
  }

  /**
   * Fetches the recommendations and cached the result for future use
   * @param {string} productId
   * @param {string | undefined} sectionId
   * @param {string | undefined} intent
   * @returns {Promise<{ success: true, data: string } | { success: false, status: number }>}
   */
  async #fetchCachedRecommendations(productId, sectionId, intent) {
    const url = `${this.dataset.url}&product_id=${productId}&section_id=${sectionId}&intent=${intent}`;

    const cachedResponse = this.#cachedRecommendations[url];
    if (cachedResponse) {
      return { success: true, data: cachedResponse };
    }

    this.#activeFetch?.abort();
    this.#activeFetch = new AbortController();

    try {
      const response = await fetch(url, { signal: this.#activeFetch.signal });
      if (!response.ok) {
        return { success: false, status: response.status };
      }

      const text = await response.text();
      this.#cachedRecommendations[url] = text;
      return { success: true, data: text };
    } finally {
      this.#activeFetch = null;
    }
  }

  /**
   * Handle errors in a consistent way
   * @param {Error} error
   */
  #handleError(error) {
    console.error('Product recommendations error:', error.message);
    this.classList.add('hidden');
    this.dataset.error = 'Error loading product recommendations';
  }
}

if (!customElements.get('product-recommendations')) {
  customElements.define('product-recommendations', ProductRecommendations);
}

/* ==================================================
   Sporton: Complete the look variant selection
   ================================================== */

(() => {
  if (window.SportonCompleteLookLoaded) return;
  window.SportonCompleteLookLoaded = true;

  const getCardVariant = (card) => {
    const variantData = card.querySelector('[data-complete-look-variants]');
    const selects = Array.from(
      card.querySelectorAll('select[data-option-position]')
    ).sort(
      (a, b) =>
        Number(a.dataset.optionPosition) -
        Number(b.dataset.optionPosition)
    );

    if (!variantData || !selects.length) return null;

    let variants;

    try {
      variants = JSON.parse(variantData.textContent);
    } catch (error) {
      return null;
    }

    const selectedOptions = selects.map((select) => select.value);

    return variants.find((variant) =>
      selectedOptions.every(
        (value, index) =>
          String(variant.options[index]) === String(value)
      )
    );
  };

  const syncCard = (card) => {
    const variant = getCardVariant(card);
    const variantInput = card.querySelector('[data-complete-look-variant]');
    const button = card.querySelector('[data-complete-look-submit]');
    const links = card.querySelectorAll('[data-complete-look-link]');

    if (!variant || !variantInput || !button) return;

    variantInput.value = variant.id;
    button.disabled = !variant.available;

    if (!variant.available) {
      button.textContent = 'Unavailable';
    } else {
      button.textContent = 'Quick selection';
    }

    links.forEach((link) => {
      const productUrl = new URL(link.href, window.location.origin);
      productUrl.searchParams.set('variant', variant.id);
      link.href = productUrl.toString();
    });
  };

  const syncAllCards = () => {
    document
      .querySelectorAll('[data-complete-look-card]')
      .forEach(syncCard);
  };

  document.addEventListener('change', (event) => {
    const select = event.target.closest(
      '[data-complete-look-card] select[data-option-position]'
    );

    if (!select) return;

    const card = select.closest('[data-complete-look-card]');
    syncCard(card);
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-complete-look-form]');

    if (!form) return;

    event.preventDefault();

    const card = form.closest('[data-complete-look-card]');
    const variant = getCardVariant(card);
    const button = form.querySelector('[data-complete-look-submit]');

    if (!variant || !variant.available) return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Adding...';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          items: [
            {
              id: Number(variant.id),
              quantity: 1
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Unable to add product');
      }

      button.textContent = 'Added';

      document.dispatchEvent(
        new CustomEvent('cart:refresh', {
          bubbles: true
        })
      );

      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 1400);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Try again';
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAllCards);
  } else {
    syncAllCards();
  }
})();