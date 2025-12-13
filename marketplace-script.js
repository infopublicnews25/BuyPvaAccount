// Notification Request Handler
function sendNotificationRequest(event) {
  event.preventDefault();
  const accountType = document.getElementById('accountType').value;
  const quantity = document.getElementById('quantity').value;
  const email = document.getElementById('email').value;
  const requests = JSON.parse(localStorage.getItem('account_requests') || '[]');
  requests.unshift({ accountType, quantity, email, timestamp: new Date().toISOString(), new: true });
  localStorage.setItem('account_requests', JSON.stringify(requests));
  const subject = encodeURIComponent('Notification Request: ' + accountType);
  const body = encodeURIComponent('New Notification Request:\n\nAccount Type: ' + accountType + '\nQuantity: ' + quantity + '\nCustomer Email: ' + email);
  window.location.href = `mailto:info.buypva@gmail.com?subject=${subject}&body=${body}`;
  document.getElementById('notificationForm').reset();
  alert('Request sent successfully! We will notify you when the items are available.');
}

// Load News Updates
function loadNewsUpdates() {
  const newsContainer = document.getElementById('newsContainer');
  const lang = window.LanguageUtils ? window.LanguageUtils.detectLanguage() : 'en';
  const news = JSON.parse(localStorage.getItem('newsUpdates') || '[]');
  if (news.length === 0) {
    const defaultNews = {
      en: [
        { date: 'Nov 2025', content: 'Crypto payments optimized for speed.' },
        { date: 'Oct 2025', content: 'Bulk pricing available on select items.' },
        { date: 'May 2025', content: 'Improved search & filtering.' }
      ],
      ru: [
        { date: 'Ноя 2025', content: 'Криптовалютные платежи оптимизированы для скорости.' },
        { date: 'Окт 2025', content: 'Оптовые цены доступны на выбранные товары.' },
        { date: 'Май 2025', content: 'Улучшен поиск и фильтрация.' }
      ],
      zh: [
        { date: '2025年11月', content: '加密货币支付已优化以提高速度。' },
        { date: '2025年10月', content: '部分商品提供批量定价。' },
        { date: '2025年5月', content: '改进的搜索和过滤。' }
      ],
      ar: [
        { date: 'نوفمبر 2025', content: 'تم تحسين المدفوعات المشفرة للسرعة.' },
        { date: 'أكتوبر 2025', content: 'الأسعار بالجملة متاحة على بعض العناصر.' },
        { date: 'مايو 2025', content: 'تم تحسين البحث والتصفية.' }
      ]
    };
    const langNews = defaultNews[lang] || defaultNews.en;
    safeSetInnerHTML(newsContainer, langNews.map(item => `
      <div class="item"><div class="date">${item.date}</div><div>${item.content}</div></div>
    `).join(''), true);
  } else {
    safeSetInnerHTML(newsContainer, news.map(item => `
      <div class="item">
        <div class="date">${item.date}</div>
        <div class="news-content">${item.content}</div>
      </div>
    `).join(''), true);
  }
}

// Main Marketplace Logic
(async function () {
  const CART_KEY = 'mp_cart_v1'; // Keep for backward compatibility
  const CART_URL = (document.getElementById('mp-cart-url')?.dataset?.url) || '/cart/';
  const CATEGORIES_KEY = 'product_categories';

  async function loadCategories() {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      if (data.success && data.categories.length > 0) {
        // Store in localStorage for offline use
        localStorage.setItem(CATEGORIES_KEY, JSON.stringify(data.categories));
        return data.categories;
      }
    } catch (error) {
      console.warn('Failed to load categories from API, using cached or default:', error);
    }

    // Fallback to cached categories or defaults
    const stored = localStorage.getItem(CATEGORIES_KEY);
    if (stored) return JSON.parse(stored);

    // Detect language from filename or lang attribute
    const lang = detectLanguage();
    const categoryTranslations = {
      en: ['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Other'],
      ru: ['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'Другое'],
      zh: ['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', '其他'],
      ar: ['Gmail', 'Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'TikTok', 'Telegram', 'WhatsApp', 'أخرى']
    };

    return categoryTranslations[lang] || categoryTranslations.en;
  }

  function detectLanguage() {
    return window.LanguageUtils ? window.LanguageUtils.detectLanguage() : 'en';
  }

  function setLanguage(lang) {
    if (window.LanguageUtils) {
      window.LanguageUtils.setLanguage(lang);
    }
  }

  function getCurrentCategory() {
    const params = new URLSearchParams(window.location.search);
    return params.get('category') || 'all';
  }

  function setCategory(category) {
    const url = new URL(window.location);
    if (category === 'all') {
      url.searchParams.delete('category');
    } else {
      url.searchParams.set('category', category);
    }
    window.history.pushState({}, '', url);
  }

  async function renderCategoryTabs() {
    const container = document.getElementById('categoryTabs');
    const categories = await loadCategories();
    const currentCategory = getCurrentCategory();
    const lang = detectLanguage();
    const allTranslations = {
      en: 'ALL',
      ru: 'ВСЕ',
      zh: '全部',
      ar: 'الكل'
    };
    const allText = allTranslations[lang] || 'ALL';
    let html = `<a href="?category=all" class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-category="all">${allText}</a>`;
    categories.forEach(cat => {
      const isActive = currentCategory === cat;
      html += `<a href="?category=${encodeURIComponent(cat)}" class="category-tab ${isActive ? 'active' : ''}" data-category="${cat}">${cat.toUpperCase()}</a>`;
    });
    safeSetInnerHTML(container, html, true);
    container.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const category = tab.dataset.category;
        setCategory(category);
        container.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        render();
      });
    });
  }

  const PRODUCTS = await (async () => {
    // First try to load fresh data from API (admin.html's source of truth)
    try {
      const response = await fetch(`${CONFIG.API}/products`);
      const data = await response.json();
      if (data.success && Array.isArray(data.products) && data.products.length > 0) {
        console.log(`✅ Loaded ${data.products.length} products from API (admin.html sync)`);
        // Update localStorage with fresh API data
        localStorage.setItem('admin_products_v1', JSON.stringify(data.products));
        return data.products;
      }
    } catch (e) {
      console.error('❌ Error loading products from API:', e);
    }

    // Fallback to localStorage if API fails
    const localProducts = localStorage.getItem('admin_products_v1');
    if (localProducts) {
      const parsed = JSON.parse(localProducts);
      if (Array.isArray(parsed) && parsed.length > 0) {
        console.log(`⚠️ API failed, loaded ${parsed.length} products from localStorage`);
        return parsed;
      }
    }

    console.warn('⚠️ No products found from API or localStorage, using empty array');
    return [];
  })();

  function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function updateStockRandomSubset() {
    const numToUpdate = Math.max(1, Math.floor(Math.random() * Math.ceil(PRODUCTS.length / 2)));
    const indices = PRODUCTS.map((_, i) => i).sort(() => Math.random() - 0.5);
    let changed = false;
    for (let j = 0; j < numToUpdate; j++) {
      const i = indices[j];
      const p = PRODUCTS[i];
      if (typeof p.quantity !== 'number') p.quantity = 100;
      let reduceBy = getRandom([3, 4, 10, 20]);
      p.quantity = Math.max(0, p.quantity - reduceBy);
      if (p.quantity <= 10) p.quantity = getRandom([50, 60, 70, 80, 90]);
      if (p.quantity === 0) p.quantity = getRandom([50, 60, 70, 80, 90]);
      changed = true;
    }
    if (changed) localStorage.setItem('admin_products_v1', JSON.stringify(PRODUCTS));
  }

  setInterval(() => {
    updateStockRandomSubset();
    render();
  }, 15 * 60 * 1000); // 15 minutes

  // Check for inventory updates from admin.html every 30 seconds
  setInterval(async () => {
    try {
      const response = await fetch(`${CONFIG.API}/products`);
      const data = await response.json();
      if (data.success && Array.isArray(data.products)) {
        const apiProductsStr = JSON.stringify(data.products);
        const currentLocalStr = localStorage.getItem('admin_products_v1');

        if (apiProductsStr !== currentLocalStr) {
          console.log('Products updated from admin.html, syncing marketplace...');
          // Update localStorage
          localStorage.setItem('admin_products_v1', apiProductsStr);
          // Update the PRODUCTS array
          PRODUCTS.length = 0;
          PRODUCTS.push(...data.products);
          render(); // Re-render the marketplace
        }
      }
    } catch (error) {
      console.warn('Failed to check for admin.html product updates:', error);
    }
  }, 30 * 1000); // Check every 30 seconds

  function qtyFor(p) {
    if (p.forceZero) return 0;
    return p.quantity || 0;
  }

  const rowsHost = document.getElementById('rows');
  const search = document.getElementById('q');
  const money = n => '$' + (Number(n) || 0).toFixed(2);
  const idOf = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  function render() {
    safeSetInnerHTML(rowsHost, '', true);
    const q = (search?.value || '').toLowerCase().trim();
    const currentCategory = getCurrentCategory();
    const lang = detectLanguage();
    const buyNowTranslations = {
      en: 'Buy Now',
      ru: 'Купить сейчас',
      zh: '立即购买',
      ar: 'اشترِ الآن'
    };
    const buyNowText = buyNowTranslations[lang] || 'Buy Now';

    PRODUCTS.forEach(p => {
      // Get translated title and note
      const translatedTitle = p[`title_${lang}`] || p.title;
      const translatedNote = p[`note_${lang}`] || p.note;

      if (q && !translatedTitle.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q) && !(translatedNote || '').toLowerCase().includes(q) && !(p.note || '').toLowerCase().includes(q)) return;
      if (currentCategory !== 'all' && p.category !== currentCategory) return;

      const row = document.createElement('div');
      row.className = 'row cols';
      row.dataset.id = idOf(p.title);
      safeSetInnerHTML(row, `
        <div>
          <div class="title" tabindex="0" aria-expanded="false">${translatedTitle}</div>
          <div class="short-desc">${translatedNote ? translatedNote.split('<br>')[0] : ''}</div>
        </div>
        <div class="qty">${qtyFor(p)}</div>
        <div class="price" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          ${p.offerPrice ?
          `<span style="color: var(--ok);">${money(p.offerPrice)}</span><span style="text-decoration: line-through; color: var(--muted); font-size: 12px;">${money(p.price)}</span>` :
          money(p.price)}
        </div>
        <div class="buy"><button type="button">${buyNowText}</button></div>
      `, true);
      rowsHost.appendChild(row);

      const det = document.createElement('div');
      det.className = 'details';
      safeSetInnerHTML(det, `
        <div class="inner">
          ${p.image ? `<img src="${p.image}" alt="${translatedTitle}" class="d-logo" style="object-fit: cover;">` : `<div class="d-logo">📦</div>`}
          <div>
            <p class="d-title">${translatedTitle}</p>
            <div class="product-full-description muted" style="margin:0 0 6px 18px">
              ${translatedNote || `• Delivery: Email + Password + Login instructions`}
            </div>
          </div>
        </div>
      `, true);
      rowsHost.appendChild(det);

      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-expanded', 'false');

      const toggle = () => {
        const isExpanded = row.getAttribute('aria-expanded') === 'true';
        row.setAttribute('aria-expanded', String(!isExpanded));
        if (isExpanded) {
          det.style.display = 'none';
        } else {
          det.style.display = 'block';
        }
      };

      const closeOthers = () => {
        document.querySelectorAll('.row[aria-expanded="true"]').forEach(openRow => {
          if (openRow !== row) {
            openRow.setAttribute('aria-expanded', 'false');
            openRow.nextElementSibling.style.display = 'none';
          }
        });
      };

      row.addEventListener('click', (e) => {
        if (!e.target.closest('.buy')) {
          closeOthers();
          toggle();
        }
      });

      row.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!e.target.closest('.buy')) {
            closeOthers();
            toggle();
          }
        }
      });

      row.querySelector('button').addEventListener('click', e => {
        e.preventDefault();
        openMiniCart({ id: idOf(p.title), name: translatedTitle, unitPrice: (p.offerPrice || p.price) });
      });
    });
  }

  const overlay = document.getElementById('mc-overlay');
  const mcClose = document.getElementById('mc-close');
  const mcItem = document.getElementById('mc-item');
  const mcQty = document.getElementById('mc-qty');
  const mcPrice = document.getElementById('mc-price');
  const mcTotal = document.getElementById('mc-total');
  const mcGo = document.getElementById('mc-go');
  let currentItem = null;
  const money2 = n => '$' + (Number(n) || 0).toFixed(2);

  function openMiniCart(item) {
    currentItem = item;
    mcItem.textContent = item.name;
    mcQty.value = '1';
    mcPrice.textContent = money2(item.unitPrice);
    mcTotal.textContent = money2(item.unitPrice * 1);
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  mcQty.addEventListener('input', () => {
    const q = Math.max(1, parseInt(mcQty.value || '1', 10) || 1);
    mcQty.value = String(q);
    if (currentItem) mcTotal.textContent = money2(currentItem.unitPrice * q);
  });

  mcClose.addEventListener('click', () => {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    }
  });

  mcGo.addEventListener('click', () => {
    if (!currentItem) return;
    const qty = Math.max(1, parseInt(mcQty.value || '1', 10) || 1);
    const item = { id: currentItem.id, name: currentItem.name, unitPrice: currentItem.unitPrice, quantity: qty, currency: 'USD' };
    addToCart(item);
    const product = PRODUCTS.find(p => idOf(p.title) === item.id);
    if (product && typeof product.quantity === 'number') {
      product.quantity = Math.max(0, product.quantity - qty);
      if (product.quantity <= 10) product.quantity = getRandom([50, 60, 70, 80, 90]);
      if (product.quantity === 0) product.quantity = getRandom([50, 60, 70, 80, 90]);
      localStorage.setItem('admin_products_v1', JSON.stringify(PRODUCTS));
      render();
    }
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    location.href = CART_URL;
  });

  function readCart() {
    try {
      // Use secure storage for cart data (contains purchase info)
      const cartData = secureStorage.get(STORAGE_KEYS.CART) ||
                      JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(cartData) ? cartData : [];
    } catch {
      return [];
    }
  }

  function writeCart(a) {
    try {
      // Store cart data securely
      secureStorage.set(STORAGE_KEYS.CART, a);
      // Also keep in localStorage for backward compatibility
      localStorage.setItem(CART_KEY, JSON.stringify(a));
    } catch { }
  }

  function upsert(cart, item) {
    const k = item.id + '|' + item.unitPrice;
    const i = cart.findIndex(x => (x.id + '|' + x.unitPrice) === k);
    if (i > -1) {
      cart[i].quantity += item.quantity;
      cart[i].total = +(cart[i].unitPrice * cart[i].quantity).toFixed(2);
    }
    else {
      item.total = +(item.unitPrice * item.quantity).toFixed(2);
      item.ts = Date.now();
      cart.push(item);
    }
    return cart;
  }

  function addToCart(item) {
    let cart = readCart();
    cart = upsert(cart, item);
    writeCart(cart);
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'add_to_cart', ecommerce: { currency: 'USD', value: +(item.unitPrice * item.quantity).toFixed(2), items: [{ item_id: item.id, item_name: item.name, price: item.unitPrice, quantity: item.quantity }] } });
    } catch { }
  }

  (async () => {
    await renderCategoryTabs();
    render();
  })();

  // Set logo subtitle based on language
  const lang = detectLanguage();
  const subtitleTranslations = {
    en: 'Best place to buy bulk pva accounts',
    ru: 'Лучшее место для покупки оптовых PVA аккаунтов',
    zh: '购买批量 PVA 账户的最佳地点',
    ar: 'أفضل مكان لشراء حسابات PVA بالجملة'
  };
  const subtitleElement = document.getElementById('logo-subtitle');
  if (subtitleElement) {
    subtitleElement.textContent = subtitleTranslations[lang] || subtitleTranslations.en;
  }

  document.getElementById('q')?.addEventListener('input', render);
  window.addEventListener('popstate', async () => {
    await renderCategoryTabs();
    render();
  });

  const msToNext30Min = () => {
    const n = new Date();
    const minutes = n.getMinutes();
    const targetMinutes = minutes < 30 ? 30 : 60;
    return (targetMinutes - minutes) * 60 * 1000 - n.getSeconds() * 1000 - n.getMilliseconds();
  };

  setTimeout(() => {
    render();
    setInterval(render, 30 * 60 * 1000);
  }, msToNext30Min());
})();

// Load news on page load
window.addEventListener('load', loadNewsUpdates);
