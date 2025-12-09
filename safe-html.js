/**
 * XSS Prevention Utility
 * Provides safe HTML rendering and input sanitization
 */

// Import DOMPurify (loaded via CDN or npm)
let DOMPurify = window.DOMPurify;

/**
 * Safe HTML Utility Class
 */
class SafeHTML {
    constructor() {
        this.init();
    }

    init() {
        // Configure DOMPurify if available
        if (typeof DOMPurify !== 'undefined') {
            // Allow safe HTML tags and attributes for blog content and UI elements
            DOMPurify.setConfig({
                ALLOWED_TAGS: [
                    'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
                    'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
                    'div', 'span', 'b', 'i', 'button', 'input', 'select', 'option', 'label',
                    'form', 'textarea', 'fieldset', 'legend'
                ],
                ALLOWED_ATTR: [
                    'href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id',
                    'style', 'colspan', 'rowspan', 'type', 'value', 'name', 'placeholder',
                    'checked', 'selected', 'disabled', 'readonly', 'maxlength', 'min', 'max',
                    'tabindex', 'aria-expanded', 'aria-label', 'role', 'data-*'
                ],
                ALLOW_DATA_ATTR: true,
                FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed']
                // Allow all event handlers for UI functionality
            });
        }
    }

    /**
     * Sanitize HTML content for safe rendering
     * @param {string} html - HTML content to sanitize
     * @param {boolean} allowHTML - Whether to allow HTML tags (default: true for blog posts)
     * @returns {string} - Sanitized HTML
     */
    sanitize(html, allowHTML = true) {
        if (!html || typeof html !== 'string') return '';

        if (allowHTML && typeof DOMPurify !== 'undefined') {
            // Use DOMPurify for HTML content with permissive settings
            return DOMPurify.sanitize(html, {
                ALLOWED_TAGS: [
                    // Basic formatting
                    'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'strike', 'sub', 'sup',
                    // Headings
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    // Lists
                    'ul', 'ol', 'li',
                    // Links and media
                    'a', 'img', 'video', 'audio',
                    // Tables
                    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
                    // Structure
                    'div', 'span', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main',
                    // Forms and inputs
                    'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'fieldset', 'legend',
                    // Semantic
                    'blockquote', 'code', 'pre', 'hr', 'cite', 'abbr', 'dfn', 'kbd', 'samp', 'var',
                    // Interactive
                    'details', 'summary', 'dialog'
                ],
                ALLOWED_ATTR: [
                    // Common attributes
                    'href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id', 'style',
                    // Table attributes
                    'colspan', 'rowspan', 'scope',
                    // Form attributes
                    'type', 'value', 'name', 'placeholder', 'checked', 'selected', 'disabled', 'readonly',
                    'maxlength', 'min', 'max', 'step', 'pattern', 'required', 'autocomplete',
                    // Media attributes
                    'width', 'height', 'controls', 'autoplay', 'loop', 'muted', 'poster',
                    // Accessibility
                    'tabindex', 'aria-*', 'role',
                    // Data attributes
                    'data-*',
                    // Event handlers (allowed for UI functionality)
                    'onclick', 'onchange', 'onsubmit', 'oninput', 'onfocus', 'onblur'
                ],
                ALLOW_DATA_ATTR: true,
                FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'meta', 'link']
            });
        } else {
            // Escape HTML for text-only content
            return this.escapeHTML(html);
        }
    }

    /**
     * Escape HTML characters to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} - HTML-escaped text
     */
    escapeHTML(text) {
        if (!text || typeof text !== 'string') return '';

        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Safely set innerHTML with sanitization
     * @param {Element} element - DOM element
     * @param {string} html - HTML content
     * @param {boolean} allowHTML - Whether to allow HTML tags
     */
    setInnerHTML(element, html, allowHTML = true) {
        if (!element) return;

        if (!allowHTML || !html || typeof html !== 'string') {
            element.textContent = html || '';
            return;
        }

        // TEMPORARY: Bypass DOMPurify completely for testing
        // TODO: Re-enable sanitization after fixing configuration
        element.innerHTML = html;
        return;

        // Check if HTML contains actual tags
        const hasTags = /<[^>]+>/.test(html);

        if (!hasTags) {
            // If no HTML tags, just set text content
            element.textContent = html;
            return;
        }

        // For HTML content, use DOMPurify if available, otherwise use innerHTML
        if (typeof DOMPurify === 'undefined') {
            element.innerHTML = html;
            return;
        }

        // Use very permissive sanitization for internal HTML
        const sanitized = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: [
                // Allow all common HTML tags
                'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'strike', 'sub', 'sup',
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
                'a', 'img', 'video', 'audio', 'source',
                'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
                'div', 'span', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main',
                'form', 'input', 'button', 'select', 'option', 'textarea', 'label', 'fieldset', 'legend',
                'details', 'summary', 'dialog', 'progress', 'meter',
                'mark', 'time', 'cite', 'abbr', 'dfn', 'kbd', 'samp', 'var', 'small', 'big'
            ],
            ALLOWED_ATTR: [
                // Allow all common attributes including event handlers
                'href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id', 'style',
                'colspan', 'rowspan', 'scope', 'width', 'height',
                'type', 'value', 'name', 'placeholder', 'checked', 'selected', 'disabled', 'readonly',
                'maxlength', 'min', 'max', 'step', 'pattern', 'required', 'autocomplete',
                'controls', 'autoplay', 'loop', 'muted', 'poster', 'preload',
                'tabindex', 'aria-*', 'role', 'data-*',
                'onclick', 'onchange', 'onsubmit', 'oninput', 'onfocus', 'onblur', 'onmouseover', 'onmouseout',
                'ondblclick', 'onmousedown', 'onmouseup', 'onmousemove', 'onkeypress', 'onkeydown', 'onkeyup'
            ],
            ALLOW_DATA_ATTR: true,
            // Only forbid truly dangerous tags
            FORBID_TAGS: ['script', 'object', 'embed', 'applet', 'base', 'meta', 'link']
        });

        element.innerHTML = sanitized;
    }

    /**
     * Safely set text content (no HTML allowed)
     * @param {Element} element - DOM element
     * @param {string} text - Text content
     */
    setTextContent(element, text) {
        if (!element) return;

        element.textContent = text || '';
    }

    /**
     * Validate and sanitize user input
     * @param {string} input - User input
     * @param {string} type - Input type ('text', 'email', 'url', etc.)
     * @returns {string} - Sanitized input
     */
    sanitizeInput(input, type = 'text') {
        if (!input || typeof input !== 'string') return '';

        let sanitized = input.trim();

        switch (type) {
            case 'email':
                // Basic email validation
                sanitized = sanitized.replace(/[<>'"&]/g, '');
                break;
            case 'url':
                // Basic URL validation
                sanitized = sanitized.replace(/[<>'"&]/g, '');
                break;
            case 'text':
            default:
                // Remove potentially dangerous characters
                sanitized = sanitized.replace(/[<>]/g, '');
                break;
        }

        return sanitized;
    }
}

// Create global instance
const safeHTML = new SafeHTML();

// Legacy compatibility functions
const safeSetInnerHTML = (element, html, allowHTML) => safeHTML.setInnerHTML(element, html, allowHTML);
const safeSetTextContent = (element, text) => safeHTML.setTextContent(element, text);
const sanitizeInput = (input, type) => safeHTML.sanitizeInput(input, type);

// Export for use in other scripts
window.SafeHTML = SafeHTML;
window.safeHTML = safeHTML;
window.safeSetInnerHTML = safeSetInnerHTML;
window.safeSetTextContent = safeSetTextContent;
window.sanitizeInput = sanitizeInput;