// Language Utilities for BuyPvaAccount Marketplace
window.LanguageUtils = {
  detectLanguage: function() {
    const path = window.location.pathname;
    if (path.includes('marketplace-ru.html')) return 'ru';
    if (path.includes('marketplace-zh.html')) return 'zh';
    if (path.includes('marketplace-ar.html')) return 'ar';
    return 'en';
  },

  setLanguage: function(lang) {
    // For future use if needed
    localStorage.setItem('preferred_language', lang);
  },

  getLanguage: function() {
    return localStorage.getItem('preferred_language') || this.detectLanguage();
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
      }
      // Add more translations as needed
    };
    return translations[key] ? translations[key][lang] || key : key;
  }
};