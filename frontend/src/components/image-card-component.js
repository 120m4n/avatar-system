/**
 * ImageCard Web Component
 * 
 * A custom web component for displaying image cards with configurable properties.
 * Compatible with the images-grid layout in /admin/images.astro
 * 
 * Attributes:
 * - image-id: The unique identifier for the image
 * - image-url: The URL of the image to display
 * - alias: The alias/name for the image
 * - created: The creation date (ISO format)
 * - placeholder: Optional placeholder image URL
 * 
 * Usage:
 * <image-card
 *   image-id="123"
 *   image-url="https://example.com/image.jpg"
 *   alias="MyImage"
 *   created="2024-12-01T00:00:00.000Z"
 * ></image-card>
 */
class ImageCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  static get observedAttributes() {
    return ['image-id', 'image-url', 'alias', 'created', 'placeholder'];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  get imageId() {
    return this.getAttribute('image-id') || '';
  }

  get imageUrl() {
    return this.getAttribute('image-url') || '';
  }

  get alias() {
    return this.getAttribute('alias') || 'Sin nombre';
  }

  get created() {
    return this.getAttribute('created') || '';
  }

  get placeholder() {
    return this.getAttribute('placeholder') || 
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23f0f0f0' width='100' height='100'/%3E%3Ctext x='50' y='55' text-anchor='middle' font-size='40'%3E🖼️%3C/text%3E%3C/svg%3E";
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('es');
    } catch (e) {
      return dateString;
    }
  }

  render() {
    const imageUrl = this.imageUrl ? `${this.imageUrl}?size=medium` : this.placeholder;
    const alias = this.escapeHtml(this.alias);
    const formattedDate = this.formatDate(this.created);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          background: #f8f9fa;
          border-radius: 12px;
          padding: 1rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        :host(:hover) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .image-container {
          width: 100%;
          height: 250px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 8px;
          margin-bottom: 0.75rem;
          background: #e0e0e0;
        }

        img {
          width: 200px;
          height: 200px;
          object-fit: cover;
          border-radius: 8px;
        }

        h4 {
          margin: 0 0 0.5rem 0;
          font-size: 1.1rem;
          color: #333;
          word-break: break-word;
        }

        .meta {
          font-size: 0.85rem;
          color: #666;
          margin-bottom: 0.75rem;
        }

        .actions {
          display: flex;
          gap: 0.5rem;
          justify-content: space-between;
        }

        .btn {
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          min-width: 105px;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
        }

        .btn-danger {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          color: white;
        }

        .btn-danger:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(245, 87, 108, 0.3);
        }
      </style>

      <div class="card-content">
        <div class="image-container">
          <img 
            src="${imageUrl}" 
            alt="${alias}"
            class="card-image"
          />
        </div>
        <h4>${alias}</h4>
        <div class="meta">
          ID: ${this.escapeHtml(this.imageId)}<br>
          Creado: ${formattedDate}
        </div>
        <div class="actions">
          <button class="btn btn-primary edit-btn" data-id="${this.escapeHtml(this.imageId)}">
            ✏️ Editar
          </button>
          <button class="btn btn-danger delete-btn" data-id="${this.escapeHtml(this.imageId)}">
            🗑️ Eliminar
          </button>
        </div>
      </div>
    `;

    // Set up error handling for image loading safely using addEventListener
    const img = this.shadowRoot.querySelector('.card-image');
    if (img) {
      img.addEventListener('error', () => {
        img.src = this.placeholder;
      });
    }

    // Note: Event listeners for edit/delete are intentionally not added in this commit
    // as per requirement #5. These will be added in a future commit.
  }
}

// Register the custom element
customElements.define('image-card', ImageCard);
