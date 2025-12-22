// Notification Request Handler
function sendNotificationRequest(event) {
  event.preventDefault();
  const accountType = document.getElementById('accountType').value;
  const quantity = document.getElementById('quantity').value;
  const email = document.getElementById('email').value;
  const requests = JSON.parse(localStorage.getItem('account_requests') || '[]');
  requests.unshift({ accountType, quantity, email, timestamp: new Date().toISOString(), new: true });
  localStorage.setItem('account_requests', JSON.stringify(requests));

  // Also persist on backend to trigger admin bell badge (non-blocking)
  try {
    fetch(`${CONFIG.API}/account-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountType, quantity, email })
    }).catch(() => {});
  } catch (e) {}

  const subject = encodeURIComponent('Notification Request: ' + accountType);
  const body = encodeURIComponent('New Notification Request:\n\nAccount Type: ' + accountType + '\nQuantity: ' + quantity + '\nCustomer Email: ' + email);
  window.location.href = `mailto:info.buypva@gmail.com?subject=${subject}&body=${body}`;
  document.getElementById('notificationForm').reset();
  alert('Request sent successfully! We will notify you when the items are available.');
}

// Load News Updates
function loadNewsUpdates() {
  const newsContainer = document.getElementById('newsContainer');
  const lang = detectLanguage();
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
    const hasLocalized = news.some(n => n && (n[`content_${lang}`] || n[`date_${lang}`]));

    // If admin stored only English news but user is browsing RU/ZH/AR,
    // show the default localized news so the section changes language.
    if (lang !== 'en' && !hasLocalized) {
      const langNews = defaultNews[lang] || defaultNews.en;
      safeSetInnerHTML(newsContainer, langNews.map(item => `
        <div class="item"><div class="date">${item.date}</div><div>${item.content}</div></div>
      `).join(''), true);
      return;
    }

    safeSetInnerHTML(newsContainer, news.map(item => {
      const date = (item && (item[`date_${lang}`] || item.date)) || '';
      const content = (item && (item[`content_${lang}`] || item.content)) || '';
      return `
        <div class="item">
          <div class="date">${date}</div>
          <div class="news-content">${content}</div>
        </div>
      `;
    }).join(''), true);
  }
}

function detectLanguage() {
  try {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.includes('marketplace-ru.html')) return 'ru';
    if (path.includes('marketplace-zh.html')) return 'zh';
    if (path.includes('marketplace-ar.html')) return 'ar';

    const urlLang = new URLSearchParams(window.location.search).get('lang');
    if (urlLang && ['en', 'ru', 'zh', 'ar'].includes(urlLang)) return urlLang;

    const htmlLang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (htmlLang && ['en', 'ru', 'zh', 'ar'].includes(htmlLang)) return htmlLang;

    if (window.LanguageUtils && typeof window.LanguageUtils.detectLanguage === 'function') {
      return window.LanguageUtils.detectLanguage() || 'en';
    }
  } catch {}
  return 'en';
}

// Main Marketplace Logic
(async function () {
  const CART_KEY = 'mp_cart_v1'; // Keep for backward compatibility
  const CART_URL = (document.getElementById('mp-cart-url')?.dataset?.url) || '/cart/';
  const CATEGORIES_KEY = 'product_categories';

  const I18N = {
    requestTitle: { en: 'Request Notification', ru: 'Запрос уведомления', zh: '请求通知', ar: 'طلب إشعار' },
    requestDesc: {
      en: "If you can't find your desired account in the list or if it's out of stock, you can place a custom order with us.",
      ru: 'Если вы не нашли нужный аккаунт в списке или он отсутствует на складе, вы можете оформить индивидуальный заказ.',
      zh: '如果列表中找不到您想要的账户或已售罄，您可以向我们提交定制订单。',
      ar: 'إذا لم تجد الحساب المطلوب في القائمة أو كان غير متوفر، يمكنك تقديم طلب مخصص لدينا.'
    },
    accountTypeLabel: { en: 'Account Type:', ru: 'Тип аккаунта:', zh: '账户类型：', ar: 'نوع الحساب:' },
    accountTypePlaceholder: { en: 'Type account name', ru: 'Введите название аккаунта', zh: '输入账户名称', ar: 'اكتب اسم الحساب' },
    amountLabel: { en: 'Amount:', ru: 'Количество:', zh: '数量：', ar: 'الكمية:' },
    amountPlaceholder: { en: 'e.g. 1000', ru: 'например 1000', zh: '例如 1000', ar: 'مثال: 1000' },
    emailLabel: { en: 'E-mail:', ru: 'E-mail:', zh: '电子邮箱：', ar: 'البريد الإلكتروني:' },
    emailPlaceholder: { en: 'your-email@example.com', ru: 'your-email@example.com', zh: 'your-email@example.com', ar: 'your-email@example.com' },
    requestSubmit: { en: 'Account Request Submit', ru: 'Отправить запрос', zh: '提交请求', ar: 'إرسال الطلب' },
    newsTitle: { en: 'News & Updates', ru: 'Новости и обновления', zh: '新闻与更新', ar: 'الأخبار والتحديثات' },
    helpTitle: { en: 'Need help?', ru: 'Нужна помощь?', zh: '需要帮助？', ar: 'هل تحتاج مساعدة؟' },
    contactsPrefix: { en: 'CONTACTS:', ru: 'КОНТАКТЫ:', zh: '联系方式：', ar: 'جهات الاتصال:' },
    tableTitle: { en: 'Title', ru: 'Название', zh: '标题', ar: 'العنوان' },
    tableQty: { en: 'Quantity', ru: 'Количество', zh: '数量', ar: 'الكمية' },
    tablePrice: { en: 'Price', ru: 'Цена', zh: '价格', ar: 'السعر' },
    searchPlaceholder: { en: 'Search title or notes…', ru: 'Поиск по названию или заметкам…', zh: '搜索标题或备注…', ar: 'البحث في العنوان أو الملاحظات…' },
    all: { en: 'ALL', ru: 'ВСЕ', zh: '全部', ar: 'الكل' },
    buyNow: { en: 'Buy Now', ru: 'Купить сейчас', zh: '立即购买', ar: 'اشترِ الآن' },
    quickAdd: { en: 'Quick add', ru: 'Быстро добавить', zh: '快速添加', ar: 'إضافة سريعة' },
    qty: { en: 'Qty', ru: 'Кол-во', zh: '数量', ar: 'الكمية' },
    unitPrice: { en: 'Unit price', ru: 'Цена за единицу', zh: '单价', ar: 'سعر الوحدة' },
    total: { en: 'Total', ru: 'Итого', zh: '合计', ar: 'الإجمالي' },
    addToCart: { en: 'Add to Cart', ru: 'Добавить в корзину', zh: '添加到购物车', ar: 'أضف إلى السلة' },
    deliveryFallback: {
      en: '• Delivery: Email + Password + Login instructions',
      ru: '• Доставка: Email + Пароль + Инструкции по входу',
      zh: '• 交付：邮箱 + 密码 + 登录说明',
      ar: '• التسليم: البريد الإلكتروني + كلمة المرور + تعليمات تسجيل الدخول'
    }
  };

  function t(key, lang) {
    const l = lang || detectLanguage();
    return (I18N[key] && (I18N[key][l] || I18N[key].en)) || '';
  }

  function categoryLabel(rawValue, lang) {
    const v = String(rawValue || '').trim();
    const upper = v.toUpperCase();
    const l = lang || detectLanguage();
    const map = {
      OTHER: { en: 'OTHER', ru: 'ДРУГОЕ', zh: '其他', ar: 'أخرى' }
    };

    if (map[upper]) return map[upper][l] || map[upper].en;
    return upper;
  }

  function applyStaticTranslations(lang) {
    const l = lang || detectLanguage();

    // Search
    const qEl = document.getElementById('q');
    if (qEl) qEl.placeholder = t('searchPlaceholder', l);

    // Table headers
    const th = document.querySelector('.list .thead');
    if (th) {
      const cells = th.querySelectorAll(':scope > div');
      if (cells[0]) cells[0].textContent = t('tableTitle', l);
      if (cells[1]) cells[1].textContent = t('tableQty', l);
      if (cells[2]) cells[2].textContent = t('tablePrice', l);
    }

    // Sidebar titles
    const requestBox = document.querySelector('.request-box');
    if (requestBox) {
      const h3 = requestBox.querySelector('h3');
      if (h3) h3.textContent = t('requestTitle', l);

      const p = requestBox.querySelector('p.muted');
      if (p) p.textContent = t('requestDesc', l);

      const labelAccountType = requestBox.querySelector('label[for="accountType"]');
      if (labelAccountType) labelAccountType.textContent = t('accountTypeLabel', l);
      const inputAccountType = requestBox.querySelector('#accountType');
      if (inputAccountType) inputAccountType.placeholder = t('accountTypePlaceholder', l);

      const labelQty = requestBox.querySelector('label[for="quantity"]');
      if (labelQty) labelQty.textContent = t('amountLabel', l);
      const inputQty = requestBox.querySelector('#quantity');
      if (inputQty) inputQty.placeholder = t('amountPlaceholder', l);

      const labelEmail = requestBox.querySelector('label[for="email"]');
      if (labelEmail) labelEmail.textContent = t('emailLabel', l);
      const inputEmail = requestBox.querySelector('#email');
      if (inputEmail) inputEmail.placeholder = t('emailPlaceholder', l);

      const submitBtn = requestBox.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.textContent = t('requestSubmit', l);
    }

    const newsBox = document.querySelector('.side.news');
    if (newsBox) {
      const h3 = newsBox.querySelector('h3');
      if (h3) h3.innerHTML = t('newsTitle', l).replace('&', '&amp;');
    }

    // Help section
    const helpBox = Array.from(document.querySelectorAll('.sidebar .side')).find(el => {
      const h = el.querySelector('h3');
      return h && /need help\?/i.test(h.textContent || '');
    });
    if (helpBox) {
      const h3 = helpBox.querySelector('h3');
      if (h3) h3.textContent = t('helpTitle', l);
      const muted = helpBox.querySelector('.muted');
      if (muted) {
        // Preserve the link but translate prefix
        const link = muted.querySelector('a');
        if (link) {
          muted.innerHTML = '';
          muted.appendChild(document.createTextNode(t('contactsPrefix', l) + ' '));
          muted.appendChild(link);
        }
      }
    }

    // Mini-cart modal
    const mcTitle = document.getElementById('mc-title');
    if (mcTitle) mcTitle.textContent = t('quickAdd', l);

    const mcGo = document.getElementById('mc-go');
    if (mcGo) mcGo.textContent = t('addToCart', l);

    const labels = document.querySelectorAll('#mc .row label');
    labels.forEach(label => {
      const txt = (label.textContent || '').trim().toLowerCase();
      if (txt === 'qty') label.textContent = t('qty', l);
      if (txt === 'unit price') label.textContent = t('unitPrice', l);
      if (txt === 'total') label.textContent = t('total', l);
    });
  }

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

  function setLanguage(lang) {
    if (window.LanguageUtils) {
      window.LanguageUtils.setLanguage(lang);
    }
  }

  function normalizeCategoryName(value) {
    const raw = (value && typeof value === 'object' && 'name' in value) ? value.name : value;
    return String(raw || '').trim().toLowerCase();
  }

  function getCategoryValue(value) {
    return (value && typeof value === 'object' && 'name' in value) ? value.name : value;
  }

  function getCurrentCategory() {
    const params = new URLSearchParams(window.location.search);
    return params.get('category') || 'all';
  }

  // Optional server-side overrides (managed via dashboard)
  let CATEGORY_DETAILS_OVERRIDES = null;

  async function loadCategoryDetailsOverrides() {
    try {
      const res = await fetch('/marketplace-category-details.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const json = await res.json();
      if (json && typeof json === 'object') {
        CATEGORY_DETAILS_OVERRIDES = json;
      }
    } catch (e) {
      // ignore
    }
  }

  function updateCategoryDetails() {
    const host = document.getElementById('mpCategoryDetails');
    const titleEl = document.getElementById('mpCategoryDetailsTitle');
    const bodyEl = document.getElementById('mpCategoryDetailsBody');
    if (!host || !titleEl || !bodyEl) return;

    const currentCategory = getCurrentCategory();
    const norm = normalizeCategoryName(currentCategory);

    const CATEGORY_DETAILS_HTML = {
      all: `
        <h1>Buy Premium Accounts Online - Instant Delivery, Flexible Quantities, Trusted Support</h1>

        <p><strong>BuyPvaAccount</strong> offers a curated selection of accounts across popular services, including <strong>email platforms, social networks, and more</strong>. If you need accounts for testing, outreach, advertising workflows, or day-to-day operations, you can choose the category you want and order in the quantity that fits your project.</p>

        <h2>Why Buy From BuyPvaAccount?</h2>
        <ul>
          <li><strong>Fast delivery</strong> - quick access after checkout.</li>
          <li><strong>Bulk-friendly</strong> - buy one account or place a large order.</li>
          <li><strong>Clear offers</strong> - straightforward listings with details and pricing.</li>
          <li><strong>Support when needed</strong> - help with order questions and issues.</li>
        </ul>

        <h2>Fresh Stock and Category Variety</h2>
        <p>We regularly update availability and add new offers so you can find options that match your goals and preferred regions when applicable.</p>

        <h2>Wholesale Options</h2>
        <p>If you need accounts at scale for marketing teams, agencies, or internal testing, BuyPvaAccount supports bulk orders and repeat purchasing.</p>

        <h2>Order Now</h2>
        <p>Select a category to see available products, compare options, and place your order in minutes.</p>
      `,
      gmail: `
        <h1>Buy Gmail &amp; Google Accounts - Ready-to-Use Options for Workflows at Scale</h1>

        <p>Need <strong>Gmail/Google accounts</strong> for campaigns, verification flows, or operational tasks? BuyPvaAccount provides multiple options so you can choose what matches your use case and order size.</p>

        <h2>Common Options You Can Find</h2>
        <ul>
          <li><strong>Verified accounts</strong> - prepared for immediate login.</li>
          <li><strong>Aged accounts</strong> - older profiles suited for more natural activity patterns.</li>
          <li><strong>Bulk-friendly packs</strong> - convenient for large campaigns and teams.</li>
          <li><strong>Accounts with recovery details</strong> - for longer-term account management.</li>
        </ul>

        <h2>Why Order Here?</h2>
        <ul>
          <li><strong>Fast delivery</strong> - access details after checkout.</li>
          <li><strong>Choice</strong> - multiple listings for different needs.</li>
          <li><strong>Support</strong> - help if you face order or access questions.</li>
        </ul>

        <h2>Get Started</h2>
        <p>Select a Gmail/Google offer from the list, choose quantity, and place your order. Delivery is provided with the credentials and basic usage information.</p>
      `,
      linkedin: `
        <h1>Buy LinkedIn Accounts in Bulk - Suitable for Outreach, Lead Gen, and B2B Work</h1>

        <p>If you run outreach, recruitment, or B2B campaigns, having the right account type matters. BuyPvaAccount lists different <strong>LinkedIn account options</strong> so you can choose by age, profile type, and quantity.</p>

        <h2>What You May See in This Category</h2>
        <ul>
          <li><strong>Aged profiles</strong> - accounts with history intended for steadier usage.</li>
          <li><strong>Region-focused accounts</strong> - options aligned to specific markets when offered.</li>
          <li><strong>Bulk quantities</strong> - for teams and automated workflows.</li>
        </ul>

        <h2>Why Many Buyers Prefer Aged Profiles</h2>
        <p>Fresh profiles can be more sensitive in the early stage. Aged options are often selected for smoother onboarding and more natural-looking activity over time.</p>

        <h2>Delivery and Support</h2>
        <p>After checkout, you receive the account credentials and basic access guidance. If you have questions about your order, support is available.</p>
      `,
      email: `
        <h1>Buy Email Accounts - IMAP/POP3/SMTP Ready, Single or Bulk</h1>

        <p>BuyPvaAccount offers <strong>email account listings</strong> suitable for day-to-day communication, testing, and campaign tooling. Many offers support common protocols such as <strong>IMAP</strong>, <strong>POP3</strong>, and <strong>SMTP</strong>, so you can connect them to standard email clients and systems.</p>

        <h2>Typical Use Cases</h2>
        <ul>
          <li><strong>Business operations</strong> - separate inboxes for teams and projects.</li>
          <li><strong>Testing</strong> - QA, sign-up flows, and verification scenarios.</li>
          <li><strong>Campaign workflows</strong> - bulk usage where permitted by your tools/platforms.</li>
        </ul>

        <h2>What to Expect</h2>
        <ul>
          <li>Clear product options and quantities.</li>
          <li>Fast delivery after checkout.</li>
          <li>Credentials provided with basic access notes.</li>
        </ul>

        <h2>Choose an Offer and Order</h2>
        <p>Open the Email category, pick the product that fits your requirements, then select quantity and checkout.</p>
      `,

      // Placeholders (edit these to your own text)
      facebook: '',
      instagram: '',
      twitter: '',
      youtube: '',
      tiktok: '',
      telegram: '',
      other: '',
      yahoo: '',
      tender: '',
      open: ''
    };

    if (!norm) {
      host.hidden = true;
      safeSetInnerHTML(bodyEl, '', true);
      titleEl.textContent = '';
      return;
    }

    const isGmail = norm === 'gmail' || norm.includes('gmail') || norm.includes('google');
    const isLinkedIn = norm === 'linkedin' || norm.includes('linkedin');
    const isEmail = norm === 'email' || norm.includes('email') || ['yahoo', 'outlook', 'proton', 'gmx', 'web', 'hotmail'].some(k => norm.includes(k));

    const key = (norm === 'all') ? 'all' : (isGmail ? 'gmail' : isLinkedIn ? 'linkedin' : isEmail ? 'email' : norm);
    const customHtml = CATEGORY_DETAILS_HTML[key];

    const overrideHtml = CATEGORY_DETAILS_OVERRIDES && (CATEGORY_DETAILS_OVERRIDES[key] ?? CATEGORY_DETAILS_OVERRIDES[norm]);

    let categoryDescription = '';
    try {
      const stored = JSON.parse(localStorage.getItem('product_categories') || '[]');
      if (Array.isArray(stored)) {
        const match = stored.find(c => normalizeCategoryName(c && c.name) === norm);
        if (match && match.description) categoryDescription = String(match.description);
      }
    } catch {}

    titleEl.textContent = norm === 'all' ? '' : String(currentCategory || '').toUpperCase();

    if (typeof overrideHtml === 'string' && overrideHtml.trim()) {
      safeSetInnerHTML(bodyEl, overrideHtml, true);
      host.hidden = false;
      return;
    }

    if (typeof customHtml === 'string' && customHtml.trim()) {
      safeSetInnerHTML(bodyEl, customHtml, true);
      host.hidden = false;
      return;
    }

    const fallbackHtml = `
      <h1>Buy ${String(currentCategory || '').toUpperCase()} Accounts - Verified &amp; Ready</h1>
      <p>${categoryDescription ? categoryDescription : 'Category details will be added soon.'}</p>
      <h2>Why buy from us?</h2>
      <ul>
        <li><strong>Fast delivery</strong> - Quick access after purchase.</li>
        <li><strong>Secure</strong> - Reliable accounts and safe checkout.</li>
        <li><strong>Bulk support</strong> - Suitable for single or bulk orders.</li>
      </ul>
    `;
    safeSetInnerHTML(bodyEl, fallbackHtml, true);
    host.hidden = false;
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
    const currentCategoryNorm = normalizeCategoryName(currentCategory);
    const lang = detectLanguage();
    const allText = t('all', lang) || 'ALL';
    let html = `<a href="?category=all" class="category-tab ${currentCategory === 'all' ? 'active' : ''}" data-category="all">${allText}</a>`;
    categories.forEach(cat => {
      const catValue = String(getCategoryValue(cat) || '');
      const isActive = currentCategoryNorm === normalizeCategoryName(catValue);
      const label = categoryLabel(catValue, lang);
      html += `<a href="?category=${encodeURIComponent(catValue)}" class="category-tab ${isActive ? 'active' : ''}" data-category="${catValue}">${label}</a>`;
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
    updateCategoryDetails();
    const q = (search?.value || '').toLowerCase().trim();
    const currentCategory = getCurrentCategory();
    const currentCategoryNorm = normalizeCategoryName(currentCategory);
    const isAllCategory = currentCategoryNorm === 'all' || currentCategory === 'all';
    const lang = detectLanguage();
    const buyNowText = t('buyNow', lang) || 'Buy Now';

    PRODUCTS.forEach(p => {
      // Get translated title and note
      const translatedTitle = p[`title_${lang}`] || p.title;
      const translatedNote = p[`note_${lang}`] || p.note;

      if (q && !translatedTitle.toLowerCase().includes(q) && !p.title.toLowerCase().includes(q) && !(translatedNote || '').toLowerCase().includes(q) && !(p.note || '').toLowerCase().includes(q)) return;
      if (!isAllCategory && normalizeCategoryName(p.category) !== currentCategoryNorm) return;

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
              ${translatedNote || t('deliveryFallback', lang)}
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
    const lang = detectLanguage();
    applyStaticTranslations(lang);
    await loadCategoryDetailsOverrides();
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
