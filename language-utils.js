// Language Utilities for BuyPvaAccount Marketplace
window.LanguageUtils = {
  SUPPORTED: ['en', 'ru', 'zh', 'ar'],
  STORAGE_KEY: 'preferred_language',

  normalizeLanguage: function(lang) {
    const l = String(lang || '').toLowerCase();
    return this.SUPPORTED.includes(l) ? l : 'en';
  },

  detectLanguage: function() {
    try {
      // 1) Explicit URL parameter always wins
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang');
      if (urlLang && this.SUPPORTED.includes(urlLang.toLowerCase())) {
        return this.normalizeLanguage(urlLang);
      }

      // 2) Saved preference applies across all pages
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved && this.SUPPORTED.includes(saved.toLowerCase())) {
        return this.normalizeLanguage(saved);
      }

      // 3) Filename-based fallback (marketplace language pages)
      const path = String(window.location.pathname || '').toLowerCase();
      if (path.includes('marketplace-ru.html')) return 'ru';
      if (path.includes('marketplace-zh.html')) return 'zh';
      if (path.includes('marketplace-ar.html')) return 'ar';

      // 4) HTML lang attribute fallback
      const htmlLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
      if (this.SUPPORTED.includes(htmlLang)) return htmlLang;
    } catch {}
    return 'en';
  },

  setLanguage: function(lang) {
    // For future use if needed
    try {
      localStorage.setItem(this.STORAGE_KEY, this.normalizeLanguage(lang));
    } catch {}
  },

  getLanguage: function() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) return this.normalizeLanguage(saved);
    } catch {}
    return this.detectLanguage();
  },

  isRTL: function(lang) {
    return (this.normalizeLanguage(lang) === 'ar');
  },

  applyDocumentDirection: function(lang) {
    const l = this.normalizeLanguage(lang);
    document.documentElement.setAttribute('lang', l);
    document.documentElement.setAttribute('dir', this.isRTL(l) ? 'rtl' : 'ltr');
  },

  marketplacePage: function(lang) {
    const l = this.normalizeLanguage(lang);
    if (l === 'ru') return 'marketplace-ru.html';
    if (l === 'zh') return 'marketplace-zh.html';
    if (l === 'ar') return 'marketplace-ar.html';
    return 'marketplace.html';
  },

  withLangParam: function(url, lang) {
    try {
      const l = this.normalizeLanguage(lang);
      const u = new URL(url, window.location.href);
      u.searchParams.set('lang', l);
      // keep relative if originally relative
      if (!/^(https?:)?\/\//i.test(url)) {
        return u.pathname.replace(/^\//, '') + (u.search || '') + (u.hash || '');
      }
      return u.toString();
    } catch {
      return url;
    }
  },

  translate: function(key, lang) {
    const translations = {
      // Product related translations can be added here
      'Out of Stock': {
        ru: 'Нет в наличии',
        zh: '缺货',
        ar: 'غير متوفر'
      },
      'Add to Cart': {
        ru: 'Добавить в корзину',
        zh: '添加到购物车',
        ar: 'أضف إلى السلة'
      },
      'Qty': {
        ru: 'Кол-во',
        zh: '数量',
        ar: 'الكمية'
      },

      // Common navigation
      'Continue shopping': {
        ru: 'Продолжить покупки',
        zh: '继续购物',
        ar: 'متابعة التسوق'
      },
      'Back to cart': {
        ru: 'Назад в корзину',
        zh: '返回购物车',
        ar: 'العودة إلى السلة'
      }
      // Add more translations as needed
    };
    return translations[key] ? translations[key][lang] || key : key;
  }
};